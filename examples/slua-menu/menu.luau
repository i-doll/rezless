-- A lamp with a colour menu: the SLua take on examples/menu. Clicking it
-- shows the toucher a dialog, and their answer sets the colour. The menu
-- closes itself after 30 seconds.

local CHANNEL = -7001
local listener = nil
local timeout = nil

local function close()
    if listener then
        ll.ListenRemove(listener)
        listener = nil
    end
    if timeout then
        LLTimers:off(timeout)
        timeout = nil
    end
end

ll.SetText("white", vector(1, 1, 1), 1)

LLEvents:on("touch_start", function(events)
    local who = events[1]:getKey()
    close()
    listener = ll.Listen(CHANNEL, "", who, "")
    ll.Dialog(who, "Pick a colour", { "Red", "Green", "Blue" }, CHANNEL)
    timeout = LLTimers:once(30, close)
end)

LLEvents:on("listen", function(channel, name, id, message)
    close()
    ll.SetText(`{string.lower(message)}, set by {name}`, vector(1, 1, 1), 1)
end)
