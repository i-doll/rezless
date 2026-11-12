// rezless <-> SLua bridge, compiled with SLua's VM and compiler to a
// standalone WebAssembly module (see scripts/build-slua-wasm.sh).
//
// Each wasm instance hosts one SLua script. JavaScript drives it through the
// `rz_*` exports and answers `ll.*` / `llcompat.*` calls, the clock, timer
// scheduling and event-handler registration through the `rezless` imports.

#include "lua.h"
#include "lualib.h"
#include "luacode.h"
#include "llsl.h"

#include "Luau/Ast.h"
#include "Luau/Common.h"
#include "Luau/LSLBuiltins.h"
#include "Luau/BytecodeBuilder.h"
#include "Luau/Compiler.h"
#include "Luau/Parser.h"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#define RZ_EXPORT extern "C" __attribute__((used, visibility("default")))
#define RZ_IMPORT(name) __attribute__((import_module("rezless"), import_name(name)))

// ---- Imports (implemented in packages/vm/src/slua/engine.ts) ----

// Run ll function `fn` with `nargs` arguments on L's stack. Returns the number
// of results it pushed, RZ_YIELD to suspend the thread, or RZ_ERROR with an
// error message pushed.
extern "C" RZ_IMPORT("rz_call") int rz_host_call(lua_State* L, int fn, int compat, int nargs);
extern "C" RZ_IMPORT("rz_clock") double rz_host_clock();
extern "C" RZ_IMPORT("rz_set_timer") void rz_host_set_timer(double seconds);
extern "C" RZ_IMPORT("rz_event_registered") void rz_host_event_registered(const char* name, int len, int registered);
extern "C" RZ_IMPORT("rz_print") void rz_host_print(const char* text, int len);

static const int RZ_YIELD = -1;
static const int RZ_ERROR = -2;

// ---- Script instance ----

struct RzScript : lua_SLRuntimeState
{
    lua_State* GL = nullptr;     // main state
    lua_State* thread = nullptr; // sandboxed thread that owns the script's globals
    int threadRef = LUA_NOREF;
    int handleEventRef = LUA_NOREF;
    int lleventsRef = LUA_NOREF;
    size_t bytecodeSize = 0;
    lua_OpaqueGCObjectSet freeObjects;
    std::string scratch;    // string results handed to JavaScript
    std::string plan;       // coverage plan, JSON
    std::vector<int32_t> statementHits;
    std::vector<int32_t> branchHits; // [true, false] per branch
    std::vector<int32_t> functionHits;
    std::unordered_map<lua_State*, int> eventThreads; // references keeping them alive
};

static RzScript* rz(lua_State* L)
{
    return static_cast<RzScript*>(lua_getthreaddata(L));
}

static void userthread_callback(lua_State* LP, lua_State* L)
{
    if (LP)
        lua_setthreaddata(L, lua_getthreaddata(LP));
}

static int ll_forward(lua_State* L)
{
    int compat = lua_toboolean(L, lua_upvalueindex(1));
    int fn = (int)lua_tonumber(L, lua_upvalueindex(2));
    int r = rz_host_call(L, fn, compat, lua_gettop(L));
    if (r >= 0)
        return r;
    if (r == RZ_YIELD)
        return lua_yield(L, 0);
    // Error message on top: prefix the caller's position, as luaL_error does.
    luaL_where(L, 1);
    lua_insert(L, -2);
    lua_concat(L, 2);
    lua_error(L);
}

static int rz_print(lua_State* L)
{
    std::string out;
    int n = lua_gettop(L);
    for (int i = 1; i <= n; i++)
    {
        size_t len;
        const char* s = luaL_tolstring(L, i, &len);
        if (i > 1)
            out += '\t';
        out.append(s, len);
        lua_pop(L, 1);
    }
    rz_host_print(out.data(), (int)out.size());
    return 0;
}

// Coverage counters the instrumented script calls.
static int cov_statement(lua_State* L)
{
    auto* s = rz(L);
    size_t id = (size_t)lua_tonumber(L, 1);
    if (id < s->statementHits.size())
        s->statementHits[id]++;
    return 0;
}

