string nm(string v) {
  if (v == JSON_INVALID) return "<INV>"; if (v == JSON_OBJECT) return "<OBJ>"; if (v == JSON_ARRAY) return "<ARR>";
  if (v == JSON_NUMBER) return "<NUM>"; if (v == JSON_STRING) return "<STR>"; if (v == JSON_NULL) return "<NULL>";
  if (v == JSON_TRUE) return "<TRUE>"; if (v == JSON_FALSE) return "<FALSE>"; if (v == JSON_DELETE) return "<DEL>";
  return "'" + v + "'";
}
list V = ["{\"a\"}",
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
"\"A\""];
run() {
  integer i; integer n = llGetListLength(V);
  for (i = 0; i < n; ++i) {
    string v = llList2String(V, i);
    llOwnerSay("V" + (string)i + " " + v + " A=" + nm(llJsonSetValue("[]", [0], v)) + " O=" + nm(llJsonSetValue("{}", ["k"], v))
      + " L=" + nm(llList2Json(JSON_ARRAY, [v])) + " M=" + nm(llList2Json(JSON_OBJECT, ["k", v]))
      + " P=" + nm(llList2Json(JSON_ARRAY, [" " + v + " "])) + " Q=" + nm(llJsonSetValue("[]", [0], " " + v + " ")));
    llSleep(0.05);
  }
  llOwnerSay("DONE " + (string)llGetFreeMemory());
}
default { state_entry() { run(); } touch_start(integer d) { run(); } }
