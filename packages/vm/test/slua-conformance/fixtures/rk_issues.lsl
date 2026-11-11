checkTruth(string name, integer val)
{
    if (!val)
    {
        llOwnerSay(name + ": FAILED");
        // Force a crash.
        llOwnerSay((string)(0/0));
    }
}

default {
    state_entry() {
        integer a = (1 - (0 / 3));
        integer b = 3 - 4;
        float c = (1.0 - (0 / 3.0));
        float d = 3.0 - 4.0;
        list foo = [a, b, c, d];
        checkTruth("a is integer", llGetListEntryType(foo, 0) == TYPE_INTEGER);
        checkTruth("b is integer", llGetListEntryType(foo, 1) == TYPE_INTEGER);
        checkTruth("c is float", llGetListEntryType(foo, 2) == TYPE_FLOAT);
        checkTruth("d is float", llGetListEntryType(foo, 3) == TYPE_FLOAT);
    }
}
