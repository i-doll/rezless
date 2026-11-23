import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'

// https://luau.org/library#vector-library
// https://wiki.secondlife.com/wiki/SLua
//
// In-world: SLua Tideland on the Aditi beta grid, 2026-11-23. The script below ran in a box,
// compiled as SLua, and said its results with ll.OwnerSay; every number is printed with %.9g.
// The inputs come from tonumber at run time, so the compiler can't fold them, except d_lit.
// The grid flushes any result of float or number arithmetic below the smallest normal value
// (1.17549435e-38 for a float, 2.2250738585072014e-308 for a number) to a zero of the same
// sign, step by step: in vector.magnitude each square is flushed before the sum, so 1.1e-19 and
// 1e-19 have the length of 1.1e-19 alone. A tiny value that is only read, compared, made
// positive or square-rooted is kept: 1e-310 > 0 is true and math.sqrt(1e-310) is 1e-155.
// A vector or quaternion made from numbers keeps no part below the smallest normal float.
const PROBE = `
local function f(x) return string.format("%.9g", x) end
local function s(x)
  local t = typeof(x)
  if t == "vector" then return \`<{f(x.x)},{f(x.y)},{f(x.z)}>\` end
  if t == "quaternion" then return \`<{f(x.x)},{f(x.y)},{f(x.z)},{f(x.s)}>\` end
  if t == "number" then return f(x) end
  return tostring(x)
end
local N = tonumber
local function V(a, b, c) return vector.create(N(a), N(b), N(c)) end
local buf = ""
local function add(name, ok, val)
  local item = name .. "=" .. (ok and s(val) or ("ERR " .. tostring(val)))
  if #buf + #item > 700 then ll.OwnerSay(buf); buf = "" end
  buf = buf .. item .. " | "
end
local function T(name, fn) add(name, pcall(fn)) end

for _, x in {"1e-19","1.08e-19","1.084e-19","1.0842e-19","1.08420217e-19","1.0842022e-19","1.0843e-19","1.085e-19","1e-20","1e-22","3e-23","2e-23","1e-30","-1e-19","-1.1e-19"} do
  T("mag" .. x, function() return vector.magnitude(V(x, "0", "0")) end)
end
T("magY", function() return vector.magnitude(V("0", "1e-19", "0")) end)
T("magA", function() return vector.magnitude(V("1.1e-19", "1e-19", "0")) end)
T("magB", function() return vector.magnitude(V("8e-20", "8e-20", "8e-20")) end)
T("magC", function() return vector.magnitude(V("1e-19", "1", "0")) end)
T("magD", function() return vector.magnitude(V("1.1e-19", "1.1e-19", "1e-19")) end)
for _, t in {{"1e-19","0","0"},{"-1e-19","0","0"},{"0","1e-19","0"},{"0","0","-1e-19"},{"1.1e-19","0","0"},{"1.1e-19","1e-19","0"},{"1e-19","1e-19","1e-19"},{"3e-23","0","0"},{"1e-19","1","0"},{"0","0","0"},{"1e-40","0","0"},{"1e-30","1","0"}} do
  T("norm" .. table.concat(t, ","), function() return vector.normalize(V(t[1], t[2], t[3])) end)
end
T("dot1", function() return vector.dot(V("1e-19","0","0"), V("1e-19","0","0")) end)
T("dot2", function() return vector.dot(V("1.1e-19","1e-19","0"), V("1.1e-19","1e-19","0")) end)
T("dot3", function() return vector.dot(V("1e-19","1","0"), V("1e-19","1","0")) end)
T("dot4", function() return vector.dot(V("1e-20","0","0"), V("1e20","0","0")) end)
T("dot5", function() return vector.dot(V("1e-19","0","0"), V("-1e-19","0","0")) end)
T("cross1", function() return vector.cross(V("1e-19","0","0"), V("0","1e-19","0")) end)
T("cross2", function() return vector.cross(V("1.1e-19","0","0"), V("0","1.1e-19","0")) end)
T("cross3", function() return vector.cross(V("0","1e-19","0"), V("1e-19","0","0")) end)
T("angle1", function() return vector.angle(V("1","0","0"), V("1","1e-19","0")) end)
T("angle2", function() return vector.angle(V("1","0","0"), V("1","1.1e-19","0")) end)
T("angle3", function() return vector.angle(V("1","0","0"), V("1","2e-19","0"), V("0","0","-1")) end)
T("angle4", function() return vector.angle(V("1","0","0"), V("1","1e-19","0"), V("0","0","-1")) end)
T("lerp1", function() return vector.lerp(V("1e-37","0","0"), V("0","0","0"), N("0.99")) end)
T("lerp2", function() return vector.lerp(V("1e-37","-1e-37","0"), V("0","0","0"), N("0.99")) end)
T("lerp3", function() return vector.lerp(V("0","0","0"), V("1e-30","0","0"), N("1e-10")) end)
T("lerp4", function() return vector.lerp(V("1","0","0"), V("1","1e-30","0"), N("1e-10")) end)
T("floor", function() return vector.floor(V("1e-40","-1e-40","0.5")) end)
T("ceil", function() return vector.ceil(V("1e-40","-1e-40","0.5")) end)
T("abs", function() return vector.abs(V("1e-40","-1e-40","0.5")) end)
T("sign", function() return vector.sign(V("1e-40","-1e-40","0.5")) end)
T("max", function() return vector.max(V("-1e-40","1e-40","0"), V("0","0","-1")) end)
T("min", function() return vector.min(V("1e-40","-1e-40","0"), V("0","0","1")) end)
T("clamp", function() return vector.clamp(V("1e-40","-1e-40","0.5"), V("0","0","0"), V("1","1","1")) end)
T("mulvv", function() return V("1e-19","0","0") * V("1e-19","0","0") end)
T("sub", function() return V("1.5e-38","0","0") - V("1.4e-38","0","0") end)
T("add", function() return V("1.4e-38","0","0") + V("-1.3e-38","0","0") end)
T("mulvn", function() return V("1e-30","2e-30","1") * N("1e-10") end)
T("divvn", function() return V("1e-30","2e-30","1") / N("1e10") end)
T("mulnv", function() return N("1e-10") * V("1e-30","2e-30","1") end)
T("mulvtiny", function() return V("1e30","1","1") * N("1e-40") end)
T("multinyv", function() return N("1e-40") * V("1e30","1","1") end)
T("divtinyv", function() return N("1e-40") / V("1e-10","1","1") end)
T("divvv", function() return V("1e-20","0","0") / V("1e20","1","1") end)
T("neg", function() return -V("1e-40","-1e-40","0") end)
T("eq", function() return V("1e-40","0","0") == V("0","0","0") end)
T("negx", function() return V("-1e-40","0","0").x end)
T("mod", function() return V("1e-19","0","0") % V("0","1e-19","0") end)
T("litx", function() return vector(1e-40, 0, 0).x end)
T("rot", function() return V("1e-30","1","0") * quaternion(0, 0, N("0.70710677"), N("0.70710677")) end)
T("quatx", function() return quaternion(N("1e-40"), 0, 0, 1).x end)
T("quatmul", function() return quaternion(N("1e-20"), 0, 0, 1) * quaternion(0, N("1e-20"), 0, 1) end)
T("d_sq", function() local a = N("1e-160"); return a * a end)
T("d_lit", function() return 1e-160 * 1e-160 end)
T("d_den", function() return N("1e-310") end)
T("d_mul1", function() return N("1e-310") * N("1") end)
T("d_add0", function() return N("1e-310") + N("0") end)
T("d_eq0", function() return N("1e-310") == N("0") end)
T("d_gt0", function() return N("1e-310") > N("0") end)
T("d_half", function() return N("1e-310") / N("2") end)
T("d_min4", function() return N("2.2250738585072014e-308") / N("4") end)
T("d_abs", function() return math.abs(N("-1e-310")) end)
T("d_sqrt", function() return math.sqrt(N("1e-310")) end)
T("d_sum", function() return N("5e-324") + N("5e-324") end)
T("ll_fabs40", function() return ll.Fabs(N("1e-40")) end)
T("ll_fabs310", function() return ll.Fabs(N("1e-310")) end)
ll.OwnerSay(buf .. "END")
`