static int cov_branch(lua_State* L)
{
    auto* s = rz(L);
    size_t id = (size_t)lua_tonumber(L, 1);
    bool taken = lua_toboolean(L, 2);
    if (id * 2 + 1 < s->branchHits.size())
        s->branchHits[id * 2 + (taken ? 0 : 1)]++;
    lua_settop(L, 2);
    return 1;
}

static int cov_function(lua_State* L)
{
    auto* s = rz(L);
    size_t id = (size_t)lua_tonumber(L, 1);
    if (id < s->functionHits.size())
        s->functionHits[id]++;
    return 0;
}

RZ_EXPORT RzScript* rz_new()
{
    // Process-wide set-up SLua's CLI does before running SL scripts:
    // the builtins table (constants, events) and SLua's required flags.
    static bool initialized = false;
    if (!initialized)
    {
        luauSL_init_global_builtins(nullptr);
        Luau::setRequiredSLuaFlags();
        initialized = true;
    }

    auto* s = new RzScript();
    s->slIdentifier = LUA_SL_IDENTIFIER;
    s->setTimerEventCb = [](lua_State*, double seconds) { rz_host_set_timer(seconds); };
    s->clockProvider = [](lua_State*) { return rz_host_clock(); };
    s->performanceClockProvider = [](lua_State*) { return rz_host_clock(); };
    s->eventHandlerRegistrationCb = [](lua_State*, const char* name, bool registered)
    {
        rz_host_event_registered(name, (int)strlen(name), registered ? 1 : 0);
        return true;
    };

    lua_State* L = luaL_newstate();
    s->GL = L;
    lua_setthreaddata(L, s);
    lua_callbacks(L)->userthread = userthread_callback;

    // As SLua's own CLI sets up an SL-mode VM (CLI/src/Repl.cpp setupState).
    luaL_openlibs(L);
    luaopen_sl(L, 0);
    luaopen_ll(L, 0);
    lua_pop(L, 1);
    luaSL_set_constant_globals(L);
    luaopen_cjson(L);
    lua_pop(L, 1);
    luaopen_llbase64(L);
    lua_pop(L, 1);

    lua_pushcfunction(L, rz_print, "print");
    lua_setglobal(L, "print");
    lua_pushcfunction(L, cov_statement, "__rz_s");
    lua_setglobal(L, "__rz_s");
    lua_pushcfunction(L, cov_branch, "__rz_b");
    lua_setglobal(L, "__rz_b");
    lua_pushcfunction(L, cov_function, "__rz_f");
    lua_setglobal(L, "__rz_f");
    return s;
}

// Register `ll.<name>` and `llcompat.<name>` as calls to host function `fn`.
// SLua's own implementations (list and math functions) stay unless `replace`.
RZ_EXPORT void rz_add_ll(RzScript* s, const char* name, int fn, int replace)
{
    lua_State* L = s->GL;
    const char* tables[] = {LUA_LLLIBNAME, LUA_LLCOMPATLIBNAME};
    for (int compat = 0; compat < 2; compat++)
    {
        lua_getglobal(L, tables[compat]);
        lua_rawgetfield(L, -1, name);
        bool present = !lua_isnil(L, -1);
        lua_pop(L, 1);
        if (!present || replace)
        {
            lua_pushboolean(L, compat);
            lua_pushnumber(L, fn);
            // Named like SLua's own ll functions, for error messages.
            lua_pushcclosure(L, ll_forward, name, 2);
            lua_setfield(L, -2, name);
        }
        lua_pop(L, 1);
    }
}

// ---- Coverage instrumentation ----

namespace
{
using namespace Luau;

struct Instrumenter : AstVisitor
{
    Allocator& allocator;
    AstNameTable& names;
    std::string plan;
    int statements = 0, branches = 0, functions = 0;
    std::unordered_set<AstNode*> synthetic;
    std::unordered_map<AstStat*, int> loopIds;
    std::unordered_map<AstExprFunction*, std::string> eventNames;
    std::unordered_map<AstExprFunction*, std::string> functionNames;

