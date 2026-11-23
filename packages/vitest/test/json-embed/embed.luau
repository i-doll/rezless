local function nm(v)
  if v == JSON_INVALID then return "<INV>" elseif v == JSON_OBJECT then return "<OBJ>" elseif v == JSON_ARRAY then return "<ARR>"
  elseif v == JSON_NUMBER then return "<NUM>" elseif v == JSON_STRING then return "<STR>" elseif v == JSON_NULL then return "<NULL>"
  elseif v == JSON_TRUE then return "<TRUE>" elseif v == JSON_FALSE then return "<FALSE>" elseif v == JSON_DELETE then return "<DEL>" end
  return "'" .. v .. "'"
end
local V = {"{\"a\"}",
"[1,]",
"{\"\":1,\"a\":1,}",
"{\"\":1,\"a\":1}",
"{\"a\":1,\"\":1}",
"{\"a\":1,}",
"[1,,2]",
"[,]",
"[ ]",
"{ }",
"{,}",
"[1",
"{\"a\":1",
"[1]]",
"[1]x",
"[1] [2]",
"[1],[2]",
"{a:1}",
"{\"a\":tru}",
"{\"a\":1,,\"b\":2}",
"[1 2]",
"[01]",
"[+1]",
"[.5]",
"[1e]",
"[1, \"x]",
"[\"]\"]",
"[[1]",
"[{]",
"{\"a\":[1,2}",
"[1}",
"{\"a\":1]",
"{\"a\":1:2}",
"[1:2]",
"[1,'a']",
"[\"a\" ]",
"{\"a\" }",
"[]",
"{}",
"[1,2]",
"{\"a\":1}",
"[",
"{",
"]",
"}",
"[]]",
"{\"a\":[1,]}",
"[1,{\"a\"}]",
"01",
"1.",
".5",
"1e",
"+1",
"-",
"1 2",
"\"a",
"\"a\"b\"",
"\"a\"x",
"tru",
"-.5",
"0x10",
"1e5",
"1",
"-1.5e+3",
"nul",
"\"a\\q\"",
"\"A\""}
local function run()
  for i, v in V do
    ll.OwnerSay("V" .. (i - 1) .. " " .. v .. " A=" .. nm(ll.JsonSetValue("[]", {0}, v)) .. " O=" .. nm(ll.JsonSetValue("{}", {"k"}, v))
      .. " L=" .. nm(ll.List2Json(JSON_ARRAY, {v})) .. " M=" .. nm(ll.List2Json(JSON_OBJECT, {"k", v}))
      .. " P=" .. nm(ll.List2Json(JSON_ARRAY, {" " .. v .. " "})) .. " Q=" .. nm(ll.JsonSetValue("[]", {0}, " " .. v .. " ")))
    ll.Sleep(0.05)
  end
  ll.OwnerSay("DONE")
end
LLEvents:on("touch_start", function() run() end)
run()