const MEASURED = [
    'mag1e-19=0',
    'mag1.08e-19=0',
    'mag1.084e-19=0',
    'mag1.0842e-19=0',
    'mag1.08420217e-19=1.08420217e-19',
    'mag1.0842022e-19=1.08420217e-19',
    'mag1.0843e-19=1.08430001e-19',
    'mag1.085e-19=1.08500001e-19',
    'mag1e-20=0',
    'mag1e-22=0',
    'mag3e-23=0',
    'mag2e-23=0',
    'mag1e-30=0',
    'mag-1e-19=0',
    'mag-1.1e-19=1.10000003e-19',
    'magY=0',
    'magA=1.10000003e-19',
    'magB=0',
    'magC=1',
    'magD=1.55563502e-19',
    'norm1e-19,0,0=<inf,-nan,-nan>',
    'norm-1e-19,0,0=<-inf,-nan,-nan>',
    'norm0,1e-19,0=<-nan,inf,-nan>',
    'norm0,0,-1e-19=<-nan,-nan,-inf>',
    'norm1.1e-19,0,0=<1,0,0>',
    'norm1.1e-19,1e-19,0=<1,0.909090877,0>',
    'norm1e-19,1e-19,1e-19=<inf,inf,inf>',
    'norm3e-23,0,0=<inf,-nan,-nan>',
    'norm1e-19,1,0=<9.99999968e-20,1,0>',
    'norm0,0,0=<-nan,-nan,-nan>',
    'norm1e-40,0,0=<-nan,-nan,-nan>',
    'norm1e-30,1,0=<1e-30,1,0>',
    'dot1=0',
    'dot2=1.21000006e-38',
    'dot3=1',
    'dot4=1',
    'dot5=0',
    'cross1=<0,0,0>',
    'cross2=<0,0,1.21000006e-38>',
    'cross3=<0,0,0>',
    'angle1=0',
    'angle2=1.10000003e-19',
    'angle3=-1.99999994e-19',
    'angle4=-0',
    'lerp1=<0,0,0>',
    'lerp2=<0,-0,0>',
    'lerp3=<0,0,0>',
    'lerp4=<1,0,0>',
    'floor=<0,-0,0>',
    'ceil=<0,-0,1>',
    'abs=<0,0,0.5>',
    'sign=<0,0,1>',
    'max=<-0,0,0>',
    'min=<0,-0,0>',
    'clamp=<0,-0,0.5>',
    'mulvv=<0,0,0>',
    'sub=<0,0,0>',
    'add=<0,0,0>',
    'mulvn=<0,0,1.00000001e-10>',
    'divvn=<0,0,1.00000001e-10>',
    'mulnv=<0,0,1.00000001e-10>',
    'mulvtiny=<0,0,0>',
    'multinyv=<0,0,0>',
    'divtinyv=<0,0,0>',
    'divvv=<0,0,0>',
    'neg=<-0,0,-0>',
    'eq=true',
    'negx=-0',
    'mod=<0,0,0>',
    'litx=0',
    'rot=<-0.99999994,0,0>',
    'quatx=0',
    'quatmul=<9.99999968e-21,9.99999968e-21,0,1>',
    'd_sq=0',
    'd_lit=9.99988867e-321',
    'd_den=1e-310',
    'd_mul1=0',
    'd_add0=0',
    'd_eq0=false',
    'd_gt0=true',
    'd_half=0',
    'd_min4=0',
    'd_abs=1e-310',
    'd_sqrt=1e-155',
    'd_sum=0',
    'll_fabs40=9.9999461e-41',
    'll_fabs310=0',
]

