
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
list R = ["[1]\"x\"]",
"[1] [2]",
"[1]{}",
"{\"a\":1}[2]",
"{\"a\":1} {\"b\":2}",
"[1] ]",
"[1] x]",
"[x[1]]",
"[1 {\"a\":1}]",
"[\"a\"[1]]",
"[[1]\"a\"]",
"[[1] 2]",
"{x{",
"[x[",
"{{",
"[[",
"{x",
"[x",
"-",
".",
"1.",
".5",
"1e",
"\"a\" \"b\"",
"\"a\"x",
"[{\"a\":1}\"x\"]",
"{\"a\":\"x\"[1]}",
"[1,\"a]\",2]",
"[[1}]",
"{\"a\":{1]}",
"[{]}]",
"[[1]}",
"{\"a\":[}]}",
"[1,[2]",
"[[1],[2]",
"[1]],[2]",
"{\"a\":1]}",
"[1}[2]",
"[1},[2]",
"{\"a\":1][\"b\"]}",
"[1.e5]",
"[-e1]",
"[-.]",
"[0e1]",
"[-.5e]",
"[1.5e+3]",
"[1e+-1]",
"[e1]",
"[.1e1]",
"[0.e1]",
"[--1]",
"[1e-]",
"[-0.0]",
"[0e]",
"[01.5]",
"[1x]",
"[ - ]",
"[1E5]",
"[2147483648]",
"[-1.5E-2]",
"{\"a\":1,\"b\":[1}",
"[1,{\"a\":1]",
"[1]}",
"{\"a\":1}]",
"[1] , [2]",
"[ ,1]",
"{\"a\":1 , \"b\":2}",
"{\"a\" \"b\"}",
"{\"a\":1,\"b\" 2}",
"{\"a\":[1],}",
"{[1]:2}",
"{\"a\"[1]:2}",
"{\"a\":1,\"b\":2}}",
"[[1]],",
"[1]],",
"[1,'a']",
"{\"a\":{\"b\":}}",
"{\"a\":[1]x,\"b\":2}",
"[1,[2]x,3]",
"[{\"a\"}x]"];
list SJ = ["{\"a\":1,\"b\"}","{\"a\":1,\"b\":[1}","[1,[2]","[1,[2]","{\"a\":tru,\"b\":1}","[1 2,3]","{\"a\":1}}","{\"a\" \"b\":1}","{\"a\":1,2}","{\"a\":1,2}","[1,]","{\"a\":[1,,2]}"];
run() {
  integer i; integer n = llGetListLength(R);
  for (i = 0; i < n; ++i) {
    string j = llList2String(R, i);
    llOwnerSay("R" + (string)i + " " + j + " L=" + fl(llJson2List(j)) + " T=" + nm(llJsonValueType(j, [])) + " G=" + nm(llJsonGetValue(j, []))
      + " a=" + rd(j, ["a"]) + " b=" + rd(j, ["b"]) + " e=" + rd(j, [""]) + " 0=" + rd(j, [0]) + " 1=" + rd(j, [1]) + " 2=" + rd(j, [2])
      + " a0=" + rd(j, ["a", 0]) + " Sz=" + nm(llJsonSetValue(j, ["z"], "9")) + " S0=" + nm(llJsonSetValue(j, [0], "9")) + " Sa=" + nm(llJsonSetValue(j, ["a"], "9")));
    llSleep(0.05);
  }
  list sv = [llJsonSetValue("{\"a\":1,\"b\"}", ["b"], "2"),
llJsonSetValue("{\"a\":1,\"b\":[1}", ["a"], "2"),
llJsonSetValue("[1,[2]", [0], "9"),
llJsonSetValue("[1,[2]", [1], "9"),
llJsonSetValue("{\"a\":tru,\"b\":1}", ["b"], JSON_DELETE),
llJsonSetValue("[1 2,3]", [1], JSON_DELETE),
llJsonSetValue("{\"a\":1}}", ["b"], "2"),
llJsonSetValue("{\"a\" \"b\":1}", ["c"], "2"),
llJsonSetValue("{\"a\":1,2}", [""], "3"),
llJsonSetValue("{\"a\":1,2}", ["a"], JSON_DELETE),
llJsonSetValue("[1,]", [JSON_APPEND], "9"),
llJsonSetValue("{\"a\":[1,,2]}", ["a",1], "9")];
  n = llGetListLength(sv);
  for (i = 0; i < n; ++i) { llOwnerSay("S" + (string)i + " " + llList2String(SJ, i) + " -> " + nm(llList2String(sv, i))); llSleep(0.05); }
  llOwnerSay("DONE " + (string)llGetFreeMemory());
}
default { state_entry() { run(); } touch_start(integer d) { run(); } }
