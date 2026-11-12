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
// of results it pushed, RZ_ERROR with an error message pushed, or RZ_KILL to
// stop the script (llDie, llResetScript, a crash). A call that sleeps returns
// its results and asks for a break (rz_request_break), as SLua's host does.
extern "C" RZ_IMPORT("rz_call") int rz_host_call(lua_State* L, int fn, int compat, int nargs);
extern "C" RZ_IMPORT("rz_clock") double rz_host_clock();
extern "C" RZ_IMPORT("rz_set_timer") void rz_host_set_timer(double seconds);
// Whether `name` may be (un)registered as an LLEvents handler.
extern "C" RZ_IMPORT("rz_event_registered") int rz_host_event_registered(const char* name, int len, int registered);
extern "C" RZ_IMPORT("rz_print") void rz_host_print(const char* text, int len);

static const int RZ_ERROR = -2;
static const int RZ_KILL = -3;

// ---- Script instance ----

struct RzScript : lua_SLRuntimeState
{
    lua_State* GL = nullptr;     // main state
    lua_State* thread = nullptr; // sandboxed thread that owns the script's globals
    // The one thread the top level and every handler run on, kept in slot 1 of
    // `thread`'s stack so its memory counts towards the script's (as SLua's host).
    lua_State* handler = nullptr;
    int threadRef = LUA_NOREF;
    int handleEventRef = LUA_NOREF;
    int lleventsRef = LUA_NOREF;
    size_t bytecodeSize = 0; // without coverage instrumentation, as SLua charges it
    bool breakPending = false;
    bool inExecution = false;
    int memoryLimit = 0; // 0: not enforced
    int exactSize = 0;
    int maxPossibleSize = 0;
    lua_OpaqueGCObjectSet freeObjects;
    std::string scratch;    // string results handed to JavaScript
    std::string plan;       // coverage plan, JSON
    std::vector<int32_t> statementHits;
    std::vector<int32_t> branchHits; // [true, false] per branch
    std::vector<int32_t> functionHits;
};

static RzScript* rz(lua_State* L)
{
    return static_cast<RzScript*>(lua_getthreaddata(L));
}

// As SLua's host: scripts may not act on the instance thread, the handler
// thread (looking is allowed) or a thread stopped at a break.
static int thread_use_callback(lua_State* L, lua_State* co, int inspect)
{
    if (lua_getmemcat(co) < LUA_FIRST_USER_MEMCAT || lua_status(co) == LUA_BREAK)
        return 1;
    RzScript* s = rz(L);
    if (co == s->thread)
        return 1;
    if (!inspect && co == s->handler)
        return 1;
    return 0;
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
    if (r == RZ_KILL)
        lua_killerror(L, "rezless: script stopped");
    // Error message on top: prefix the caller's position, as luaL_error does.
    luaL_where(L, 1);
    lua_insert(L, -2);
    lua_concat(L, 2);
    lua_error(L);
}

// As SLua's host (Executor/src/Executor.cpp): the script's own memory in KB.
static int rz_gcinfo(lua_State* L)
{
    RzScript* s = rz(L);
    lua_pushnumber(L, (double)(lua_userthreadgc(s->thread, &s->freeObjects) + s->bytecodeSize) / 1024);
    return 1;
}

// The libraries SLua's host gives scripts (Executor/src/Executor.cpp kSafeLuaLibs).
static const luaL_Reg kSafeLuaLibs[] = {
    {"", luaopen_base},
    {LUA_COLIBNAME, luaopen_coroutine},
    {LUA_TABLIBNAME, luaopen_table},
    {LUA_OSLIBNAME, luaopen_os},
    {LUA_STRLIBNAME, luaopen_string},
    {LUA_MATHLIBNAME, luaopen_math},
    {LUA_DBLIBNAME, luaopen_debug},
    {LUA_UTF8LIBNAME, luaopen_utf8},
    {LUA_BITLIBNAME, luaopen_bit32},
    {LUA_BUFFERLIBNAME, luaopen_buffer},
    {LUA_VECLIBNAME, luaopen_vector},
    {LUA_CJSONLIBNAME, luaopen_cjson},
    {LUA_LLBASE64LIBNAME, luaopen_llbase64},
    {NULL, NULL},
};

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
    // A third argument takes the count back: a for loop left by break
    // doesn't run out, though the counter after it still runs.
    int delta = lua_gettop(L) >= 3 ? -1 : 1;
    if (id * 2 + 1 < s->branchHits.size())
        s->branchHits[id * 2 + (taken ? 0 : 1)] += delta;
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

// As SLua's host (Executor/src/Script.cpp interruptHandler / tryYield): a
// pending sleep breaks out of the script at the first point it may yield,
// through any coroutines it is in.
static void interrupt_callback(lua_State* L, int gc)
{
    if (gc >= 0)
        return;
    auto* s = rz(L);
    if (s->breakPending && luaSL_may_interrupt(L) == YieldableStatus::OK)
    {
        s->breakPending = false;
        lua_break(L);
    }
}

