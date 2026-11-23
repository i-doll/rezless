list S=["0","1"," 1","1 ","1x","x1","01","-1","+1","1.0","1.5","0x1","","a","1e0","2","3","00","-0"," ","\t1","1,","0x","9999999999","-","\n1","１"];
string nm(string v) {
  if (v == JSON_INVALID) return "<INV>"; if (v == JSON_NUMBER) return "<NUM>"; if (v == JSON_ARRAY) return "<ARR>"; if (v == JSON_OBJECT) return "<OBJ>";
  return "'" + v + "'";
}
run() {
  integer i; integer n = llGetListLength(S);
  for (i = 0; i < n; ++i) {
    string s = llList2String(S, i);
    llOwnerSay("P" + (string)i + " [" + s + "] G=" + nm(llJsonGetValue("[10,11,12]", [s])) + " T=" + nm(llJsonValueType("[10,11,12]", [s]))
      + " N=" + nm(llJsonGetValue("{\"a\":[10,11,12]}", ["a", s])) + " S=" + nm(llJsonSetValue("[10,11,12]", [s], "9"))
      + " SN=" + nm(llJsonSetValue("{\"a\":[10,11]}", ["a", s], "9")));
    llSleep(0.05);
  }
  llOwnerSay("DONE");
}
default { state_entry() { run(); } }
