string nm(string v) { if (v == JSON_INVALID) return "<INV>"; return "'" + llEscapeURL(v) + "'"; }
run() {
  list sents = [JSON_INVALID, JSON_DELETE, JSON_OBJECT, JSON_ARRAY, JSON_NUMBER, JSON_STRING, JSON_TRUE];
  list names = ["I", "D", "O", "A", "#", "S", "T"];
  list pads = ["", " "];
  integer i; integer j;
  for (i = 0; i < 2; ++i) for (j = 0; j < 7; ++j) {
    string v = llList2String(pads, i) + llList2String(sents, j);
    llOwnerSay("Y" + llList2String(names, j) + (string)i
      + " A=" + nm(llJsonSetValue("[1,2]", [0], v)) + " P=" + nm(llJsonSetValue("[1]", [JSON_APPEND], v)) + " B=" + nm(llJsonSetValue("{\"k\":1}", ["k"], v)) + " C=" + nm(llJsonSetValue("{}", ["k"], v))
      + " L=" + nm(llList2Json(JSON_ARRAY, [1, v, 2])) + " M=" + nm(llList2Json(JSON_OBJECT, ["k", v])));
    llSleep(0.05);
  }
  llOwnerSay("DONE");
}
default { state_entry() { run(); } }
