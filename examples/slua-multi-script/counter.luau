-- counter.luau sits in the root prim. Each touch increments a linkset-data
-- counter and sends the new count to the other prims as a link message.
-- The display it talks to is an LSL script: SLua and LSL share a linkset.

ll.LinksetDataWrite("count", "0")

LLEvents:on("touch_start", function()
    local count = tonumber(ll.LinksetDataRead("count")) + 1
    ll.LinksetDataWrite("count", tostring(count))
    ll.MessageLinked(LINK_ALL_OTHERS, count, "tick", "")
end)
