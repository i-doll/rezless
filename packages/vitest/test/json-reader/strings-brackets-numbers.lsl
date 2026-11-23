
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
list R = ["[\"a\" \"b\"]",
"[\"a\" x \"b\"]",
"[\"ab\"cd\"ef\"]",
"[\"a\"x]",
"[x\"a\"]",
"[\"a\" ]",
"[ \"a\"]",
"[\"a\\\"b\"]",
"[\"a\",]",
"{\"a\":\"x\" \"y\"}",
"{\"a\":\"x\" y}",
"{\"a\" \"b\":1}",
"{\"a\":1 \"b\"}",
"[\"a\" 1]",
"[1 \"a\"]",
"[1][2]",
"[1]]",
"[1]][2]",
"[[1]][2]",
"[1,2][3]",
"[1]1]",
"[1]x]",
"[1],[2]",
"[[1]]]",
"[1}]",
"[{]",
"[{}]]",
"{\"a\":1}}}",
"{\"a\":1}x}",
"{\"a\":1},\"b\":2}",
"{\"a\":[1]]}",
"{\"a\":[1]}}",
"[{\"a\":1}}]",
"[[1,2]]]",
"[[1],2]",
"[[1,[2]]",
"{\"a\":{\"b\":1}",
"{\"a\":{\"b\":1,\"c\":2}",
"[.]",
"[-]",
"[e]",
"[1e5]",
"[-.5]",
"[0]",
"[-0]",
"[00]",
"[1.2.3]",
"[1e1e1]",
"[1-2]",
"[0x10]",
"[1E+]",
"[ 1 ]",
"[1 ]",
"[-01]",
"[.e1]",
"[0.]",
"{\"a\"b:1}",
"{ \"a\":1}",
"{\"a\":1 }",
"{\"a\\\"\":1}",
"{'a':1}",
"{\"a\":1,\"b\"  }",
"{\"a\":1, \"b\" \"c\"}",
"{\"a\":1,\"b\":2,\"c\"}",
"{{\"a\":1}}",
"{[1]}",
"{\"a\":1,[1]}",
"{\"a\":1,{\"b\":1}}",
"{1}",
"{\"a\":1,2}",
"{true}",
"{\"a\":1,true}",
"{\"a\" : 1}",
"{\"a\":\"b\":1}",
"{ ,}",
"{\"a\":1, ,\"b\":2}",
"{\"a\":1,,\"b\"}",
"[,,1]",
"{ \"a\":1 , }",
"{\"a\":1,\"b\":2,,}",
"[true1]",
"[truex]",
"[ true ]",
"[null ]",
"[true false]",
"{\"a\":truee}",
"{\"a\": true}",
"{\"\":1,\"a\":1}",
"{\"a\":1,\"\":1}",
"{\"\":1,}",
"{\"\":1,\"a\":1,}",
"{\"\":,\"a\":1}",
"{\"b\":1,\"\":1,\"a\":1}",
"{\"\":1}x",
"[{\"\":1,\"a\":1}]",
"{\"x\":{\"\":1,\"a\":1}}",
"{\"a\":\"}\"}",
"{\"a\":\"]\"}",
"[\"]\"]",
"[\"[\",1]",
"{\"a\":\"{\"}",
"[\"a,b\"]",
"{\"a\":\"x,y\",\"b\":1}",
"{\"a:b\":1}",
"{\"a\":\":\"}",
"[{\"a\":\"}\"},1]",
"{\"a\":[1,\"]\"]}",
"[1,\"x]",
" {\"a\"} ",
"{\"a\":[1,2]x}"];
list SJ = ["{\"\":1,\"a\":1}","{\"b\":1,\"\":1,\"a\":1}","{\"b\":1,\"\":1}","{\"\":1}","{\"\":1}","{\"\":1,\"a\":1}","{\"\":1,\"a\":1}","{\"\":1,\"a\":1}","{\"\":1,\"a\":1}","{\"\":\"x\",\"a\":1}","{\"\":[1],\"a\":1}","{ \"\":1,\"a\":1}","{\"\" :1,\"a\":1}","{\"\":1 ,\"a\":1}","{\"a\"}","{\"a\"}","{\"a\":1,\"b\"}","{\"b\"}","{\"a\" 1}","{ }","{\"a\":tru}","{\"a\":tru}","[1,,2]","[1 2]","[\"a\" \"b\"]","[1][2]","{\"a\":1}{\"b\":2}","[1,]","{\"a\":[1,2}","{\"a\":{\"b\"}}","{\"a\":1,\"\":1,}","{\"\":1,\"\":2}"];
run() {
  integer i; integer n = llGetListLength(R);
  for (i = 0; i < n; ++i) {
    string j = llList2String(R, i);
    llOwnerSay("R" + (string)i + " " + j + " L=" + fl(llJson2List(j)) + " T=" + nm(llJsonValueType(j, [])) + " G=" + nm(llJsonGetValue(j, []))
      + " a=" + rd(j, ["a"]) + " b=" + rd(j, ["b"]) + " e=" + rd(j, [""]) + " 0=" + rd(j, [0]) + " 1=" + rd(j, [1]) + " 2=" + rd(j, [2])
      + " a0=" + rd(j, ["a", 0]) + " Sz=" + nm(llJsonSetValue(j, ["z"], "9")) + " S0=" + nm(llJsonSetValue(j, [0], "9")) + " Sa=" + nm(llJsonSetValue(j, ["a"], "9")));
    llSleep(0.05);
  }
  list sv = [llJsonSetValue("{\"\":1,\"a\":1}", ["b"], "2"),
llJsonSetValue("{\"b\":1,\"\":1,\"a\":1}", ["a"], "2"),
llJsonSetValue("{\"b\":1,\"\":1}", ["a"], "2"),
llJsonSetValue("{\"\":1}", ["a"], "2"),
llJsonSetValue("{\"\":1}", [""], "2"),
llJsonSetValue("{\"\":1,\"a\":1}", [], "2"),
llJsonSetValue("{\"\":1,\"a\":1}", [0], "2"),
llJsonSetValue("{\"\":1,\"a\":1}", ["a"], JSON_DELETE),
llJsonSetValue("{\"\":1,\"a\":1}", [""], JSON_DELETE),
llJsonSetValue("{\"\":\"x\",\"a\":1}", ["a"], "2"),
llJsonSetValue("{\"\":[1],\"a\":1}", ["a"], "2"),
llJsonSetValue("{ \"\":1,\"a\":1}", ["a"], "2"),
llJsonSetValue("{\"\" :1,\"a\":1}", ["a"], "2"),
llJsonSetValue("{\"\":1 ,\"a\":1}", ["a"], "2"),
llJsonSetValue("{\"a\"}", ["a"], "2"),
llJsonSetValue("{\"a\"}", [""], "2"),
llJsonSetValue("{\"a\":1,\"b\"}", ["a"], "2"),
llJsonSetValue("{\"b\"}", ["a"], "2"),
llJsonSetValue("{\"a\" 1}", [""], "2"),
llJsonSetValue("{ }", ["a"], "2"),
llJsonSetValue("{\"a\":tru}", ["b"], "2"),
llJsonSetValue("{\"a\":tru}", ["a"], "2"),
llJsonSetValue("[1,,2]", [1], "9"),
llJsonSetValue("[1 2]", [0], "9"),
llJsonSetValue("[\"a\" \"b\"]", [1], "9"),
llJsonSetValue("[1][2]", [1], "9"),
llJsonSetValue("{\"a\":1}{\"b\":2}", ["c"], "9"),
llJsonSetValue("[1,]", [1], "9"),
llJsonSetValue("{\"a\":[1,2}", ["b"], "9"),
llJsonSetValue("{\"a\":{\"b\"}}", ["a","c"], "9"),
llJsonSetValue("{\"a\":1,\"\":1,}", ["b"], "2"),
llJsonSetValue("{\"\":1,\"\":2}", ["a"], "2")];
  n = llGetListLength(sv);
  for (i = 0; i < n; ++i) { llOwnerSay("S" + (string)i + " " + llList2String(SJ, i) + " -> " + nm(llList2String(sv, i))); llSleep(0.05); }
  llOwnerSay("DONE " + (string)llGetFreeMemory());
}
default { state_entry() { run(); } touch_start(integer d) { run(); } }