    Instrumenter(Allocator& allocator, AstNameTable& names)
        : allocator(allocator)
        , names(names)
    {
    }

    static std::string json(const std::string& s)
    {
        std::string out = "\"";
        for (char c : s)
        {
            if (c == '"' || c == '\\')
                out += '\\', out += c;
            else if ((unsigned char)c < 0x20)
            {
                char buf[8];
                snprintf(buf, sizeof(buf), "\\u%04x", c);
                out += buf;
            }
            else
                out += c;
        }
        return out + "\"";
    }

    void entry(const char* type, int id, const Location& loc, const char* kind, const std::string& extra = "")
    {
        if (!plan.empty())
            plan += ",";
        plan += "{\"t\":\"" + std::string(type) + "\",\"id\":" + std::to_string(id) + ",\"line\":" + std::to_string(loc.begin.line + 1) +
                ",\"col\":" + std::to_string(loc.begin.column + 1) + ",\"kind\":\"" + kind + "\"" + extra + "}";
    }

    AstExpr* call(const char* fn, const Location& loc, std::initializer_list<AstExpr*> args)
    {
        AstArray<AstExpr*> argv;
        argv.size = args.size();
        argv.data = static_cast<AstExpr**>(allocator.allocate(sizeof(AstExpr*) * args.size()));
        size_t i = 0;
        for (AstExpr* a : args)
            argv.data[i++] = a;
        auto* func = allocator.alloc<AstExprGlobal>(loc, names.getOrAdd(fn));
        return allocator.alloc<AstExprCall>(loc, func, argv, false, false, AstArray<AstTypeOrPack>{}, loc);
    }

    AstExpr* number(double v, const Location& loc)
    {
        return allocator.alloc<AstExprConstantNumber>(loc, v);
    }

    AstStat* counter(const char* fn, int id, const Location& loc)
    {
        auto* stat = allocator.alloc<AstStatExpr>(loc, call(fn, loc, {number(id, loc)}));
        synthetic.insert(stat);
        return stat;
    }

    AstExpr* branch(AstExpr* cond, const char* kind, const Location& loc, bool hasElse)
    {
        int id = branches++;
        entry("b", id, loc, kind, std::string(",\"else\":") + (hasElse ? "true" : "false"));
        return call("__rz_b", cond->location, {number(id, cond->location), cond});
    }

    static const char* statementKind(AstStat* s)
    {
        if (s->is<AstStatLocal>()) return "local";
        if (s->is<AstStatAssign>()) return "assign";
        if (s->is<AstStatCompoundAssign>()) return "compound-assign";
        if (s->is<AstStatExpr>()) return "expression";
        if (s->is<AstStatIf>()) return "if";
        if (s->is<AstStatWhile>()) return "while";
        if (s->is<AstStatRepeat>()) return "repeat";
        if (s->is<AstStatFor>()) return "for";
        if (s->is<AstStatForIn>()) return "for-in";
        if (s->is<AstStatReturn>()) return "return";
        if (s->is<AstStatBreak>()) return "break";
        if (s->is<AstStatContinue>()) return "continue";
        if (s->is<AstStatFunction>()) return "function";
        if (s->is<AstStatLocalFunction>()) return "local-function";
        if (s->is<AstStatBlock>()) return "do";
        return nullptr; // type declarations and the like don't run
    }

