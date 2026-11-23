import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'

// https://luau.org/library#math-library
// https://wiki.secondlife.com/wiki/SLua
// https://wiki.secondlife.com/wiki/LlAxisAngle2Rot
// https://wiki.secondlife.com/wiki/LlRot2Fwd
// https://wiki.secondlife.com/wiki/LlVecNorm
//
// In-world: SLua Tideland on the Aditi beta grid, 2026-11-23. Each probe below ran in a box and
// said its results with llOwnerSay in chunks; every expression takes its inputs at run time
// (tonumber, or a float cast from a string), so nothing is folded by a compiler. SLua prints
// numbers with %.9g. LSL prints a float under 1e-30 as itself times 1e45 with an "e-45" suffix
// (and likewise e-30 and e-15), because a cast to string keeps only six decimals.

const MATH_PROBE = `local function f(x) return string.format("%.9g", x) end
local function s(x)
  local t = typeof(x)
  if t == "vector" then return \`<{f(x.x)},{f(x.y)},{f(x.z)}>\` end
  if t == "quaternion" then return \`<{f(x.x)},{f(x.y)},{f(x.z)},{f(x.s)}>\` end
  if t == "number" then return f(x) end
  return tostring(x)
end
local N = tonumber
local function V(a, b, c) return vector.create(N(a), N(b), N(c)) end
local function Q(a, b, c, d) return quaternion(N(a), N(b), N(c), N(d)) end
local buf = ""
local function add(name, ok, val)
  local item = name .. "=" .. (ok and s(val) or ("ERR " .. tostring(val)))
  if #buf + #item > 470 then ll.OwnerSay(buf); ll.Sleep(0.5); buf = "" end
  buf = buf .. item .. " | "
end
local function T(name, fn) add(name, pcall(fn)) end
for _, x in {"1e-310","-1e-310","5e-324"} do
  T("sin" .. x, function() return math.sin(N(x)) end)
  T("tan" .. x, function() return math.tan(N(x)) end)
  T("asin" .. x, function() return math.asin(N(x)) end)
  T("atan" .. x, function() return math.atan(N(x)) end)
  T("sinh" .. x, function() return math.sinh(N(x)) end)
  T("tanh" .. x, function() return math.tanh(N(x)) end)
end
T("cos", function() return math.cos(N("1e-310")) end)
T("cosh", function() return math.cosh(N("1e-310")) end)
T("acos", function() return math.acos(N("1")) end)
T("atan2a", function() return math.atan2(N("1e-310"), N("1")) end)
T("atan2b", function() return math.atan2(N("1e-300"), N("1e10")) end)
T("atan2c", function() return math.atan2(N("-1e-300"), N("1e10")) end)
T("atan2d", function() return math.atan2(N("1e-300"), N("-1e10")) end)
T("exp708", function() return math.exp(N("-708")) end)
T("exp710", function() return math.exp(N("-710")) end)
T("exp745", function() return math.exp(N("-745")) end)
T("log", function() return math.log(N("1e-310")) end)
T("logb", function() return math.log(N("1e-310"), N("2")) end)
T("log10", function() return math.log10(N("1e-310")) end)
T("pow1", function() return math.pow(N("1e-160"), N("2")) end)
T("pow2", function() return math.pow(N("2"), N("-1030")) end)
T("pow3", function() return math.pow(N("1e-310"), N("1")) end)
T("pow4", function() return math.pow(N("1e-310"), N("0.5")) end)
T("pow5", function() return math.pow(N("1e-110"), N("3")) end)
T("sqrt", function() return math.sqrt(N("1e-310")) end)
T("fmod1", function() return math.fmod(N("1e-310"), N("1")) end)
T("fmod2", function() return math.fmod(N("3e-308"), N("2.2e-308")) end)
T("fmod3", function() return math.fmod(N("-1e-310"), N("1")) end)
T("floor", function() return math.floor(N("1e-310")) end)
T("ceil", function() return math.ceil(N("-1e-310")) end)
T("round", function() return math.round(N("-1e-310")) end)
T("sign", function() return math.sign(N("-1e-310")) end)
T("clamp", function() return math.clamp(N("1e-310"), N("0"), N("1")) end)
T("min", function() return math.min(N("1e-310"), N("1")) end)
T("max", function() return math.max(N("-1e-310"), N("-1")) end)
T("modf", function() local a, b = math.modf(N("1e-310")); return f(a) .. "," .. f(b) end)
T("modf2", function() local a, b = math.modf(N("-1e-310")); return f(a) .. "," .. f(b) end)
T("frexp", function() local a, b = math.frexp(N("1e-310")); return f(a) .. "," .. f(b) end)
T("noise1", function() return math.noise(N("1e-310")) end)
T("noise2", function() return math.noise(N("1e-307"), N("0"), N("0")) end)
T("noise3", function() return math.noise(N("1e-300"), N("1e-300"), N("1e-300")) end)
T("noise4", function() return math.noise(N("3e-308")) end)
local sin, exp, fmod, atan2 = math.sin, math.exp, math.fmod, math.atan2
T("lsin", function() return (sin)(N("1e-310")) end)
T("lexp", function() return (exp)(N("-710")) end)
T("lfmod", function() return (fmod)(N("3e-308"), N("2.2e-308")) end)
T("latan2", function() return (atan2)(N("1e-300"), N("1e10")) end)
ll.OwnerSay(buf .. "END")
`