// As SLua's host (Executor/src/Script.cpp memoryLimitCallback): refuse an
// allocation that would take the script's own memory past its limit.
static int before_allocate(lua_State* L, size_t osize, size_t nsize)
{
    auto* s = rz(L);
    if (!s || !s->inExecution || s->memoryLimit == 0 || !s->thread || osize >= nsize)
        return 0;
    size_t gain = nsize - osize;
    if (gain > (size_t)s->memoryLimit)
        return 1;
    s->maxPossibleSize += (int)gain;
    if (s->exactSize == 0 || s->maxPossibleSize > s->memoryLimit)
    {
        int current = (int)(lua_userthreadgc(s->thread, &s->freeObjects) + s->bytecodeSize);
        int next = current + (int)gain;
        if (next > s->memoryLimit)
        {
            s->exactSize = s->maxPossibleSize = current;
            return 1;
        }
        s->exactSize = s->maxPossibleSize = next;
    }
    return 0;
}

RZ_EXPORT void rz_request_break(RzScript* s)
{
    s->breakPending = true;
}

RZ_EXPORT void rz_set_memory_limit(RzScript* s, int limit)
{
    s->memoryLimit = limit;
    s->exactSize = 0;
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
        return rz_host_event_registered(name, (int)strlen(name), registered ? 1 : 0) != 0;
    };

    lua_State* L = luaL_newstate();
    s->GL = L;
    lua_setthreaddata(L, s);
    lua_callbacks(L)->userthread = userthread_callback;
    lua_callbacks(L)->beforethreaduse = thread_use_callback;
    lua_callbacks(L)->interrupt = interrupt_callback;
    lua_callbacks(L)->beforeallocate = before_allocate;

    // As SLua's host sets up a script environment (Executor/src/Executor.cpp),
    // with the LSL constants SLua's CLI adds.
    for (const luaL_Reg* lib = kSafeLuaLibs; lib->func; lib++)
    {
        lua_pushcfunction(L, lib->func, NULL);
        lua_pushstring(L, lib->name);
        lua_call(L, 1, 0);
    }
    // Scripts can't change environments, which would de-optimize them.
    lua_pushnil(L);
    lua_setglobal(L, "getfenv");
    lua_pushnil(L);
    lua_setglobal(L, "setfenv");
    lua_pushcfunction(L, rz_gcinfo, "gcinfo");
    lua_setglobal(L, "gcinfo");
    luaopen_sl(L, 0);
    luaopen_ll(L, 0);
    lua_pop(L, 1);
    luaSL_set_constant_globals(L);

    lua_pushcfunction(L, rz_print, "print");
    lua_setglobal(L, "print");
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
    // `break`s that leave a for loop, with that loop's branch.
    std::unordered_map<AstStat*, int> forBreaks;

    // The breaks in a loop body that leave that loop (not an inner loop).
    struct BreakFinder : AstVisitor
    {
        std::vector<AstStat*> found;
        bool visit(AstStatBreak* b) override
        {
            found.push_back(b);
            return false;
        }
        bool visit(AstStatWhile*) override { return false; }
        bool visit(AstStatRepeat*) override { return false; }
        bool visit(AstStatFor*) override { return false; }
        bool visit(AstStatForIn*) override { return false; }
        bool visit(AstExprFunction*) override { return false; }
    };
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

    // A constant condition only ever goes one way, so it isn't a branch.
    static bool constant(AstExpr* e)
    {
        return e->is<AstExprConstantBool>() || e->is<AstExprConstantNil>() || e->is<AstExprConstantNumber>() ||
               e->is<AstExprConstantInteger>() || e->is<AstExprConstantString>();
    }

    AstExpr* branch(AstExpr* cond, const char* kind, const Location& loc, bool hasElse)
    {
        if (constant(cond))
            return cond;
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
            auto leaving = forBreaks.find(stat);
            if (leaving != forBreaks.end())
            {
                auto* undo = allocator.alloc<AstStatExpr>(stat->location,
                    call("__rz_b", stat->location,
                        {number(leaving->second, stat->location), allocator.alloc<AstExprConstantBool>(stat->location, false),
                            allocator.alloc<AstExprConstantBool>(stat->location, true)}));
                synthetic.insert(undo);
                body.push_back(undo);
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
        BreakFinder breaks;
        for (AstStat* stat : body->body)
            stat->visit(&breaks);
        for (AstStat* b : breaks.found)
            forBreaks[b] = it->second;
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

    // `a or b or c`: one branch per term that can short-circuit (a and b),
    // recorded where the term is. Terms are wrapped one level deep, so long
    // chains don't nest calls.
    std::unordered_set<AstExprBinary*> chained;

    void chain(AstExprBinary* e, AstExprBinary::Op op, bool top)
    {
        chained.insert(e);
        const char* kind = op == AstExprBinary::And ? "and" : "or";
        auto* left = e->left->as<AstExprBinary>();
        if (left && left->op == op)
            chain(left, op, false);
        else
            e->left = branch(e->left, kind, e->left->location, true);
        if (!top)
            e->right = branch(e->right, kind, e->right->location, true);
    }

    bool visit(AstExprBinary* e) override
    {
        if ((e->op == AstExprBinary::And || e->op == AstExprBinary::Or) && !chained.count(e))
            chain(e, e->op, true);
        return true;
    }

    // Type functions run in the type checker, not the script.
    bool visit(AstStatTypeFunction*) override
    {
        return false;
    }

    // `function LLEvents.touch_start(...)` names its handler after the event.
    bool visit(AstStatFunction* f) override
    {
        auto* index = f->name->as<AstExprIndexName>();
        auto* owner = index ? index->expr->as<AstExprGlobal>() : nullptr;
        if (owner && owner->name == "LLEvents")
            eventNames[f->func] = index->index.value;
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
    if (coverage)
    {
        lua_pushcfunction(GL, cov_statement, "__rz_s");
        lua_setglobal(GL, "__rz_s");
        lua_pushcfunction(GL, cov_branch, "__rz_b");
        lua_setglobal(GL, "__rz_b");
        lua_pushcfunction(GL, cov_function, "__rz_f");
        lua_setglobal(GL, "__rz_f");
    }
    luaL_sandbox(GL);
    lua_fixallcollectable(GL);

    Luau::CompileOptions options;
    options.optimizationLevel = 1;
    options.debugLevel = 1;
    options.typeInfoLevel = 1;
    options.libraryMemberConstantCb = &luauSL_lookup_constant_cb;

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
        // Memory is charged for the script's own bytecode, not the instrumentation.
        try
        {
            Luau::BytecodeBuilder plain;
            Luau::compileOrThrow(plain, parsed, names, options);
            s->bytecodeSize = plain.getBytecode().size();
        }
        catch (Luau::CompileError& e)
        {
            s->scratch = std::string(name) + ":" + std::to_string(e.getLocation().begin.line + 1) + ": " + e.what();
            return 1;
        }
        Instrumenter instrumenter(allocator, names);
        parsed.root->visit(&instrumenter);
        s->plan = "[" + instrumenter.plan + "]";
        s->statementHits.assign(instrumenter.statements, 0);
        s->branchHits.assign(instrumenter.branches * 2, 0);
        s->functionHits.assign(instrumenter.functions, 0);
    }

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
    if (!coverage)
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
    // What the script starts with costs it nothing (as SLua's host, which
    // collects these before it creates the handler thread).
    s->freeObjects = lua_collectfreeobjects(L);
    // As SLua's host: stage the main function on the persistent handler thread,
    // which sits in slot 1 of the instance thread's stack.
    lua_newthread(L);
    lua_insert(L, 1);
    s->handler = lua_tothread(L, 1);
    lua_xmove(L, s->handler, 1);
    return 0;
}

// The handler thread, ready to run LLEvents' dispatcher for `event`: push the
// arguments, then rz_resume(thread, 2 + nargs).
RZ_EXPORT lua_State* rz_event_thread(RzScript* s, const char* event)
{
    // A handler that failed, or was abandoned mid-run, leaves the thread unusable:
    // carry on with a fresh one.
    if (lua_costatus(s->thread, s->handler) != LUA_COFIN)
    {
        lua_newthread(s->thread);
        lua_replace(s->thread, 1);
        s->handler = lua_tothread(s->thread, 1);
    }
    lua_State* T = s->handler;
    lua_settop(T, 0);
    lua_getref(T, s->handleEventRef);
    lua_getref(T, s->lleventsRef);
    lua_pushstring(T, event);
    return T;
}

// The instance thread, which owns the script's globals.
RZ_EXPORT lua_State* rz_instance_thread(RzScript* s)
{
    return s->thread;
}

// The handler thread with the script's main function staged on it.
RZ_EXPORT lua_State* rz_main_thread(RzScript* s)
{
    return s->handler;
}

// Resume T with nargs values on its stack. Returns LUA_OK, LUA_YIELD, or an
// error status with the message (and traceback) in rz_string.
RZ_EXPORT int rz_resume(RzScript* s, lua_State* T, int nargs)
{
    s->inExecution = true;
    s->exactSize = 0;
    int status = lua_resume(T, nullptr, nargs);
    s->inExecution = false;
    // A break asked for in a run that ended first is moot.
    if (status != LUA_BREAK && status != LUA_YIELD)
        s->breakPending = false;
    if (status != LUA_OK && status != LUA_YIELD && status != LUA_BREAK)
    {
        // As SLua's host words a fault (Executor/src/Script.cpp).
        if (lua_type(T, -1) == LUA_TSTRING)
            s->scratch = lua_tostring(T, -1);
        else
            s->scratch = std::string("error object is a ") + lua_typename(T, lua_type(T, -1)) + " value";
        lua_pop(T, 1);
    }
    else if (status == LUA_OK)
        lua_settop(T, 0);
    return status;
}

RZ_EXPORT int rz_isnumber(lua_State* L, int i)
{
    return lua_isnumber(L, i);
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

// Lua's name for the type of the value at `i`, into the scratch buffer, as
// argument errors give it (luaL_typeerror).
RZ_EXPORT void rz_typename(RzScript* s, lua_State* L, int i)
{
    s->scratch = luaL_typename(L, i);
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
