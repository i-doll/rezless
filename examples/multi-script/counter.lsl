// counter.lsl — sits in the root prim. On every touch increments a
// linkset-data counter and broadcasts a link_message so the display script
// in the child prim can update its floating text.
default {
    state_entry() {
        llLinksetDataWrite("count", "0");
    }
    touch_start(integer n) {
        integer current = (integer)llLinksetDataRead("count");
        current = current + 1;
        llLinksetDataWrite("count", (string)current);
        llMessageLinked(LINK_ALL_OTHERS, current, "tick", "");
    }
}