const MATH_MEASURED = [
    'sin1e-310=1e-310',
    'tan1e-310=1e-310',
    'asin1e-310=1e-310',
    'atan1e-310=1e-310',
    'sinh1e-310=1e-310',
    'tanh1e-310=1e-310',
    'sin-1e-310=-1e-310',
    'tan-1e-310=-1e-310',
    'asin-1e-310=-1e-310',
    'atan-1e-310=-1e-310',
    'sinh-1e-310=-1e-310',
    'tanh-1e-310=-1e-310',
    'sin5e-324=4.94065646e-324',
    'tan5e-324=4.94065646e-324',
    'asin5e-324=4.94065646e-324',
    'atan5e-324=4.94065646e-324',
    'sinh5e-324=4.94065646e-324',
    'tanh5e-324=4.94065646e-324',
    'cos=1',
    'cosh=1',
    'acos=0',
    'atan2a=1e-310',
    'atan2b=1e-310',
    'atan2c=-1e-310',
    'atan2d=3.14159265',
    'exp708=3.307553e-308',
    'exp710=4.47628623e-309',
    'exp745=4.94065646e-324',
    'log=-713.801379',
    'logb=-1029.79771',
    'log10=-310',
    'pow1=9.99988867e-321',
    'pow2=8.69169476e-311',
    'pow3=1e-310',
    'pow4=1e-155',
    'pow5=0',
    'sqrt=1e-155',
    'fmod1=1e-310',
    'fmod2=8e-309',
    'fmod3=-1e-310',
    'floor=0',
    'ceil=-0',
    'round=-0',
    'sign=-1',
    'clamp=1e-310',
    'min=1e-310',
    'max=-1e-310',
    'modf=0,1e-310',
    'modf2=-0,-1e-310',
    'frexp=0.575261803,-1029',
    'noise1=0',
    'noise2=0',
    'noise3=0',
    'noise4=0',
    'lsin=1e-310',
    'lexp=4.47628623e-309',
    'lfmod=8e-309',
    'latan2=1e-310',
]

const LL_PROBE = `local function f(x) return string.format("%.9g", x) end
local function s(x)
  local t = typeof(x)
  if t == "vector" then return \`<{f(x.x)},{f(x.y)},{f(x.z)}>\` end
  if t == "quaternion" then return \`<{f(x.x)},{f(x.y)},{f(x.z)},{f(x.s)}>\` end
  if t == "number" then return f(x) end
  return tostring(x)
end
local N = tonumber
local function V(a, b, c) return vector.create(N(a), N(b), N(c)) end
local function Q(a, b, c, d) return quaternion(N(a), N(b), N(c), N(d)) end
local buf = ""
local function add(name, ok, val)
  local item = name .. "=" .. (ok and s(val) or ("ERR " .. tostring(val)))
  if #buf + #item > 470 then ll.OwnerSay(buf); ll.Sleep(0.5); buf = "" end
  buf = buf .. item .. " | "
end
local function T(name, fn) add(name, pcall(fn)) end
local function SV(t) return tovector(t) end
local function SQ(t) return toquaternion(t) end
T("sin40", function() return ll.Sin(N("1e-40")) end)
T("tan40", function() return ll.Tan(N("1e-40")) end)
T("asin40", function() return ll.Asin(N("1e-40")) end)
T("sqrt40", function() return ll.Sqrt(N("1e-40")) end)
T("cos40", function() return ll.Cos(N("1e-40")) end)
T("sin20", function() return ll.Sin(N("1e-20")) end)
T("atan2a", function() return ll.Atan2(N("1e-40"), N("1")) end)
T("atan2b", function() return ll.Atan2(N("1e-30"), N("1e10")) end)
T("pow", function() return ll.Pow(N("2"), N("-130")) end)
T("powk", function() return ll.Pow(N("1e-40"), N("1")) end)
T("log", function() return ll.Log(N("1e-40")) end)
T("log10", function() return ll.Log10(N("1e-40")) end)
T("fabs", function() return ll.Fabs(N("-1e-40")) end)
T("l2f", function() return ll.List2Float({N("1e-40")}, 1) end)
T("l2fd", function() return ll.List2Float({N("1e-310")}, 1) end)
T("vmag", function() return ll.VecMag(V("1e-19","0","0")) end)
T("vmag2", function() return ll.VecMag(V("1.1e-19","1e-19","0")) end)
T("vdist", function() return ll.VecDist(V("1e-19","0","0"), V("0","0","0")) end)
T("vnorm1", function() return ll.VecNorm(V("1","1e-30","0")) end)
T("vnorm2", function() return ll.VecNorm(V("1e20","1e-20","0")) end)
T("vnorm3", function() return ll.VecNorm(SV("<1, 1e-40, -1e-40>")) end)
T("vnorm4", function() return ll.VecNorm(V("1e-3","1e-38","0")) end)
T("e2r1", function() return ll.Euler2Rot(V("2e-38","0","0")) end)
T("e2r2", function() return ll.Euler2Rot(SV("<1e-40, 0, 0>")) end)
T("e2r3", function() return ll.Euler2Rot(V("1e-20","1e-20","0")) end)
T("e2r4", function() return ll.Euler2Rot(V("1e-20","1e-20","1e-20")) end)
T("r2e1", function() return ll.Rot2Euler(Q("1e-20","1e-20","0","1")) end)
T("r2e2", function() return ll.Rot2Euler(SQ("<1e-40, 0, 0, 1>")) end)
T("r2e3", function() return ll.Rot2Euler(Q("2e-38","0","0","1")) end)
T("rb1", function() return ll.RotBetween(V("1","0","0"), V("1","1e-20","0")) end)
T("rb2", function() return ll.RotBetween(V("1","0","0"), SV("<1, 1e-40, 0>")) end)
T("rb3", function() return ll.RotBetween(V("1","0","0"), V("1","1e-38","0")) end)
T("aa1", function() return ll.AxisAngle2Rot(V("1","0","0"), N("2e-38")) end)
T("aa2", function() return ll.AxisAngle2Rot(V("1e20","1e-20","0"), N("1")) end)
T("aa3", function() return ll.AxisAngle2Rot(SV("<1, 1e-40, 0>"), N("1")) end)
T("r2ax", function() return ll.Rot2Axis(Q("1e-20","1e-20","0","1")) end)
T("r2ax2", function() return ll.Rot2Axis(SQ("<1e-40, 0, 0, 1>")) end)
T("r2an", function() return ll.Rot2Angle(Q("2e-38","0","0","1")) end)
T("fwd", function() return ll.Rot2Fwd(Q("1e-20","1e-20","0","1")) end)
T("left", function() return ll.Rot2Left(Q("1e-20","1e-20","0","1")) end)
T("up", function() return ll.Rot2Up(Q("1e-20","0","1e-20","1")) end)
T("axes", function() return ll.Axes2Rot(V("1","1e-20","0"), V("-1e-20","1","0"), V("0","0","1")) end)
T("angb", function() return ll.AngleBetween(Q("0","0","0","1"), Q("2e-38","0","0","1")) end)
T("l2v", function() return ll.List2Vector({SV("<1e-40, 0, 0>")}, 1) end)
T("l2r", function() return ll.List2Rot({SQ("<1e-40, 0, 0, 1>")}, 1) end)
T("vid", function() return ll.VecNorm(SV("<1e-40, 1, 0>")) end)
ll.OwnerSay(buf .. "END")
`

