// JSON config demo — a tiny key/value store with nested paths.
//   "set theme.color red"   – writes config.theme.color
//   "get theme.color"       – reads it back
//   "keys"                  – lists top-level keys
// State lives as one JSON blob in Linkset Data, so changes survive
// llResetScript and edits from sibling scripts.

string config;

default
{
    state_entry()
    {
        config = llLinksetDataRead("config");
        if (llJsonValueType(config, []) != JSON_OBJECT) {
            config = llList2Json(JSON_OBJECT, [
                "theme",  llList2Json(JSON_OBJECT, ["color", "blue", "size", 12]),
                "volume", 5,
                "muted",  "false"
            ]);
            llLinksetDataWrite("config", config);
        }
        llListen(0, "", NULL_KEY, "");
    }

    listen(integer channel, string name, key id, string message)
    {
        list parts = llParseString2List(message, [" "], []);
        string cmd = llList2String(parts, 0);

        if (cmd == "get") {
            list path = llParseString2List(llList2String(parts, 1), ["."], []);
            llSay(0, llJsonGetValue(config, path));
        }
        else if (cmd == "set") {
            list path = llParseString2List(llList2String(parts, 1), ["."], []);
            string value = llList2String(parts, 2);
            config = llJsonSetValue(config, path, value);
            llLinksetDataWrite("config", config);
        }
        else if (cmd == "keys") {
            list flat = llJson2List(config);
            integer i = 0;
            integer n = llGetListLength(flat);
            string out = "";
            for (i = 0; i < n; i = i + 2) {
                if (out != "") out = out + ",";
                out = out + llList2String(flat, i);
            }
            llSay(0, out);
        }
    }
}
