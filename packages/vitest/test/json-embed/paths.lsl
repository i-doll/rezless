string nm(string v) {
  if (v == JSON_INVALID) return "<INV>"; if (v == JSON_NULL) return "<NULL>"; if (v == JSON_STRING) return "<STR>";
  return "'" + llEscapeURL(v) + "'";
}
say(string tag, string r, list p) { llOwnerSay(tag + " " + nm(r) + " G=" + nm(llJsonGetValue(r, p)) + " T=" + nm(llJsonValueType(r, p))); llSleep(0.05); }
run() {
  say("Z0", llJsonSetValue("{\"z\":1}", ["a"], JSON_INVALID), ["a"]);
  say("Z1", llJsonSetValue("{}", ["a", "b"], JSON_INVALID), ["a", "b"]);
  say("Z2", llJsonSetValue("{}", ["a", 0], JSON_INVALID), ["a", 0]);
  say("Z3", llJsonSetValue("[]", [0, 0], JSON_INVALID), [0, 0]);
  say("Z4", llJsonSetValue("[]", [JSON_APPEND], JSON_INVALID), [0]);
  say("Z5", llJsonSetValue("", ["k"], JSON_INVALID), ["k"]);
  say("Z6", llJsonSetValue("[1]", [], JSON_INVALID), []);
  say("Z7", llJsonSetValue("[1]", [], " x "), []);
  say("Z8", llJsonSetValue("[1]", [], "{\"a\"}"), []);
  say("Z9", llJsonSetValue("[1,2,3]", [1], JSON_INVALID), [1]);
  say("Z10", llJsonSetValue("[]", [0], "."), [0]);
  say("Z11", llJsonSetValue("[]", [0], "1e+"), [0]);
  say("Z12", llJsonSetValue("[]", [0], llUnescapeURL("%E3%80%80x%E2%80%A8")), [0]);
  say("Z13", llList2Json(JSON_ARRAY, [llUnescapeURL("%EF%BB%BFx%E3%80%80")]), [0]);
  say("Z14", llJsonSetValue("{\"a\":1,\"z\":1}", ["m"], JSON_INVALID), ["m"]);
  llOwnerSay("DONE");
}
default { state_entry() { run(); } }