const LL_MEASURED = [
    'sin40=9.9999461e-41',
    'tan40=9.9999461e-41',
    'asin40=9.9999461e-41',
    'sqrt40=9.99997303e-21',
    'cos40=1',
    'sin20=9.99999968e-21',
    'atan2a=0',
    'atan2b=0',
    'pow=0',
    'powk=0',
    'log=-92.1034088',
    'log10=-40.0000038',
    'fabs=9.9999461e-41',
    'l2f=1e-40',
    'l2fd=1e-310',
    'vmag=0',
    'vmag2=1.10000003e-19',
    'vdist=0',
    'vnorm1=<1,1e-30,0>',
    'vnorm2=<0,0,0>',
    'vnorm3=<1,0,-0>',
    'vnorm4=<1,0,0>',
    'e2r1=<0,0,0,1>',
    'e2r2=<0,0,0,1>',
    'e2r3=<0,0,0,1>',
    'e2r4=<0,0,0,1>',
    'r2e1=<0,0,0>',
    'r2e2=<0,0,0>',
    'r2e3=<0,0,0>',
    'rb1=<0,0,0,1>',
    'rb2=<0,0,0,1>',
    'rb3=<0,0,0,1>',
    'aa1=<0,0,0,1>',
    'aa2=<0,0,0,1>',
    'aa3=<0.47942555,0,0,0.87758255>',
    'r2ax=<0,0,0>',
    'r2ax2=<0,0,0>',
    'r2an=0',
    'fwd=<1,0,-1.99999994e-20>',
    'left=<0,1,1.99999994e-20>',
    'up=<0,-1.99999994e-20,1>',
    'axes=<0,0,4.99999984e-21,1>',
    'angb=0',
    'l2v=<9.9999461e-41,0,0>',
    'l2r=<9.9999461e-41,0,0,1>',
    'vid=<0,1,0>',
]

const LL_PROBE2 = `local function f(x) return string.format("%.9g", x) end
local function s(x)
  local t = typeof(x)
  if t == "vector" then return \`<{f(x.x)},{f(x.y)},{f(x.z)}>\` end
  if t == "quaternion" then return \`<{f(x.x)},{f(x.y)},{f(x.z)},{f(x.s)}>\` end
  if t == "number" then return f(x) end
  return tostring(x)
end
local N = tonumber
local function V(a, b, c) return vector.create(N(a), N(b), N(c)) end
local function Q(a, b, c, d) return quaternion(N(a), N(b), N(c), N(d)) end
local buf = ""
local function add(name, ok, val)
  local item = name .. "=" .. (ok and s(val) or ("ERR " .. tostring(val)))
  if #buf + #item > 470 then ll.OwnerSay(buf); ll.Sleep(0.5); buf = "" end
  buf = buf .. item .. " | "
end
local function T(name, fn) add(name, pcall(fn)) end
local one = N("1")
T("ax19", function() return ll.AxisAngle2Rot(V("1e19","0","0"), one) end)
T("ax2e19", function() return ll.AxisAngle2Rot(V("2e19","0","0"), one) end)
T("ax20", function() return ll.AxisAngle2Rot(V("1e20","0","0"), one) end)
T("axt", function() return ll.AxisAngle2Rot(V("1e-20","0","0"), one) end)
T("aab", function() return ll.AxisAngle2Rot(V("1","0","0"), N("3e-38")) end)
T("aac", function() return ll.AxisAngle2Rot(V("1","0","0"), N("2.2e-38")) end)
T("fwd2", function() return ll.Rot2Fwd(toquaternion("<1e-40, 0, 0, 1>")) end)
T("vn20", function() return ll.VecNorm(V("1e20","0","0")) end)
T("vm20", function() return ll.VecMag(V("1e20","0","0")) end)
T("r2an", function() return ll.Rot2Angle(Q("2e-38","0","0","1")) end)
T("rb4", function() return ll.RotBetween(V("1","0","0"), V("1","1e-20","0")) end)
T("vrot", function() return V("1","0","0") * Q("1e-20","1e-20","0","1") end)
T("e2r5", function() return ll.Euler2Rot(V("3e-38","0","0")) end)
T("e2r6", function() return ll.Euler2Rot(V("1e-37","0","0")) end)
T("sin38", function() return ll.Sin(N("1e-38")) end)
T("vnorm5", function() return ll.VecNorm(V("1","1e-38","0")) end)
T("vnorm6", function() return ll.VecNorm(V("1","2e-38","0")) end)
ll.OwnerSay(buf .. "END")
`