    bool visit(AstStatBlock* block) override
    {
        std::vector<AstStat*> body;
        for (AstStat* stat : block->body)
        {
            if (synthetic.count(stat))
            {
                body.push_back(stat);
                continue;
            }
            if (const char* kind = statementKind(stat))
            {
                int id = statements++;
                entry("s", id, stat->location, kind);
                body.push_back(counter("__rz_s", id, stat->location));
            }
            body.push_back(stat);
            // A numeric or generic for loop's "not taken" outcome: the loop finished.
            if (stat->is<AstStatFor>() || stat->is<AstStatForIn>())
            {
                int id = branches++;
                loopIds[stat] = id;
                entry("b", id, stat->location, stat->is<AstStatFor>() ? "for" : "for-in", ",\"else\":false");
                auto* done = allocator.alloc<AstStatExpr>(
                    stat->location, call("__rz_b", stat->location, {number(id, stat->location), allocator.alloc<AstExprConstantBool>(stat->location, false)}));
                synthetic.insert(done);
                body.push_back(done);
            }
        }
        block->body.size = body.size();
        block->body.data = static_cast<AstStat**>(allocator.allocate(sizeof(AstStat*) * body.size()));
        for (size_t i = 0; i < body.size(); i++)
            block->body.data[i] = body[i];
        return true;
    }

    // A loop body's "taken" outcome: one more iteration started.
    void enterLoop(AstStat* loop, AstStatBlock* body)
    {
        auto it = loopIds.find(loop);
        if (it == loopIds.end())
            return;
        auto* taken = allocator.alloc<AstStatExpr>(
            loop->location, call("__rz_b", loop->location, {number(it->second, loop->location), allocator.alloc<AstExprConstantBool>(loop->location, true)}));
        synthetic.insert(taken);
        prepend(body, taken);
    }

    void prepend(AstStatBlock* body, AstStat* stat)
    {
        AstStat** data = static_cast<AstStat**>(allocator.allocate(sizeof(AstStat*) * (body->body.size + 1)));
        data[0] = stat;
        for (size_t i = 0; i < body->body.size; i++)
            data[i + 1] = body->body.data[i];
        body->body.data = data;
        body->body.size++;
    }

    bool visit(AstStatIf* s) override
    {
        s->condition = branch(s->condition, "if", s->location, s->elsebody != nullptr);
        return true;
    }

    bool visit(AstStatWhile* s) override
    {
        s->condition = branch(s->condition, "while", s->location, false);
        return true;
    }

    bool visit(AstStatRepeat* s) override
    {
        s->condition = branch(s->condition, "repeat", s->location, false);
        return true;
    }

    bool visit(AstStatFor* s) override
    {
        enterLoop(s, s->body);
        return true;
    }

    bool visit(AstStatForIn* s) override
    {
        enterLoop(s, s->body);
        return true;
    }

    bool visit(AstExprBinary* e) override
    {
        if (e->op == AstExprBinary::And || e->op == AstExprBinary::Or)
            e->left = branch(e->left, e->op == AstExprBinary::And ? "and" : "or", e->location, true);
        return true;
    }

    bool visit(AstExprIfElse* e) override
    {
        e->condition = branch(e->condition, "if-expression", e->location, e->hasElse);
        return true;
    }

    // `LLEvents:on("touch_start", function ...)` and `LLEvents.touch_start = function ...`
    // name their handler after the event.
    bool visit(AstExprCall* c) override
    {
        auto* index = c->func->as<AstExprIndexName>();
        if (index && c->self && c->args.size == 2 && (index->index == "on" || index->index == "once"))
        {
            auto* global = index->expr->as<AstExprGlobal>();
            auto* event = c->args.data[0]->as<AstExprConstantString>();
            auto* fn = c->args.data[1]->as<AstExprFunction>();
            if (global && global->name == "LLEvents" && event && fn)
                eventNames[fn] = std::string(event->value.data, event->value.size);
        }
        return true;
    }

    bool visit(AstStatAssign* a) override
    {
        for (size_t i = 0; i < a->vars.size && i < a->values.size; i++)
        {
            auto* fn = a->values.data[i]->as<AstExprFunction>();
            if (!fn)
                continue;
            auto* index = a->vars.data[i]->as<AstExprIndexName>();
            auto* owner = index ? index->expr->as<AstExprGlobal>() : nullptr;
            if (owner && owner->name == "LLEvents")
                eventNames[fn] = index->index.value;
            else if (auto* global = a->vars.data[i]->as<AstExprGlobal>())
                functionNames[fn] = global->name.value;
        }
        return true;
    }

