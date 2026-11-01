integer attempts;
integer replyChannel = 23710;
integer waiting;
integer listener;

queryFolders()
{
    ++attempts;
    ++replyChannel;
    llListenRemove(listener);
    listener = llListen(replyChannel, "", llGetOwner(), "");
    llSetTimerEvent(1.0);
    llOwnerSay("@getinv=" + (string)replyChannel);
}

fallback(string reason)
{
    waiting = FALSE;
    llListenRemove(listener);
    llSetTimerEvent(0.0);
    llOwnerSay(reason + " Please wear Outfit manually.");
}

default
{
    touch_start(integer count)
    {
        if (waiting) return;
        attempts = 0;
        waiting = TRUE;
        queryFolders();
    }

    timer()
    {
        if (attempts < 2)
        {
            llOwnerSay("Viewer reply timed out; retrying.");
            queryFolders();
        }
        else fallback("Viewer did not reply.");
    }

    listen(integer channel, string name, key id, string message)
    {
        if (!waiting || channel != replyChannel) return;
        if (llListFindList(llParseString2List(message, [","], []), ["Outfit"]) == -1)
        {
            fallback("Outfit was not found in #RLV.");
            return;
        }
        waiting = FALSE;
        llListenRemove(listener);
        llSetTimerEvent(0.0);
        llOwnerSay("@attachover:Outfit=force");
        llOwnerSay("Requested Outfit.");
    }
}
