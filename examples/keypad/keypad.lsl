// A door keypad drawn on one face as a 3 x 4 grid:
//   1 2 3
//   4 5 6
//   7 8 9
//   * 0 #
// llDetectedTouchST says where on the face the click landed, from <0, 0> at
// the bottom left to <1, 1> at the top right. * clears the entry, # checks it.
string CODE = "1234";
list KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
string entered = "";

show(string status) {
  llSetText(status, <1, 1, 1>, 1.0);
}

default {
  state_entry() { show("enter code"); }

  touch_start(integer n) {
    vector st = llDetectedTouchST(0);
    // Some clicks carry no point on the face.
    if (st == TOUCH_INVALID_TEXCOORD) return;
    integer col = (integer)(st.x * 3);
    integer row = 3 - (integer)(st.y * 4);
    if (col > 2) col = 2;
    if (row < 0) row = 0;
    string key_ = llList2String(KEYS, row * 3 + col);
    if (key_ == "*") {
      entered = "";
      show("enter code");
    } else if (key_ == "#") {
      if (entered == CODE) show("unlocked");
      else show("wrong code");
      entered = "";
    } else {
      entered += key_;
      show("code: " + llGetSubString("********", 0, llStringLength(entered) - 1));
    }
  }
}