    // `local f = function ... end` names the function after the local.
    bool visit(AstStatLocal* l) override
    {
        for (size_t i = 0; i < l->vars.size && i < l->values.size; i++)
            if (auto* fn = l->values.data[i]->as<AstExprFunction>())
                functionNames[fn] = l->vars.data[i]->name.value;
        return true;
    }

    bool visit(AstExprFunction* f) override
    {
        int id = functions++;
        auto named = eventNames.find(f);
        bool event = named != eventNames.end();
        auto assigned = functionNames.find(f);
        std::string name = event                         ? named->second
                           : f->debugname.value          ? f->debugname.value
                           : assigned != functionNames.end() ? assigned->second
                                                         : "(anonymous)";
        entry("f", id, f->location, event ? "event" : "function", ",\"name\":" + json(name));
        prepend(f->body, counter("__rz_f", id, f->location));
        return true;
    }
};
} // namespace

// ---- Loading ----

// Compile `source` and load it as the script's main chunk on a new sandboxed
// thread, ready for rz_resume. Returns 0, or 1 with the error in rz_string.
static int load(RzScript* s, const char* name, const char* source, int sourceLen, int coverage);

RZ_EXPORT int rz_load(RzScript* s, const char* name, const char* source, int sourceLen, int coverage)
{
    try
    {
        return load(s, name, source, sourceLen, coverage);
    }
    catch (std::exception& e)
    {
        s->scratch = std::string("internal error loading script: ") + e.what();
        return 1;
    }
}

static int load(RzScript* s, const char* name, const char* source, int sourceLen, int coverage)
{
    lua_State* GL = s->GL;
    luaL_sandbox(GL);
    lua_fixallcollectable(GL);

    Luau::Allocator allocator;
    Luau::AstNameTable names(allocator);
    Luau::ParseResult parsed = Luau::Parser::parse(source, sourceLen, names, allocator);
    if (!parsed.errors.empty())
    {
        const auto& e = parsed.errors.front();
        s->scratch = std::string(name) + ":" + std::to_string(e.getLocation().begin.line + 1) + ": " + e.getMessage();
        return 1;
    }
    if (coverage)
    {
        Instrumenter instrumenter(allocator, names);
        parsed.root->visit(&instrumenter);
        s->plan = "[" + instrumenter.plan + "]";
        s->statementHits.assign(instrumenter.statements, 0);
        s->branchHits.assign(instrumenter.branches * 2, 0);
        s->functionHits.assign(instrumenter.functions, 0);
    }

    Luau::CompileOptions options;
    options.optimizationLevel = 1;
    options.debugLevel = 1;
    options.typeInfoLevel = 1;
    options.libraryMemberConstantCb = &luauSL_lookup_constant_cb;
    Luau::BytecodeBuilder bcb;
    try
    {
        Luau::compileOrThrow(bcb, parsed, names, options);
    }
    catch (Luau::CompileError& e)
    {
        s->scratch = std::string(name) + ":" + std::to_string(e.getLocation().begin.line + 1) + ": " + e.what();
        return 1;
    }
    std::string bytecode = bcb.getBytecode();
    s->bytecodeSize = bytecode.size();

    // As SLua's CLI runs a script: user allocations on a sandboxed thread.
    lua_setmemcat(GL, LUA_FIRST_USER_MEMCAT);
    lua_State* L = lua_newthread(GL);
    s->threadRef = lua_ref(GL, -1);
    lua_pop(GL, 1);
    lua_setmemcat(GL, 0);
    s->thread = L;
    luaL_sandboxthread(L);

    // As SLua's CLI: the timer manager takes LLEvents from the top of the stack.
    int top = lua_gettop(L);
    luaSL_createeventmanager(L);
    s->lleventsRef = lua_ref(L, -1);
    lua_pushvalue(L, -1);
    lua_setglobal(L, "LLEvents");
    luaSL_createtimermanager(L);
    lua_setglobal(L, "LLTimers");
    lua_settop(L, top);
    lua_getfield(L, LUA_REGISTRYINDEX, LLEVENTS_HANDLEEVENT_KEY);
    s->handleEventRef = lua_ref(L, -1);
    lua_pop(L, 1);

    std::string chunk = std::string("=") + name;
    if (luau_load(L, chunk.c_str(), bytecode.data(), bytecode.size(), 0) != 0)
    {
        s->scratch = lua_tostring(L, -1);
        lua_pop(L, 1);
        return 1;
    }
    s->freeObjects = lua_collectfreeobjects(L);
    return 0;
}