const LL_MEASURED2 = [
    'ax19=<0.47942555,0,0,0.87758255>',
    'ax2e19=<0,0,0,1>',
    'ax20=<0,0,0,1>',
    'axt=<0,0,0,1>',
    'aab=<1.50000004e-38,0,0,1>',
    'aac=<0,0,0,1>',
    'fwd2=<1,0,0>',
    'vn20=<0,0,0>',
    'vm20=inf',
    'r2an=0',
    'rb4=<0,0,0,1>',
    'vrot=<1,0,-1.99999994e-20>',
    'e2r5=<0,0,0,1>',
    'e2r6=<0,0,0,1>',
    'sin38=9.99999935e-39',
    'vnorm5=<1,0,0>',
    'vnorm6=<1,2.00000001e-38,0>',
]

const LSL_PROBE = `string buf;
string F(float f) {
    if (f == 0.0) return llList2CSV([f]);
    if (f > -1e-30 && f < 1e-30) return (string)(f * 1e38 * 1e7) + "e-45";
    if (f > -1e-15 && f < 1e-15) return (string)(f * 1e30) + "e-30";
    if (f > -1e-3 && f < 1e-3) return (string)(f * 1e15) + "e-15";
    return (string)f;
}
string FV(vector v) { return "<" + F(v.x) + "," + F(v.y) + "," + F(v.z) + ">"; }
string FR(rotation r) { return "<" + F(r.x) + "," + F(r.y) + "," + F(r.z) + "," + F(r.s) + ">"; }
T(string name, string val) {
    string item = name + "=" + val;
    if (llStringLength(buf) + llStringLength(item) > 470) { llOwnerSay(buf); llSleep(0.5); buf = ""; }
    buf += item + " | ";
}
default {
    state_entry() {
        buf = "";
        float t40 = (float)"1e-40";
        float a = (float)"1e-20";
        float b = (float)"2e-38";
        float c = (float)"1.9e-38";
        float one = (float)"1";
        float zero = (float)"0";
        T("cast", F(t40));
        T("castn", F((float)"-1e-40"));
        T("aa", F(a * a));
        T("half", F(b / 2.0));
        T("halfv", F(b / (float)"2"));
        T("sub", F(b - c));
        T("add0", F(t40 + zero));
        T("mul1", F(t40 * one));
        T("neg", F(-t40));
        float x = t40; x += zero; T("pluseq", F(x));
        x = t40; x *= one; T("muleq", F(x));
        T("big", F(t40 * 1e38));
        T("int", F(1 * t40));
        T("lf", F(llList2Float([t40], 0)));
        T("lfa", F(llList2Float([a * a], 0)));
        T("fabs", F(llFabs(-t40)));
        T("sin", F(llSin(t40)));
        T("sqrt", F(llSqrt(t40)));
        T("pow", F(llPow(2.0, (float)"-130")));
        T("atan2", F(llAtan2((float)"1e-30", (float)"1e10")));
        vector v = <a, 0, 0>;
        T("vf", FV(v * a));
        T("fv", FV(a * v));
        T("vdiv", FV(v / (float)"1e20"));
        T("dot", F(v * v));
        T("vadd", FV(<b, 0, 0> - <c, 0, 0>));
        T("vcast", FV((vector)"<1e-40, 0, 0>"));
        T("vlit", FV(<t40, 0, 0>));
        T("vneg", FV(-<t40, 0, 0>));
        T("vmag", F(llVecMag(v)));
        T("vnorm", FV(llVecNorm(<(float)"1e20", a, 0>)));
        T("vnorm3", FV(llVecNorm((vector)"<1, 1e-40, 0>")));
        T("e2r1", FR(llEuler2Rot(<b, 0, 0>)));
        T("e2r3", FR(llEuler2Rot(<a, a, 0>)));
        T("r2e1", FV(llRot2Euler(<a, a, 0, one>)));
        T("rb1", FR(llRotBetween(<1, 0, 0>, <1, a, 0>)));
        T("aa1", FR(llAxisAngle2Rot(<1, 0, 0>, b)));
        T("aa2", FR(llAxisAngle2Rot(<(float)"1e20", a, 0>, one)));
        T("fwd", FV(llRot2Fwd(<a, a, 0, one>)));
        rotation r = <a, a, 0, one>;
        T("rmul", FR(r * r));
        T("vrot", FV(<1, 0, 0> * r));
        T("rcast", FR((rotation)"<1e-40, 0, 0, 1>"));
        T("rlit", FR(<t40, 0, 0, one>));
        llOwnerSay(buf + "END");
    }
}
`

const LSL_MEASURED = [
    'cast=99999.460000e-45',
    'castn=-99999.460000e-45',
    'aa=99999.460000e-45',
    'half=9999999.000000e-45',
    'halfv=9999999.000000e-45',
    'sub=1000000.000000e-45',
    'add0=99999.460000e-45',
    'mul1=99999.460000e-45',
    'neg=-99999.460000e-45',
    'pluseq=99999.460000e-45',
    'muleq=99999.460000e-45',
    'big=0.010000',
    'int=99999.460000e-45',
    'lf=99999.460000e-45',
    'lfa=99999.460000e-45',
    'fabs=99999.460000e-45',
    'sin=99999.460000e-45',
    'sqrt=9999973000.000000e-30',
    'pow=734683.900000e-45',
    'atan2=99999.460000e-45',
    'vf=<99999.460000e-45,0.000000,0.000000>',
    'fv=<99999.460000e-45,0.000000,0.000000>',
    'vdiv=<99999.460000e-45,0.000000,0.000000>',
    'dot=99999.460000e-45',
    'vadd=<1000000.000000e-45,0.000000,0.000000>',
    'vcast=<99999.460000e-45,0.000000,0.000000>',
    'vlit=<99999.460000e-45,0.000000,0.000000>',
    'vneg=<-99999.460000e-45,-0.000000,-0.000000>',
    'vmag=10000000000.000000e-30',
    'vnorm=<1.000000,99999.460000e-45,0.000000>',
    'vnorm3=<1.000000,99999.460000e-45,0.000000>',
    'e2r1=<0.000000,0.000000,0.000000,1.000000>',
    'e2r3=<0.000000,0.000000,0.000000,1.000000>',
    'r2e1=<0.000000,0.000000,0.000000>',
    'rb1=<0.000000,0.000000,0.000000,1.000000>',
    'aa1=<0.000000,0.000000,0.000000,1.000000>',
    'aa2=<0.000000,0.000000,0.000000,1.000000>',
    'fwd=<1.000000,0.000000,-20000000000.000000e-30>',
    'rmul=<20000000000.000000e-30,20000000000.000000e-30,0.000000,1.000000>',
    'vrot=<1.000000,200000.300000e-45,-20000000000.000000e-30>',
    'rcast=<99999.460000e-45,0.000000,0.000000,1.000000>',
    'rlit=<99999.460000e-45,0.000000,0.000000,1.000000>',
]

