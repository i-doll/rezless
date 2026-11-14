local TAG = "D"
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
  if type(v) == "function" then return "print" end
  return tostring(v)
end
local function un(v) if v == NIL then return nil end return v end
local function r1(f, ...)
  local r = table.pack(pcall(f, ...))
  if r[1] then return r.n == 1 and "(nothing)" or show(r[2]) end
  return "!! " .. tostring(r[2])
end
local function both(name, mk)
  local a = r1(function() return mk(ll, 1) end)
  local b = r1(function() return mk(llcompat, 0) end)
  emit(name .. " -> " .. a .. (a == b and "" or (" ;; compat " .. b)))
end
local XS = {true, false, 1, 1.5, -0.0, -1.9, 16777217, 2^31, 1e10, 0.1, 1/0, 0/0, "s", "1.5", "0x10", " 7x", "", U, tostring(U), "<1,2,3>", "<0,0,0,1>", V, Q, {}, print, buffer.create(1)}
for _, name in {"DumpList2String", "List2String", "List2Integer", "List2Float", "List2Key", "List2Vector", "List2Rot", "GetListEntryType"} do
  for _, x in XS do
    if name == "DumpList2String" then
      both(name .. "({" .. lbl(x) .. "},',')", function(L) return L.DumpList2String({x}, ",") end)
    else
      both(name .. "({" .. lbl(x) .. "},i)", function(L, i) return L[name]({x}, i) end)
    end
  end
  both(name .. "({},i)", function(L, i) if name == "DumpList2String" then return L.DumpList2String({}, ",") end return L[name]({}, i) end)
