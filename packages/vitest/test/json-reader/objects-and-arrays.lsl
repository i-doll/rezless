
string nm(string v) {
  if (v == JSON_INVALID) return "<INV>"; if (v == JSON_OBJECT) return "<OBJ>"; if (v == JSON_ARRAY) return "<ARR>";
  if (v == JSON_NUMBER) return "<NUM>"; if (v == JSON_STRING) return "<STR>"; if (v == JSON_NULL) return "<NULL>";
  if (v == JSON_TRUE) return "<TRUE>"; if (v == JSON_FALSE) return "<FALSE>"; if (v == JSON_DELETE) return "<DEL>";
  return "'" + v + "'";
}
string fl(list l) {
  string o = "["; integer i; integer n = llGetListLength(l);
  for (i = 0; i < n; ++i) {
    integer t = llGetListEntryType(l, i);
    if (i) o += ",";
    if (t == TYPE_INTEGER) o += "i" + (string)llList2Integer(l, i);
    else if (t == TYPE_FLOAT) o += "f" + (string)llList2Float(l, i);
    else o += "s" + nm(llList2String(l, i));
  }
  return o + "](" + (string)n + ")";
}
string rd(string j, list p) { return nm(llJsonGetValue(j, p)) + "/" + nm(llJsonValueType(j, p)); }
list R = ["{\"a\"}",
"{\"a\":1,,\"b\":2}",
"{\"a\" 1}",
"{a:1}",
"{\"a\":1,}",
"{,}",
"{,\"a\":1}",
"{\"a\":1 \"b\":2}",
"{\"a\":1,\"b\"}",
"{\"a\",1}",
"{\"a\":1",
"{\"a\":1}}",
"{\"a\":[1,2}",
"{\"a\":{\"b\"}}",
"{\"a\":1,\"b\":}",
"{:1}",
"{\"\":1}",
"{\"a\"::1}",
"{\"a\":1:2}",
"{\"a\":tru}",
"{\"a\":abc}",
"{\"a\":\"x\"y}",
"{ }",
"{\"a\":1,\"b\":2,}",
"{\"a\":1,,}",
"{1:2}",
"{\"a\":1]",
"{\"a\"}x",
"{\"a\":01}",
"{\"a\":+1}",
"{\"a\":.5}",
"{\"a\":1.}",
"{\"a\":1e}",
"{\"a\":nul}",
"{\"a\":null1}",
"{\"a\":\"b\",}",
"{\"a\" , \"b\"}",
"{\"a\",\"b\":1}",
"{\"b\":1,\"a\"}",
"{\"a\":{\"b\":1,,\"c\":2}}",
"{\"a\":[1,,2]}",
"{\"a\":{\"b\"}, \"c\":1}",
"{\"a\":1,\"b\":{}",
"{\"a\" }",
"{\"a\":1, }",
"{ ,\"a\":1}",
"{\"a\":true false}",
"{\"a\":\"x\",,}",
"{\"a\"   :1}",
"{\"a\":1,\"a\":2}",
"[1,,2]",
"[1,]",
"[,1]",
"[,]",
"[1 2]",
"[1",
"[1]]",
"[1}",
"[[1,2]",
"[1,[2,]]",
"[abc]",
"[1,{\"a\"}]",
"[1,{\"a\":1,,\"b\":2}]",
"[\"a\":1]",
"[1:2]",
"[tru]",
"[01]",
"[+1]",
"[.5]",
"[ ]",
"[\"a\" \"b\"]",
" [1] ",
"[1] x",
"[1]x",
"[]]",
"[[]",
"[1,,]",
"[,,]",
"[{\"a\"},1]",
"[{\"a\":1,}]",
"\"abc",
"abc",
"1 2",
"\"a\"x",
"01",
"tru",
"true1",
"{",
"[",
"}",
"]",
",",
"{\"a\":1}{\"b\":2}",
"[1][2]",
"{\"a\":[}",
"{\"a\":\"b\"",
"[1,2,]",
"[,{\"a\"}]",
"{\"a\":[1,}",
"{\"a\":{}}x"];
list SJ = ["{\"\":1,\"a\":1,}","{\"\":1,\"a\":1,}","{\"\":1,\"a\":1}","{\"a\":1,\"\":1,}","{\"\":1,}","{\"\":1,}","{\"\":1,\"a\":1,}","{\"\":1,\"a\":1,}","{\"\":1,\"a\":1,}","{\"a\":1,}","{\"\":,\"a\":1,}","{\"\":1,\"a\":1,}","{\"\":2,\"b\":3,\"a\":1,}","{\"x\":{\"\":1,\"a\":1,}}","{\"x\":{\"\":1,\"a\":1,}}","{\"\":1,\"a\":1,}","{\"\":1,\"a\":,}","{\"\":{},\"a\":1,}","{\"\":1,\"a\":1, }","{\"b\":1,\"a\":1,}","[{\"\":1,\"a\":1,}]","{\"\":1,\"\":2,}","{\"\":1,\"a\":1}","{\"a\":1,\"\":1}"];
run() {
  integer i; integer n = llGetListLength(R);
  for (i = 0; i < n; ++i) {
    string j = llList2String(R, i);
    llOwnerSay("R" + (string)i + " " + j + " L=" + fl(llJson2List(j)) + " T=" + nm(llJsonValueType(j, [])) + " G=" + nm(llJsonGetValue(j, []))
      + " a=" + rd(j, ["a"]) + " b=" + rd(j, ["b"]) + " e=" + rd(j, [""]) + " 0=" + rd(j, [0]) + " 1=" + rd(j, [1]) + " 2=" + rd(j, [2])
      + " a0=" + rd(j, ["a", 0]) + " Sz=" + nm(llJsonSetValue(j, ["z"], "9")) + " S0=" + nm(llJsonSetValue(j, [0], "9")) + " Sa=" + nm(llJsonSetValue(j, ["a"], "9")));
    llSleep(0.05);
  }
  list sv = [llJsonSetValue("{\"\":1,\"a\":1,}", ["a"], "2"),
llJsonSetValue("{\"\":1,\"a\":1,}", ["b"], "2"),
llJsonSetValue("{\"\":1,\"a\":1}", ["a"], "2"),
llJsonSetValue("{\"a\":1,\"\":1,}", ["a"], "2"),
llJsonSetValue("{\"\":1,}", ["a"], "2"),
llJsonSetValue("{\"\":1,}", [""], "2"),
llJsonSetValue("{\"\":1,\"a\":1,}", [""], "2"),
llJsonSetValue("{\"\":1,\"a\":1,}", ["a"], JSON_DELETE),
llJsonSetValue("{\"\":1,\"a\":1,}", [""], JSON_DELETE),
llJsonSetValue("{\"a\":1,}", ["a"], "2"),
llJsonSetValue("{\"\":,\"a\":1,}", ["a"], "2"),
llJsonSetValue("{\"\":1,\"a\":1,}", [], "2"),
llJsonSetValue("{\"\":2,\"b\":3,\"a\":1,}", ["a"], "2"),
llJsonSetValue("{\"x\":{\"\":1,\"a\":1,}}", ["x","a"], "2"),
llJsonSetValue("{\"x\":{\"\":1,\"a\":1,}}", ["y"], "2"),
llJsonSetValue("{\"\":1,\"a\":1,}", ["a","b"], "2"),
llJsonSetValue("{\"\":1,\"a\":,}", ["a"], "2"),
llJsonSetValue("{\"\":{},\"a\":1,}", ["a"], "2"),
llJsonSetValue("{\"\":1,\"a\":1, }", ["a"], "2"),
llJsonSetValue("{\"b\":1,\"a\":1,}", ["a"], "2"),
llJsonSetValue("[{\"\":1,\"a\":1,}]", [0,"a"], "2"),
llJsonSetValue("{\"\":1,\"\":2,}", ["a"], "2"),
llJsonSetValue("{\"\":1,\"a\":1}", [""], "2"),
llJsonSetValue("{\"a\":1,\"\":1}", ["b"], "2")];
  n = llGetListLength(sv);
  for (i = 0; i < n; ++i) { llOwnerSay("S" + (string)i + " " + llList2String(SJ, i) + " -> " + nm(llList2String(sv, i))); llSleep(0.05); }
  llOwnerSay("DONE " + (string)llGetFreeMemory());
}
default { state_entry() { run(); } touch_start(integer d) { run(); } }
