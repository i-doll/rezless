// The brick material from the Library
string MATERIAL = "f35823e6-40dc-d992-f4cc-85a4cb5464c0";

// The change value is a bitmask: CHANGED_COLOR is 2, CHANGED_RENDER_MATERIAL is 4096.
list names = ["color", "alpha", "material set", "gltf override", "material removed"];
list seen;      // the change value of each changed event since the last step
integer step;

default
{
    state_entry()
    {
        // A known start, then a step every 3 seconds. The changed events come
        // after the call, so each step is reported at the next tick.
        llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_COLOR, 0, <1.0, 1.0, 1.0>, 1.0, PRIM_RENDER_MATERIAL, 0, NULL_KEY]);
        llSetTimerEvent(3.0);
    }

    changed(integer change)
    {
        seen += change;
    }

    timer()
    {
        if (step > 0) llOwnerSay(llList2String(names, step - 1) + " => events " + (string)llGetListLength(seen) + ": " + llList2CSV(seen));
        seen = [];
        if (step == llGetListLength(names))
        {
            llSetTimerEvent(0.0);
            return;
        }
        if (step == 0) llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_COLOR, 0, <1.0, 0.0, 0.0>, 1.0]);
        else if (step == 1) llSetLinkAlpha(LINK_THIS, 0.5, 0);
        else if (step == 2) llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, MATERIAL]);
        else if (step == 3) llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0, "", <1.0, 1.0, 0.0>, <0.0, 0.0, 0.0>, 0.0, <1.0, 0.0, 0.0>, 1.0, 0, 0.5, 0]);
        else llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, NULL_KEY]);
        ++step;
    }
}
