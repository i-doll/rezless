// display.lsl — sits in the child prim. Reacts to the counter's
// link_message events by updating its floating text. Also reacts to the
// linkset_data event so the display refreshes if the counter is poked
// directly via llLinksetDataWrite by another script.
default {
    link_message(integer sender, integer num, string str, key id) {
        if (str == "tick") {
            llSetText("count: " + (string)num, <1.0, 1.0, 1.0>, 1.0);
        }
    }
    linkset_data(integer action, string name, string value) {
        if (name == "count") {
            // LSL passes value="" on UPDATE; read the current value back.
            llSetText("count: " + llLinksetDataRead("count"), <1.0, 1.0, 1.0>, 1.0);
        }
    }
}
