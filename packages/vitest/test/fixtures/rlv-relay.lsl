// SPDX-License-Identifier: Apache-2.0
// Narrow integration fixture, independently written for rezless.
// Description: explicitly authorized controller object UUID. Empty denies all.
// Only detach add/remove and two fixed getstatus channels are accepted.
// One controller session; no persistence, consent UI, ping/relog recovery,
// optional meta-commands or general command support is claimed.
integer RELAY_CHANNEL = -1812221819;
integer REPLY_CHANNEL = 235101;
integer FORWARD_CHANNEL = 235103;
key controller;
integer active;

ack(string ident, key sender, string command, string result)
{
    llRegionSayTo(sender, RELAY_CHANNEL,
        ident + "," + (string)sender + "," + command + "," + result);
}

default
{
    state_entry()
    {
        controller = (key)llGetObjectDesc();
        llListen(RELAY_CHANNEL, "", NULL_KEY, "");
        llListen(REPLY_CHANNEL, "", llGetOwner(), "");
        llListen(-REPLY_CHANNEL, "", llGetOwner(), "");
    }
    listen(integer channel, string name, key sender, string message)
    {
        if (channel != RELAY_CHANNEL)
        {
            if (active && sender == llGetOwner())
                llRegionSayTo(controller, FORWARD_CHANNEL, message);
            return;
        }
        list fields = llParseStringKeepNulls(message, [","], []);
        if (llGetListLength(fields) != 3) return;
        if (llList2String(fields, 1) != (string)llGetOwner()) return;
        string ident = llList2String(fields, 0);
        list commands = llParseStringKeepNulls(llList2String(fields, 2), ["|"], []);
        integer i;
        for (i = 0; i < llGetListLength(commands); ++i)
        {
            string command = llList2String(commands, i);
            if (sender != controller || controller == NULL_KEY)
                ack(ident, sender, command, "ko");
            else if (command == "!version")
                ack(ident, sender, command, "1100");
            else if (command == "!pong")
            {
                // Pong has no acknowledgement; recovery is outside this fixture.
            }
            else if (command == "!release")
            {
                llOwnerSay("@clear");
                active = FALSE;
                ack(ident, sender, command, "ok");
            }
            else if (command == "@detach=n" || command == "@detach=y"
                || command == "@getstatus=235101" || command == "@getstatus=-235101")
            {
                active = TRUE;
                llOwnerSay(command);
                ack(ident, sender, command, "ok");
            }
            else ack(ident, sender, command, "ko");
        }
    }
}