const PROBE2 = `local function f(x) return string.format("%.9g", x) end
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
  if #buf + #item > 700 then ll.OwnerSay(buf); buf = "" end
  buf = buf .. item .. " | "
end
local function T(name, fn) add(name, pcall(fn)) end
T("qmag", function() return quaternion.magnitude(Q("1e-19","0","0","0")) end)
T("qmag2", function() return quaternion.magnitude(Q("1.1e-19","1e-19","0","0")) end)
T("qdot", function() return quaternion.dot(Q("1e-19","0","0","0"), Q("1e-19","0","0","0")) end)
T("qdot2", function() return quaternion.dot(Q("1e-19","0","0","1"), Q("1e-19","0","0","1")) end)
T("qnorm", function() return quaternion.normalize(Q("1e-19","0","0","0")) end)
T("qnorm2", function() return quaternion.normalize(Q("1e-19","1","0","0")) end)
T("qslerp", function() return quaternion.slerp(Q("0","0","0","1"), Q("1e-19","0","0","1"), N("1e-20")) end)
T("qslerp2", function() return quaternion.slerp(Q("1e-37","0","0","1"), Q("0","0","0","1"), N("0.99")) end)
T("qadd", function() return Q("1.5e-38","0","0","1") - Q("1.4e-38","0","0","1") end)
T("rot1", function() return V("1e19","0","0") * Q("7e-20","7e-20","0","1") end)
T("rot2", function() return V("1","0","0") * Q("1e-19","1e-19","0","1") end)
T("rot3", function() return V("1e19","1e19","1e19") * Q("7e-20","0","7e-20","1") end)
T("rot4", function() return V("1e19","0","0") / Q("7e-20","7e-20","0","1") end)
T("idiv", function() return N("-1e-300") // N("1e10") end)
T("mod", function() return N("-1e-300") % N("1e10") end)
T("mod2", function() return N("1e-300") % N("-1e10") end)
T("idiv2", function() return N("1e-300") // N("-1e10") end)
T("lerp", function() return math.lerp(N("0"), N("1e-300"), N("1e-10")) end)
T("map", function() return math.map(N("1e-300"), N("0"), N("1"), N("0"), N("1e-10")) end)
T("unm", function() return -N("1e-310") end)
T("pow", function() return N("1e-160") ^ N("2") end)
T("pow3", function() return N("1e-110") ^ N("3") end)
T("powh", function() return N("1e-310") ^ N("0.5") end)
T("for", function() local out = {} for i = N("-2e-308"), N("1"), N("1e-308") do table.insert(out, f(i)) if #out >= 3 then break end end return table.concat(out, ",") end)
T("tovec", function() return tovector("<1e-40, 0, 0>") end)
T("toquat", function() return toquaternion("<1e-40, 0, 0, 1>") end)
T("floor", function() return math.floor(N("-1e-310")) end)
T("vfloordiv", function() return V("-1e-30","1","1") // N("1e10") end)
T("vmodn", function() return V("-1e-30","1","1") % N("1e10") end)
ll.OwnerSay(buf .. "END")
`

