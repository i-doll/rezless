local TAG = "C"
local CH = 7777
local buf = ""
local n = 0
local function flush()
  if buf ~= "" then ll.Say(CH, buf); buf = ""; ll.Sleep(0.5) end
end
local function emit(s)
  n += 1
  local line = TAG .. n .. " " .. s
  if #line > 470 then line = string.sub(line, 1, 470) end
  if #buf + #line + 1 > 480 then flush() end
  buf = buf == "" and line or (buf .. "\n" .. line)
end
local function show(v)
  local ty = typeof(v)
  if ty == "table" then
    local parts = {}
    for i = 1, #v do parts[#parts + 1] = typeof(v[i]) .. ":" .. tostring(v[i]) end
    return "{" .. table.concat(parts, " | ") .. "}"
  end
  return ty .. ":" .. tostring(v)
end
local function t(label, f, ...)
  local r = table.pack(pcall(f, ...))
  if r[1] then
    emit(label .. " -> " .. (r.n == 1 and "(nothing)" or show(r[2])))
  else
    emit(label .. " !! " .. tostring(r[2]))
  end
end
ll.SetObjectName("probe issue-405 " .. TAG)
local U = touuid("5748decc-f629-461c-9a36-a35a221fe21f")
local V = vector(1, 2, 3)
local Q = quaternion(0, 0, 0, 1)

local NIL = {}
local function lbl(v)
  if v == NIL then return "nil" end
  if type(v) == "string" then return '"' .. v .. '"' end
  if typeof(v) == "uuid" then return "U" end
  if typeof(v) == "vector" then return "V" end
  if typeof(v) == "quaternion" then return "Q" end
  if type(v) == "table" then return "{}" end
  return tostring(v)
end
local function un(v) if v == NIL then return nil end return v end
local function r1(f, ...)
  local r = table.pack(pcall(f, ...))
  if r[1] then return r.n == 1 and "(nothing)" or show(r[2]) end
  return "!! " .. tostring(r[2])
end
local XS = {true, false, 1, 1.5, -1.5, 0.5, 2.5, -0.0, "2", " 2 ", "0x10", "abc", "", U, V, Q, NIL, {}, 2^31, -2^31 - 1, 1e10, 0/0, 1/0}
for _, name in {"Fabs", "Abs", "Floor", "Ceil", "Round", "Sqrt", "Sin", "Cos", "Tan", "Asin", "Acos", "Log", "Log10", "ToUpper", "ToLower", "StringLength", "GetListLength", "Sleep"} do
  for _, x in XS do
    if not (name == "Sleep" and type(x) == "number" and (x > 1 or x ~= x)) and not (name == "Sleep" and (x == "2" or x == " 2 " or x == "0x10")) then
      local a = r1(ll[name], un(x))
      local b = r1(llcompat[name], un(x))
      emit(name .. "(" .. lbl(x) .. ") -> " .. a .. (a == b and "" or (" ;; compat " .. b)))
    end
  end
end
local PAIRS = {{2, 3}, {2, true}, {true, 2}, {"2", "3"}, {2, NIL}, {NIL, 2}, {2, 0.5}, {-8, 1 / 3}, {0, 0}, {0, -1}, {2, U}, {V, 2}, {1e10, 2}, {2, 31}, {2, 32}, {-1, 0.5}}
for _, name in {"Pow", "Atan2"} do
  for _, p in PAIRS do
    local a = r1(ll[name], un(p[1]), un(p[2]))
    local b = r1(llcompat[name], un(p[1]), un(p[2]))
    emit(name .. "(" .. lbl(p[1]) .. "," .. lbl(p[2]) .. ") -> " .. a .. (a == b and "" or (" ;; compat " .. b)))
  end
end
-- big / edge numerics
for _, x in {2147483647.5, 2147483648, -2147483648, -2147483649, 4294967296, 4294967297.9, 1e15, -1e15, 1e300, -1/0, 0.49999999, -0.5, -2.5, 3.5, 16777217, 0.1} do
  for _, name in {"Abs", "Fabs", "Floor", "Ceil", "Round", "Sqrt", "ToUpper"} do
    local a = r1(ll[name], x)
    local b = r1(llcompat[name], x)
    emit(name .. "(" .. tostring(x) .. ") -> " .. a .. (a == b and "" or (" ;; compat " .. b)))
  end
end
-- GetSubString / OwnerSay / others SLua answers itself
local SUB = {{1, 3}, {1, -1}, {0, 2}, {-3, -1}, {4, 2}, {2, 2}, {7, 9}, {-9, 2}, {1.5, 3.9}, {true, 3}, {"2", "3"}, {NIL, 2}, {2, NIL}, {1, 2^31}, {-1, 1}, {3, 1}}
for _, p in SUB do
  local a = r1(ll.GetSubString, "abcdef", un(p[1]), un(p[2]))
  local b = r1(llcompat.GetSubString, "abcdef", un(p[1]), un(p[2]))
  emit("GetSubString(abcdef," .. lbl(p[1]) .. "," .. lbl(p[2]) .. ") -> " .. a .. " ;; compat " .. b)
end
for _, x in {5, 1.5, true, U, V, NIL, {}} do
  emit("GetSubString(" .. lbl(x) .. ",1,2) -> " .. r1(ll.GetSubString, un(x), 1, 2) .. " ;; compat " .. r1(llcompat.GetSubString, un(x), 0, 1))
  emit("OwnerSay(" .. lbl(x) .. ") -> " .. r1(ll.OwnerSay, un(x)) .. " ;; compat " .. r1(llcompat.OwnerSay, un(x)))
end
emit("GetSubString('héllo',2,3) -> " .. r1(ll.GetSubString, "héllo", 2, 3) .. " len " .. r1(ll.StringLength, "héllo"))
emit("ToUpper('héllo ß ǆ') -> " .. r1(ll.ToUpper, "héllo ß ǆ") .. " / " .. r1(ll.ToLower, "HÉLLO İ Ǆ"))
emit("GenerateKey -> " .. typeof(ll.GenerateKey()) .. " compat " .. typeof(llcompat.GenerateKey()))
emit("GetTime -> " .. typeof(ll.GetTime()) .. " compat " .. typeof(llcompat.GetTime()))
emit("DetectedTouchFace -> " .. r1(ll.DetectedTouchFace, 1) .. " ;; " .. r1(ll.DetectedTouchFace, 0) .. " ;; " .. r1(ll.DetectedTouchFace, true) .. " ;; compat " .. r1(llcompat.DetectedTouchFace, 0))
emit("GetUsedMemory(1) -> " .. typeof(ll.GetUsedMemory(1)) .. " GetFreeMemory " .. typeof(ll.GetFreeMemory()))
emit("ToUpper('a','b') -> " .. r1(ll.ToUpper, "a", "b") .. " Abs() -> " .. r1(ll.Abs) .. " ToUpper() -> " .. r1(ll.ToUpper))
emit("DONE")
flush()
