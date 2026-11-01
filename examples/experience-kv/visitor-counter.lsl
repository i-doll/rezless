key pending;
string counter;
string original;
integer updating;

reportError(integer code)
{
    llOwnerSay(counter + ": " + llGetExperienceErrorMessage(code));
    pending = NULL_KEY;
}

default
{
    touch_start(integer count)
    {
        if (pending != NULL_KEY) return;
        counter = llGetObjectDesc();
        updating = FALSE;
        pending = llReadKeyValue(counter);
    }

    dataserver(key query, string data)
    {
        if (query != pending) return;
        integer comma = llSubStringIndex(data, ",");
        string value = llGetSubString(data, comma + 1, -1);
        if (llGetSubString(data, 0, comma - 1) != "1")
        {
            reportError((integer)value);
            return;
        }
        if (!updating)
        {
            original = value;
            updating = TRUE;
            llOwnerSay(counter + ": read " + original);
            pending = llUpdateKeyValue(counter, (string)((integer)original + 1), TRUE, original);
        }
        else
        {
            pending = NULL_KEY;
            llOwnerSay(counter + ": saved " + value);
        }
    }
}