const LSL_PROBE2 = `string buf;
string F(float f) {
    if (f == 0.0) return llList2CSV([f]);
    if (f > -1e-30 && f < 1e-30) return (string)(f * 1e38 * 1e7) + "e-45";
    if (f > -1e-15 && f < 1e-15) return (string)(f * 1e30) + "e-30";
    if (f > -1e-3 && f < 1e-3) return (string)(f * 1e15) + "e-15";
    return (string)f;
}
string FV(vector v) { return "<" + F(v.x) + "," + F(v.y) + "," + F(v.z) + ">"; }
string FR(rotation r) { return "<" + F(r.x) + "," + F(r.y) + "," + F(r.z) + "," + F(r.s) + ">"; }
T(string name, string val) {
    string item = name + "=" + val;
    if (llStringLength(buf) + llStringLength(item) > 470) { llOwnerSay(buf); llSleep(0.5); buf = ""; }
    buf += item + " | ";
}
default {
    state_entry() {
        buf = "";
        float a = (float)"1e-20";
        float b = (float)"2e-38";
        float one = (float)"1";
        rotation r = <a, a, 0, one>;
        T("left", FV(llRot2Left(r)));
        T("up", FV(llRot2Up(<a, 0, a, one>)));
        T("aa3", FR(llAxisAngle2Rot((vector)"<1, 1e-40, 0>", one)));
        T("vid", FV(llVecNorm((vector)"<1e-40, 1, 0>")));
        T("axes", FR(llAxes2Rot(<1, a, 0>, <-a, 1, 0>, <0, 0, 1>)));
        T("r2ax", FV(llRot2Axis(r)));
        T("r2ax2", FV(llRot2Axis((rotation)"<1e-40, 0, 0, 1>")));
        T("r2e2", FV(llRot2Euler((rotation)"<1e-40, 0, 0, 1>")));
        T("e2r2", FR(llEuler2Rot((vector)"<1e-40, 0, 0>")));
        T("rb2", FR(llRotBetween(<1, 0, 0>, (vector)"<1, 1e-40, 0>")));
        T("ax19", FR(llAxisAngle2Rot(<(float)"1e19", 0, 0>, one)));
        T("ax2e19", FR(llAxisAngle2Rot(<(float)"2e19", 0, 0>, one)));
        T("ax20", FR(llAxisAngle2Rot(<(float)"1e20", 0, 0>, one)));
        T("axt", FR(llAxisAngle2Rot(<a, 0, 0>, one)));
        T("aab", FR(llAxisAngle2Rot(<1, 0, 0>, (float)"3e-38")));
        T("aac", FR(llAxisAngle2Rot(<1, 0, 0>, (float)"2.2e-38")));
        T("vmul", FV((vector)"<1e-40, 0, 0>" * one));
        T("vrot0", FV((vector)"<1e-40, 1, 0>" * ZERO_ROTATION));
        T("fwd2", FV(llRot2Fwd((rotation)"<1e-40, 0, 0, 1>")));
        T("dist", F(llVecDist(<a, 0, 0>, ZERO_VECTOR)));
        T("ang", F(llAngleBetween(ZERO_ROTATION, <b, 0, 0, one>)));
        T("r2an", F(llRot2Angle(<b, 0, 0, one>)));
        T("vn20", FV(llVecNorm(<(float)"1e20", 0, 0>)));
        T("vm20", F(llVecMag(<(float)"1e20", 0, 0>)));
        llOwnerSay(buf + "END");
    }
}
`

const LSL_MEASURED2 = [
    'left=<0.000000,1.000000,20000000000.000000e-30>',
    'up=<0.000000,-20000000000.000000e-30,1.000000>',
    'aa3=<0.479426,0.000000,0.000000,0.877583>',
    'vid=<99999.460000e-45,1.000000,0.000000>',
    'axes=<0.000000,0.000000,5000000000.000000e-30,1.000000>',
    'r2ax=<0.000000,0.000000,0.000000>',
    'r2ax2=<0.000000,0.000000,0.000000>',
    'r2e2=<0.000000,0.000000,0.000000>',
    'e2r2=<0.000000,0.000000,0.000000,1.000000>',
    'rb2=<0.000000,0.000000,0.000000,1.000000>',
    'ax19=<0.479426,0.000000,0.000000,0.877583>',
    'ax2e19=<0.000000,0.000000,0.000000,1.000000>',
    'ax20=<0.000000,0.000000,0.000000,1.000000>',
    'axt=<0.000000,0.000000,0.000000,1.000000>',
    'aab=<15000000.000000e-45,0.000000,0.000000,1.000000>',
    'aac=<0.000000,0.000000,0.000000,1.000000>',
    'vmul=<99999.460000e-45,0.000000,0.000000>',
    'vrot0=<99999.460000e-45,1.000000,0.000000>',
    'fwd2=<1.000000,0.000000,0.000000>',
    'dist=10000000000.000000e-30',
    'ang=0.000000',
    'r2an=0.000000',
    'vn20=<1.000000,0.000000,0.000000>',
    'vm20=100000000000000000000.000000',
]