end
both("DumpList2String({1,1.5,'a',U,V,Q},'|')", function(L) return L.DumpList2String({1, 1.5, "a", U, V, Q}, "|") end)
both("DumpList2String({'a','b'},'')", function(L) return L.DumpList2String({"a", "b"}, "") end)
both("DumpList2String({1,true},',')", function(L) return L.DumpList2String({1, true}, ",") end)
both("DumpList2String({1,nil,2},',')", function(L) return L.DumpList2String({1, nil, 2}, ",") end)
both("DumpList2String({a=1},',')", function(L) return L.DumpList2String({a = 1}, ",") end)
both("DumpList2String({0.1,-0.0,1e-7,123456.789,1e20,3e38},',')", function(L) return L.DumpList2String({0.1, -0.0, 1e-7, 123456.789, 1e20, 3e38}, ",") end)
both("List2String({0.1,...},each)", function(L, i) local r = {}; local x = {0.1, -0.0, 1e-7, 123456.789, 1e20, 2147483647, 16777217, -16777217, 1e6, 1234567, 12345678}; for k = 1, #x do r[#r + 1] = L.List2String(x, k - 1 + i) end; return table.concat(r, " ") end)
for _, sep in {NIL, 5, U, true, V, {}} do
  both("DumpList2String({1,2}," .. lbl(sep) .. ")", function(L) return L.DumpList2String({1, 2}, un(sep)) end)
end
-- index handling (ll 1-based / llcompat 0-based passes the same raw value)
for _, ix in {0, 1, 2, 3, 4, -1, -3, -4, 1.5, 2.9, true, false, "2", NIL, U, 2^31, -2^31} do
  local a = r1(ll.List2String, {"a", "b", "c"}, un(ix))
  local b = r1(llcompat.List2String, {"a", "b", "c"}, un(ix))
  emit("List2String({a,b,c}," .. lbl(ix) .. ") -> " .. a .. " ;; compat " .. b)
  a = r1(ll.GetListEntryType, {"a", 1, V}, un(ix))
  b = r1(llcompat.GetListEntryType, {"a", 1, V}, un(ix))
  emit("GetListEntryType({a,1,V}," .. lbl(ix) .. ") -> " .. a .. " ;; compat " .. b)
end
local RANGES = {{1, 2}, {2, -1}, {0, 1}, {-2, -1}, {3, 1}, {4, 2}, {1, 9}, {7, 9}, {-9, 2}, {true, 2}, {1, true}, {1.5, 2.9}, {"1", "2"}, {NIL, 2}, {2, NIL}, {-1, 1}, {4, 4}, {5, 5}}
for _, p in RANGES do
  for _, name in {"List2List", "DeleteSubList"} do
    local a = r1(ll[name], {"a", "b", "c", "d"}, un(p[1]), un(p[2]))
    local b = r1(llcompat[name], {"a", "b", "c", "d"}, un(p[1]), un(p[2]))
    emit(name .. "({a,b,c,d}," .. lbl(p[1]) .. "," .. lbl(p[2]) .. ") -> " .. a .. " ;; compat " .. b)
  end
  local a = r1(ll.ListReplaceList, {"a", "b", "c", "d"}, {"X", "Y"}, un(p[1]), un(p[2]))
  local b = r1(llcompat.ListReplaceList, {"a", "b", "c", "d"}, {"X", "Y"}, un(p[1]), un(p[2]))
  emit("ListReplaceList({a,b,c,d},{X,Y}," .. lbl(p[1]) .. "," .. lbl(p[2]) .. ") -> " .. a .. " ;; compat " .. b)
end
for _, ix in {0, 1, 2, 4, 5, 9, -1, -4, -9, true, 1.5, "2", NIL} do
  local a = r1(ll.ListInsertList, {"a", "b", "c", "d"}, {"X"}, un(ix))
  local b = r1(llcompat.ListInsertList, {"a", "b", "c", "d"}, {"X"}, un(ix))
  emit("ListInsertList({a,b,c,d},{X}," .. lbl(ix) .. ") -> " .. a .. " ;; compat " .. b)
end
both("List2List({1,true,U,V,1.5},all)", function(L, i) return L.List2List({1, true, U, V, 1.5}, i, -1) end)
both("List2List({1,{},2},all)", function(L, i) return L.List2List({1, {}, 2}, i, -1) end)
both("ListInsertList({true},{print},i)", function(L, i) return L.ListInsertList({true}, {print}, i) end)
both("ListReplaceList({1,2},5,i,i)", function(L, i) return L.ListReplaceList({1, 2}, 5, i, i) end)
both("ListInsertList({1},'x',i)", function(L, i) return L.ListInsertList({1}, "x", i) end)
both("GetListLength({1,nil,3})", function(L) return L.GetListLength({1, nil, 3}) end)
both("GetListLength({a=1,2})", function(L) return L.GetListLength({a = 1, 2}) end)
both("GetListLength(setmetatable({}, {__len}))", function(L) return L.GetListLength(setmetatable({}, {__len = function() return 5 end})) end)
both("List2Integer strings", function(L, i) local r = {}; local x = {"12abc", " 12", "0x1A", "-0x1A", "1e3", "2147483648", "-2147483649", "4294967297", "1.9", "-1.9", "+5", "", "inf", "nan", "0b11", "012"}; for k = 1, #x do r[#r + 1] = tostring(L.List2Integer(x, k - 1 + i)) end; return table.concat(r, " ") end)
both("List2Float strings", function(L, i) local r = {}; local x = {"1.5abc", " 1.5", "0x1A", "1e3", "inf", "nan", "-inf", "infinity", ".5", "5.", "1e", "", "+2", "1,5", "0x1p4", "NaN"}; for k = 1, #x do r[#r + 1] = tostring(L.List2Float(x, k - 1 + i)) end; return table.concat(r, " ") end)
both("List2Integer numbers", function(L, i) local r = {}; local x = {1.9, -1.9, 2^31, -2^31 - 1, 2^32 + 5, 1e10, 1e300, 0/0, 1/0, -1/0, -0.0}; for k = 1, #x do r[#r + 1] = tostring(L.List2Integer(x, k - 1 + i)) end; return table.concat(r, " ") end)
both("List2Float numbers", function(L, i) local r = {}; local x = {16777217, 0.1, 1e300, 2^31, -0.0, 1e-50}; for k = 1, #x do r[#r + 1] = tostring(L.List2Float(x, k - 1 + i)) end; return table.concat(r, " ") end)
both("List2Vector/Rot strings", function(L, i) return show(L.List2Vector({"<1,2,3>"}, i)) .. " " .. show(L.List2Rot({"<1,2,3,4>"}, i)) .. " " .. show(L.List2Vector({Q}, i)) .. " " .. show(L.List2Rot({V}, i)) end)
both("List2Key variants", function(L, i) local r = {}; local x = {"abc", "", tostring(U), string.upper(tostring(U)), 5, V}; for k = 1, #x do local v = L.List2Key(x, k - 1 + i); r[#r + 1] = typeof(v) .. ":" .. tostring(v) end; return table.concat(r, " ") end)
both("List2String vec/rot/uuid", function(L, i) return L.List2String({V}, i) .. " " .. L.List2String({Q}, i) .. " " .. L.List2String({U}, i) .. " " .. L.List2String({vector(0.1, -0.0, 1e10)}, i) end)
both("DumpList2String vec/rot", function(L) return L.DumpList2String({V, Q, vector(0.1, -0.0, 1e10)}, " ") end)
emit("DONE")
flush()
