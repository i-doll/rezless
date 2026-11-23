string nm(string v) { if (v == JSON_INVALID) return "<INV>"; if (v == JSON_NULL) return "<NULL>"; return "'" + llEscapeURL(v) + "'"; }
list W = ["%09x%09", "%0Ax%0A", "%0Dx%0D", "%0Bx%0B", "%0Cx%0C", "%C2%A0x%C2%A0", "", "%20%20", "%22", "%22%22", "%09%5B1%5D%0A", "%0B%5B1%5D%0B", "%0C1%0C", "%0B%22a%22", "%20true%20", "%0Bnull", "a%09b"];
run() {
  integer i;
  for (i = 0; i < llGetListLength(W); ++i) {
    string v = llUnescapeURL(llList2String(W, i));
    llOwnerSay("W" + (string)i + " " + llList2String(W, i) + " A=" + nm(llJsonSetValue("[]", [0], v)) + " L=" + nm(llList2Json(JSON_ARRAY, [v])) + " M=" + nm(llList2Json(JSON_OBJECT, ["k", v])));
    llSleep(0.05);
  }
  llOwnerSay("DONE");
}
default { state_entry() { run(); } }