const AXIS_PROBE = `string buf;
string F(float f) {
    if (f == 0.0) return llList2CSV([f]);
    if (f > -1e-30 && f < 1e-30) return (string)(f * 1e38 * 1e7) + "e-45";
    if (f > -1e-15 && f < 1e-15) return (string)(f * 1e30) + "e-30";
    if (f > -1e-3 && f < 1e-3) return (string)(f * 1e15) + "e-15";
    return (string)f;
}
string FV(vector v) { return "<" + F(v.x) + "," + F(v.y) + "," + F(v.z) + ">"; }
string FR(rotation r) { return "<" + F(r.x) + "," + F(r.y) + "," + F(r.z) + "," + F(r.s) + ">"; }
T(string name, string val) {
    string item = name + "=" + val;
    if (llStringLength(buf) + llStringLength(item) > 470) { llOwnerSay(buf); llSleep(0.5); buf = ""; }
    buf += item + " | ";
}
rotation A(string axis, float angle) { return llAxisAngle2Rot((vector)axis, angle); }
default {
    state_entry() {
        buf = "";
        float one = (float)"1";
        T("z2pi", FR(A("<0,0,0>", TWO_PI)));
        T("zpi", FR(A("<0,0,0>", PI)));
        T("z3", FR(A("<0,0,0>", (float)"3")));
        T("o2pi", FR(A("<1e20,0,0>", TWO_PI)));
        T("t2pi", FR(A("<1e-20,0,0>", TWO_PI)));
        T("n2pi", FR(A("<1,0,0>", TWO_PI)));
        T("m1e-19", FR(A("<1e-19,0,0>", one)));
        T("m1.1e-19", FR(A("<1.1e-19,0,0>", one)));
        T("m1e-18", FR(A("<1e-18,0,0>", one)));
        T("m1e-10", FR(A("<1e-10,0,0>", one)));
        T("m1e-8", FR(A("<1e-8,0,0>", one)));
        T("m1e-7", FR(A("<1e-7,0,0>", one)));
        T("m1.5e-7", FR(A("<1.5e-7,0,0>", one)));
        T("m1e-6", FR(A("<1e-6,0,0>", one)));
        T("m1.8e19", FR(A("<1.8e19,0,0>", one)));
        T("m1.9e19", FR(A("<1.9e19,0,0>", one)));
        T("mix", FR(A("<1e-10,1e-10,0>", one)));
        T("big", FR(A("<1,2,3>", (float)"7")));
        T("neg", FR(A("<0,-1,0>", (float)"-2.5")));
        llOwnerSay(buf + "END");
    }
}
`

const AXIS_MEASURED = [
    'z2pi=<-0.000000,-0.000000,-0.000000,-1.000000>',
    'zpi=<0.000000,0.000000,0.000000,1.000000>',
    'z3=<0.000000,0.000000,0.000000,1.000000>',
    'o2pi=<-0.000000,-0.000000,-0.000000,-1.000000>',
    't2pi=<-0.000000,-0.000000,-0.000000,-1.000000>',
    'n2pi=<-87422780.000000e-15,-0.000000,-0.000000,-1.000000>',
    'm1e-19=<0.000000,0.000000,0.000000,1.000000>',
    'm1.1e-19=<0.000000,0.000000,0.000000,1.000000>',
    'm1e-18=<0.000000,0.000000,0.000000,1.000000>',
    'm1e-10=<0.000000,0.000000,0.000000,1.000000>',
    'm1e-8=<0.000000,0.000000,0.000000,1.000000>',
    'm1e-7=<0.000000,0.000000,0.000000,1.000000>',
    'm1.5e-7=<0.479426,0.000000,0.000000,0.877583>',
    'm1e-6=<0.479426,0.000000,0.000000,0.877583>',
    'm1.8e19=<0.479426,0.000000,0.000000,0.877583>',
    'm1.9e19=<0.000000,0.000000,0.000000,1.000000>',
    'mix=<0.000000,0.000000,0.000000,1.000000>',
    'big=<-0.093751,-0.187502,-0.281252,-0.936457>',
    'neg=<-0.000000,0.948985,-0.000000,0.315322>',
]

const AXIS_PROBE_SLUA = `local function f(x) return string.format("%.9g", x) end
local function s(x)
  local t = typeof(x)
  if t == "vector" then return \`<{f(x.x)},{f(x.y)},{f(x.z)}>\` end
  if t == "quaternion" then return \`<{f(x.x)},{f(x.y)},{f(x.z)},{f(x.s)}>\` end
  if t == "number" then return f(x) end
  return tostring(x)
end
local N = tonumber
local function V(a, b, c) return vector.create(N(a), N(b), N(c)) end
local function Q(a, b, c, d) return quaternion(N(a), N(b), N(c), N(d)) end
local buf = ""
local function add(name, ok, val)
  local item = name .. "=" .. (ok and s(val) or ("ERR " .. tostring(val)))
  if #buf + #item > 470 then ll.OwnerSay(buf); ll.Sleep(0.5); buf = "" end
  buf = buf .. item .. " | "
end
local function T(name, fn) add(name, pcall(fn)) end
local function A(x, angle) return ll.AxisAngle2Rot(tovector(x), N(angle)) end
local P = tostring(math.pi * 2)
for _, c in {{"z2pi","<0,0,0>",P},{"zpi","<0,0,0>",tostring(math.pi)},{"z3","<0,0,0>","3"},{"o2pi","<1e20,0,0>",P},{"t2pi","<1e-20,0,0>",P},{"n2pi","<1,0,0>",P},{"m1e-19","<1e-19,0,0>","1"},{"m1.1e-19","<1.1e-19,0,0>","1"},{"m1e-18","<1e-18,0,0>","1"},{"m1e-10","<1e-10,0,0>","1"},{"m1e-8","<1e-8,0,0>","1"},{"m1e-7","<1e-7,0,0>","1"},{"m1.5e-7","<1.5e-7,0,0>","1"},{"m1e-6","<1e-6,0,0>","1"},{"m1.8e19","<1.8e19,0,0>","1"},{"m1.9e19","<1.9e19,0,0>","1"},{"mix","<1e-10,1e-10,0>","1"},{"big","<1,2,3>","7"},{"neg","<0,-1,0>","-2.5"}} do
  T(c[1], function() return A(c[2], c[3]) end)
end
ll.OwnerSay(buf .. "END")
`