const MEASURED2 = [
    'qmag=0',
    'qmag2=1.10000003e-19',
    'qdot=0',
    'qdot2=1',
    'qnorm=<0,0,0,1>',
    'qnorm2=<9.99999968e-20,1,0,0>',
    'qslerp=<0,0,0,1>',
    'qslerp2=<0,0,0,1>',
    'qadd=<0,0,0,0>',
    'rot1=<9.99999998e+18,0,-1.39999998>',
    'rot2=<1,1.99999987e-38,-1.99999994e-19>',
    'rot3=<9.99999998e+18,9.99999998e+18,9.99999998e+18>',
    'rot4=<9.99999998e+18,0,1.39999998>',
    'idiv=-0',
    'mod=-1e-300',
    'mod2=1e-300',
    'idiv2=-0',
    'lerp=0',
    'map=0',
    'unm=-1e-310',
    'pow=9.99988867e-321',
    'pow3=0',
    'powh=1e-155',
    'for=-2e-308,-0,0',
    'tovec=<9.9999461e-41,0,0>',
    'toquat=<9.9999461e-41,0,0,1>',
    'floor=-1',
    'vfloordiv=<-1,0,0>',
    'vmodn=ERR lua_script:47: invalid argument #2 to \'__mod\' (vector expected, got number)',
]

describe('SLua float and number arithmetic near zero', () => {
  it('flushes results below the smallest normal value to zero, as Second Life does', async () => {
    const s = await loadScript({ language: 'slua', filename: 'probe.luau', source: PROBE })
    s.start()
    const said = s.chat.map((c) => c.text).join('').split(' | ').filter((x) => x !== 'END')
    expect(said).toEqual(MEASURED)
  })

  // In-world: a second script, the same day and region, for quaternions, a vector times a
  // rotation, //, %, math.lerp, math.map, powers, a for loop and string casts. Each step of
  // quaternion.magnitude, quaternion.dot and a vector turned by a rotation is flushed, and so are
  // the quotient inside // and %, the steps of math.lerp and math.map and the next index of a
  // for loop. A power keeps a tiny result (1e-160 ^ 2 is 9.99988867e-321), and so does a float
  // read from a string: tovector("<1e-40, 0, 0>") keeps 9.9999461e-41.
  it('flushes quaternion, rotation, division and library steps, but not powers or string casts', async () => {
    const s = await loadScript({ language: 'slua', filename: 'probe.luau', source: PROBE2 })
    s.start()
    const said = s.chat.map((c) => c.text).join('').split(' | ').filter((x) => x !== 'END')
    expect(said).toEqual(MEASURED2)
  })
})