// A new coroutine for one event, with LLEvents' dispatcher, LLEvents and the
// event name pushed. Push the arguments, then rz_resume(thread, 2 + nargs).
RZ_EXPORT lua_State* rz_event_thread(RzScript* s, const char* event)
{
    lua_State* T = lua_newthread(s->thread);
    // Keep it alive until the host lets go of it (rz_release).
    s->eventThreads[T] = lua_ref(s->thread, -1);
    lua_pop(s->thread, 1);
    lua_getref(T, s->handleEventRef);
    lua_getref(T, s->lleventsRef);
    lua_pushstring(T, event);
    return T;
}

RZ_EXPORT void rz_release(RzScript* s, lua_State* T)
{
    auto it = s->eventThreads.find(T);
    if (it == s->eventThreads.end())
        return;
    lua_unref(s->thread, it->second);
    s->eventThreads.erase(it);
}

RZ_EXPORT lua_State* rz_main_thread(RzScript* s)
{
    return s->thread;
}

// Resume T with nargs values on its stack. Returns LUA_OK, LUA_YIELD, or an
// error status with the message (and traceback) in rz_string.
RZ_EXPORT int rz_resume(RzScript* s, lua_State* T, int nargs)
{
    int status = lua_resume(T, nullptr, nargs);
    if (status != LUA_OK && status != LUA_YIELD)
    {
        const char* msg = lua_tostring(T, -1);
        s->scratch = msg ? msg : "unknown error";
        lua_pop(T, 1);
    }
    else if (status == LUA_OK)
        lua_settop(T, 0);
    return status;
}

RZ_EXPORT const char* rz_string(RzScript* s)
{
    return s->scratch.c_str();
}

RZ_EXPORT int rz_string_len(RzScript* s)
{
    return (int)s->scratch.size();
}

RZ_EXPORT int rz_used_memory(RzScript* s)
{
    return (int)(lua_userthreadgc(s->thread, &s->freeObjects) + s->bytecodeSize);
}

// ---- Coverage readout ----

RZ_EXPORT const char* rz_plan(RzScript* s)
{
    return s->plan.c_str();
}

RZ_EXPORT int rz_plan_len(RzScript* s)
{
    return (int)s->plan.size();
}

RZ_EXPORT int32_t* rz_hits(RzScript* s, int kind)
{
    auto& v = kind == 0 ? s->statementHits : kind == 1 ? s->branchHits : s->functionHits;
    return v.data();
}

// ---- Stack access for the host ----

enum RzType
{
    RZ_NIL = 0,
    RZ_BOOLEAN = 1,
    RZ_NUMBER = 2,
    RZ_INTEGER = 3,
    RZ_STRING = 4,
    RZ_VECTOR = 5,
    RZ_QUATERNION = 6,
    RZ_UUID = 7,
    RZ_TABLE = 8,
    RZ_FUNCTION = 9,
    RZ_OTHER = 10,
};

RZ_EXPORT int rz_gettop(lua_State* L)
{
    return lua_gettop(L);
}

RZ_EXPORT void rz_settop(lua_State* L, int top)
{
    lua_settop(L, top);
}

