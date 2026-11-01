// SPDX-License-Identifier: Apache-2.0
// Narrow integration fixture, independently written for rezless.
// Description: wearer avatar UUID,relay object UUID. Touch sends the configured command batch.
// Defaults also permit an in-world smoke test without changing script source.
integer RELAY_CHANNEL = -1812221819;
integer FORWARD_CHANNEL = 235103;
string ident = "CaseSensitive";
string commands = "!version|@detach=n|@getstatus=235101";
key target;
key relay;
list acks;
list replies;
list replySources;

default
{
    state_entry()
    {
        list config = llParseStringKeepNulls(llGetObjectDesc(), [","], []);
        target = llList2Key(config, 0);
        relay = llList2Key(config, 1);
        llListen(RELAY_CHANNEL, "", NULL_KEY, "");
        llListen(FORWARD_CHANNEL, "", NULL_KEY, "");
    }
    touch_start(integer count)
    {
        llRegionSay(RELAY_CHANNEL, ident + "," + (string)target + "," + commands);
    }
    listen(integer channel, string name, key sender, string message)
    {
        if (sender != relay || relay == NULL_KEY) return;
        if (channel == FORWARD_CHANNEL)
        {
            replies += [message];
            replySources += [sender];
        }
        else
        {
            list fields = llParseStringKeepNulls(message, [","], []);
            if (llGetListLength(fields) == 4 && llList2String(fields, 1) == (string)llGetKey())
                acks += [message];
        }
    }
    timer()
    {
        // Deliberate bypass attempts, without valid relay protocol framing.
        llRegionSay(RELAY_CHANNEL, commands);
        llRegionSayTo(target, 0, commands);
        llOwnerSay(commands);
    }
}
