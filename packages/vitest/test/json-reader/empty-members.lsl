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
list R = ["{\"k\":,}",
"{\"k\":,\"z\":1}",
"{\"z\":1,\"k\":,}",
"{\"z\":1,\"k\":,\"y\":2}",
"{\"k\":}",
"{\"z\":1,\"k\":}",
"{\"k\": ,\"z\":1}",
"{\"k\":, \"z\":1}",
"{\"k\" : , \"z\" : 1}",
"{\"k\":,\"z\":}",
"{\"z\":1,\"k\":,\"y\":}",
"{\"k\":,\"k\":1}",
"{\"k\":1,\"k\":,\"z\":1}",
"{\"k\":,,}",
"{\"k\":, }",
"{\"k\":,\"z\":{\"a\":1}}",
"{\"k\":,\"z\":[1]}",
"{\"k\":,\"z\":\"s\"}",
"{\"o\":{\"k\":,\"z\":1}}",
"{\"o\":{\"k\":,}}",
"[{\"k\":,\"z\":1}]",
"{\"k\":null,\"z\":1}",
"[,]",
"[,1]",
"[1,]",
"[1,,2]",
"[1,,]",
"[,,]",
"[ ,1]",
"[1, ,2]",
"[ , ]",
"[1,,2,]",
"[,\"a\"]",
"[,{\"k\":1}]",
"[[1,,2]]",
"{\"a\":[1,,2]}",
"{\"a\":[,]}",
"[1,null,2]"];
run() {
  integer i; integer n = llGetListLength(R);
  for (i = 0; i < n; ++i) {
    string j = llList2String(R, i);
    llOwnerSay("E" + (string)i + " " + j + " L=" + fl(llJson2List(j)) + " T=" + nm(llJsonValueType(j, [])) + " G=" + nm(llJsonGetValue(j, []))
      + " k=" + rd(j, ["k"]) + " kx=" + rd(j, ["k", "x"]) + " k0=" + rd(j, ["k", 0]) + " z=" + rd(j, ["z"])
      + " 0=" + rd(j, [0]) + " 1=" + rd(j, [1]) + " 2=" + rd(j, [2]) + " 10=" + rd(j, [1, 0]) + " 1x=" + rd(j, [1, "x"])
      + " ok=" + rd(j, ["o", "k"]) + " okx=" + rd(j, ["o", "k", "x"]) + " 0k=" + rd(j, [0, "k"]) + " 01=" + rd(j, [0, 1]) + " a1=" + rd(j, ["a", 1]));
    llOwnerSay("W" + (string)i + " Sk=" + nm(llJsonSetValue(j, ["k"], "9")) + " Skx=" + nm(llJsonSetValue(j, ["k", "x"], "9"))
      + " Sn=" + nm(llJsonSetValue(j, ["n"], "9")) + " Dk=" + nm(llJsonSetValue(j, ["k"], JSON_DELETE))
      + " S1=" + nm(llJsonSetValue(j, [1], "9")) + " S10=" + nm(llJsonSetValue(j, [1, 0], "9")) + " S2=" + nm(llJsonSetValue(j, [2], "9"))
      + " Sp=" + nm(llJsonSetValue(j, [JSON_APPEND], "9")) + " D1=" + nm(llJsonSetValue(j, [1], JSON_DELETE))
      + " Sok=" + nm(llJsonSetValue(j, ["o", "k"], "9")) + " S0k=" + nm(llJsonSetValue(j, [0, "k"], "9")) + " Sa1=" + nm(llJsonSetValue(j, ["a", 1], "9")));
    llSleep(0.1);
  }
  llOwnerSay("DONE " + (string)llGetFreeMemory());
}
default { state_entry() { run(); } touch_start(integer d) { run(); } }
