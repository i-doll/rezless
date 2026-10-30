// A lamp: a short tap toggles it, a long press (1 second or more) steps the brightness.
float LONG_PRESS = 1.0;
integer on = FALSE;
integer level = 1;

show() {
  if (on) llSetText("on, brightness " + (string)level, <1, 1, 1>, 1.0);
  else llSetText("off", <1, 1, 1>, 1.0);
}

default {
  state_entry() { show(); }

  touch_start(integer n) { llResetTime(); }

  touch_end(integer n) {
    if (llGetTime() >= LONG_PRESS) {
      level = level % 3 + 1;
      on = TRUE;
    } else {
      on = !on;
    }
    show();
  }
}
