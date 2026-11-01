// A HUD that points at a landmark. It attaches itself to the centre of the
// screen, then says whether the landmark is ahead, left, right or behind the
// camera. Clicking it takes it off.
vector LANDMARK = <128, 128, 25>;

default {
  state_entry() {
    llRequestPermissions(llGetOwner(), PERMISSION_ATTACH | PERMISSION_TRACK_CAMERA);
  }

  run_time_permissions(integer perms) {
    if ((perms & PERMISSION_ATTACH) && !llGetAttached()) llAttachToAvatar(ATTACH_HUD_CENTER_1);
  }

  attach(key id) {
    if (id) llSetTimerEvent(0.5);
    else llSetTimerEvent(0.0);
  }

  timer() {
    vector hud = llWorldPosToHUD(LANDMARK);
    string where = "straight ahead";
    if (hud.x < 0) where = "behind you";
    else if (hud.y > 0.1) where = "to the left";
    else if (hud.y < -0.1) where = "to the right";
    llSetText("Landmark " + where, <1, 1, 1>, 1.0);
  }

  touch_start(integer n) { llDetachFromAvatar(); }
}
