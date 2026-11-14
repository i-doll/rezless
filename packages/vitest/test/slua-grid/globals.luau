local TAG = "A"
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

local function g(name, v)
  local s = name .. " type=" .. type(v) .. " typeof=" .. typeof(v)
  if type(v) == "table" then
    local ks = {}
    for k in pairs(v) do ks[#ks + 1] = tostring(k) end
    table.sort(ks)
    s ..= " keys=" .. table.concat(ks, ",")
  elseif type(v) ~= "function" and type(v) ~= "nil" then
    s ..= " str=" .. tostring(v)
  end
  emit(s)
end
g("integer", integer)
g("uuid", uuid)
g("touuid", touuid)
g("vector", vector)
g("tovector", tovector)
g("quaternion", quaternion)
g("rotation", rotation)
g("toquaternion", toquaternion)
g("torotation", torotation)
g("bit32", bit32)
g("ll", nil)
emit("ll type=" .. type(ll) .. " typeof=" .. typeof(ll))
emit("llcompat type=" .. type(llcompat) .. " typeof=" .. typeof(llcompat))
g("lljson", lljson)
g("llbase64", llbase64)
g("LLEvents", LLEvents)
g("LLTimers", LLTimers)
g("buffer", buffer)
g("utf8", utf8)
g("os", os)
g("debug", debug)
g("math", math)
g("string", string)
g("table", table)
g("coroutine", coroutine)
g("_VERSION", _VERSION)
g("require", require)
g("loadstring", loadstring)
g("getfenv", getfenv)
g("setfenv", setfenv)
g("newproxy", newproxy)
g("gcinfo", gcinfo)
g("collectgarbage", collectgarbage)
g("dangerouslyexecuterequiredmodule", dangerouslyexecuterequiredmodule)
g("print", print)
g("callable", callable)
g("lsl", lsl)
g("class", class)
g("int64", int64)
g("_G", nil)
emit("_G type=" .. type(_G))
g("script", script)
g("state", state)
g("select", select)
g("unpack", unpack)
g("rawlen", rawlen)
g("TYPE_INTEGER", TYPE_INTEGER)
g("TRUE", TRUE)
g("NULL_KEY", NULL_KEY)
g("ZERO_VECTOR", ZERO_VECTOR)
g("ZERO_ROTATION", ZERO_ROTATION)
g("PI", PI)
g("EOF", EOF)
g("lljson.null", lljson and lljson.null)
g("lljson.empty_array", lljson and lljson.empty_array)
g("lljson.array_mt", lljson and lljson.array_mt)
g("lljson.object_mt", lljson and lljson.object_mt)
g("lljson.remove", lljson and lljson.remove)
t("getmetatable(LLEvents)", function() local m = getmetatable(LLEvents); return typeof(m) .. " " .. tostring(m) end)
t("LLEvents members", function()
  local r = {}
  for _, k in {"on", "off", "once", "listeners", "eventNames", "handlers", "emit", "_handleEvent"} do r[#r + 1] = k .. "=" .. type(LLEvents[k]) end
  return table.concat(r, " ")
end)
t("LLTimers members", function()
  local r = {}
  for _, k in {"on", "off", "once", "every", "_tick"} do r[#r + 1] = k .. "=" .. type(LLTimers[k]) end
  return table.concat(r, " ")
end)
t("getmetatable(vector(1,2,3))", function() local m = getmetatable(vector(1, 2, 3)); return typeof(m) .. " " .. tostring(m) end)
t("getmetatable(uuid)", function() local m = getmetatable(NULL_KEY); return typeof(m) .. " " .. tostring(m) end)
for _, k in {"simulator_version", "sim_version", "sim_channel", "region_product_name", "slua_version", "luau_version", "script_engine", "lua_version"} do
  t('GetEnv("' .. k .. '")', ll.GetEnv, k)
end
t("GetSimulatorHostname()", ll.GetSimulatorHostname)
t("ll count", function() local n = 0; for k in pairs(ll) do n += 1 end; return n end)
t("llcompat count", function() local n = 0; for k in pairs(llcompat) do n += 1 end; return n end)
t("ll names missing/extra probe", function()
  local r = {}
  for _, k in {"GetListEntryType", "List2Bool", "IsFriend", "GetUsedMemory", "SetTimerEvent", "ResetTime", "GetAndResetTime", "ResetScript", "Sleep", "GetTime", "Log10", "Tan", "Acos", "Asin", "DetectedTouchFace", "GenerateKey", "Die", "OwnerSay", "StringLength", "GetSubString"} do
    r[#r + 1] = k .. "=" .. type(ll[k]) .. "/" .. type(llcompat[k])
  end
  return table.concat(r, " ")
end)
t("integer(5)", function() return integer(5) end)
t("integer.create(7)", function() return integer.create(7) end)
t("tostring(print)", tostring, print)
t("tostring(ll.Abs)", tostring, ll.Abs)
t("tostring(ll.OwnerSay)", tostring, ll.OwnerSay)
t("debug.info(ll.Abs,'sn')", function() local a, b = debug.info(ll.Abs, "sn"); return tostring(a) .. " " .. tostring(b) end)
t("debug.info(ll.Say,'sn')", function() local a, b = debug.info(ll.Say, "sn"); return tostring(a) .. " " .. tostring(b) end)
t("math.lerp", function() return math.lerp(0, 10, 0.5) end)
t("vector.lerp", function() return vector.lerp(vector(0, 0, 0), vector(2, 2, 2), 0.5) end)
t("buffer.readbits", function() return type(buffer.readbits) end)
t("math.isnan", function() return type(math.isnan) .. type(math.isinf) .. type(math.isfinite) end)
t("string.format %*", function() return string.format("%*", 1.5) end)
t("table.find", function() return table.find({5, 6}, 6) end)
t("1//2", function() return 7 // 2 end)
t("typeof(vector(1,2,3))", function() return typeof(vector(1, 2, 3)) .. " " .. type(vector(1, 2, 3)) end)
t("typeof(quaternion)", function() return typeof(quaternion(0, 0, 0, 1)) .. " " .. type(quaternion(0, 0, 0, 1)) end)
t("typeof(uuid)", function() return typeof(NULL_KEY) .. " " .. type(NULL_KEY) end)
t("typeof(buffer)", function() return typeof(buffer.create(1)) .. " " .. type(buffer.create(1)) end)
t("ll.GetUsedMemory/Free", function() return ll.GetUsedMemory() .. " " .. ll.GetFreeMemory() .. " " .. ll.GetMemoryLimit() end)
g("llprim", llprim)
g("llruleset", llruleset)
t("llprim members", function() local r = {}; for _, k in {"ParamsSetter", "ParamSetter", "ParamsGetter", "ParamGetter"} do r[#r + 1] = k .. "=" .. type(llprim[k]) end; return table.concat(r, " ") end)
t("getmetatable(llprim)", function() local m = getmetatable(llprim); return typeof(m) end)
t("typeof(LLEvents.on)", function() return tostring(LLEvents.on) end)
t("vector meta __call", function() return tostring(vector(1, 2, 3)) .. " " .. tostring(vector.create(1, 2, 3)) .. " " .. tostring(quaternion(1, 2, 3, 4)) .. " " .. tostring(1.5) .. " " .. tostring(0.1) .. " " .. tostring(vector(0.1, 1e10, -0.0)) end)
t("string.split", function() return #string.split("a,b,c", ",") end)
t("tostring(-0.0), 1e15, 2^53, 1e100, nan, inf", function() return tostring(-0.0) .. " " .. tostring(1e15) .. " " .. tostring(2^53) .. " " .. tostring(1e100) .. " " .. tostring(0/0) .. " " .. tostring(1/0) end)
t("error object", function() local ok, e = pcall(error, {code = 1}); return typeof(e) end)
t("error string level", function() local ok, e = pcall(function() error("boom") end); return e end)
t("error no pcall position", function() local ok, e = pcall(function() local x = nil; return x.y end); return e end)
t("xpcall traceback", function() local ok, e = xpcall(function() error("boom") end, function(m) return debug.traceback(m) end); return e end)
emit("DONE")
flush()