const AXIS_MEASURED_SLUA = [
    'z2pi=<-0,-0,-0,-1>',
    'zpi=<0,0,0,1>',
    'z3=<0,0,0,0.99999994>',
    'o2pi=<-0,-0,-0,-1>',
    't2pi=<-0,-0,-0,-1>',
    'n2pi=<-8.74227766e-08,-0,-0,-1>',
    'm1e-19=<0,0,0,1>',
    'm1.1e-19=<0,0,0,1>',
    'm1e-18=<0,0,0,1>',
    'm1e-10=<0,0,0,1>',
    'm1e-8=<0,0,0,1>',
    'm1e-7=<0,0,0,1>',
    'm1.5e-7=<0.47942555,0,0,0.87758255>',
    'm1e-6=<0.47942555,0,0,0.87758255>',
    'm1.8e19=<0.47942555,0,0,0.87758255>',
    'm1.9e19=<0,0,0,1>',
    'mix=<0,0,0,1>',
    'big=<-0.09375076,-0.18750152,-0.281252265,-0.93645668>',
    'neg=<-0,0.948984623,-0,0.315322369>',
]

const AXIS_EDGE_PROBE = `string buf;
string F(float f) {
    if (f == 0.0) return llList2CSV([f]);
    if (f > -1e-30 && f < 1e-30) return (string)(f * 1e38 * 1e7) + "e-45";
    if (f > -1e-15 && f < 1e-15) return (string)(f * 1e30) + "e-30";
    if (f > -1e-3 && f < 1e-3) return (string)(f * 1e15) + "e-15";
    return (string)f;
}
string FV(vector v) { return "<" + F(v.x) + "," + F(v.y) + "," + F(v.z) + ">"; }
string FR(rotation r) { return "<" + F(r.x) + "," + F(r.y) + "," + F(r.z) + "," + F(r.s) + ">"; }
T(string name, string val) {
    string item = name + "=" + val;
    if (llStringLength(buf) + llStringLength(item) > 470) { llOwnerSay(buf); llSleep(0.5); buf = ""; }
    buf += item + " | ";
}
rotation A(string axis, float angle) { return llAxisAngle2Rot((vector)axis, angle); }
default {
    state_entry() {
        buf = "";
        T("n1e-8", FR(A("<-1e-8,0,0>", (float)"1")));
        T("nz", FR(A("<-0.0,0,-0.0>", (float)"1")));
        T("nzpi", FR(A("<-0.0,0,0>", TWO_PI)));
        T("nan4", FR(A("<nan,0,0>", (float)"4")));
        T("nan2pi", FR(A("<nan,0,0>", TWO_PI)));
        T("inf4", FR(A("<inf,0,0>", (float)"4")));
        T("s15", FR(A("<1.5e19,1.5e19,0>", (float)"1")));
        llOwnerSay(buf + "END");
    }
}
`

const AXIS_EDGE_MEASURED = [
    'n1e-8=<0.000000,0.000000,0.000000,1.000000>',
    'nz=<0.000000,0.000000,0.000000,1.000000>',
    'nzpi=<-0.000000,-0.000000,-0.000000,-1.000000>',
    'nan4=<0.000000,0.000000,0.000000,-1.000000>',
    'nan2pi=<-0.000000,-0.000000,-0.000000,-1.000000>',
    'inf4=<0.000000,0.000000,0.000000,1.000000>',
    's15=<0.000000,0.000000,0.000000,1.000000>',
]

const AXIS_EDGE_PROBE_SLUA = `local function f(x) return string.format("%.9g", x) end
local function s(x)
  local t = typeof(x)
  if t == "vector" then return \`<{f(x.x)},{f(x.y)},{f(x.z)}>\` end
  if t == "quaternion" then return \`<{f(x.x)},{f(x.y)},{f(x.z)},{f(x.s)}>\` end
  if t == "number" then return f(x) end
  return tostring(x)
end
local N = tonumber
local function V(a, b, c) return vector.create(N(a), N(b), N(c)) end
local function Q(a, b, c, d) return quaternion(N(a), N(b), N(c), N(d)) end
local buf = ""
local function add(name, ok, val)
  local item = name .. "=" .. (ok and s(val) or ("ERR " .. tostring(val)))
  if #buf + #item > 470 then ll.OwnerSay(buf); ll.Sleep(0.5); buf = "" end
  buf = buf .. item .. " | "
end
local function T(name, fn) add(name, pcall(fn)) end
local function A(x, angle) return ll.AxisAngle2Rot(x, N(angle)) end
local P = tostring(math.pi * 2)
T("n1e-8", function() return A(tovector("<-1e-8,0,0>"), "1") end)
T("nz", function() return A(tovector("<-0.0,0,-0.0>"), "1") end)
T("nzpi", function() return A(tovector("<-0.0,0,0>"), P) end)
T("nan4", function() return A(vector.create(N("0")/N("0"), 0, 0), "4") end)
T("nan2pi", function() return A(vector.create(N("0")/N("0"), 0, 0), P) end)
T("inf4", function() return A(vector.create(N("1")/N("0"), 0, 0), "4") end)
T("s15", function() return A(tovector("<1.5e19,1.5e19,0>"), "1") end)
ll.OwnerSay(buf .. "END")
`

