// A lamp with a colour menu. Clicking it shows the toucher a dialog; their
// answer sets the colour. The menu closes itself after 30 seconds.
integer CHANNEL = -7001;
integer listener;

close() {
  llListenRemove(listener);
  llSetTimerEvent(0.0);
}

default {
  state_entry() { llSetText("white", <1, 1, 1>, 1.0); }

  touch_start(integer n) {
    key who = llDetectedKey(0);
    close();
    listener = llListen(CHANNEL, "", who, "");
    llDialog(who, "Pick a colour", ["Red", "Green", "Blue"], CHANNEL);
    llSetTimerEvent(30.0);
  }

  listen(integer channel, string name, key id, string message) {
    close();
    llSetText(llToLower(message) + ", set by " + name, <1, 1, 1>, 1.0);
  }

  timer() { close(); }
}
