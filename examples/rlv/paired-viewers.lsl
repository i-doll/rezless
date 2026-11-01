// Each copy controls only its own prim's restrictions.
list versions;
list statuses;
list negativeStatuses;
list allStatuses;
default
{
    state_entry()
    {
        llListen(23701, "", llGetOwner(), "");
        llListen(23702, "", llGetOwner(), "");
        llListen(-23702, "", llGetOwner(), "");
        llListen(23703, "", llGetOwner(), "");
        llOwnerSay("@versionnum=23701,sendchannel=n");
    }
    touch_start(integer count)
    {
        llOwnerSay("@getstatus=23702,getstatus=-23702,getstatusall=23703,clear,getstatusall=23703");
    }
    listen(integer channel, string name, key id, string message)
    {
        if (channel == 23701) versions += [message];
        else if (channel == 23702) statuses += [message];
        else if (channel == -23702) negativeStatuses += [message];
        else if (channel == 23703) allStatuses += [message];
    }
}
