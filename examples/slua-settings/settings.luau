-- Keeps its settings as JSON in linkset data, so they survive a reset.
-- Commands on channel 7, from the owner only:
--   set <name> <value>   change a setting
--   show                 say every setting
--   reset                reset the script (the settings stay)

local CHANNEL = 7
local DEFAULTS = { colour = "white", brightness = 1 }

local function load()
    local stored = ll.LinksetDataRead("settings")
    local settings = if stored == "" then {} else lljson.decode(stored)
    for name, value in DEFAULTS do
        if settings[name] == nil then
            settings[name] = value
        end
    end
    return settings
end

local settings = load()

local function save()
    ll.LinksetDataWrite("settings", lljson.encode(settings))
end

local function show()
    local names = {}
    for name in settings do
        table.insert(names, name)
    end
    table.sort(names)
    for _, name in names do
        ll.OwnerSay(`{name} = {settings[name]}`)
    end
end

ll.Listen(CHANNEL, "", ll.GetOwner(), "")

LLEvents:on("listen", function(channel, name, id, message)
    local command, setting, value = string.match(message, "^(%S+)%s*(%S*)%s*(.*)$")
    if command == "set" and setting ~= "" then
        settings[setting] = tonumber(value) or value
        save()
        ll.OwnerSay(`{setting} set`)
    elseif command == "show" then
        show()
    elseif command == "reset" then
        ll.ResetScript()
    else
        ll.OwnerSay(`unknown command: {message}`)
    end
end)
