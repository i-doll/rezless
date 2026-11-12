// display.lsl sits in the child prim and shows the count it is sent.
default {
    link_message(integer sender, integer num, string str, key id) {
        if (str == "tick") llSetText("count: " + (string)num, <1.0, 1.0, 1.0>, 1.0);
    }
}
