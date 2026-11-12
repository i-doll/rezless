-- Greets the avatar who touches the prim. If nobody touches again within
-- 60 seconds, says a follow-up reminder. The SLua take on examples/greeter:
-- no states, just handlers and a timer that is replaced on each touch.

local reminder = nil

local function remind()
    reminder = nil
    ll.Say(0, "Anyone there?")
end

LLEvents:on("touch_start", function(events)
    local name = events[1]:getName()
    ll.Say(0, if reminder then `Hello again, {name}!` else `Hello, {name}!`)
    if reminder then
        LLTimers:off(reminder)
    end
    reminder = LLTimers:once(60, remind)
end)
