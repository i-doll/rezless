-- Counts votes on channel 5: a number adds to the tally, "reset" starts
-- over, and anything else is ignored. A tally of 10 or more announces the
-- result and stops counting.

local tally = 0
local done = false

local function bump(by)
    tally += by
    ll.Say(0, tostring(tally))
end

local function reset()
    tally = 0
    done = false
    ll.Say(0, "Reset")
end

ll.Listen(5, "", "", "")

LLEvents:on("listen", function(channel, name, id, message)
    if message == "reset" then
        reset()
        return
    end
    local n = tonumber(message)
    if done or not n then
        return
    end
    bump(n)
    if tally >= 10 then
        done = true
        ll.Say(0, "Result: " .. tally)
    end
end)
