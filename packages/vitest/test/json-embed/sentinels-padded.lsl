string nm(string v) {
  if (v == JSON_INVALID) return "<INV>"; if (v == JSON_OBJECT) return "<OBJ>"; if (v == JSON_ARRAY) return "<ARR>";
  if (v == JSON_NUMBER) return "<NUM>"; if (v == JSON_STRING) return "<STR>"; if (v == JSON_NULL) return "<NULL>";
  if (v == JSON_TRUE) return "<TRUE>"; if (v == JSON_FALSE) return "<FALSE>"; if (v == JSON_DELETE) return "<DEL>";
  return "'" + llEscapeURL(v) + "'";
}
run() {
  list pads = ["%20", "%0B", "%C2%A0"];
  list sents = [JSON_TRUE, JSON_FALSE, JSON_NULL, JSON_DELETE, JSON_INVALID];
  list names = ["T", "F", "N", "D", "I"];
  integer i; integer j;
  for (i = 0; i < 3; ++i) for (j = 0; j < 5; ++j) {
    string p = llUnescapeURL(llList2String(pads, i));
    string s = llList2String(sents, j);
    string lead = p + s; string both = p + s + p;
    llOwnerSay("X" + llList2String(names, j) + " " + llList2String(pads, i)
      + " A=" + nm(llJsonSetValue("[1]", [0], lead)) + " B=" + nm(llJsonSetValue("{\"k\":1}", ["k"], both))
      + " L=" + nm(llList2Json(JSON_ARRAY, [lead])) + " M=" + nm(llList2Json(JSON_OBJECT, ["k", both])));
    llSleep(0.05);
  }
  string r = llJsonSetValue("{\"z\":1}", ["a", "b"], "[1,,2]");
  llOwnerSay("N0 " + nm(r) + " G=" + nm(llJsonGetValue(r, ["a", "b"])) + " T=" + nm(llJsonValueType(r, ["a", "b"])));
  r = llJsonSetValue("[1]", [JSON_APPEND], "{\"a\"}");
  llOwnerSay("N1 " + nm(r) + " G=" + nm(llJsonGetValue(r, [1])) + " T=" + nm(llJsonValueType(r, [1])) + " G0=" + nm(llJsonGetValue(r, [1, ""])));
  r = llJsonSetValue("{\"z\":1}", ["a"], "{a:1}");
  llOwnerSay("N2 " + nm(r) + " G=" + nm(llJsonGetValue(r, ["a"])) + " T=" + nm(llJsonValueType(r, ["a"])));
  r = llList2Json(JSON_ARRAY, ["\"a\"b\"", "[1]]"]);
  llOwnerSay("N3 " + nm(r) + " G0=" + nm(llJsonGetValue(r, [0])) + " G1=" + nm(llJsonGetValue(r, [1])) + " L=" + (string)llGetListLength(llJson2List(r)));
  llOwnerSay("DONE");
}
default { state_entry() { run(); } }
