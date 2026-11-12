-- Counts votes on channel 5: a number adds to the tally, anything else is
-- ignored. A tally of 10 or more announces the result and stops counting.

local tally = 0
local done = false

local function bump(by)
    tally += by
    ll.Say(0, tostring(tally))
end

-- Never called: coverage reports it as missed.
local function reset()
    tally = 0
end

ll.Listen(5, "", "", "")

LLEvents:on("listen", function(channel, name, id, message)
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