const AXIS_EDGE_MEASURED_SLUA = [
    'n1e-8=<0,0,0,1>',
    'nz=<0,0,0,1>',
    'nzpi=<-0,-0,-0,-1>',
    'nan4=<0,0,0,-1>',
    'nan2pi=<-0,-0,-0,-1>',
    'inf4=<0,0,0,1>',
    's15=<0,0,0,1>',
]

async function said(language: 'lsl' | 'slua', source: string) {
  const s = await loadScript(language === 'slua' ? { language, filename: 'probe.luau', source } : { source })
  s.start()
  return s.chat.map((c) => c.text).join('').split(' | ').filter((x) => x !== 'END')
}

describe('results below the smallest normal value', () => {
  // In-world: SLua's math library keeps every result below the smallest normal double, whether
  // the input is tiny (math.sin, tan, asin, atan, sinh, tanh, atan2, fmod, modf, frexp, min, max,
  // clamp) or the result alone is (math.exp(-710) is 4.47628623e-309, math.pow(2, -1030) is
  // 8.69169476e-311, math.fmod(3e-308, 2.2e-308) is 8e-309). Calling them through a local gives
  // the same. Only the arithmetic operators flush, as pinned in slua-float-flush.test.ts.
  it('keeps tiny results from the SLua math library', async () => {
    expect(await said('slua', MATH_PROBE)).toEqual(MATH_MEASURED)
  })

  // In-world: ll functions in SLua take a float that keeps a tiny value (ll.Sin(1e-40) and
  // ll.Fabs(-1e-40) give it back), and a list keeps a tiny number or vector part. ll.VecNorm,
  // ll.AxisAngle2Rot and ll.Rot2Fwd, Left and Up flush every part of their result below the
  // smallest normal float: ll.VecNorm(<1, 1e-40, -1e-40>) is <1, 0, -0>.
  it('flushes tiny parts of ll.VecNorm, ll.AxisAngle2Rot and ll.Rot2Fwd results in SLua', async () => {
    expect(await said('slua', LL_PROBE)).toEqual(LL_MEASURED)
  })

  // In-world: ll.AxisAngle2Rot makes the axis a unit vector in single precision first. An axis
  // whose squared length overflows a float (2e19 or more) or underflows it (1e-20) turns into no
  // rotation, as does a half angle below the smallest normal float (2.2e-38 radians), while
  // 3e-38 radians gives x 1.50000004e-38.
  it('turns an axis that over- or underflows into no rotation in ll.AxisAngle2Rot', async () => {
    expect(await said('slua', LL_PROBE2)).toEqual(LL_MEASURED2)
  })

  // In-world: the same LSL source compiled for Mono. Mono's own float arithmetic, casts, llVecNorm,
  // llVecMag and a vector times a rotation keep tiny values, but llAxisAngle2Rot and llRot2Fwd,
  // Left and Up flush them as in SLua.
  //
  // Compiled to Luau, the same source gave zero for every tiny result, starting with the cast
  // (float)"1e-40" and each float operator, except the casts (vector)"<1e-40, 0, 0>" and
  // (rotation)"<1e-40, 0, 0, 1>", which kept 9.9999461e-41. Its llVecNorm and llVecMag of
  // <1e20, 0, 0> gave ZERO_VECTOR and infinity, where Mono gives <1, 0, 0> and 1e20.
  // rezless runs LSL as Mono does.
  it('keeps tiny Mono floats except in llAxisAngle2Rot and llRot2Fwd, Left and Up', async () => {
    expect(await said('lsl', LSL_PROBE)).toEqual(LSL_MEASURED)
  })

  it('turns an axis that over- or underflows into no rotation in llAxisAngle2Rot under Mono', async () => {
    expect(await said('lsl', LSL_PROBE2)).toEqual(LSL_MEASURED2)
  })

  // In-world: a second LSL and SLua pair, the same day and region. The LSL gave the same under
  // Mono and compiled to Luau. An axis no longer than 1e-7 is no direction, from 1.5e-7 on it is,
  // and an axis of 1.9e19 overflows while 1.8e19 doesn't. The axis isn't checked on its own: a
  // zero axis still gives the angle's cosine, so ZERO_VECTOR and TWO_PI give <-0, -0, -0, -1>,
  // and with PI the result is too short to normalise and becomes ZERO_ROTATION.
  it('normalises the axis and the result of llAxisAngle2Rot in single precision', async () => {
    expect(await said('lsl', AXIS_PROBE)).toEqual(AXIS_MEASURED)
    expect(await said('slua', AXIS_PROBE_SLUA)).toEqual(AXIS_MEASURED_SLUA)
  })

  // In-world: a third pair, Mono and SLua alike. An axis with no direction becomes +0, whatever
  // its signs: <-1e-8, 0, 0> and <-0, 0, -0> give <0, 0, 0, 1> at angle 1. A NaN axis has no
  // direction either, so it keeps the cosine: angle 4 gives <0, 0, 0, -1>. An infinite part
  // gives ZERO_ROTATION, and so does <1.5e19, 1.5e19, 0>, whose squared length overflows.
  it('gives a +0 axis for a short, zero or NaN axis in llAxisAngle2Rot', async () => {
    expect(await said('lsl', AXIS_EDGE_PROBE)).toEqual(AXIS_EDGE_MEASURED)
    expect(await said('slua', AXIS_EDGE_PROBE_SLUA)).toEqual(AXIS_EDGE_MEASURED_SLUA)
  })
})
