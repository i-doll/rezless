local TAG = "E"
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

t("llcompat-only names", function() local r = {}; for k in pairs(llcompat) do if ll[k] == nil then r[#r + 1] = k end end; table.sort(r); return table.concat(r, ",") end)
t("ll-only names", function() local r = {}; for k in pairs(ll) do if llcompat[k] == nil then r[#r + 1] = k end end; table.sort(r); return table.concat(r, ",") end)
local I = ll.GetListEntryType({1}, 1)
local K = llcompat.GetListEntryType({"s"}, 0)
t("I + 1 / I * 3 / I / 4 / I - 1 / I % 2 / I ^ 2 / I // 4", function() return show({I + 1, I * 3, I / 4, I - 1, I % 2, I ^ 2, I // 4, 1 + I, 1.5 + I}) end)
t("I + K, I - K, I * K, I / K, I % K, K // I, -I", function() return show({I + K, I - K, I * K, I / K, I % K, K // I, -I}) end)
t("I == I2, I == K, K == compat TYPE_STRING int", function() return show({I == ll.GetListEntryType({2.5}, 1), I == K, K == TYPE_STRING, tonumber(I) == TYPE_FLOAT, tonumber(K) == TYPE_STRING, tostring(I) == "2"}) end)
t("I < K", function() return I < K end)
t("I <= I", function() return I <= I end)
t("math.max(I,K)", function() return math.max(I, K) end)
t("typeof TYPE consts in llcompat?", function() return typeof(TYPE_INTEGER) .. " " .. typeof(TRUE) .. " " .. typeof(llcompat.GetListLength({1})) .. " " .. typeof(llcompat.List2Integer({1}, 0)) .. " " .. typeof(llcompat.Abs(-1)) .. " " .. typeof(llcompat.StringLength("a")) .. " " .. typeof(llcompat.ListFindList({1}, {1})) .. " " .. typeof(llcompat.GetStatus(STATUS_PHANTOM)) end)
t("big ints", function() local a = ll.GetListEntryType({1}, 1); local s = a; for i = 1, 31 do s = s + s end; return typeof(s) .. " " .. tostring(s) .. " " .. tostring(s + s) .. " " .. tostring(s * a) .. " " .. tostring(s - a) end)
t("int division", function() local z = ll.GetListEntryType({}, 1); return show({I / z}) end)
t("int mod zero", function() local z = ll.GetListEntryType({}, 1); return show({I % z}) end)
t("K / I (3/2)", function() return show({K / I, -K / I, K % I, -K % I}) end)
t("lljson.encode/slencode {I}", function() return lljson.encode({I, a = nil}) .. " " .. lljson.slencode({I}) .. " " .. lljson.encode(I) end)
t("string.format('%d %f %s')", function() return string.format("%d %f %s", I, I, tostring(I)) end)
t("tostring(-I), tonumber(-I)", function() return tostring(-I) .. " " .. tostring(tonumber(-I)) .. " " .. typeof(tonumber(I)) end)
t("I as key vs K", function() local x = {[I] = "i", [K] = "k"}; local n = 0; for k, v in pairs(x) do n += 1 end; return n .. " " .. tostring(x[ll.GetListEntryType({2}, 1)]) end)
t("ll.Say(I..) integer param", function() return ll.GetSubString("abcdef", I, I) .. " " .. ll.List2String({"a", "b", "c"}, I) .. " " .. tostring(ll.Abs(-I)) .. " " .. typeof(ll.Abs(I)) .. " " .. typeof(ll.Fabs(I)) .. " " .. tostring(ll.IntegerToBase64(I)) end)
t("List2CSV / List2Json / DumpList2String ints", function() return ll.List2CSV({I, K, 1, 1.5}) .. " / " .. ll.List2Json(JSON_ARRAY, {I, 1}) .. " / " .. ll.DumpList2String({I, 1, K}, ",") end)
t("List2Integer/Float/String({I})", function() return show({ll.List2Integer({I}, 1), ll.List2Float({I}, 1), ll.List2String({I}, 1), ll.List2Key({I}, 1), ll.List2Vector({I}, 1)}) end)
t("ListSort({K,I,1.5,1},1,true)", function() return show(ll.ListSort({K, I, 1.5, 1}, 1, true)) end)
t("ListFindList({I},{I})", ll.ListFindList, {I}, {I})
t("ListFindList({1,I},{I})", ll.ListFindList, {1, I}, {ll.GetListEntryType({1}, 1)})
t("ListStatistics(MAX,{I,K})", ll.ListStatistics, LIST_STAT_MAX, {I, K})
t("SetPrimitiveParams glow via integer K? PRIM_FULLBRIGHT I", function() ll.SetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES, I}); local r = show(ll.GetPrimitiveParams({PRIM_FULLBRIGHT, 0})); ll.SetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES, false}); return r end)
t("math.nan/tau/e", function() return tostring(math.nan) .. " " .. tostring(math.tau) .. " " .. tostring(math.e) .. " " .. tostring(math.phi) .. " " .. tostring(math.sqrt2) end)
t("buffer.readinteger", function() return tostring(buffer.readinteger) .. " " .. tostring(buffer.writeinteger) end)
t("bit32 on I", function() return show({bit32.band(I, 3), bit32.bor(I, K), bit32.lshift(I, 1)}) end)
t("vector(I,1,1)", function() return vector(I, 1, 1) end)
t("uuid/tostring concat", function() return "x" .. tostring(I) end)
t("I and 1 / not I", function() return show({I and 1, not I, not ll.GetListEntryType({}, 1)}) end)
t("for i=I,K", function() local c = 0; for i = I, K do c += 1 end; return c end)
t("string.rep('a',I) / string.sub('abc',I)", function() return string.rep("a", I) .. " " .. string.sub("abc", I) end)
t("select(I,...)", function() return select(I, "a", "b", "c") end)
t("ipairs idx", function() return ({10, 20, 30})[tonumber(I)] end)
t("rawequal / rawget", function() return show({rawequal(I, ll.GetListEntryType({1}, 1)), rawget({[I] = 1}, I)}) end)
emit("DONE")
flush()