RZ_EXPORT int rz_type(lua_State* L, int i)
{
    switch (lua_type(L, i))
    {
    case LUA_TNIL:
        return RZ_NIL;
    case LUA_TBOOLEAN:
        return RZ_BOOLEAN;
    case LUA_TNUMBER:
        return RZ_NUMBER;
    case LUA_TSTRING:
        return RZ_STRING;
    case LUA_TVECTOR:
        return RZ_VECTOR;
    case LUA_TTABLE:
        return RZ_TABLE;
    case LUA_TFUNCTION:
        return RZ_FUNCTION;
    default:
        break;
    }
    switch (luaSL_lsl_type(L, i))
    {
    case 1: // LST_INTEGER
        return RZ_INTEGER;
    case 6: // LST_QUATERNION
        return RZ_QUATERNION;
    case 4: // LST_KEY
        return RZ_UUID;
    default:
        return RZ_OTHER;
    }
}

RZ_EXPORT double rz_tonumber(lua_State* L, int i)
{
    return lua_tonumber(L, i);
}

RZ_EXPORT int rz_toboolean(lua_State* L, int i)
{
    return lua_toboolean(L, i);
}

// String value at i (strings, uuids as text, anything via tostring) into rz_string.
RZ_EXPORT void rz_tostring(RzScript* s, lua_State* L, int i)
{
    if (lua_type(L, i) == LUA_TSTRING)
    {
        size_t len;
        const char* str = lua_tolstring(L, i, &len);
        s->scratch.assign(str, len);
        return;
    }
    size_t len;
    const char* str = luaL_tolstring(L, i, &len);
    s->scratch.assign(str, len);
    lua_pop(L, 1);
}

static float rz_components[4];

RZ_EXPORT float* rz_tovector(lua_State* L, int i)
{
    const float* v = lua_tovector(L, i);
    for (int k = 0; k < 3; k++)
        rz_components[k] = v ? v[k] : 0;
    return rz_components;
}

RZ_EXPORT float* rz_toquaternion(lua_State* L, int i)
{
    const float* q = luaSL_checkquaternion(L, i);
    for (int k = 0; k < 4; k++)
        rz_components[k] = q[k];
    return rz_components;
}

RZ_EXPORT int rz_objlen(lua_State* L, int i)
{
    return lua_objlen(L, i);
}

RZ_EXPORT void rz_rawgeti(lua_State* L, int i, int n)
{
    lua_rawgeti(L, i, n);
}

RZ_EXPORT void rz_pop(lua_State* L, int n)
{
    lua_pop(L, n);
}

RZ_EXPORT void rz_pushnil(lua_State* L)
{
    lua_pushnil(L);
}

RZ_EXPORT void rz_pushboolean(lua_State* L, int b)
{
    lua_pushboolean(L, b);
}

RZ_EXPORT void rz_pushnumber(lua_State* L, double n)
{
    lua_pushnumber(L, n);
}

RZ_EXPORT void rz_pushstring(lua_State* L, const char* s, int len)
{
    lua_pushlstring(L, s, len);
}

RZ_EXPORT void rz_pushuuid(lua_State* L, const char* s, int len)
{
    luaSL_pushuuidlstring(L, s, len);
}

RZ_EXPORT void rz_pushvector(lua_State* L, float x, float y, float z)
{
    lua_pushvector(L, x, y, z);
}

RZ_EXPORT void rz_pushquaternion(lua_State* L, double x, double y, double z, double w)
{
    luaSL_pushquaternion(L, x, y, z, w);
}

RZ_EXPORT void rz_newtable(lua_State* L, int narr)
{
    lua_createtable(L, narr, 0);
}

RZ_EXPORT void rz_rawseti(lua_State* L, int i, int n)
{
    lua_rawseti(L, i, n);
}

// Read global `name` of the script onto L's stack.
RZ_EXPORT void rz_getglobal(RzScript* s, const char* name)
{
    lua_getglobal(s->thread, name);
}

// Set global `name` of the script from the value on top of its stack.
RZ_EXPORT void rz_setglobal(RzScript* s, const char* name)
{
    lua_setglobal(s->thread, name);
}

// Scratch memory for the host to pass strings in.
RZ_EXPORT char* rz_buffer(int size)
{
    static std::vector<char> buffer;
    if ((int)buffer.size() < size + 1)
        buffer.resize(size + 1);
    return buffer.data();
}
