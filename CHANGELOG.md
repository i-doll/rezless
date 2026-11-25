# Changelog

## [0.14.1](https://github.com/i-doll/rezless/compare/v0.14.0...v0.14.1) (2026-11-25)


### Bug Fixes

* **vm:** keep the NaN sign when V8 optimises the code that makes it ([#792](https://github.com/i-doll/rezless/issues/792)) ([759e273](https://github.com/i-doll/rezless/commit/759e273c3ece59f25979d9e83624faed9348d3d7))

## [0.14.0](https://github.com/i-doll/rezless/compare/v0.13.0...v0.14.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **vm:** After a take or a detach and wear inside a handler that spun with clicks, events that come after the rez run behind the carried click and ahead of the held-back click, including a listen in a later sleep, a link message the handler sent itself after a wake, and a later take's on_rez. In LSL a listen from before the take and the detach's attach run there too, in the order they came. In SLua the waiting events are reversed once per rez, each on_rez after the first keeping its place, so after two rezzes both clicks run first to last with their touch events.
* **vm:** llGetInventoryCreator on an object item in a prim's contents returns the creator of the object's root prim, which is the owner when no creator is set, instead of NULL_KEY.
* **vm:** Test helpers that deliver an event, such as script.fire and linkset.touch, no longer run an event that llMinEventDelay holds back. The event stays queued until the test advances time past the delay.
* **vm:** After a take and wear, the first held land_collision of a land contact held in the sleep now runs ahead of the touch events of a held-back click, instead of after that click's touch.
* **vm:** A touch_end that merges two releases lists the avatars in the order they let go, an avatar's second click after a spin raises its own touch_start, touch and touch_end (SLua drops that touch after a take or a detach and wear), a click on a taken or re-worn object no longer merges into the avatar's own click carried from the spin, an LSL press during another avatar's hold raises no touch_start even after a click in the spin, and the attach of a wear, and a listen that came after a take or a wear, run after the carried touch events that were not held back.
* **vm:** A take in a handler's sleep keeps a click held back behind another avatar's click from the spin, and runs it after the carried click. After a take and wear, attach runs right after the carried click, ahead of the change of a sitter's stand and of the held-back click. A collision_start and collision held in a detach and wear's sleep run inside the carried click, before its touch_end, and with no take or detach a land contact held in the sleep runs inside the first avatar's click. When two avatars clicked in the spin and the second of them pressed again in the sleep, the first one's later press joins that touch, and in SLua its touch_start.
* **vm:** After a detach and wear with a click held back behind a carried click, the wear's attach event runs right after the carried click, ahead of held changes and the held-back click, and a land contact held in the sleep runs inside the carried click. A second click in a sleep, by an avatar that clicked in the handler's spin, now joins the other avatar's touch from that sleep, and in SLua its touch_start when pressed while that avatar holds on.
* **vm:** An LLTimers or llcompat.SetTimerEvent tick due on a whole simulator frame now always runs on that frame, so scripts or tests that timed such a tick a frame late see it a frame earlier.
* **vm:** A timer or llMinEventDelay longer than 256 s that is a whole number of simulator frames as a float, such as 256.2 s, runs its ticks on those frames instead of a frame or more later.
* **vm:** In SLua, a second avatar's touch_start from a first click during another avatar's hold after a handler spun waits behind a merged touch_end listing both avatars, and after a detach and wear a held change runs ahead of a held-back click.
* **vm:** An RLV force sit, stand or ground sit reaches World seating 10 simulator frames (222 ms) after the command instead of 225 ms, and an llSleep longer than 256 s that is a whole number of frames as a float wakes on that frame instead of the one after.
* **vm:** A script that calls llSleep, or a function with a forced delay, wakes on the first simulator frame (1/45 s) on or after the time has passed, counted from the call, so llSleep(0.25) takes 0.267 s and the 0.1 s delay of llRezObject takes 0.111 s. A mock's ctx.sleep(ms) rounds up the same way, and a notecard read's dataserver event comes when its delay ends.
* **vm:** A second avatar's click held back in a busy loop behind a released click now raises its own touch event; in SLua a later click's own touch runs ahead of its touch_start; a detach and wear keeps a held-back click and leaves a click held through it stuck, with no touch_end on release; and after a take or a detach, a later click merges only into a held-back carried click (not into the avatar's own click carried from the spin).
* **vm:** Under llMinEventDelay, a held click's touch events after the first come a delay rounded up to whole simulator frames after touch_start and after each other, so llMinEventDelay(0.3) spaces them 0.311 s apart instead of 0.3 s.
* **vm:** llMinEventDelay counts in whole simulator frames from the frame it last let a timer, sensor or touch_start event through, and every such event due before then runs with it, the timer tick first, one frame apart; a 0.3 s delay spaces events 0.311 s apart. A timer tick held through more than an interval of a sleep starts the schedule again from the frame the script woke on, and after a busy handler the tick standing for the later ticks restarts it from when it ran.
* **vm:** In LSL, an avatar's later clicks while another avatar's click is held raise touch_start (only its first overlapping click omits touch_start). In SLua, waiting touch events carried from a busy loop through a take or a detach reverse once per rez (running touch_end first after a single take or detach).
* **vm:** A timer tick runs on the first simulator frame (1/45 s) on or after its due time, counting frames from when the timer was set, started or last ticked, so a 0.1 s timer set in a handler ticks at 0.111 s, 0.2 s and 0.311 s instead of 0.1 s, 0.2 s and 0.3 s. For a tick delayed by at most one interval, its lag also counts the frames it waited behind the script's previous handler, which starts the next llSetTimerEvent call's first tick earlier by that much (a tick held back past a full interval leaves no lag).
* **vm:** Each script runs one queued event or timer tick per simulator frame (1/45 s), a frame after its previous handler ended, and in LSL a second waiting changed event or timer tick two frames after. An event a handler raises, such as a link message, chat, a changed, on_rez or a reset script's state_entry, runs a frame later at the earliest. Test helpers that deliver an event move the clock on to the frame it runs in, but not to the events its handler raises; tests advance time for those.
* **vm:** A rezzed root moved with PRIM_POSITION or PRIM_POS_LOCAL now moves at most 10 m toward the target per rule, and a worn root's offset from its attachment point is cut to 3.5 m, for those rules and for llSetPos. Before, both moved the whole way.
* **vm:** In LSL, when one avatar holds a click and a second avatar clicks while a handler runs a busy loop, the touch raised after the handler lists only the first avatar, also when the handler slept before the loop. The second avatar is listed only when it clicked while the handler slept or waited out a function's delay, and the first avatar's touch came up then too.
* **vm:** Touch events change when two or more avatars click the same object. Each touch lists every avatar holding a click, in the order they pressed, where it listed one avatar per event (except in LSL for a touch waiting through a handler's busy loop, which lists only the first avatar). In LSL, an avatar's first click pressed while another avatar's click is held raises no touch_start unless touch_end is running (later clicks by that avatar during the overlap raise touch_start). A touch_start raised during an LSL touch_end sleep runs ahead of the touch that waited. In LSL, a held click's touch waiting through another handler's sleep or forced delay also lists other avatars whose clicks were held during it, when it came up after the handler's first frame and before any spin.
* **vm:** Gifts that land in one frame in an object its owner cannot modify, or in another owner's prim, now raise one changed(CHANGED_ALLOWED_DROP) in each script that has not run one yet, whether they come from inside the linkset or from other objects. Only a giving script that already had another object's drop waiting gets a second.
* **vm:** Touch events change for scripts that sleep while avatars click. After the touch handler ends, a held click's next touch comes one repeat later: 0.044 s in LSL and 0.022 s in SLua. In LSL, an avatar's first click pressed while another handler (other than touch_end) runs on and another avatar's click is held raises no touch_start. A click by another avatar during a touch_start sleep raises its touch_start after the touch_end that waited. A second avatar's held click adds no touch while the first avatar's touch waits through a sleep. A held click's touch from a sleep after its touch_start ran runs ahead of chat that came later.
* **vm:** A colour, alpha, shape, media or render material change of a child prim whose scripts have no changed handler now raises changed in the root prim's scripts, and two gifts inside a no-modify object in one handler raise one changed(CHANGED_ALLOWED_DROP) instead of two.
* **vm:** llMapDestination and llMapBeacon in a rezzed object now record a map for a clicker who is in another region of the World, and count it against that avatar's map throttle in the object's region, saying the throttle error when it is over the limit. A clicker whose key is not a World avatar and whose region presence is set false still gets nothing.
* **vm:** A held click raises no touch while the script's touch handler sleeps, spins or waits out a forced delay, so a release during that time gives only touch_end, and a click by another avatar during it raises no touch, and in LSL no touch_start for that avatar's first click while an earlier click is still held.
* **vm:** llMapDestination and llMapBeacon show each avatar at most 4 maps and beacons per region over weighted 4 s periods (counting calls in the current period plus the previous period's calls scaled by the fraction of the current period remaining), from all objects together. Calls past that count against the throttle, shut it until the end of the following 4 s period, show nothing, and say "Too many llMapDestination() function calls; halted until average falls." on DEBUG_CHANNEL.
* **vm:** changed(CHANGED_INVENTORY) from llGiveInventory or llGiveInventoryList into a prim of the giver's own linkset now comes up a simulator frame after the call instead of at it. It merges with prim changes made in that frame, so a gift and llSetColor give one changed(3), and an idle script gets one changed event for all gifts and prim changes made in the same frame, where two gifts from another prim used to give it two. A gift to the giver's own prim leaves a copyable item in place instead of adding a numbered copy, and removes a no-copy one.
* **vm:** llMapDestination and llMapBeacon in a rezzed object show the map again from each touch after the first and from the touch_end of a held click, not once per click, and after a link break ends a click the root's script holds, that avatar's next click raises no touch_start there unless the release reached the root or the script was reset.
* **vm:** A script busy in a handler when another script calls llUnSit after a sleep, llSetLinkColor, llSetColor or llBreakLink and then sends a link message now gets that link_message before the changed event the call raised, and several prim changes made in one simulator frame give a busy script one changed event instead of two.
* **vm:** A held click raises touch every 1000/45 ms in an SLua script, twice as often as in an LSL one. The release of any held click goes where a click on that prim would go at the release, by its pass setting and links at that moment, and its touch_end reads the prim's link number then. llBreakLink and llBreakAllLinks end every click held by the root's scripts at once with touch_end, and the release can then raise touch_end alone there.
* **vm:** Events that came up while a handler slept now run before the events the handler raises after it wakes. A timer tick that fell due in the sleep runs before them too, and a held land contact's land_collision events run one every two simulator frames behind them.
* **vm:** An SLua script that calls llUnSit, llBreakLink or llBreakAllLinks with a default avatar seated, after sleeping or staying busy earlier in the same handler, and then sends a link message, now gets that link_message before changed(CHANGED_LINK), and so does every other script of the object that isn't busy in a handler, because the stand's changed(CHANGED_LINK) arrives one simulator frame (1/45 s) after the call, as in LSL. For a sitter added with standTakesFrame: true, changed(CHANGED_LINK) still runs before link_message in every script.
* **vm:** The release of a held click on a child prim with the default pass setting goes where a new click on that prim would go when the button comes up. A script it reaches that did not get the click gets touch_end alone, which also ends a click that script was still holding. A clicked script it no longer reaches gets no touch_end and keeps getting touch until the same avatar clicks it again.
* **vm:** In LSL, llBreakLink and llBreakAllLinks on a seated object raise changed(CHANGED_LINK) a simulator frame after the call in every script, so a link message sent straight after the call runs first. llUnSit from an LSL handler that slept or was busy first does the same. Before, those scripts got changed first.
* **vm:** An event raised at a script that has not started yet, such as linkset data, a link message, a sit's changed event or an attach event, is now lost instead of running the script's handler without state_entry; start the script before the event to receive it. Script.start on a stopped script no longer runs state_entry until the script is set running.
* **vm:** changed events for prim colour, alpha, scale, shape, media, render material and link changes made by a script call arrive one simulator frame (1/45 s) after the call, so a link message the handler sends right after the call runs before them, a change made just before a state change runs in the new state, and a test must advance time past that frame to see them.
* **vm:** A link message sent to a script that has not started yet is lost, as in Second Life. A test that starts the sender with start() before the receiver, and expects the receiver to get the message, has to start both together with linkset.startAll().
* **vm:** `linkset.duplicate` now starts the copy of a crashed LSL script that is set running, and of a crashed SLua script that was stopped and started again since the crash.
* **vm:** setting `s.running = true` on a crashed script leaves it crashed. Use `s.reset()` or llResetOtherScript to bring it back.
* **vm:** llLookAt at a target that is not level with the prim gives a different rotation than before, for non-physical prims at once and for physical prims as the one they turn toward.
* **vm:** worn objects no longer get moving_start and moving_end for a teleport into another region, and when the wearer is at rest the other worn move target no longer pulls the wearer after the script holding one of two targets resets or is set not running. A worn move target that stops while the wearer is still moving no longer holds the wearer where it is; the remaining targets keep pulling.
* **vm:** worn objects now get moving_start and moving_end when their wearer moves; two worn move targets pull the wearer to their 1 / tau weighted average instead of each pulling in turn; a pending sit autopilot fails while a worn move target pulls the wearer; and no-modify unlinks now tell the owner.
* **vm:** rays hit seated and ground-sitting avatars at different places than their size box, and standing avatars shorter or taller than about 1.65 to 1.71 m at different places than before.
* **vm:** llMoveToTarget in a worn object now moves its standing wearer instead of the attachment itself (a seated wearer stays put), llSetRegionPos in a worn object returns FALSE and moves nothing, and worn objects no longer link or unlink; llBreakLink and llBreakAllLinks without PERMISSION_CHANGE_LINKS now put an owner error on DEBUG_CHANNEL; and rays hit standing avatars at different places than their size box.
* **vm:** Linkset.duplicate no longer copies the original's llRotLookAt or llLookAt target into the copy.
* **vm:** llRot2Fwd, llRot2Left and llRot2Up, in LSL and SLua, can differ in the last bits and the zero signs for rotations that are not unit length, and give the unturned axes for rotations of length 1e-7 or less.
* **vm:** a Duplicate's copy no longer keeps the original's move target.
* **vm:** rotation / rotation and vector / rotation can differ in the last bit and the zero signs of finite results, give -nan where an overflow meets an opposite infinity, and give Second Life's NaN signs when a NaN and an infinity meet. llRot2Fwd, llRot2Left and llRot2Up of a rotation larger than about 9.2e18 in each part give the unturned axis.
* **vm:** an edit, Take or Take Copy of a physical object at rest or settling raises moving events. An impulse or push during a selection no longer raises moving_start, and a move target set then starts the object only at the release. A physical object the viewer rezzes gets on_rez only, not moving_start and moving_end.
* **vm:** position reads, sensors, targets, relative rezzing and rays in or about a worn object now use its wearer's position instead of the fixture position on the attachment point, sensors and rays skip attachments, and at_rot_target's ourrot is the inverse of the object's rotation.
* **vm:** llEuler2Rot and llRotBetween of opposite vectors can return results that differ from before in the last bits of a float, and llEuler2Rot of a negative angle that lands on a half step turns one step further than before, matching the magnitude of its positive.
* **vm:** an SLua script's timer lags after a late tick or a start, so a timer handler next to LLTimers sees extra ticks. A timer set in the caught-up tick's handler after a start keeps the start's lag when the tick runs after the next one was due, and a tick a call made due a full interval or more ago leaves no lag.
* **vm:** a new object's first switch to physical and a scripted physical rez raise moving_end 0.9 s later instead of 0.8 s and 0.133 s. Duplicating a physical object at rest or settling raises moving events in the original and the copy.
* **vm:** llGetObjectDetails OBJECT_ROT of an attached prim returns the wearer's rotation for the root, and the child's local rotation times the wearer's for a child, instead of the rotation composed from the attachment's rotation on its point.
* **vm:** NaN signs out of rotation products and divisions, llListStatistics MEDIAN of a list holding a NaN, llRot2Fwd, llRot2Left and llRot2Up of a NaN or infinite rotation, and SLua's ll.Acos of -nan now give Second Life's results.
* **vm:** another avatar's Take Copy of a moving object no longer raises moving_end or moving_start in it, and the copy rezzes moving. A KFM_CMD_PLAY while the viewer holds the object selected no longer plays the motion at once, and after a KFM_CMD_STOP in that time it now plays the motion when the viewer lets go. A Take or Take Copy whose moving_end calls llDie returns no object. A script that has not started no longer receives moving events.
* **vm:** llGetRootRotation in an attachment returns the wearer's rotation instead of the attachment's local rotation.
* **vm:** after a start, a timer set in a waiting handler before the caught-up tick now ticks on a schedule from the call instead of from the missed tick, and can give two ticks at the start or the wake.
* **vm:** switching physics on again for an object at rest raises moving_end 0.8 s later rather than 0.133 s (a new object's first switch to physical raises it 0.9 s later), so a script that sleeps 0.5 s after switching physics on now gets both moving events.
* **vm:** under the RLVa profile, `attemptAvatarPay` with `{ menu: true }` on an avatar or another avatar's attachment returns `blocked` with reason `shownames` (or `shownames_sec`) while `@shownames` hides that avatar.
* **vm:** a script added to, first started in, or set running from stopped in a moving object now gets moving_start after state_entry. At an owner's Take or Take Copy of an object in keyframed motion (not another avatar's Take Copy), the original's scripts now run the moving_end raised by selection before the item or copy is saved (so the copy carries what that handler did), and a script asleep at such a Take or Take Copy now gets moving_end after on_rez in the rezzed object.
* **vm:** reading a seated avatar's PRIM_ROTATION or OBJECT_ROT in the same event as a rotation set, right after the avatar sits, or right after a relink gives the object another root, gives the rotation from before. A standing avatar no longer keeps its seated region rotation.
* **vm:** attemptAvatarPay and fixture.pay on an attachment prim now return kind 'object', check `@buy` instead of `@pay`, and queue money events on the attachment. Pass { menu: true } for the previous wearer payment.
* **vm:** a negative NaN now prints as -nan in llList2CSV and llList2Json. Unary minus now binds looser than *, / and % (which changes the `@rezless/parser` AST as well as integer results such as a / -b / c). llListStatistics MIN, MAX and RANGE keep a leading NaN, RANGE of [0.0, -0.0] is 0.0, and llSleep of a negative NaN returns at once.
* **vm:** llJsonGetValue and llJsonValueType return JSON_INVALID instead of JSON_NULL for an empty object member such as {"k":,}.
* **vm:** the tick after a held tick can come earlier than an interval after it, a tick held past more than one interval no longer moves the first tick of a later llSetTimerEvent call earlier (a timer set after a sleep that held a tick back for more than one interval now ticks a full interval after the call), and a started script can get two timer events at a wake.
* **vm:** `@tpto` moves the avatar 220 ms after the command instead of at once, writes a pending log entry immediately and its applied or refused entry when it lands, and a second `@tpto` sent while the first is on its way logs the first as refused. Worn scripts get the changed event for a region crossing 640 ms after the avatar leaves, and script teleports now send worn scripts a changed event. A force stand overtaken by a teleport logs unchanged instead of refused, and a force ground sit overtaken by a teleport within the region lands instead of being refused.
* **vm:** malformed JSON-shaped values such as {"a"}, [1,,2] or "a"b" are now written as they are instead of quoted. llJsonSetValue trims a string value and deletes on a padded JSON_DELETE. JSON_INVALID is written as an empty slot instead of a quoted string. llList2Json no longer trims a no-break space.
* **vm:** a motion that starts and ends while a script sleeps no longer raises moving_start and moving_end; script-rezzed objects (unless keyframed motion is already playing) get moving events, while viewer-rezzed objects get on_rez only; copies made by Duplicate or by the owner's Take or Take Copy keep keyframed motion paused instead of playing (another avatar's Take Copy rezzes moving); llStopMoveToTarget on a resting object no longer raises moving_start; and a viewer edit pauses keyframed motion for 0.4 s.
* **vm:** attemptAvatarPay and fixture.pay now return `paid` for a prim without a running money handler, where they returned `unsupported` with reason `not-payable`. For a rezzed (non-attachment) object, pass `{ menu: true }` for the old refusal (on another avatar's attachment, `{ menu: true }` pays the wearer as an avatar). A payment to a child without a handler now runs the root's money handler.
* **vm:** llEuler2Rot returns an exact quarter turn for angles within 1.414e-5 radians of a quarter turn, and its zeros may change sign. A seated avatar's link stores tiny rotations as none and rescales near-unit ones in single precision, and a rotation too long to square in single precision is stored as <0, 0, 0, 0>. A child prim's PRIM_ROTATION is multiplied by the root in single precision and is no longer normalised afterward.
* **vm:** malformed JSON that rezless used to return whole from llJson2List, or read as JSON_INVALID, now reads as Second Life reads it, and a non-numeric string specifier on an array now gives JSON_INVALID instead of the first element.
* **vm:** a script reset while its object lies on the land gets a land_collision_start ahead of its next land_collision, and a script that changes state during a contact whose held land_collision events ran gets every live land_collision after it.
* **vm:** using the float value of `integer *= float` (such as `float g = (i *= f)` or `(string)(i *= f)`) crashes the script when the handler or function is entered, with Mono's System.InvalidProgramException text, instead of at the statement with "cannot take result of integer *= float" (assigning it to an integer still fails to compile with "Type mismatch", and a standalone `i *= f;` statement runs normally). The InvalidProgramException text for a key print gains the stack frames, and a user function's name gains the "g" prefix. llSetTimerEvent after a start that caught up on a missed tick gives an earlier first tick, and a timer tick now runs before a sensor result due at the same time.
* **vm:** llAxisAngle2Rot, llRot2Fwd, llRot2Left, llRot2Up and SLua's ll.VecNorm return zero for a part below the smallest normal float. llAxisAngle2Rot drops the axis direction for an axis no longer than 1e-7 or whose squared length overflows (1.9e19 or more) and normalises <0, 0, 0, cos(angle / 2)>, returning ZERO_ROTATION when cos(angle / 2) >= -1e-7 (including at PI) and <-0, -0, -0, -1> when cos(angle / 2) < -1e-7.
* **vm:** llSetLinkGLTFOverrides and the PRIM_GLTF_* rules now store values that equal the glTF default (metallic or roughness of 1, alpha cutoff of 0.5, opaque white base colour alpha of 1, or black emissive tint) 2^-23 away from it (for example a metallic factor of 1 reads 0.99999988), where they used to read back exactly.
* **vm:** a stopped script's move and look targets no longer act until the script is started, including targets a sibling sets meanwhile. A llSetScriptState or llResetOtherScript made by a handler that was busy at a detach now takes effect after the wear instead of during the detach.
* **vm:** llGetTextureOffset, llGetTextureScale and llGetTextureRot with a negative face return face 0's values instead of zeros. Assigning a key print to a key variable is a compile error, a discarded key print in a for init or step no longer halts the script, and scripts that use a print value outside the places Mono accepts (such as integer i = print(1);, list l = print([1]);, or (print(x));) no longer compile. llJson2List, llJsonValueType and llJsonSetValue now handle valueless JSON object members ("k":) and trailing commas as Second Life does (llJsonSetValue writes a valueless member as "k": instead of "k":null, and llJson2List gives two more empty strings for a trailing comma). llJsonSetValue with JSON_DELETE removes an array element instead of returning JSON_INVALID, and returns JSON_INVALID for a missing object key or an array index one past the end instead of returning the input unchanged.
* **vm:** llSetLinkGLTFOverrides with an unknown override code now rejects the whole call instead of skipping that pair, and its errors are no longer heard by scripts listening on DEBUG_CHANNEL.
* **vm:** llGetObjectDetails OBJECT_VELOCITY reads zero for an avatar that left beyond the next region; llGetAgentList's parcel scopes keep a departing avatar during "Init"; llGetVisualParams, llSameGroup and llName2Key read avatars that left the region.
* **vm:** a script that runs other events after a sleep gets fewer of the land_collision events held in it, a contact that goes on past the wake gives fewer live land_collision events, and collision_end held in a sleep runs after the second held land_collision instead of the first.
* **vm:** llBase64ToString returns fewer ? characters for truncated and overlong UTF-8 sequences and drops a final decoded NUL byte instead of ending in ?. The InvalidProgramException error text for a user function that uses a key print's value changes from ":f ()" to ":gf ()" plus its Mono parameter types. llSetLinkGLTFOverrides with a non-integer rule code (including a trailing non-integer code with no value) now rejects the whole call with an error instead of skipping the bad pair and applying the others. llSetPhysicsMaterial with a masked value outside its accepted range now emits "ERROR: Failed to set material properties." once on DEBUG_CHANNEL while still applying its in-range values.
* **vm:** world.userSitAvatar and getSitResponse seat an avatar on a cylinder's top at another place and turn, on an oval cylinder against the polygon's sides instead of the oval, and write turns between -180 and -120 degrees as the turn plus 360 degrees. Because headings are wrapped in region space, the stored rotation of a seat on a turned prim can read with the opposite quaternion sign.
* **vm:** linkset.collide() now triggers default material sounds for objects that never called llCollisionSound, and the speed an impact needs depends on the objects' sizes instead of a fixed 2 m/s.
* **vm:** owner permission errors on DEBUG_CHANNEL from a child prim for llTakeControls, llSetCameraParams, llClearCameraParams and the camera getters (llGetCameraPos, llGetCameraRot, llGetCameraFOV, llGetCameraAspect) now end with " {RootName ..., RootPosition {...}}" (including the permission holder's copy for llTakeControls), and pathfinding errors from a child prim come from the root prim's key.
* **vm:** SLua scripts now get zero where they used to get a result below the smallest normal float or double, as in Second Life. An object rezzed or worn from inventory can read a profile cut, hollow, dimple or advanced cut one 0.00001 step lower than the object that was taken, and rebuilds its faces if that changes its shape.
* **vm:** llKey2Name, llGetUsername, llGetDisplayName, llGetObjectDetails and llGetAttachedList read an avatar in a region that shares an edge with the script's region, and one that left for up to about 50 s, where they read "", [] or "NOT ON REGION" before. An avatar in a non-adjacent region that the region no longer knows reads llGetAttachedList "NOT FOUND" instead of "NOT ON REGION". A seat's sitter reads as absent for 22 ms after the seat is deleted. World.userSitAvatarOnGround returns false and leaves a flying avatar flying, where it sat it on the ground before.
* **vm:** s.chat now has an owner-say for each SLua print, and a long DEBUG_CHANNEL error in s.chat is cut to fit the prim's name.
* **vm:** removeInventory resets faces that use a deleted texture or material, and a deleted material adds CHANGED_RENDER_MATERIAL to the changed event.
* **vm:** llStartAnimation, llStopAnimation, llSetAnimationOverride, llResetAnimationOverride and llGetAnimationOverride without their required permission now add owner-only DEBUG_CHANNEL entries to the script's chat. Rezzing an empty notecard says "Could not find object" and takes 1 s more.
* **vm:** ll.GetUsedMemory() in an SLua script that names LLEvents or LLTimers reads 40 bytes more from its start, and each LLEvents:on handler and LLTimers callback now adds to it; setting either global to nil no longer lowers it. A crashed SLua script whose error says "not enough memory" without actually running out of memory is heard as "runtime error" by listening scripts.
* **vm:** scripts with moving_start or moving_end handlers now get them when physics is switched on, when a prim joins a moving object and from setVelocity; a waiting moving_end can be taken away by a later moving_start; land collisions held in one sleep are merged and read the prim's current position.
* **vm:** a force ground sit that a later ground sit replaces now logs unchanged when the avatar ends on the ground, where it logged refused. A teleport within the region sits the avatar on the ground at once when a force or menu ground sit waits for its stand, and a teleport to another region drops that ground sit and leaves the avatar standing. A Kokua standtp return sits the avatar on the ground as it lands. A script teleport to another region refuses force sit, stand and ground sit requests the region hasn't answered yet and any ground sit still waiting for its stand, where they used to land in the new region.
* **vm:** a take and rez drops a waiting game_control, a state change out of a game_control handler no longer drops one, a handler that sleeps twice gets one game_control instead of two, and the first held land_collision runs before game_control. sendGameControl no longer reaches a script in a state with no game_control handler. Held land_collision_start now runs before collision_start.
* **vm:** scripts calling the sound calls, llPreloadSound, llSetTexture, llSetLinkTexture, llSetScriptState, llResetOtherScript or llGetScriptState with a missing or wrong-type item name now sleep 1 s per call on top of their usual delay. Error floods are now counted in aligned 16 s periods on the region clock rather than from a prim's first error, so bursts that start late in a period can hit or clear the cap sooner or later than before.
* **vm:** llTakeControls, llSetCameraParams, llClearCameraParams and (when the script has a permission key) the camera getters (llGetCameraPos, llGetCameraRot, llGetCameraFOV, llGetCameraAspect) without their required permission now add owner-only DEBUG_CHANNEL entries to the script's chat (with llTakeControls also messaging the permission avatar), and an RLVa Duplicate under `@fartouch` is refused unless the prim's center or the new clicked point is within reach.
* **vm:** after a Take Copy of an object whose stopped script holds a move or look target, the original no longer moves toward that target until the script is started. A script stopped by a sibling's attach(NULL_KEY) now comes back reset, and one started there keeps its state. A handler that was running at a detach and ends in llResetScript no longer gets on_rez or attach when the object is worn again.
* **vm:** RLVa "`@sitground=force`" and World.sitAvatarOnGround no longer clear AGENT_FLYING (whereas World.userSitAvatarOnGround refuses a flying avatar). A deleted seat's sitter reads "Striding" until 270 ms instead of 50 ms and no longer walks. A teleport of a flying avatar reads AGENT_FLYING and AGENT_IN_AIR "Hovering" instead of "Falling Down", "Landing" and "Standing", and scripts in the region an avatar leaves read it as "Init" for 200 ms instead of "" at once, with AGENT_FLYING kept.
* **vm:** llRezObjectWithParams says option errors to the owner where it was silent. REZ_SOUND with a missing name, NULL_KEY or another item's name now refuses the rez, and its "" keeps the saved sound instead of clearing it. A sound item named like a key now wins over that key. The root suffix uses an exponent for coordinates below 1e-4 and the wearer's position when worn.
* **vm:** the RLV command log gains a refused sitground entry when a later sit request drops a waiting force ground sit.
* **vm:** more than 8 quick errors from one prim now give the flood notice and drop the rest, for the owner and for listeners. llRequestUserKey refuses lookups for longer after calls past its limit, and answers again sooner after a burst of exactly 20.
* **vm:** scripts with moving_start or moving_end handlers now get them for keyframed motion and llSetRegionPos; several collisions in one sleep reach the handler as one event; a target event held in a sleep can be replaced; sensor events wait for llMinEventDelay.
* **vm:** game_control input sent while a handler sleeps now arrives after held-back events and only as its newest state. For a script whose current state has a game_control handler, the mode functions read new input before its event runs when the script is not inside game_control. sendGameControl no longer runs a sleeping handler to its end.
* **vm:** root scripts now get changed for gifts and remote loads into a child prim with no changed handler. A script that was stopped when its object went into inventory no longer resumes where it was.
* **vm:** Script.reset(), and a recompile through prim.replaceInventory, made from inside the script's own running handler (for example from a mock) now stop that handler at its next call instead of letting it finish. A mock that detaches the object from inside a handler no longer clears that script's waiting events.
* **vm:** llEuler2Rot returns different last bits for many rotations and different turns for angles past about 5e6 radians. A prim given a rotation of length 1e-7 or less stores no rotation instead of a rescaled one, and rescaled rotations can differ in their last bits.
* **vm:** world.userSitAvatar with an offset on a box's top now seats the avatar at the side nearest the clicked spot among the sides reached across the top, and an offset on a cylinder now moves the seat. A plain request whose line from the camera meets a box's top first selects its side the same way.
* **vm:** llPlaySound, llTriggerSound and the other sound calls, and PSYS_SRC_TEXTURE, now take an item whose name reads like a key before the key. A key is refused when an item of another type has its text as a name. llRequestInventoryData returns NULL_KEY and records no request for a name that is not a landmark in the prim.
* **vm:** a crashed SLua script's second DEBUG_CHANNEL line in s.chat is now the Lua message and traceback instead of "runtime error" (or "not enough memory"). Listening scripts still hear the short text.
* **vm:** a script that called llGetNotecardLineSync or llFindNotecardTextSync in the same event as the first llFindNotecardTextCount of a notecard got its text and now gets NAK, and llFindNotecardTextCount with an invalid pattern leaves the notecard uncached so later sync reads continue to return NAK.
* **vm:** llGetPrimitiveParams and llGetLinkPrimitiveParams now say owner-only errors on DEBUG_CHANNEL (for missing or non-integer faces and missing, invalid or absent PRIM_LINK_TARGET links, with the root name and position suffix from a child prim or seated avatar) where they used to end silently, scripts listening on DEBUG_CHANNEL no longer hear those errors, some reads keep a PRIM_CLICK_ACTION value they used to drop, and llRezObjectWithParams refuses a REZ_SOUND_COLLIDE name it can't find. RezRecord no longer has collisionSound; read the rezzed root prim's collisionSound instead.
* **vm:** s.fire() called from inside one of s's own handlers no longer runs the fired handler before returning; it runs after the current handler ends. Inventory edits made from inside a handler deliver changed to that script after the handler ends.
* **vm:** setGameControl and the exported GameControlState type are removed; use sendGameControl(agent, input) and import GameControlInput instead. sendGameControl now takes the whole controller state (mode, buttons, axes, modeButtons, modeAxes), raises game_control only when it changes, and reaches every permitted script in the World whose current state has a game_control handler. llGetGameControlMode and its siblings keep the last event's values after the event instead of reading -1. Axis values carry Second Life's 16-bit precision.
* **vm:** linkset.dropFromAvatar now takes PERMISSION_TAKE_CONTROLS and PERMISSION_CONTROL_CAMERA from the object's scripts, releases their controls and clears their scripted camera. A Take Copy by another avatar that stands up a sitter now gives the original's scripts one changed(160) instead of changed(32) followed by changed(128).
* **vm:** llGetStatus with more than one flag, 0xFFFF or a negative value now reads only the first flag of the mask in that order, so masks such as 0xFFFF or -1 read FALSE unless STATUS_DIE_AT_NO_ENTRY is set.
* **vm:** a sync notecard read before any dataserver read of that notecard now returns NAK (llGetNotecardLineSync) or [NAK] (llFindNotecardTextSync) instead of the notecard's text. Reading a notecard by an old asset key after its attachment is detached, after the item is deleted or its holder is gone, or after the owner saved new text over it now gives the old lines instead of EOF.
* **vm:** llEuler2Rot returns different last bits for many rotations, negative zeros in y, a rotation for some small turns about three axes that gave none, and a 25.07 degree turn for a NaN or infinite angle. llRotBetween returns different last bits for opposite vectors off an axis. In SLua, ll.Pow and ll.Atan2 return a signed zero for results below 1.17549435e-38. PRIM_ROT_LOCAL and PRIM_ROTATION store a nearly unit rotation without rescaling it.
* **vm:** world.userSitAvatar with an offset on a box without a sit target seats the avatar where the line from the camera to the clicked spot meets a side (or, for a click on the box's top, at the side edge nearest the clicked spot), where it used to ignore the offset for the seat's position.
* **vm:** objects rezzed with REZ_FLAG_DIE_ON_COLLIDE (unless llVolumeDetect(TRUE) is set) are deleted at their first collision instead of running the handler, and objects rezzed with REZ_FLAG_NO_COLLIDE_OWNER or REZ_FLAG_NO_COLLIDE_FAMILY no longer get collision events with their owner or family.
* **vm:** llGetPrimitiveParams([PRIM_CAST_SHADOWS]) returns nothing instead of the stored flag, reads of unreadable rules say an error on DEBUG_CHANNEL, prim.collisionSound holds the stored key and clamped volume instead of the raw arguments, and flexible, normal and specular map, light and omega values read back rounded.
* **vm:** more than 20 llRequestUserKey calls in quick succession from the same owner in a region now return NULL_KEY and say an error for the extra calls instead of answering each. llMapBeacon outside a touch event in a rezzed object, a second map or beacon call in the same touch event (or in touch_end of an unheld click, or in the first touch after touch_start already showed one), and a click by someone other than the owner on an attachment no longer record a viewer request.
* **vm:** with the rlva profile, avatar chat over 1023 bytes reaches listeners as several listen events. Negative-channel avatar chat and Kokua negative-channel query replies now reach listeners across region borders.
* **vm:** a UUID passed to the notecard line reads no longer says "Could not find notecard" and fires no event; it reads the notecard or delivers EOF. NULL_KEY passed to llFindNotecardTextSync or llFindNotecardTextCount now says the missing-notecard error, and llFindNotecardTextCount returns NULL_KEY instead of delivering EOF.
* **vm:** world.sendAvatarChat on a negative channel now delivers the chat and returns status 'sent' instead of 'unsupported'. Worn objects hear their wearer's chat wherever their fixture position is.
* **vm:** Script.touchText, sitText and payPrice (and the prim fields behind them) now hold the stored values instead of the arguments the script passed: texts are cut to 9 bytes and payPrice.buttons always has four resolved entries typed as number[]. Script.answerDialog cuts a text box answer longer than 254 UTF-8 bytes without splitting a character.
* **vm:** attemptAvatarTake in the RLVa profile now blocks Take and Take Copy under `@interact` and for objects past the `@fartouch` reach. A Take Copy by an avatar that does not own the object now succeeds when everyone may copy the object and its contents, and raises changed(CHANGED_OWNER) in the original.
* **vm:** linkset.touch with a hold raises touch every 2000/45 ms in LSL and every 1000/45 ms in SLua instead of once, so scripts that count touch events see more of them. Under llMinEventDelay, a second click by the same avatar while its first click's events wait no longer starts a click of its own; its touch and touch_end data replace the waiting ones and touch_end waits behind a delayed touch. Clicks by several avatars that wait together now arrive as one event of each kind with num_detected above 1, a second avatar's click under llMinEventDelay is delivered instead of dropped, and non-touch events no longer wait behind a delayed touch_start.
* **vm:** llAdjustDamage outside on_damage now says an error. Several hits in one handler arrive as one event, so a script counting final_damage events sees fewer of them. Damage is never throttled and Linkset.damageThrottleExempt is removed. A lethal hit leaves the avatar at 100, not 0. Damage aimed at a child prim's key or at a worn object is ignored.
* **vm:** prim-param error texts change, scripts listening on DEBUG_CHANNEL no longer hear prim-param or pathfinding errors, bounds errors for PRIM_MATERIAL, PRIM_FULLBRIGHT and PRIM_TEXT are now said, script.reset() starts a crashed script, and llSetClickAction and PRIM_CLICK_ACTION no longer store a value outside 0 to 9.
* **vm:** world.userSitAvatar and `@sit:<key>=force` on another prim of the avatar's seat object leave the avatar where it was, and a same-owner rezzed copy of an object keeps the controls its scripts took (a copy for another owner starts with none).
* **vm:** renameInventory no longer throws for a taken name, a name the item already has, or a name with no ASCII characters; it numbers the taken name or keeps the old one. replaceInventory on a notecard with unchanged text keeps its key instead of making a new one.
* **vm:** SLua ll.FindNotecardTextSync no longer refuses a start of 0, a start of 1 now skips the first match, and the lines and columns it returns are 1 higher than before. A notecard item with hasEmbeddedItems: true now reads as empty (0 lines, EOF from line reads, and no search matches) even when notecardLines is set.
* **vm:** collision events that come up while a handler sleeps no longer keep the place they came in, and a repeating sensor that found and lost its target during one sleep gives only the last result.
* **vm:** while a handler sleeps, timer, sensor, target, touch and changed events are held back behind chat, link messages and replies and released in that fixed priority order; repeated clicks by one avatar and multiple changed events held together are merged into one event.
* **vm:** world.userSitAvatar and `@sit:<key>=force` now stand a seated avatar up from its original seat when the request is refused because there is no room, where the avatar stayed seated before.
* **vm:** owner-only requests to a non-owner no longer wait for an answer, another sitter's stand empties s.cameraParams, a temporary attach to another avatar leaves PERMISSION_ATTACH unset, and copies for a new owner get an extra changed(CHANGED_OWNER) event.
* **vm:** llGetAgentInfo and llGetAnimation read "Walking" with AGENT_WALKING a few tenths of a second after a stand from an object, "Landing" from 600 to 850 ms after a teleport of a non-flying avatar (a flying avatar stays AGENT_FLYING | AGENT_IN_AIR and "Hovering"), AGENT_FLYING in a seat's changed event when a flying avatar sits, and no AGENT_ATTACHMENTS or AGENT_SCRIPTED for 350 ms after a teleport into another region.
* **vm:** llGetAgentInfo includes AGENT_IN_AIR in a seat's changed event for a stand and right after one, llGetAnimation reports "Sitting", "Sitting on Ground", "Striding" or "Standing" where it used to return what the test seeded or an empty string (and "" for an avatar in another region), and llClearCameraParams with only PERMISSION_TRACK_CAMERA now clears the rules for the script's permission avatar. Scripts in the same prim share s.cameraParams only when their permission key identifies the same avatar.
* **vm:** linkset.copy() of an object whose LSL handler is asleep gives the copy that handler and the events waiting for it, where the copy used to start idle with an empty queue. A handler asleep when its attachment is detached now sleeps the rest of its time after the rewear instead of counting the time in inventory, and the events that were waiting for it are kept.
* **vm:** a test whose script asks a key that no avatar of its world holds now gets the error instead of a waiting request. Add the avatar with world.addAvatar before the script asks. Script.grantPermissions and denyPermissions no longer mark the other waiting requests answered, and answering a named request the script has stopped waiting for does nothing instead of throwing. Copies of SLua scripts keep their state instead of restarting, and Linkset.copy() into inventory (without a destination world or region) stands up an avatar sitting on the object.
* **vm:** world.userSitAvatar and `@sit:<key>=force` seat the avatar beside a taken sit target instead of refusing it, and world.sitAvatar seats an avatar on a prim another avatar sits on. llAvatarOnSitTarget and llAvatarOnLinkSitTarget return NULL_KEY for an avatar that sat before the sit target was set, and keep returning the holder after its sit target is removed.
* **vm:** a child prim's llAllowInventoryDrop now opens that prim, gifts of scripts to a prim that allows drops arrive, no-copy scripts are moved by llRemoteLoadScriptPin, a same-owner temporary attach with no-transfer contents succeeds, and a temporary transfer clears permissions and cuts the object and its contents to their next-owner masks (as does gifting an object to another owner). llBreakLink, llBreakAllLinks and llCreateLink do nothing in a no-modify object (and llCreateLink does nothing across owners), llRemoteLoadScriptPin refuses a no-modify target, and a temporary attach of a no-transfer object to another avatar is refused. Error texts changed for cross-owner gifts ("Blocked by permissions" / "No permission to transfer"), illegal remote loads, and llAttachToAvatar for another avatar ("Script trying to attach to someone other than owner!").
* **vm:** llSetPrimitiveParams, llSetLinkPrimitiveParams and llSetLinkPrimitiveParamsFast now end the call with an "error running rule" message at a float where a rule wants an integer, and at a key for PRIM_NAME, PRIM_DESC, PRIM_TEXT or PRIM_PROJECTOR. A list cut short ends the call without a message, and an out-of-range PRIM_MATERIAL leaves the material as it was.
* **vm:** RLVa getcommand replies list names in RLVa's dictionary order and no longer include environment or debug setting names or overlay and sphere modifiers. RLV/RLVa force sit, unsit and ground sit now change the avatar's seat 10 simulator frames (about 222 ms) of virtual time after the command instead of at once (a ground sit from a seat then waits a further 300 ms before sitting on the ground); advance virtual time before reading the new seat (250 ms is enough for a sit or stand). A getsitid in the same message replies with the seat from before the command, and the command log records "pending" before the outcome.
* **vm:** llRotBetween returns different floats for most vectors, no rotation for vectors shorter than 1e-5 and for nearly equal directions, and a half turn for nearly opposite ones. llFrand returns zero for results below 1.17549435e-38. llEuler2Rot returns a rotation for single-axis turns from 1.415e-5 to 2e-5 radians and for turns 1.415e-5 to 2e-5 short of PI.
* **vm:** world.userSitAvatar and `@sit:<key>=force` now seat an avatar on a prim without a sit target at the side edge on top of the prim facing outward instead of at the prim's centre, changing the avatar's position and its link's PRIM_POS_LOCAL and PRIM_ROT_LOCAL from the centre and ZERO_ROTATION. While an object detects volume, collision events fired at a child prim's script are dropped (only root scripts receive collision_start and collision_end, and no script receives collision), and Prim.volumeDetect reads and sets the root's value.
* **vm:** an RLVa `@sit=force` or `@sit:<null key>=force` from a seat, and `@sitground=force` from a seat, now stay on the old seat for the 10-frame (about 222 ms) force-seat delay and then leave the avatar standing for another 300 ms (about 522 ms total) before sitting on the ground; a getsitid in the same batch replies with the old seat. `@sitground=force` is now an action under both profiles instead of an unknown behaviour, and RLVa's getcommand lists it.
* **vm:** llGetStatus, PRIM_PHYSICS and PRIM_PHANTOM read the object's flags from every prim, and llSetStatus from a child prim sets them for the whole object. llGetStatus(STATUS_ROTATE_X), _Y and _Z read TRUE on a new object, where they read FALSE, and llGetStatus(STATUS_CAST_SHADOWS) reads FALSE after it is set. OBJECT_SERVER_COST reads a quarter more after DEREZ_MAKE_TEMP for an object whose last script had not been counted.
* **vm:** ll.GetUsedMemory() in an SLua script reads less at the start and more after making functions, and a script at a limit equal to its use stops when it makes a function. Resetting an LSL script now restores llGetMemoryLimit() to 65536, and OBJECT_SCRIPT_MEMORY now counts each SLua script as 4096 bytes instead of its configured limit.
* **vm:** llRot2Euler returns different floats for most rotations. PRIM_TYPE stores limited values where it stored what it was given, and llGetNumberOfSides and face numbers change for spheres with one of cut, dimple or hollow, for twisted spheres and for tapered, offset or skewed tori, tubes and rings.
* rezless is licensed under the MIT License from this release on (earlier releases stay under the Apache License 2.0). The root package, `@rezless/parser` and `@rezless/vitest` declare MIT; `@rezless/vm` declares MIT AND Apache-2.0 AND Unicode-3.0, with case tables generated from Unicode data under the Unicode License v3 and APR Base64 code in slua.wasm under Apache-2.0.
* **vm:** world.userSitAvatar and `@sit:<key>=force` stand an avatar up from another object when the request is refused because the prim is out of reach or world.setSitResponse refused it (the avatar stayed seated before). OBJECT_SERVER_COST reads a quarter more for an object whose last script has been counted, for example after an avatar sat on it, after llSetScale or after it was rezzed from inventory, and stops at one point for each prim. Setting PRIM_PHYSICS_SHAPE_NONE on a root prim, or an unknown physics shape type, no longer changes PRIM_PHYSICS_SHAPE_TYPE. During attach(NULL_KEY), llGetObjectDetails for the detaching object's own key now returns its details instead of [].
* **vm:** coroutine.running() returns nil outside a coroutine in an SLua script, and ll.GetUsedMemory no longer counts the stack of a handler that has ended. In an SLua script, llcompat.SetMemoryLimit returns 0 for a limit below the memory in use, a lowered limit is enforced under memoryLimit: true, and coroutine.yield with values no longer fails outside a coroutine.
* **vm:** script.fire and every event source drop an event for a script that is not running, where they used to hold it for replay. Setting script.running to false no longer parks events for a test, so tests that stopped a script to hold events in its queue need another way to hold them, such as a sleeping handler. Setting it to true now delivers what was queued before the stop; resumeParked stays and has nothing left to do after that. The tick after a missed one can now land on the old schedule. An attachment's repeating sensor scans after the time it had left on rewear, where it waited a full interval. `integer j = (i *= f)` with a float f fails to compile with "Type mismatch".
* **vm:** reads through PRIM_LINK_TARGET with a link that names no prim now end instead of carrying on, negative links in reads name one prim, and llRound, llVecNorm, llRot2Angle, llRot2Axis, llAngleBetween, llRot2Euler and SLua's vector functions return slightly different floats. Faces after a prism, tube or ring changes shape can differ.
* **vm:** in SLua, ll.GetPrimitiveParams, ll.GetLinkPrimitiveParams, ll.GetObjectDetails, ll.GetParcelDetails, ll.GetPrimMediaParams, ll.GetLinkMedia and ll.GetEnvironment now return booleans or uuids where they previously returned numbers or strings, a pcall message starts with lua_script: instead of the file name, and llGiveInventoryList and llGiveAgentInventory no longer find an item by a number or a key in their list. llListFindStrided (and SLua ll.ListFindStrided) returns -1 (or nil) for a start or end before the list where it previously searched from the first entry, and llSetTexture and the other texture and material setters resolve key-like text to an inventory item of that name when the prim holds one.
* **vm:** world.userSitAvatar and `@sit:<key>=force` refuse an object with a scripted-only prim unless it has a free sit target without the flag, standing an already-seated avatar up from another object when refused, and llGetObjectPrimCount returns 0 for a worn object where it returned the number of prims. world.sitAvatar still seats the avatar whatever the flags say.
* **vm:** llGetPrimitiveParams gives nothing for PRIM_PROJECTOR and for the rules after it. PRIM_POINT_LIGHT and PRIM_REFLECTION_PROBE read back clamped values, and zeros when off. llRemoveInventory resets the faces, maps and sculpt that used the removed texture or material. llJson2List floats are rounded to 32 bits. llVecNorm gives ZERO_VECTOR below a length of 1e-7, llRot2Euler rounds to 1e-7 degrees, and llSin, llTan and llFrand give 0.0 where they gave -0.0. A sculpt map that is a key has the list entry type TYPE_KEY, and a normal or specular map named by an inventory item has TYPE_STRING.
* **vm:** PrimParams.allowUnsit and PrimParams.scriptedSitOnly are removed; read and write PrimParams.sitFlags instead (SIT_FLAG_ALLOW_UNSIT is 2, SIT_FLAG_SCRIPTED_ONLY is 4, and a new prim has sitFlags 2), and llGetLinkSitFlags and PRIM_SIT_FLAGS now include the read-only SIT_FLAG_SIT_TARGET (1) bit while a sit target is set. Group link calls made from a child prim with link 0 now target the root instead of doing nothing, and linked-media errors now originate from the targeted prim or seated avatar.
* **vm:** llRequestPermissions for PERMISSION_CONTROL_CAMERA no longer waits for grantPermissions() unless the avatar sits on the object or wears it, so a script loaded with loadScript alone is always refused. Seat the avatar with world.sitAvatar or attach the object first. Scripts copied by a rez for the same owner now start with the permissions the original held (a copy for another owner starts with none).
* **vm:** SLua scripts that ran in 0.13.0 can now fail, as they do in Second Life. integer.create and the rest of the integer library are gone, as are math.nan, math.tau, math.e, math.phi, math.sqrt2, buffer.readinteger and buffer.writeinteger; llprim.ParamSetter is llprim.ParamsSetter. ll.GetListEntryType returns an integer that never equals a number, so compare tonumber(ll.GetListEntryType(l, i)). ll.DumpList2String raises "non-LSL value in list" for a boolean, and ll.List2String and ll.List2Float read one as "" and 0.
* **vm:** llMapDestination outside a touch event in a rezzed object, and a second call in the same touch event (or in touch_end of an unheld click, or in the first touch after touch_start already showed one), no longer record a viewer request. llTransferLindenDollars to the owner or a World avatar now queues its own transaction_result. A request for an owner-only permission to another avatar is no longer recorded, so grantPermissions has nothing to answer.
* **vm:** a division or modulo by zero throws "Math Error" (was "Math Error: divide by zero" / "modulo by zero") and stops the script, as does "Too Many Listens". The first DEBUG_CHANNEL line of every run-time error carries the prim and script name. For scripts listening on DEBUG_CHANNEL, an SLua crash says "runtime error" where it said the Lua message (the owner's s.chat receives the Lua message and traceback). llSetScriptState no longer starts a crashed script and llResetOtherScript no longer ignores one.
* owner inventory edits (addInventory, replaceInventory, renameInventory, removeInventory and addScript) in a child prim with no running script that handles changed now deliver changed(CHANGED_INVENTORY) to the root prim's scripts.
* **vm:** llList2CSV and llList2Json print a float whose last shown decimal sits exactly on a tie one digit lower when that digit is even, and print -0.0 as -0.000000. Texture and material keys read back in lower case. PRIM_TYPE_SCULPT with a map that is not a texture reads back as a torus, and with an unknown sculpt type it changes nothing. PRIM_NORMAL and PRIM_SPECULAR with a texture that is not a key reset their repeats, offsets, rotation, colour, glossiness and environment.
* **vm:** ll.GetTexture returns a uuid instead of a string when the face holds a texture by key, so a script that concatenates the result or calls string functions on it now raises an error, as measured in Second Life. Wrap it in tostring(). ll.List2CSV and ll.List2Json print a whole number from a Lua list as an integer ("1", not "1.000000"), and the error texts for missing arguments and bad list arguments changed.
* **vm:** link numbers below LINK_THIS (such as -5 or -100) now target the first link other than the caller (link 2 from the root, the root from a child, or the sitter from a seated lone prim) in link getters, setters, llMessageLinked, sit-target calls, media calls and PRIM_LINK_TARGET, instead of doing nothing. llGetLinkNumberOfSides, llIsLinkGLTFMaterial and llGetObjectLinkKey still answer LINK_THIS only.
* **vm:** grantPermissions() throws after a request that was granted automatically. Drop the call, or set autoGrantPermissions to 'none'.
* llRemoteLoadScriptPin now delivers changed(CHANGED_INVENTORY) to running scripts in the receiving prim, and llGiveInventory no longer delivers changed(CHANGED_INVENTORY) to a script that has not started.
* **vm:** seated avatars are now links numbered after the prims in seating order. llGetNumberOfPrims counts them, a seated lone prim becomes link 1 instead of 0 (affecting llGetLinkNumber, llDetectedLinkNumber, link_message senders and LINK_* selectors), link readers and setters expose the avatar at its link number, and unlinking a prim or calling llBreakLink or llBreakAllLinks on a seated lone prim stands the sitter.
* prim.addInventory now delivers changed(CHANGED_INVENTORY) to running scripts in the prim, renames an item whose name is already taken by appending a number instead of storing duplicates, and refuses an item whose name has no ASCII characters. Use prim.placeInventory to add an item silently without renaming. Two llGiveInventory calls in one handler into another modifiable object of the same owner now send an idle receiving script two changed(CHANGED_INVENTORY) events instead of one (same-frame gifts within the giver's own linkset, or allowed-drop gifts, merge into one changed event), and gifts no longer reach a stopped script.
* **vm:** in SLua, a number passed to a string parameter of an ll function, such as ll.OwnerSay(5), now raises "string expected, got number", as it does in Second Life. Pass tostring(n) instead.

### Features

* let a test add, recompile and rename a script in a running prim ([#422](https://github.com/i-doll/rezless/issues/422)) ([1707c7e](https://github.com/i-doll/rezless/commit/1707c7e656186bffc26fda6849f1669be86f67e3))
* **vitest:** set an experience on a loadLinkset object for its scripts ([#696](https://github.com/i-doll/rezless/issues/696)) ([41f36e7](https://github.com/i-doll/rezless/commit/41f36e7457be2f4720db662d8b6ca10f56aaa04a))
* **vm:** answer ll.GetTime in SLua from a mock of llGetTime ([#694](https://github.com/i-doll/rezless/issues/694)) ([5a2a659](https://github.com/i-doll/rezless/commit/5a2a6592a1011f3a98ad6d49507ef2f749ad3cd9))
* **vm:** let a mock keep a handler busy, and deliver events as a busy handler gets them ([#628](https://github.com/i-doll/rezless/issues/628)) ([d1fa7f6](https://github.com/i-doll/rezless/commit/d1fa7f67316b4353dc7cf17c8aa1f55dc8b80d01))
* **vm:** let a test seat an avatar whose stand takes a frame ([#725](https://github.com/i-doll/rezless/issues/725)) ([345b0bb](https://github.com/i-doll/rezless/commit/345b0bb60b32aba3f10c961028be57cfde42c6b0))
* **vm:** let a test start a duplicated object's scripts in groups ([#700](https://github.com/i-doll/rezless/issues/700)) ([1881660](https://github.com/i-doll/rezless/commit/1881660f457e11f54cb1515bd470661549b59993))
* **vm:** let tests set the creator of a prim ([#785](https://github.com/i-doll/rezless/issues/785)) ([d35a739](https://github.com/i-doll/rezless/commit/d35a73926ae812ddba589893c40430ac95058c6d))
* **vm:** let tests set the creator of a script in inventory ([#693](https://github.com/i-doll/rezless/issues/693)) ([7f1c557](https://github.com/i-doll/rezless/commit/7f1c5579ae979fb1b635551737b962bc430b2068))
* **vm:** let world.sendAvatarChat speak on negative channels ([#519](https://github.com/i-doll/rezless/issues/519)) ([0318658](https://github.com/i-doll/rezless/commit/031865865ded813882a9636cf6c15852dce243eb))
* **vm:** read an object item's creator from its root prim ([#790](https://github.com/i-doll/rezless/issues/790)) ([7e16980](https://github.com/i-doll/rezless/commit/7e169800d20d09ba95f5ec3f431f9824ac6391e8))
* **vm:** start a linkset's scripts together with Linkset.startAll ([#697](https://github.com/i-doll/rezless/issues/697)) ([dd8db53](https://github.com/i-doll/rezless/commit/dd8db53b5cbf009c038a1cfe68ff37829a03aed2)), closes [#689](https://github.com/i-doll/rezless/issues/689)


### Bug Fixes

* list the third-party code in slua.wasm and ship its licence texts ([#437](https://github.com/i-doll/rezless/issues/437)) ([84c1ea9](https://github.com/i-doll/rezless/commit/84c1ea9d6ccee5e4f090ffa2d623f3eb90d11e17))
* queue CHANGED_INVENTORY from llRemoteLoadScriptPin by the measured rule ([#415](https://github.com/i-doll/rezless/issues/415)) ([a632546](https://github.com/i-doll/rezless/commit/a6325464b29322e3cb6f4f251e952e45783ebdef))
* send CHANGED_INVENTORY when a test edits a prim's contents ([#401](https://github.com/i-doll/rezless/issues/401)) ([0e0c905](https://github.com/i-doll/rezless/commit/0e0c90522d30664e2e63cd0977ff48e4d3ce5a7b))
* **vitest:** document the setup file LSL_COVERAGE=1 needs without the reporter ([#399](https://github.com/i-doll/rezless/issues/399)) ([922d701](https://github.com/i-doll/rezless/commit/922d701531a62793b4cb95b9f4da73a94df40aaa)), closes [#398](https://github.com/i-doll/rezless/issues/398)
* **vm:** accept object payments without a money handler and route them to the root ([#621](https://github.com/i-doll/rezless/issues/621)) ([dd038e3](https://github.com/i-doll/rezless/commit/dd038e343c42f4cc358f8965ceb8d18d71427cbb))
* **vm:** act on the collision flags of llRezObjectWithParams ([#525](https://github.com/i-doll/rezless/issues/525)) ([7970d8d](https://github.com/i-doll/rezless/commit/7970d8def7d84bcf048c839632ae87c1ec55fbbb))
* **vm:** answer batched replies from before a force sit or stand, list getcommand in RLVa's order ([#475](https://github.com/i-doll/rezless/issues/475)) ([bac1019](https://github.com/i-doll/rezless/commit/bac1019d1f1f05aab1dcb14fbfd8e4ffc1533a0f))
* **vm:** answer coroutine.running, yields and memory limits as Second Life's SLua does ([#449](https://github.com/i-doll/rezless/issues/449)) ([47a3fd7](https://github.com/i-doll/rezless/commit/47a3fd725a8fc9e4c5d2026cdf7e77eb4db9c011))
* **vm:** block the RLVa Pay menu on an avatar whose name [`@shownames`](https://github.com/shownames) hides ([#640](https://github.com/i-doll/rezless/issues/640)) ([66a01df](https://github.com/i-doll/rezless/commit/66a01df284787662bc27a7bb6fb4983558d6cc29))
* **vm:** build the SLua VM from the release the grid runs ([#427](https://github.com/i-doll/rezless/issues/427)) ([87614e5](https://github.com/i-doll/rezless/commit/87614e561ce4c937ae368635d55e9565cfe5228d))
* **vm:** cache a notecard only once llFindNotecardTextCount answers ([#548](https://github.com/i-doll/rezless/issues/548)) ([10d7c30](https://github.com/i-doll/rezless/commit/10d7c309f17e80971403d7f82ff3ac2456123e45))
* **vm:** cap PRIM_POSITION moves of a root as Second Life does ([#695](https://github.com/i-doll/rezless/issues/695)) ([358c015](https://github.com/i-doll/rezless/commit/358c01533a879a7c9efac056245c3205640f9b15))
* **vm:** carry a sleeping LSL handler and its waiting events through a copy ([#447](https://github.com/i-doll/rezless/issues/447)) ([dd93b97](https://github.com/i-doll/rezless/commit/dd93b975789a9010c9eca9df1ee023f1b01b91f1))
* **vm:** carry NaN signs through rotations, MEDIAN and SLua ll.Acos as Second Life does ([#646](https://github.com/i-doll/rezless/issues/646)) ([2a92b6f](https://github.com/i-doll/rezless/commit/2a92b6fa693d92a097a54c113fd908c6de90f267))
* **vm:** carry the NaN sign bit through floats as Mono does ([#624](https://github.com/i-doll/rezless/issues/624)) ([de65bd7](https://github.com/i-doll/rezless/commit/de65bd75ff07c28495baafbafcdd879224c48564)), closes [#429](https://github.com/i-doll/rezless/issues/429)
* **vm:** check prim-param value types the way Second Life does ([#476](https://github.com/i-doll/rezless/issues/476)) ([2986976](https://github.com/i-doll/rezless/commit/29869761bc1ff256a372ff5d051b00502b523dae))
* **vm:** close a dropped force ground sit in the RLV log, and pin the force sit delay spread ([#568](https://github.com/i-doll/rezless/issues/568)) ([1fc58f5](https://github.com/i-doll/rezless/commit/1fc58f5403c4535f8c642dc16c58b4c97072fa95))
* **vm:** count every SLua function made, and reset an LSL script's memory limit ([#461](https://github.com/i-doll/rezless/issues/461)) ([0fd0eed](https://github.com/i-doll/rezless/commit/0fd0eed01703264dc8dd2535cd7e9ef9a8fbac01))
* **vm:** count held land collisions by the events that run ahead of them ([#601](https://github.com/i-doll/rezless/issues/601)) ([698b8b3](https://github.com/i-doll/rezless/commit/698b8b35097fe9e49930249ad9c5a223b9c850c5))
* **vm:** count LLEvents handlers against SLua memory, and tell a script's own "not enough memory" from running out ([#582](https://github.com/i-doll/rezless/issues/582)) ([194ceab](https://github.com/i-doll/rezless/commit/194ceab53301aa7d85c189e6f8b22e9a11bfc954))
* **vm:** crash the script on a Math Error and bring a crashed script back as Second Life does ([#432](https://github.com/i-doll/rezless/issues/432)) ([d38125e](https://github.com/i-doll/rezless/commit/d38125e1d312c20bdcce8a47070e41919f6497fe))
* **vm:** cut the owner's copy of a prim's error to fit its name, and send what SLua prints to the owner ([#589](https://github.com/i-doll/rezless/issues/589)) ([b0efc07](https://github.com/i-doll/rezless/commit/b0efc070b89addaa83e49bac4eebf42ca467dc4b))
* **vm:** deliver a busy handler's second contact and volume detect contacts as measured ([#666](https://github.com/i-doll/rezless/issues/666)) ([4d7de29](https://github.com/i-doll/rezless/commit/4d7de29fc0c5567d30dccc6db710d3bf2da83ac8))
* **vm:** deliver collisions, targets, game control, sleeps after busy parts and takes to a busy handler as measured ([#650](https://github.com/i-doll/rezless/issues/650)) ([868f823](https://github.com/i-doll/rezless/commit/868f823b4c2e054aff5717c1d7562d128e7c6694))
* **vm:** divide by rotations in single precision, and read oversized rotations as Second Life does ([#661](https://github.com/i-doll/rezless/issues/661)) ([c14d4cc](https://github.com/i-doll/rezless/commit/c14d4ccdce5a0d2b0ee147e82d56c44b23613c2f))
* **vm:** drop events raised for a stopped script and carry sensors and targets through inventory ([#448](https://github.com/i-doll/rezless/issues/448)) ([fb6ac7f](https://github.com/i-doll/rezless/commit/fb6ac7f77fa99c5e267ca6b26ae8317928aece0a))
* **vm:** drop held-back control input and keep the owner-change mark on saved copies ([ebc0fd2](https://github.com/i-doll/rezless/commit/ebc0fd232c40afc2923d321853e5428e0ff75f66))
* **vm:** drop llEuler2Rot's small turns by the matrix diagonal, and flush tiny SLua ll.Pow and ll.Atan2 results ([#531](https://github.com/i-doll/rezless/issues/531)) ([a19699f](https://github.com/i-doll/rezless/commit/a19699f938bcc24e856ead5c8ecc7405bffa7359))
* **vm:** drop the move target from a Duplicate's copy ([#668](https://github.com/i-doll/rezless/issues/668)) ([5c0f5e4](https://github.com/i-doll/rezless/commit/5c0f5e48b14a71d735d9ca3da9a009a15d1c4945))
* **vm:** end a read at a link target that names no prim, and match Second Life on vector and rotation math and shape faces ([#445](https://github.com/i-doll/rezless/issues/445)) ([1ade207](https://github.com/i-doll/rezless/commit/1ade20770692a1c061f7d379f19e947a566c63f6))
* **vm:** end physics switched on at rest 0.8 s later, as Second Life does ([#639](https://github.com/i-doll/rezless/issues/639)) ([7721d3c](https://github.com/i-doll/rezless/commit/7721d3c5302f1ab9fd59e5b537efdfb2a4f3894e))
* **vm:** fail permission requests to a key that is not an avatar and carry SLua state through inventory ([#436](https://github.com/i-doll/rezless/issues/436)) ([cff27dc](https://github.com/i-doll/rezless/commit/cff27dce1a91e33a8d232d3ea4229a7bb6cdc5dc))
* **vm:** flush tiny SLua arithmetic results to zero and cut profile values again on rez ([#583](https://github.com/i-doll/rezless/issues/583)) ([5a901e5](https://github.com/i-doll/rezless/commit/5a901e5424ee9d50e28026b06434fd6ba0dd74fc))
* **vm:** follow measured two-avatar clicks during sleeps and add Linkset.press and release ([#740](https://github.com/i-doll/rezless/issues/740)) ([dcc5d76](https://github.com/i-doll/rezless/commit/dcc5d76cf79c2bf0b3acd0a9c26257e76d74536b))
* **vm:** follow measured two-avatar touch merges and touch_end sleeps ([#744](https://github.com/i-doll/rezless/issues/744)) ([25883c3](https://github.com/i-doll/rezless/commit/25883c3b8f277b4397395d36b1f6e859e885710a))
* **vm:** follow sit state in llGetAnimation, read stands in the air, keep a scripted camera through a reset ([#466](https://github.com/i-doll/rezless/issues/466)) ([b73acc8](https://github.com/i-doll/rezless/commit/b73acc83067def13377faf05e1b6213cc349f468)), closes [#458](https://github.com/i-doll/rezless/issues/458)
* **vm:** follow two-avatar and money measurements for map, names and payments ([#485](https://github.com/i-doll/rezless/issues/485)) ([6d6befe](https://github.com/i-doll/rezless/commit/6d6befe69cfafdc1355c526a0459eb3ed6a022ca))
* **vm:** follow two-avatar measurements for gifts, links, remote loads and temporary attachments ([#487](https://github.com/i-doll/rezless/issues/487)) ([ce5e8f9](https://github.com/i-doll/rezless/commit/ce5e8f9ef677f92747c67a752b6b8e19ccfa812b))
* **vm:** game control through a take, state changes, double sleeps and land collisions, as measured ([#577](https://github.com/i-doll/rezless/issues/577)) ([0e39c66](https://github.com/i-doll/rezless/commit/0e39c66e36ab09d9b44cda95830d0bca9da2d69b))
* **vm:** generate the case tables from Unicode data instead of Mono's ([#491](https://github.com/i-doll/rezless/issues/491)) ([d465cc2](https://github.com/i-doll/rezless/commit/d465cc2d053e74d568ac04785830ae08fa1cbd21))
* **vm:** give a busy script a frame-late change behind the link message sent after the call ([#728](https://github.com/i-doll/rezless/issues/728)) ([27445da](https://github.com/i-doll/rezless/commit/27445dafa1c291350e3ca0902acf74512c65b928))
* **vm:** give a Duplicate's copy no look target ([#671](https://github.com/i-doll/rezless/issues/671)) ([5194558](https://github.com/i-doll/rezless/commit/51945587a574427e0d87544a11c07f2d7e3f5ce3))
* **vm:** give a seat taken from its sitter and given away one changed event ([ebc0fd2](https://github.com/i-doll/rezless/commit/ebc0fd232c40afc2923d321853e5428e0ff75f66))
* **vm:** give each script instance its own identity for keys and motion ownership ([#513](https://github.com/i-doll/rezless/issues/513)) ([7ede155](https://github.com/i-doll/rezless/commit/7ede1550ae0ca35cd8e55a0c5516188986f84043))
* **vm:** give llSetLinkGLTFOverrides the error text Second Life gives ([#608](https://github.com/i-doll/rezless/issues/608)) ([7fde6bf](https://github.com/i-doll/rezless/commit/7fde6bfa08d94c8bb461956d3f4310118e2fa88f))
* **vm:** give moving events as measured through sleeps, rezzes, copies and pushes ([#617](https://github.com/i-doll/rezless/issues/617)) ([6f0e6d9](https://github.com/i-doll/rezless/commit/6f0e6d907d729260792b957746688b4aa967871c)), closes [#585](https://github.com/i-doll/rezless/issues/585)
* **vm:** give moving events to a script started in a moving object, and at a Take ([#635](https://github.com/i-doll/rezless/issues/635)) ([08efa24](https://github.com/i-doll/rezless/commit/08efa2486276dfdb889fadb2178baad9941930e3))
* **vm:** give NAK from notecard sync reads until a dataserver read caches the notecard ([#533](https://github.com/i-doll/rezless/issues/533)) ([67561df](https://github.com/i-doll/rezless/commit/67561df4ed3a51f1059f223f7679a27cf0ab1dd5))
* **vm:** give OBJECT_ROT of an attached prim the wearer-relative rotation ([#651](https://github.com/i-doll/rezless/issues/651)) ([b7842c6](https://github.com/i-doll/rezless/commit/b7842c670b9e0a4d50ef4e25b57c313c06d7df25)), closes [#647](https://github.com/i-doll/rezless/issues/647)
* **vm:** give seated avatars the sound of the link sound calls ([#516](https://github.com/i-doll/rezless/issues/516)) ([75cca59](https://github.com/i-doll/rezless/commit/75cca59cf046845f666a5982327332966a479a43))
* **vm:** give teleports their measured travel time and log overtaken force seating by outcome ([#599](https://github.com/i-doll/rezless/issues/599)) ([4b82265](https://github.com/i-doll/rezless/commit/4b8226534c5babbc7769dd1c446592882397be55))
* **vm:** give the wearer's rotation from llGetRootRotation in an attachment ([#644](https://github.com/i-doll/rezless/issues/644)) ([617a463](https://github.com/i-doll/rezless/commit/617a46393cc4302c0027c9dd610a005acb66def2)), closes [#637](https://github.com/i-doll/rezless/issues/637)
* **vm:** grant permissions to sitters and wearers without a dialog ([#403](https://github.com/i-doll/rezless/issues/403)) ([c7174ac](https://github.com/i-doll/rezless/commit/c7174acf2b559d4ab66ee1045476a83c07a89c2b))
* **vm:** hand a replaced force ground sit to the later one, and land it with a same-region teleport ([#579](https://github.com/i-doll/rezless/issues/579)) ([2a90039](https://github.com/i-doll/rezless/commit/2a90039df66adf3accc164157829a1c6d354a9c9))
* **vm:** hit seated and ground-sitting avatars on their measured hulls, and fit the standing hull to any height ([#676](https://github.com/i-doll/rezless/issues/676)) ([5bdbb09](https://github.com/i-doll/rezless/commit/5bdbb097fbc5c51a1f0f58db0a3b2eecfcdb4af3))
* **vm:** hold collision events through a sleep and keep one sensor result ([#470](https://github.com/i-doll/rezless/issues/470)) ([2301169](https://github.com/i-doll/rezless/commit/2301169bec84bb5bed660d64b4ecb6b65001b356))
* **vm:** hold game control input back while a handler sleeps, and read new input at once ([#562](https://github.com/i-doll/rezless/issues/562)) ([bff6428](https://github.com/i-doll/rezless/commit/bff64284b3c1729b2d1d6f3b2c7ab560ddbaf379))
* **vm:** hold or carry a worn target's wearer as measured, and raise no moving events for a teleport into another region ([#677](https://github.com/i-doll/rezless/issues/677)) ([13f4498](https://github.com/i-doll/rezless/commit/13f44986ed9f0c7369fc02720c078835ee9e12a9))
* **vm:** hold touch, timer, sensor, target and changed events back while a handler sleeps ([#454](https://github.com/i-doll/rezless/issues/454)) ([7a269dc](https://github.com/i-doll/rezless/commit/7a269dc31cb473f451dbc6fb150d053e3ea876b0))
* **vm:** idle a stopped script's targets and defer a busy sibling's script changes past the wear ([#600](https://github.com/i-doll/rezless/issues/600)) ([1c5803b](https://github.com/i-doll/rezless/commit/1c5803b539da90c6ebc7f211be3d61e0dc951b4c))
* **vm:** judge a detached script's state when it is stored, and slacken a Take Copy original's target ([#571](https://github.com/i-doll/rezless/issues/571)) ([bea56fd](https://github.com/i-doll/rezless/commit/bea56fd4233645a248eeb7147343c73746985a06))
* **vm:** keep a click pressed during an LSL spin out of the waiting touch ([#750](https://github.com/i-doll/rezless/issues/750)) ([2a0967a](https://github.com/i-doll/rezless/commit/2a0967a7642e02ddaaa6b698f934ec0a8c45f458))
* **vm:** keep a crashed script down when it is set running ([#681](https://github.com/i-doll/rezless/issues/681)) ([c4da9a5](https://github.com/i-doll/rezless/commit/c4da9a585d9fd683bc1a7f8afec2e3ad1726c133))
* **vm:** keep a held-back click's touch, order SLua's own touch first, and follow two-avatar detach and wear ([#761](https://github.com/i-doll/rezless/issues/761)) ([b69e2ff](https://github.com/i-doll/rezless/commit/b69e2ff16f1f9c43eec7715ebcbf86be0935842a))
* **vm:** keep both clicks through a take, and run held contacts inside the first click ([#775](https://github.com/i-doll/rezless/issues/775)) ([146958a](https://github.com/i-doll/rezless/commit/146958a383220134a60542daf731380e681bbe43))
* **vm:** keep flying through a ground sit and a teleport, drop a dying seat's sitter longer, and read a departing avatar as Init ([#566](https://github.com/i-doll/rezless/issues/566)) ([8e21046](https://github.com/i-doll/rezless/commit/8e21046fc744e219690901e4c232af960c1a0ae3))
* **vm:** keep reading an avatar that just left, drop a dying seat's sitter for a frame, refuse a flying menu ground sit ([#588](https://github.com/i-doll/rezless/issues/588)) ([465cddd](https://github.com/i-doll/rezless/commit/465cdddbffc78d3d99b3f613c1e24bf013a7749c))
* **vm:** keep STATUS_* flags for the whole object and pin the measured sit reach ([#462](https://github.com/i-doll/rezless/issues/462)) ([1e30868](https://github.com/i-doll/rezless/commit/1e30868aa6b65336deaadf305f2b652760c88721))
* **vm:** keep taken controls on a rezzed copy and ignore a sit on another prim of the seat ([#508](https://github.com/i-doll/rezless/issues/508)) ([39d545d](https://github.com/i-doll/rezless/commit/39d545df0fe7efa57cc0bb30c939b2b932a893a9))
* **vm:** keep the main-grid prim rule errors and glow bounds ([2986976](https://github.com/i-doll/rezless/commit/29869761bc1ff256a372ff5d051b00502b523dae))
* **vm:** keep touch and sit text and pay buttons as the region does ([#517](https://github.com/i-doll/rezless/issues/517)) ([fec23b3](https://github.com/i-doll/rezless/commit/fec23b3c70cd42ea142fa770a9b3e24d12f406e2))
* **vm:** lag an SLua script's timer as an LSL timer does ([#658](https://github.com/i-doll/rezless/issues/658)) ([43b995e](https://github.com/i-doll/rezless/commit/43b995eac9464f3753aa21bc935c26907cef4150)), closes [#645](https://github.com/i-doll/rezless/issues/645)
* **vm:** land a force seat on frame 10 and snap long whole-frame sleeps ([#766](https://github.com/i-doll/rezless/issues/766)) ([d23916d](https://github.com/i-doll/rezless/commit/d23916df78d13819f59491e1d0d829171dab7601))
* **vm:** leave a sensor result released by an earlier sleep in its place ([2301169](https://github.com/i-doll/rezless/commit/2301169bec84bb5bed660d64b4ecb6b65001b356))
* **vm:** leave events llMinEventDelay holds back queued when a test delivers an event ([#789](https://github.com/i-doll/rezless/issues/789)) ([fe6ef18](https://github.com/i-doll/rezless/commit/fe6ef18865c9868ee3e5340cde661e7a0f5f4873))
* **vm:** look sounds and particle textures up by item name first, as measured in-world ([#553](https://github.com/i-doll/rezless/issues/553)) ([e58d861](https://github.com/i-doll/rezless/commit/e58d861447c0964c11138685cbefc5781ee46862))
* **vm:** lose events raised at a script before it starts, as Second Life does ([#706](https://github.com/i-doll/rezless/issues/706)) ([112a33f](https://github.com/i-doll/rezless/commit/112a33f877cb11fdc0929ce9f1edbe1000151b03))
* **vm:** make seated avatars links of the object ([#402](https://github.com/i-doll/rezless/issues/402)) ([6995b2d](https://github.com/i-doll/rezless/commit/6995b2d117452899a70e9bf305910d50cc9f9e03)), closes [#392](https://github.com/i-doll/rezless/issues/392)
* **vm:** match llRotBetween, tiny llFrand results and small llEuler2Rot turns ([#471](https://github.com/i-doll/rezless/issues/471)) ([401dccf](https://github.com/i-doll/rezless/commit/401dccf64c449f5899d561d1165b0e03ae57f66e))
* **vm:** match measured face order, sibling script removal, print values and valueless JSON members ([#606](https://github.com/i-doll/rezless/issues/606)) ([4de2219](https://github.com/i-doll/rezless/commit/4de2219541e1d01c4fc13f9f2dd1a90fedc2cca2))
* **vm:** match prim-param get errors, rezzed collision sounds and the root suffix to Second Life ([#549](https://github.com/i-doll/rezless/issues/549)) ([1ef15b2](https://github.com/i-doll/rezless/commit/1ef15b21d0ea064d30a62ea22dcab7f83f46e430))
* **vm:** match Second Life on llRot2Euler, PRIM_TYPE limits and face counts ([#459](https://github.com/i-doll/rezless/issues/459)) ([5b2aa67](https://github.com/i-doll/rezless/commit/5b2aa67bbe694a63b31e3d54bd786ba9d3fc9575))
* **vm:** match Second Life on zero signs, PRIM_PROJECTOR reads and removed textures ([#438](https://github.com/i-doll/rezless/issues/438)) ([41c2dd5](https://github.com/i-doll/rezless/commit/41c2dd5923e1088a6094e64d5583f486361c46cb))
* **vm:** match Second Life's SLua argument checks, list numbers and ll.GetTexture ([#419](https://github.com/i-doll/rezless/issues/419)) ([f42eeb4](https://github.com/i-doll/rezless/commit/f42eeb4b5d6826d23293ba5a80a976bd990723aa))
* **vm:** measure the unmeasured cases in eight test files and the winter wallclock ([#602](https://github.com/i-doll/rezless/issues/602)) ([f048f73](https://github.com/i-doll/rezless/commit/f048f739c990abf0a51fa922fe99aa055ae5ced6))
* **vm:** merge drop gifts that land in one frame, from inside or from other objects ([#742](https://github.com/i-doll/rezless/issues/742)) ([c608e23](https://github.com/i-doll/rezless/commit/c608e23b7d4423a255da22b6116cafb586e1f654))
* **vm:** model another avatar's Take Copy, and llDie or KFM_CMD_PLAY in a Take's moving_end ([#643](https://github.com/i-doll/rezless/issues/643)) ([80b49b8](https://github.com/i-doll/rezless/commit/80b49b8392504180743588844b7714c371a08d2c))
* **vm:** model damage events as measured on the main grid ([#514](https://github.com/i-doll/rezless/issues/514)) ([55d0b99](https://github.com/i-doll/rezless/commit/55d0b99a2cde6fda9e38865209bce9b5148aca70))
* **vm:** model Drop and Duplicate refusals, the clicked point for Take, and a drop's permissions ([#538](https://github.com/i-doll/rezless/issues/538)) ([a69186f](https://github.com/i-doll/rezless/commit/a69186f2ea4e681635aed1cad3bf6a4299e77fc1)), closes [#520](https://github.com/i-doll/rezless/issues/520)
* **vm:** model permissions between two avatars as measured in-world ([#488](https://github.com/i-doll/rezless/issues/488)) ([ebc0fd2](https://github.com/i-doll/rezless/commit/ebc0fd232c40afc2923d321853e5428e0ff75f66)), closes [#481](https://github.com/i-doll/rezless/issues/481)
* **vm:** model shift-drag copies, drops and Take Copy by another avatar as measured ([#518](https://github.com/i-doll/rezless/issues/518)) ([5562078](https://github.com/i-doll/rezless/commit/5562078b8cea122f2a3ec29842cf174e2eb056bd))
* **vm:** model the llRequestUserKey throttle and the error flood cap as measured ([#561](https://github.com/i-doll/rezless/issues/561)) ([3fa5d40](https://github.com/i-doll/rezless/commit/3fa5d40fff3a12037d0d6c4ea148f99ca7638a3e))
* **vm:** move a worn object's wearer, refuse its link changes, and hit standing avatars on their measured hull ([#672](https://github.com/i-doll/rezless/issues/672)) ([aa6f101](https://github.com/i-doll/rezless/commit/aa6f101c080a99f59fad11230d7cffc35e396510)), closes [#663](https://github.com/i-doll/rezless/issues/663)
* **vm:** name the root on owner errors from a child prim for controls and camera ([#592](https://github.com/i-doll/rezless/issues/592)) ([7af1765](https://github.com/i-doll/rezless/commit/7af17654e218625024c2c42672635f1879a25858))
* **vm:** order merged touch_end by release and keep later clicks apart after a spin ([#777](https://github.com/i-doll/rezless/issues/777)) ([9abadf2](https://github.com/i-doll/rezless/commit/9abadf23aa1ab3f274a2e87cafb0c1be5f294a9c)), closes [#776](https://github.com/i-doll/rezless/issues/776)
* **vm:** pace llMinEventDelay on frames and restart a held timer as Second Life does ([#758](https://github.com/i-doll/rezless/issues/758)) ([d11d3b6](https://github.com/i-doll/rezless/commit/d11d3b63d2ebb9eec38ade6346073be2bd0bd3a9))
* **vm:** pay another avatar's attachment as an object unless paid through the Pay menu ([#630](https://github.com/i-doll/rezless/issues/630)) ([da1032e](https://github.com/i-doll/rezless/commit/da1032e79727aa25dac95656ef2de679f3c3bb54))
* **vm:** place a worn object at its wearer for position, sensor, target, rez and ray reads ([#660](https://github.com/i-doll/rezless/issues/660)) ([44cdf94](https://github.com/i-doll/rezless/commit/44cdf94820e2b6142b7cf12c5b7408c29a19ce01))
* **vm:** place SLua merged touch_start after touch_end, and carried clicks after held changes ([#767](https://github.com/i-doll/rezless/issues/767)) ([5cbe310](https://github.com/i-doll/rezless/commit/5cbe31042a70903991b8e5874825785a53ce273a))
* **vm:** play collision sounds on impact and give seated avatars link texture animation ([#543](https://github.com/i-doll/rezless/issues/543)) ([e0b2f53](https://github.com/i-doll/rezless/commit/e0b2f5385cb5d90e97a3e02a80b746b95b574de9))
* **vm:** play default collision sounds and scale the impact threshold by size ([#596](https://github.com/i-doll/rezless/issues/596)) ([d4e1e1c](https://github.com/i-doll/rezless/commit/d4e1e1c262c1cb47b3eb75804d7036e99fa759f9))
* **vm:** queue events for a script behind its running handler ([#539](https://github.com/i-doll/rezless/issues/539)) ([94c69be](https://github.com/i-doll/rezless/commit/94c69be4d41f256ca3b8b4c679aba8c7c060a006))
* **vm:** raise a new land_collision_start after a reset during a land contact ([#611](https://github.com/i-doll/rezless/issues/611)) ([8b22b76](https://github.com/i-doll/rezless/commit/8b22b769d7f59e5d69e7b9c2686b0fb1ac83f133))
* **vm:** raise a prim change from a script call a simulator frame later ([#705](https://github.com/i-doll/rezless/issues/705)) ([b79cfbe](https://github.com/i-doll/rezless/commit/b79cfbe19186f4779d32a15a3d04d773e829bbd5))
* **vm:** raise a script's inventory gift to its own linkset a frame after the call ([#727](https://github.com/i-doll/rezless/issues/727)) ([695fd67](https://github.com/i-doll/rezless/commit/695fd67192fc5283281cf423fb72a30e0fc2a8e0))
* **vm:** raise an LSL script's link change from llBreakLink a frame late ([#716](https://github.com/i-doll/rezless/issues/716)) ([3a05ec7](https://github.com/i-doll/rezless/commit/3a05ec7ecbb2af87a103e124d6933a6780893b33))
* **vm:** raise an SLua stand's changed a frame late after a sleep, as in LSL ([#719](https://github.com/i-doll/rezless/issues/719)) ([502c01b](https://github.com/i-doll/rezless/commit/502c01b8107634e26120d253a0f4893e02a9437a))
* **vm:** raise game_control as measured in-world ([#541](https://github.com/i-doll/rezless/issues/541)) ([162c84f](https://github.com/i-doll/rezless/commit/162c84f91d488c5f9c95cd159765d75f48a1fe69))
* **vm:** raise moving events for physical motion and merge held land collisions ([#576](https://github.com/i-doll/rezless/issues/576)) ([5fa55c6](https://github.com/i-doll/rezless/commit/5fa55c6d7b9a5bc7f5512fb4b825cda339140c1d)), closes [#565](https://github.com/i-doll/rezless/issues/565)
* **vm:** raise moving events, merge held collisions and delay sensor results as measured ([#560](https://github.com/i-doll/rezless/issues/560)) ([8053ca4](https://github.com/i-doll/rezless/commit/8053ca4e713292c438968c73a14193f0c9efb2a6))
* **vm:** raise no touch for a held click while the touch handler runs on ([#733](https://github.com/i-doll/rezless/issues/733)) ([c219581](https://github.com/i-doll/rezless/commit/c2195816f9b09a4a3d9d73a3458699d3f958887d))
* **vm:** raise touch_start for an avatar's later overlapping clicks, and reverse carried SLua events on rez ([#756](https://github.com/i-doll/rezless/issues/756)) ([ef0525f](https://github.com/i-doll/rezless/commit/ef0525f73cd858657bad5940a36bf25787ed9d71))
* **vm:** read a departed avatar's velocity, parcel lists, group, visual params and key as measured ([#603](https://github.com/i-doll/rezless/issues/603)) ([7dc55e9](https://github.com/i-doll/rezless/commit/7dc55e969202f438ce63b771c82f062c7ae0c87b))
* **vm:** read an empty JSON member as JSON_INVALID, as Second Life does ([#631](https://github.com/i-doll/rezless/issues/631)) ([92614a7](https://github.com/i-doll/rezless/commit/92614a7d0d09c0f6ea488a6fd1df04acb66d2887))
* **vm:** read collision sounds, end reads at cast shadows, store prim floats as the region does ([#528](https://github.com/i-doll/rezless/issues/528)) ([33379d8](https://github.com/i-doll/rezless/commit/33379d89538b92df0d769dc4265d99acaaddf2c6))
* **vm:** read malformed JSON objects and arrays as Second Life does ([#615](https://github.com/i-doll/rezless/issues/615)) ([90495f7](https://github.com/i-doll/rezless/commit/90495f7e0f35ec8f59d5112a62eea99f6d7d389b))
* **vm:** read notecard lines by asset key as measured in-world ([#522](https://github.com/i-doll/rezless/issues/522)) ([5ba93b7](https://github.com/i-doll/rezless/commit/5ba93b7bc083c490f4d2522c0ec1eb9ef5d2835a))
* **vm:** read notecards with embedded items as Second Life does, and count SLua notecard search starts from 0 ([#507](https://github.com/i-doll/rezless/issues/507)) ([292be55](https://github.com/i-doll/rezless/commit/292be559ab752950234faf686b38528c15e5a08e))
* **vm:** read only the first flag of an llGetStatus mask ([#540](https://github.com/i-doll/rezless/issues/540)) ([c1a44c6](https://github.com/i-doll/rezless/commit/c1a44c63d306a0ea436558b3613dcba03e973ce9))
* **vm:** refuse camera control off the object and keep permissions on rezzed copies ([#424](https://github.com/i-doll/rezless/issues/424)) ([57ca370](https://github.com/i-doll/rezless/commit/57ca3704e76acacf017c1e6e56b4fdc10a0ccc17))
* **vm:** refuse viewer sits on scripted-only objects and read 0 prims for attachments ([#442](https://github.com/i-doll/rezless/issues/442)) ([26d4597](https://github.com/i-doll/rezless/commit/26d4597362574ec43393ec4154e6c369955799a7))
* **vm:** rename and save items in a prim's contents as measured in-world ([#506](https://github.com/i-doll/rezless/issues/506)) ([41febaa](https://github.com/i-doll/rezless/commit/41febaac07b531a6bf81761ac04413c017b78edf))
* **vm:** repeat held clicks every frame in SLua, route each release by the links and pass setting then, and end the root's clicks on a link break ([#724](https://github.com/i-doll/rezless/issues/724)) ([59018aa](https://github.com/i-doll/rezless/commit/59018aa43b908d83fd4a91240c018e9f6e78f924))
* **vm:** repeat touch while a click is held, as measured in-world ([#509](https://github.com/i-doll/rezless/issues/509)) ([85a490b](https://github.com/i-doll/rezless/commit/85a490b36bdfb6620658bbac8565c0ca9608ff2d))
* **vm:** report llRezObjectWithParams option errors and look up REZ_SOUND like the sound calls ([#569](https://github.com/i-doll/rezless/issues/569)) ([a5628f4](https://github.com/i-doll/rezless/commit/a5628f4415552feb03ece20d077149b47c484371))
* **vm:** reset faces and clear materials when the owner deletes an item in use ([#586](https://github.com/i-doll/rezless/issues/586)) ([6718ce6](https://github.com/i-doll/rezless/commit/6718ce690ec7a407e6f685b99834b9e1dac57b44))
* **vm:** resolve link 0 from a child as the root and report the sit-target flag ([#434](https://github.com/i-doll/rezless/issues/434)) ([9a58396](https://github.com/i-doll/rezless/commit/9a583960f8ca5fe37e974f2b1f781e9c36e7d13b))
* **vm:** resolve link numbers below LINK_THIS as Second Life does ([#417](https://github.com/i-doll/rezless/issues/417)) ([f90573c](https://github.com/i-doll/rezless/commit/f90573c208c5873d1d869744e9904a0045a90e14)), closes [#407](https://github.com/i-doll/rezless/issues/407)
* **vm:** return SLua's booleans, uuids and item names in list results, and add the llcompat-only functions ([#441](https://github.com/i-doll/rezless/issues/441)) ([34be46b](https://github.com/i-doll/rezless/commit/34be46bd0cb84caea4ceb0b118b54d36b2ee1672))
* **vm:** round llList2CSV ties to even and store texture keys in lower case ([#426](https://github.com/i-doll/rezless/issues/426)) ([017e3d6](https://github.com/i-doll/rezless/commit/017e3d6eec057481e5de54665c3f63de5df7d843))
* **vm:** route the release of a click on a child where a click would go at that moment ([#715](https://github.com/i-doll/rezless/issues/715)) ([80af272](https://github.com/i-doll/rezless/commit/80af272eac73f52914c1421f57e6656ee685840d))
* **vm:** run a Duplicate's copy of a crashed script as Second Life does ([#683](https://github.com/i-doll/rezless/issues/683)) ([1ba77b1](https://github.com/i-doll/rezless/commit/1ba77b193ceee4b17874b82c8bce3f8fd7c8cc1d))
* **vm:** run a held land contact inside a carried click, and merge a spin clicker's later click ([#772](https://github.com/i-doll/rezless/issues/772)) ([68aafdb](https://github.com/i-doll/rezless/commit/68aafdb58b2daff611f438a5658a7d458e4c4d4d))
* **vm:** run a script's queued events one simulator frame apart ([#752](https://github.com/i-doll/rezless/issues/752)) ([8a037f2](https://github.com/i-doll/rezless/commit/8a037f26db258f1969697c15aafc876b7d1f875a))
* **vm:** run a take and wear's held land_collision ahead of the held-back click ([#787](https://github.com/i-doll/rezless/issues/787)) ([4502dca](https://github.com/i-doll/rezless/commit/4502dca1edef67ff5ea12d6d0359652fb831fb04))
* **vm:** run an LLTimers tick due on a whole frame on that frame from any start ([#773](https://github.com/i-doll/rezless/issues/773)) ([ee33614](https://github.com/i-doll/rezless/commit/ee3361400abd5638130588cb65ef477c4ae7758d))
* **vm:** run events that came up in a sleep ahead of those the handler raises after it ([#714](https://github.com/i-doll/rezless/issues/714)) ([2d98478](https://github.com/i-doll/rezless/commit/2d98478a1a09e2fc435c81163dafc5d6a1f1093b))
* **vm:** run every event after a rez behind the carried click, and reverse at each SLua rez ([#788](https://github.com/i-doll/rezless/issues/788)) ([f07e13e](https://github.com/i-doll/rezless/commit/f07e13ec63e14190352584a9a131bf61374a67fd)), closes [#778](https://github.com/i-doll/rezless/issues/778)
* **vm:** seat a click on a box's top by the nearest side, and follow clicks on cylinders ([#554](https://github.com/i-doll/rezless/issues/554)) ([4ddb820](https://github.com/i-doll/rezless/commit/4ddb82038acbe9eb134b1d4fb185db7df441c016))
* **vm:** seat a click on a cylinder's top at the nearest edge and treat an oval cylinder as nine-sided ([#594](https://github.com/i-doll/rezless/issues/594)) ([987e5e5](https://github.com/i-doll/rezless/commit/987e5e59d0d955be6a4c56ee53304ad46ae87cc0))
* **vm:** seat a second avatar beside a taken sit target, which stays with the avatar that took it ([#484](https://github.com/i-doll/rezless/issues/484)) ([8e04b34](https://github.com/i-doll/rezless/commit/8e04b3493679f0647e297c1363b39c03f6a3e6be))
* **vm:** seat an avatar where Second Life does on a prim without a sit target, and keep llVolumeDetect for the whole object ([#469](https://github.com/i-doll/rezless/issues/469)) ([7222773](https://github.com/i-doll/rezless/commit/7222773f6d2e6b8ccdee8d7a971eba18428ff356))
* **vm:** send a child's prim changes to the root's scripts and merge drop gifts in a frame ([#737](https://github.com/i-doll/rezless/issues/737)) ([c2ac845](https://github.com/i-doll/rezless/commit/c2ac8458565bc4df80c5f7ad8293e7daa1bc6fd1))
* **vm:** send child gifts and remote loads to the root, and reset stopped scripts in inventory ([#556](https://github.com/i-doll/rezless/issues/556)) ([df90d6e](https://github.com/i-doll/rezless/commit/df90d6ea077c24313405f095dc8eba70b353e7a2))
* **vm:** settle a new object's first physics 0.9 s later and select a physical object for Duplicate ([#649](https://github.com/i-doll/rezless/issues/649)) ([2219294](https://github.com/i-doll/rezless/commit/22192941f7cae6cf07309b4cad974af1372108b3))
* **vm:** show a seated avatar's new rotation 0.311 s after a script sets it ([#633](https://github.com/i-doll/rezless/issues/633)) ([a093936](https://github.com/i-doll/rezless/commit/a093936eb61cdc10b9eee022bb1f454f2005f664)), closes [#620](https://github.com/i-doll/rezless/issues/620)
* **vm:** show maps to a clicker who left the region during the event ([#738](https://github.com/i-doll/rezless/issues/738)) ([889549f](https://github.com/i-doll/rezless/commit/889549fa2b7b68423349efced6b0231a745c0517))
* **vm:** show the map again from later events of a held click, and keep a click a link break ended until a release reaches it ([#729](https://github.com/i-doll/rezless/issues/729)) ([fc4af05](https://github.com/i-doll/rezless/commit/fc4af059d893ba7aad8c13e4bdadc0cab18c5183))
* **vm:** show the owner an SLua error's message and traceback ([#551](https://github.com/i-doll/rezless/issues/551)) ([d673ada](https://github.com/i-doll/rezless/commit/d673ada9d886eaac58a3a0d6bcfabb1058673ffa))
* **vm:** sit from the camera to the clicked spot, and add the menu ground sit ([#526](https://github.com/i-doll/rezless/issues/526)) ([f8ddf5d](https://github.com/i-doll/rezless/commit/f8ddf5de1166e1a7fdd7515fa1a036581d7e1efe))
* **vm:** snap llEuler2Rot quarter turns and store sitter and overflowing rotations as Second Life does ([#618](https://github.com/i-doll/rezless/issues/618)) ([0b14f51](https://github.com/i-doll/rezless/commit/0b14f51291c100c4b3b43ad4ba690d006b1ae9c1))
* **vm:** space a held click's touch events in whole frames under llMinEventDelay ([#762](https://github.com/i-doll/rezless/issues/762)) ([b96eb96](https://github.com/i-doll/rezless/commit/b96eb96db7e89b3534a4d06c010e28602a626653))
* **vm:** split long avatar chat like Firestorm and carry negative channels across regions ([#523](https://github.com/i-doll/rezless/issues/523)) ([6eaac0c](https://github.com/i-doll/rezless/commit/6eaac0c8b4e1591682005324f3043177b59fb2cd))
* **vm:** stand a seated avatar up on a far sit request and count scripts for OBJECT_SERVER_COST as the region does ([#451](https://github.com/i-doll/rezless/issues/451)) ([12d33d3](https://github.com/i-doll/rezless/commit/12d33d3a2fdce5b146b66e81def597f072367cac))
* **vm:** stand a seated avatar up when a sit request is refused for no room ([#493](https://github.com/i-doll/rezless/issues/493)) ([bfcbb12](https://github.com/i-doll/rezless/commit/bfcbb1297ed8a00c359b58139541efe5e055fb58))
* **vm:** start a new timer schedule at a call made before the caught-up tick ([#641](https://github.com/i-doll/rezless/issues/641)) ([1de71c3](https://github.com/i-doll/rezless/commit/1de71c36acbbe7b15cd37ab021a9721465dc8f79))
* **vm:** step llEuler2Rot angles and turn opposite llRotBetween vectors in single precision ([#657](https://github.com/i-doll/rezless/issues/657)) ([bc91293](https://github.com/i-doll/rezless/commit/bc912936fcf24f603c3ff28e5ed5b01c5c8c286a))
* **vm:** stop a physical object at an edit or a take, drop pushes while it is selected, and rez it still from the viewer ([#662](https://github.com/i-doll/rezless/issues/662)) ([5e1b9a8](https://github.com/i-doll/rezless/commit/5e1b9a886f44bf7ab09006ca1b6a66a22f58ea91))
* **vm:** stop a running handler on reset, keep its queue through a detach ([#559](https://github.com/i-doll/rezless/issues/559)) ([92939ef](https://github.com/i-doll/rezless/commit/92939efbdae44a9fe34069c82f2e4b7d7e0311b4))
* **vm:** store glTF overrides that equal the default 2^-23 away from it ([#612](https://github.com/i-doll/rezless/issues/612)) ([64f05ce](https://github.com/i-doll/rezless/commit/64f05ce51ec0e8bfec0eb171b2b64a4662cc7ad3)), closes [#609](https://github.com/i-doll/rezless/issues/609)
* **vm:** support [`@sitground`](https://github.com/sitground)=force and sit on the ground after the stand from a seat ([#465](https://github.com/i-doll/rezless/issues/465)) ([675519d](https://github.com/i-doll/rezless/commit/675519d6fa1635006d4ca6153c8b3080757ca380))
* **vm:** take a uuid for any SLua string parameter, and no numbers ([#400](https://github.com/i-doll/rezless/issues/400)) ([2218047](https://github.com/i-doll/rezless/commit/221804704b98df2fb760eeb77ad7cb9eacad30f7))
* **vm:** take whole turns off llEuler2Rot angles as Second Life does, and store tiny prim rotations as none ([#552](https://github.com/i-doll/rezless/issues/552)) ([7f69af0](https://github.com/i-doll/rezless/commit/7f69af0d73c55afcb65baaca28b27b4bc05b3cfa))
* **vm:** tell the owner about animation calls without permission, and refuse to rez an empty notecard ([#584](https://github.com/i-doll/rezless/issues/584)) ([6f6052a](https://github.com/i-doll/rezless/commit/6f6052a11f52eab59decaebea63356e50222fed7))
* **vm:** tell the owner about control and camera calls without permission, and give Duplicate the [`@fartouch`](https://github.com/fartouch) reach ([#574](https://github.com/i-doll/rezless/issues/574)) ([5c1a3ad](https://github.com/i-doll/rezless/commit/5c1a3adeb6ed525e1f01cb31ef3aa5f1d3485e4e))
* **vm:** tell worn objects when their wearer moves, pull it with every worn target, and report no-modify unlinks ([#675](https://github.com/i-doll/rezless/issues/675)) ([75cdd02](https://github.com/i-doll/rezless/commit/75cdd02cb2309f4b8edd7038218f7e263317394b))
* **vm:** throttle llRequestUserKey and show llMapBeacon as measured in-world ([#524](https://github.com/i-doll/rezless/issues/524)) ([423492e](https://github.com/i-doll/rezless/commit/423492e93035a34a7cea91d50dbd87e5df0e4043))
* **vm:** throttle map calls to 4 per avatar shown, over 4 s periods ([#734](https://github.com/i-doll/rezless/issues/734)) ([295dea4](https://github.com/i-doll/rezless/commit/295dea43655dba4512745a34dccc40154ce3c167))
* **vm:** tick long whole-frame timers on their frames ([#770](https://github.com/i-doll/rezless/issues/770)) ([8ba3eea](https://github.com/i-doll/rezless/commit/8ba3eea7ab651008eb95f75170b59f0424e0543d))
* **vm:** tick timers on simulator frames ([#754](https://github.com/i-doll/rezless/issues/754)) ([3141cb0](https://github.com/i-doll/rezless/commit/3141cb06cc2e742ea8ff3e360051944a747b1a96))
* **vm:** tick twice after a stop, a start and a sleep, and keep a held tick's schedule ([#622](https://github.com/i-doll/rezless/issues/622)) ([636ddcd](https://github.com/i-doll/rezless/commit/636ddcd73eb09a6c4e222083661cd188ee62156d))
* **vm:** time failed lookups and count the error flood per region clock ([#575](https://github.com/i-doll/rezless/issues/575)) ([144267a](https://github.com/i-doll/rezless/commit/144267a622f9a2325b0f031ea3fcd4a83ce6500e))
* **vm:** turn llLookAt about its aim as Second Life does ([#680](https://github.com/i-doll/rezless/issues/680)) ([b9dabe6](https://github.com/i-doll/rezless/commit/b9dabe6e0622a465a84838f2af57c4fd99bb20c0)), closes [#679](https://github.com/i-doll/rezless/issues/679)
* **vm:** turn llRot2Fwd, llRot2Left and llRot2Up axes in single precision for every rotation ([#670](https://github.com/i-doll/rezless/issues/670)) ([97da5cf](https://github.com/i-doll/rezless/commit/97da5cf95b5c29e07c01082fba903e601a00b2f1)), closes [#665](https://github.com/i-doll/rezless/issues/665)
* **vm:** wake a sleep or forced delay on a simulator frame ([#764](https://github.com/i-doll/rezless/issues/764)) ([4324cb4](https://github.com/i-doll/rezless/commit/4324cb4dbb4165d4ba77d4a6bd9fdaa8c661da37))
* **vm:** walk after a stand, land after a teleport, keep a flying sitter's flag ([#473](https://github.com/i-doll/rezless/issues/473)) ([8317555](https://github.com/i-doll/rezless/commit/83175558f67896d878b199a0b7c6ba6de9897a4f))
* **vm:** word Mono's invalid program error, lag a timer after a caught-up tick, and tick before a tied sensor ([#595](https://github.com/i-doll/rezless/issues/595)) ([2cdeeee](https://github.com/i-doll/rezless/commit/2cdeeee204f275c578b680cf50b2df7876613204)), closes [#433](https://github.com/i-doll/rezless/issues/433)
* **vm:** word prim-param errors as the owner sees them and revive a crashed script on Reset ([#515](https://github.com/i-doll/rezless/issues/515)) ([feb9f57](https://github.com/i-doll/rezless/commit/feb9f57c67b961a8fd64cf8726a7784e53059369))
* **vm:** work llAxisAngle2Rot in single precision and flush tiny ll rotation results ([#598](https://github.com/i-doll/rezless/issues/598)) ([e29b7d8](https://github.com/i-doll/rezless/commit/e29b7d8ff649454361c72322d73050b42d29264a))
* **vm:** write malformed JSON-shaped values as Second Life does ([#619](https://github.com/i-doll/rezless/issues/619)) ([a09d974](https://github.com/i-doll/rezless/commit/a09d974657e1ea780a65741d62d99e500d372eab))


### Miscellaneous Chores

* relicense under MIT ([#453](https://github.com/i-doll/rezless/issues/453)) ([a6dce84](https://github.com/i-doll/rezless/commit/a6dce8473d19fb77fb4f67009855c6c60b0a100f))

## [0.13.0](https://github.com/i-doll/rezless/compare/v0.12.1...v0.13.0) (2026-11-12)


### Features

* run SLua scripts in SLua's own VM, compiled to WebAssembly ([#390](https://github.com/i-doll/rezless/issues/390)) ([316e94f](https://github.com/i-doll/rezless/commit/316e94f77998d5530f5b854741fb2ee24cadf96f))

## [0.12.1](https://github.com/i-doll/rezless/compare/v0.12.0...v0.12.1) (2026-11-11)


### Bug Fixes

* validate rezless against SLua's LSL implementation ([#389](https://github.com/i-doll/rezless/issues/389)) ([208f955](https://github.com/i-doll/rezless/commit/208f9559a74379dcfa54f6df4a7d8d358ec9ba52))
* **vm:** conform to SLua's LSL conformance suite ([#387](https://github.com/i-doll/rezless/issues/387)) ([22013c1](https://github.com/i-doll/rezless/commit/22013c1859ffaff472ef225f77f5c8e4e9f1775c))

## [0.12.0](https://github.com/i-doll/rezless/compare/v0.11.1...v0.12.0) (2026-11-03)


### Features

* filter llGetParcelPrimOwners by group return powers ([#380](https://github.com/i-doll/rezless/issues/380)) ([e92ce87](https://github.com/i-doll/rezless/commit/e92ce87c25587d449dfdb86623915b4a088f5245))
* implement environment setters and land changes ([#381](https://github.com/i-doll/rezless/issues/381)) ([33d62da](https://github.com/i-doll/rezless/commit/33d62dacc593c8a7e71e43a6790473b0a48decc8))


### Bug Fixes

* bound leash post names in selection dialogs ([c8a35e1](https://github.com/i-doll/rezless/commit/c8a35e1ae4f5cd81c40f40a9e8dee80876d1a2fc))

## [0.11.1](https://github.com/i-doll/rezless/compare/v0.11.0...v0.11.1) (2026-11-01)


### Bug Fixes

* honor root reassignment when retaining inventory fixtures ([b34f052](https://github.com/i-doll/rezless/commit/b34f0527506a5bc0789a553fe09917a2bfcfdff7))
* retain detached attachment fixtures when reseeding inventory ([61b59e5](https://github.com/i-doll/rezless/commit/61b59e594149968a65d96e1986ca86254a463815))

## [0.11.0](https://github.com/i-doll/rezless/compare/v0.10.0...v0.11.0) (2026-11-01)


### Features

* add opt-in RLV viewer delivery controls ([a3563b4](https://github.com/i-doll/rezless/commit/a3563b43ac6d1c9f073ea900c87dda0e0df7f365))


### Bug Fixes

* hold forced self-detach in the viewer delivery queue ([8309829](https://github.com/i-doll/rezless/commit/8309829cc115f266cbce8a78fa5966f4a6f1c5cf))
* preserve viewer reply order after release ([6a65f61](https://github.com/i-doll/rezless/commit/6a65f613d00ab45d3d8f6ceab0b574219e9c2dce))

## [0.10.0](https://github.com/i-doll/rezless/compare/v0.9.0...v0.10.0) (2026-11-01)


### Features

* control Experience key-value failures and answer release ([d3af36b](https://github.com/i-doll/rezless/commit/d3af36b42afe6cb806365f064e1316fb4bd4fc1e))


### Bug Fixes

* compare incoming rotation before normalization ([fc37c54](https://github.com/i-doll/rezless/commit/fc37c5435910226679d978bf923187b2ff481e70))
* deliver avatar-targeted region chat to attachments ([96e3c09](https://github.com/i-doll/rezless/commit/96e3c09287e29b97144250ed150e56e0674fc308))
* deliver scripted prim change events ([45d4d65](https://github.com/i-doll/rezless/commit/45d4d65d64ea0eaa8254bbfcefb3a0e0eedcc65e))
* initialize scripts before setter change delivery ([2532e72](https://github.com/i-doll/rezless/commit/2532e72db1e4d0bbf7fa4346b4300ec288d3c46b))
* match child primitive rotation semantics ([ebabbdc](https://github.com/i-doll/rezless/commit/ebabbdc85a465a178ca4df978e8eb088b41afdb4))
* number seated avatars in seating order ([955dddc](https://github.com/i-doll/rezless/commit/955dddc8462d63108044fa32ef50d9d8fd59d797))
* pause attachment script clocks while in inventory ([6ef2cf1](https://github.com/i-doll/rezless/commit/6ef2cf126d6c45b47dd37679bdc2e46dcbdc8bdb))
* read attachment point and temporary object details ([6c711d6](https://github.com/i-doll/rezless/commit/6c711d61d35ae064fc55b78ccad391ac6720d2fb))
* read object details for region avatars ([b6566bd](https://github.com/i-doll/rezless/commit/b6566bdfe499f15efe788a3268c2ec3481c59136))
* require full owner permissions for inventory keys ([25601ba](https://github.com/i-doll/rezless/commit/25601ba6c6c1a569a1680f2a90035df6cb39dec2))
* resolve link zero parameter reads from child prims ([55d3ec3](https://github.com/i-doll/rezless/commit/55d3ec3961680be65bae5ea0adcffc235538c057))
* resolve owner keys across live region linksets ([84b618f](https://github.com/i-doll/rezless/commit/84b618f96294877007833ad4be014c26934a74ab))
* return local avatar legacy names from llKey2Name ([3bfbf24](https://github.com/i-doll/rezless/commit/3bfbf24cfd2f8be9498d04a75998ec2d20bc666a))
* use wearer rotation for attachment children ([1cb9fa2](https://github.com/i-doll/rezless/commit/1cb9fa23982b2700359ef1b24fedefbd3aec308a))

## [0.9.0](https://github.com/i-doll/rezless/compare/v0.8.0...v0.9.0) (2026-11-01)


### Features

* add viewer edit and inventory rez actions ([1fca6f9](https://github.com/i-doll/rezless/commit/1fca6f94a98a037c11fa019b4653d4216dea117c))
* answer attachment occupancy queries for viewer profiles ([646a42a](https://github.com/i-doll/rezless/commit/646a42a8db7dc1109945744907168cd347f00695))
* answer outfit and worn inventory queries ([43c6bc0](https://github.com/i-doll/rezless/commit/43c6bc09e0194b8c9d882f6a62d9ac9f9c574134))
* answer profile-specific RLV status queries ([de6a91a](https://github.com/i-doll/rezless/commit/de6a91a9609883a173732fd1aa19348da9362fa9))
* answer RLV version queries through queued avatar listens ([8732ed6](https://github.com/i-doll/rezless/commit/8732ed62316e2bd6953370a5d2c372782b619a67))
* answer RLVa clothing layer name queries ([31e80e7](https://github.com/i-doll/rezless/commit/31e80e747d0b90df7364f906266103fabaa3be01))
* answer shared-folder searches and worn attachment paths ([10e7b09](https://github.com/i-doll/rezless/commit/10e7b095edfa3c2f57a1ba0d82be04704d3542c7))
* connect viewer sit commands to world seating ([a8966e0](https://github.com/i-doll/rezless/commit/a8966e08c5c618955f7a032f4789fdcc26cae271))
* define per-avatar RLV profiles and paired LSL fixtures ([71d6960](https://github.com/i-doll/rezless/commit/71d6960b0f77deb449057dcb8311653ddb0dbc64))
* deliver profile-specific RLV restriction notifications ([b2ee8e3](https://github.com/i-doll/rezless/commit/b2ee8e35d5e4a25edb41ac4e06757356fc267431))
* discover implemented RLVa command forms ([c0a3dbd](https://github.com/i-doll/rezless/commit/c0a3dbdde4e24c3324de69a16ad9b519a0225711))
* emulate viewer camera FOV commands and limits ([720a1f9](https://github.com/i-doll/rezless/commit/720a1f9c4f17229f6eb6cfd3f4825a22453e2c78))
* enforce attachment point locks and force removal ([12d7cb7](https://github.com/i-doll/rezless/commit/12d7cb709488d088cfcc8ac7ca7a712b1227ed1c))
* enforce avatar chat volume restrictions ([ced21b7](https://github.com/i-doll/rezless/commit/ced21b72f88c2dcfed739912ea20a6e6c07e5632))
* enforce avatar IM send and session restrictions ([613f243](https://github.com/i-doll/rezless/commit/613f2438ea23c212357341449a63779e0c263ace))
* enforce avatar teleport requests across viewer profiles ([9f113d2](https://github.com/i-doll/rezless/commit/9f113d27e6b6d4dad7dc3c910022436abcaab658))
* enforce emote and avatar chat redirection ([645ea6c](https://github.com/i-doll/rezless/commit/645ea6c7d60b4880c2de22606dbcb64d4c5034a7))
* enforce profile-specific acceptpermission grants ([e95e1aa](https://github.com/i-doll/rezless/commit/e95e1aad9035ac8973831dfa56b8a8a7af18c6a5))
* enforce profile-specific avatar movement restrictions ([74ef4c1](https://github.com/i-doll/rezless/commit/74ef4c19deea55006fb954d050027cfbf67bf0b1))
* enforce profile-specific avatar touch restrictions ([9504113](https://github.com/i-doll/rezless/commit/9504113430e488273281c77ec1504331e76fd1e2))
* enforce profile-specific folder wear locks ([cba4563](https://github.com/i-doll/rezless/commit/cba45634c8cd837ea2720b640276f5b743f074d8))
* enforce profile-specific RLV camera control ([f1149a8](https://github.com/i-doll/rezless/commit/f1149a879ad1053a04a727f57c0d6370aab3c75b))
* enforce profile-specific RLV camera distance limits ([afc0dfb](https://github.com/i-doll/rezless/commit/afc0dfbbcc7bf8b15475e2d7d58c499ac917858c))
* enforce profile-specific viewer reply delivery ([64c6a97](https://github.com/i-doll/rezless/commit/64c6a9758613f28ebd7c1f0ee51493e040c94c66))
* enforce RLVa avatar payment and purchase restrictions ([d066e3e](https://github.com/i-doll/rezless/commit/d066e3e2898eb9c120f25eceb3e6466edc9c5c06))
* enforce sendchannel restrictions for avatar chat fixtures ([d95d093](https://github.com/i-doll/rezless/commit/d95d09385d7e30824cd0636b129b8b826341cad0))
* enforce sendchat and channel exclusions per viewer profile ([9ed8873](https://github.com/i-doll/rezless/commit/9ed8873abd7198f18f726efe21c112d8839dcf1c))
* enforce sendgesture on avatar gesture actions ([9fdcc93](https://github.com/i-doll/rezless/commit/9fdcc933e1002919f9b95858d46fce02d2ee7c9e))
* enforce shared and unshared user wear locks ([69e7f1a](https://github.com/i-doll/rezless/commit/69e7f1aec82d42c56840f3dea299d6307e8fbe2f))
* enforce teleport offers and automatic acceptance ([d7b2ecd](https://github.com/i-doll/rezless/commit/d7b2ecdab064879221d5c422c587da00d22d89ae))
* enforce touchme and touchthis viewer restrictions ([74a003a](https://github.com/i-doll/rezless/commit/74a003acf9185fec97c24819c7729be9bb4e452a))
* enforce user landmark and map teleport restrictions ([41615b2](https://github.com/i-doll/rezless/commit/41615b2388c0262a9aff9bc09bfad46d27e97438))
* enforce viewer attachment detach actions ([c4d425f](https://github.com/i-doll/rezless/commit/c4d425f62ee7fd4138bd1c28d17d8311123f682d))
* enforce viewer sit and stand restrictions ([c397040](https://github.com/i-doll/rezless/commit/c397040542e37fd5c06370371c05c4541c59a10c))
* expose camera render effects through viewer state ([12290d0](https://github.com/i-doll/rezless/commit/12290d0ae5da1af9ff41644a8f84ce6fdc6ac454))
* expose viewer UI restriction state ([bcd7ed5](https://github.com/i-doll/rezless/commit/bcd7ed52d44c2dcb56e7a924cc14d787d3ba3b9a))
* force-remove shared attachments and clothing layers ([64936c9](https://github.com/i-doll/rezless/commit/64936c9ff4e234473b006b5552b86cccd1b68c77))
* force-wear direct shared-folder attachments ([d6eaf38](https://github.com/i-doll/rezless/commit/d6eaf38ea39382f0e3a6e968f1191d336c6af91a))
* implement profile-specific forced teleport ([ed1eca3](https://github.com/i-doll/rezless/commit/ed1eca399ce56a840af3e7e202d7fd36a19b7ceb))
* model profile-specific RLV blacklist behavior ([0797ff2](https://github.com/i-doll/rezless/commit/0797ff241e4ff719e2f30fce49a6087e6cec6904))
* model viewer startup and restriction cleanup ([c039520](https://github.com/i-doll/rezless/commit/c03952068189c645f952de0f3f264eed279b9536))
* parse ordered RLV and RLVa command batches ([f77f79d](https://github.com/i-doll/rezless/commit/f77f79d97fa8fb30ba5bd23b9b3d63f436690ec6))
* record received chat and enforce receive restrictions ([530ab95](https://github.com/i-doll/rezless/commit/530ab952eecc0c133d6e8dc5644b552a00cafc78))
* record received IMs and enforce recvim restrictions ([e1ee0f1](https://github.com/i-doll/rezless/commit/e1ee0f1ef86743c883743cb2539e6b7cae01525d))
* recover locked attachments after simulator detach ([54b9275](https://github.com/i-doll/rezless/commit/54b92753fae28e01a8110f3a0338accdcf4c9740))
* resolve shared inventory offers explicitly ([4b89da2](https://github.com/i-doll/rezless/commit/4b89da2364b3a25866a22f89a80df8241fb7cf2b))
* resolve worn folders for RLV this force forms ([f473aab](https://github.com/i-doll/rezless/commit/f473aabf13ccd3139b81ae368c3b5e4c25841fc5))
* seed avatar inventory and answer getinv ([40127db](https://github.com/i-doll/rezless/commit/40127dbd76e7b04729cf616e3e201f2a88eba114))
* support active avatar groups in RLV profiles ([ed0ba4a](https://github.com/i-doll/rezless/commit/ed0ba4aa1e837ce61a13c8beff95bce24dbf40eb))
* support clothing-layer getpath selectors ([79e4534](https://github.com/i-doll/rezless/commit/79e45345cf77c1d08594364b1a25726a34e759b2))
* support far simulator sit responses and autopilot ([bac68fb](https://github.com/i-doll/rezless/commit/bac68fbb23d21294d141cb2f40541e26c28267f9))
* support Kokua frame and visibility collection timing ([ed03a56](https://github.com/i-doll/rezless/commit/ed03a5609fc529e8ebc9ec2df2bc82a30121df54))
* support per-avatar RLV environment settings ([f338851](https://github.com/i-doll/rezless/commit/f3388511d7d4e6eb758d572cec40cad08bff023e))
* support profile-specific standtp return teleports ([6c03986](https://github.com/i-doll/rezless/commit/6c03986fdfbe719ac46c0017a7fd0441038b2d80))
* support recursive RLV folder wear and removal ([8135e75](https://github.com/i-doll/rezless/commit/8135e7579a9fca60553d6c8abc241426d23b749f))
* support RLVa child UUID and point-group force removal ([4aeeb32](https://github.com/i-doll/rezless/commit/4aeeb32e7f9e88b5df8ef9d24fc131d773d6d433))
* support viewer debug settings and locks ([b052812](https://github.com/i-doll/rezless/commit/b0528122928d1912cec17fcc6ededfc030b35333))
* track per-prim RLV viewer restrictions ([86cee07](https://github.com/i-doll/rezless/commit/86cee07d7efc6fcc2db5a3c3738be513cbb7269e))
* wear shared folder clothing and resolve inventory links ([b8060be](https://github.com/i-doll/rezless/commit/b8060beadfa650ec45c2867a3dff1602f44b85fb))


### Bug Fixes

* apply camera mode restrictions when commands arrive ([c521430](https://github.com/i-doll/rezless/commit/c521430738779aafbdce39db4068db085fde80fb))
* apply folder locks to clothing availability replies ([02c854c](https://github.com/i-doll/rezless/commit/02c854c2f2f5d413721a8ec65d7af0b5eba87d15))
* apply parcel routing and terrain to forced teleports ([24cda55](https://github.com/i-doll/rezless/commit/24cda5546e3d0b0b58c21ef48439f53aead2ea3c))
* bind viewer sessions before scheduling user sit pilots ([f2ac09a](https://github.com/i-doll/rezless/commit/f2ac09a4e480f88471f6491deb1fb5c9fe2259e5))
* carry worn objects through RLV teleports and tidy the RLV dispatcher ([1b4c2b9](https://github.com/i-doll/rezless/commit/1b4c2b90b23eac2088dcc528d78e9f146165e525))
* check attachment locks against the replacement definition ([49503b0](https://github.com/i-doll/rezless/commit/49503b047969815c43de2da81abacf54a6816cfc))
* clamp overflowed hover adjustments ([9d29db7](https://github.com/i-doll/rezless/commit/9d29db7b3f100f4a9867ffc3fdeebf860a099182))
* enforce camera entry and preset reset semantics ([44f548c](https://github.com/i-doll/rezless/commit/44f548c6f81403d885a65e64d8bbf474c320d064))
* enforce clothing capacity during queued force wear ([91c9213](https://github.com/i-doll/rezless/commit/91c921305868aa2247e2416f18c559945ec1b237))
* enforce RLVa single-slot physics wear ([8c4ac62](https://github.com/i-doll/rezless/commit/8c4ac6282d8bfd25dca3ad187f10c5c3ed9622f2))
* expire sit pilots with their viewer session and pose ([71c83ef](https://github.com/i-doll/rezless/commit/71c83ef68d88110e7a7b6ce2abfd4a63ddbf8fbf))
* identify RLV profiles by viewer version ([3cc3f50](https://github.com/i-doll/rezless/commit/3cc3f504ee8d4f6713c4f6a48375b80cc634fee8))
* include seated camera poses in RLV distance queries ([12cb32a](https://github.com/i-doll/rezless/commit/12cb32a4814b779b7c75a8105e0effa226c3bd45))
* match profile clothing replacement order ([28a376a](https://github.com/i-doll/rezless/commit/28a376a1d550bcaf33cf738688f8af6de8d84b42))
* match the global mouselook activation toggle ([5c804a9](https://github.com/i-doll/rezless/commit/5c804a9f19e8c8c4499240882e58c2c7bf196c14))
* match viewer FOV decimal formatting ([becbab1](https://github.com/i-doll/rezless/commit/becbab18fcd9cb5542571669d48d7379b3c52473))
* normalize nested folded folders in wear policies ([e53129a](https://github.com/i-doll/rezless/commit/e53129a2ecc53e83437714fccb2d68ab068c18a7))
* parse viewer numeric sit and teleport options ([36c23bc](https://github.com/i-doll/rezless/commit/36c23bc40303b5f0ad11a233308d746042b59423))
* preserve attachment lock and region semantics ([513420a](https://github.com/i-doll/rezless/commit/513420a2e2a7f2f3452ed49df59123981a3fe229))
* preserve bodypart skip results under folder locks ([0091504](https://github.com/i-doll/rezless/commit/00915045d74a88b9fe61d75ffc21754dce8eadd4))
* preserve default camera modifiers under exclusive control ([4ad4228](https://github.com/i-doll/rezless/commit/4ad4228a119fca514243a47302cd5a14df032158))
* preserve Kokua attachment issuers across recovery travel ([b0529fe](https://github.com/i-doll/rezless/commit/b0529fe8b76fe626013669f8a141eb1533ccee02))
* preserve Kokua bodypart folder lock bypass ([bacb6b0](https://github.com/i-doll/rezless/commit/bacb6b061ef732691a3121be4267835b8f6050e9))
* preserve Kokua protection at clothing capacity ([c72c558](https://github.com/i-doll/rezless/commit/c72c55804b5b056eeec5b2846241ac25ea2fe434))
* preserve Kokua teleport angle and lock ordering ([066b483](https://github.com/i-doll/rezless/commit/066b4832cda79682fc7d5d5c9ac3d00fb89b5a12))
* preserve protected clothing during force replacement ([b027ffc](https://github.com/i-doll/rezless/commit/b027ffcc6b53c3dbee5d93d26eca8396373af7ed))
* preserve render modifier conversion and clear semantics ([cad37d3](https://github.com/i-doll/rezless/commit/cad37d3399b0202f77d2889ff0b3c7d358b612df))
* preserve retained attachment state when rezzing inventory ([2caf792](https://github.com/i-doll/rezless/commit/2caf792b7c23e0d6c89466877006ddc0444f6fc3))
* preserve RLVa folder selector category identity ([3d9ce17](https://github.com/i-doll/rezless/commit/3d9ce175ad198ccd3121899d7768292711d4d8b3))
* preserve viewer identity during retained queries ([5ef5906](https://github.com/i-doll/rezless/commit/5ef5906633bdc72ea25dfea3559b0ba7a67cb828))
* reject overflowing environment values ([e990663](https://github.com/i-doll/rezless/commit/e9906634bf958088eb7b39d9953edc972ba94bbc))
* respect RLVa secure channel exclusion scope ([1c7f4d1](https://github.com/i-doll/rezless/commit/1c7f4d1f0298d17c24288bc573605d8383847f3a))
* retain attachment metadata on accepted gifts ([be9a59b](https://github.com/i-doll/rezless/commit/be9a59b397fc8144ff3dd63ec82b93b6f6cbdc36))
* retain mapped attachment type through inventory links ([4dc0f22](https://github.com/i-doll/rezless/commit/4dc0f22766eede9182e33e7e6b9ad4e8e54ab70a))
* retain mapped state across attachment detaches ([a347087](https://github.com/i-doll/rezless/commit/a3470873c90d94042d324413c5a989cc712340f6))
* retain the notification viewer after emitter ownership changes ([64fdf14](https://github.com/i-doll/rezless/commit/64fdf1400525119ef875ec95069168a632bc58c0))
* retain usable attachment fixtures during replacement ([45e0936](https://github.com/i-doll/rezless/commit/45e09363c6869df0f5724ac90aac46070649425e))
* scope attachment ownership checks to UUID removal ([6aef0f5](https://github.com/i-doll/rezless/commit/6aef0f539ecc7a53ab5fbf901b148798152bd5fc))
* share Kokua point selection with folder locks ([3f9fe70](https://github.com/i-doll/rezless/commit/3f9fe70dc315582199a3616043c404f821fc7328))
* synchronize avatar run modes with agent info ([8f91bc8](https://github.com/i-doll/rezless/commit/8f91bc8f320fceaef91b647cf474524527c0e2de))
* track accepted clothing layers during queued wear ([1aacc54](https://github.com/i-doll/rezless/commit/1aacc54f74bf47354259ca9ab88bdacc0247fff6))
* translate touch detection across regions ([0300a34](https://github.com/i-doll/rezless/commit/0300a346bdbb60aa19d0962088866185006b04ad))
* trigger standtp returns when seats are removed ([3e3e7c7](https://github.com/i-doll/rezless/commit/3e3e7c76048d14645b3ae130ab27d6bb619f2738))

## [0.8.0](https://github.com/i-doll/rezless/compare/v0.7.0...v0.8.0) (2026-11-01)


### Features

* add environment reads and measured land edit refusals ([f32e034](https://github.com/i-doll/rezless/commit/f32e03438c26b242fcb9d47632dc9a71c5d0330d))
* capture physics requests and expose read fixtures ([0ab777e](https://github.com/i-doll/rezless/commit/0ab777ebcdcfd42d5911332ee437c1cb6be26eb7))
* capture vehicle and hover physics settings ([94db6a1](https://github.com/i-doll/rezless/commit/94db6a161dab6d25991003c94d09a5cc43f60d8f))
* implement game-control snapshots and fixtures ([6130dde](https://github.com/i-doll/rezless/commit/6130dde438a15f5987643d6cd5378052ed07d39f))
* implement measured sensor scans and world targets ([f0535f6](https://github.com/i-doll/rezless/commit/f0535f694ca693ac798ba53823374c972e1b3794))
* implement raycasts and remote script loading ([7649646](https://github.com/i-doll/rezless/commit/7649646f16635fcb0f0f51144b63cb8be8589312))
* implement targets and collision settings ([5b891c4](https://github.com/i-doll/rezless/commit/5b891c445ed2cc9c8e59ebd077db1d2ba0a96c48))
* model avatar attachments and HUD projection ([1067e97](https://github.com/i-doll/rezless/commit/1067e97da1162c2c0f2f6f1c8c1a8e5f684d6a27))
* model avatar names and agent information ([ca364bd](https://github.com/i-doll/rezless/commit/ca364bddfdf8084618c9413f9b0e39d9dc5808fe))
* model avatar sitting and teleport requests ([3f2cfae](https://github.com/i-doll/rezless/commit/3f2cfaeccc5846120283ca135e2c947747c7e99f))
* model deterministic keyframed motion and region moves ([1afe64e](https://github.com/i-doll/rezless/commit/1afe64ec548b9b525753e3c34041262e23695e94))
* model move-to and look-at targets ([38d96b1](https://github.com/i-doll/rezless/commit/38d96b167bbd56f675f05ef884dea5a12918c1ba))
* model parcels and implement parcel reads ([8b9e729](https://github.com/i-doll/rezless/commit/8b9e7295b782b976a170ba10ffdd9966b21c2e52))
* model per-prim sit camera settings ([e7102fd](https://github.com/i-doll/rezless/commit/e7102fdb6b328cd31c285136f36356138edd601f))
* record and validate prim media state ([88d43fb](https://github.com/i-doll/rezless/commit/88d43fbbcf93d5917486ed7bf7b9c00bbab7bcda))
* record inventory giving and viewer requests ([52eb7c0](https://github.com/i-doll/rezless/commit/52eb7c09b857d4359610e5b6c1af8c26eabe45e2))
* record parcel effect and payment requests ([60ea983](https://github.com/i-doll/rezless/commit/60ea98395e01927bf5cbff064ab43ae2956ae491))
* record per-prim particle system requests ([9260c71](https://github.com/i-doll/rezless/commit/9260c7175c58e840eff64c01b4bf0ceef9678e85))
* record per-prim sound requests ([389b995](https://github.com/i-doll/rezless/commit/389b9951937b4713c87425e2c858f404c32036f0))
* rez inventory objects into the world ([ed60951](https://github.com/i-doll/rezless/commit/ed60951f3f2f0f299891082cfc5ff37c172312c3))
* **vm:** hold a linkset touch, with a long-press example ([8437e96](https://github.com/i-doll/rezless/commit/8437e9685fde4a834787932a83b6d7ac69529bc8))
* **vm:** implement combat damage and health ([9d6bf6b](https://github.com/i-doll/rezless/commit/9d6bf6b12ea1306ee7325948b780e1aa2492b971))
* **vm:** implement controls and camera functions ([2665966](https://github.com/i-doll/rezless/commit/26659664fe82d2d17952e7142ebb4d5615de7354))
* **vm:** implement experiences and the experience key-value store ([c714078](https://github.com/i-doll/rezless/commit/c71407894a5dff705d54baa555d53fa2c38b1eba))
* **vm:** implement HTTP-in (llRequestURL and friends) ([c3a23b6](https://github.com/i-doll/rezless/commit/c3a23b6ebd2fa4d9903295b9a4f22db4f48869c4))
* **vm:** implement llAngleBetween, llAxes2Rot, llListSortStrided and the sRGB conversions ([f7f7c14](https://github.com/i-doll/rezless/commit/f7f7c14666041af495f2dc4ff9d6dcca3b8c70e3))
* **vm:** implement llCreateLink, llBreakLink and llBreakAllLinks ([f765211](https://github.com/i-doll/rezless/commit/f765211f4691c080976e5db619b802a1c7405b4f))
* **vm:** implement llDetectedRezzer and llDetectedDamage ([c8b46e2](https://github.com/i-doll/rezless/commit/c8b46e2a7c42c9d8c887054cb9e96a19eba72cfd))
* **vm:** implement llEmail, llGetNextEmail and llTargetedEmail ([d663901](https://github.com/i-doll/rezless/commit/d6639012f670e7c055eb520e7a5915cf298da655))
* **vm:** implement llFindNotecardTextSync and llFindNotecardTextCount ([b4171f7](https://github.com/i-doll/rezless/commit/b4171f761d3211a3f5b870749e6e5fd96a6d22bb))
* **vm:** implement llGetGMTclock, llGetWallclock and llGetTimeOfDay ([1f92c8e](https://github.com/i-doll/rezless/commit/1f92c8eb5048aff909620b4b57e05be3c3715a79))
* **vm:** implement llScriptDanger from a region setting ([1939d7e](https://github.com/i-doll/rezless/commit/1939d7e644e13b49d1470ead50addeeab3f4515d))
* **vm:** implement llSetTouchText, llSetSitText and llSetPayPrice ([c9f9bf4](https://github.com/i-doll/rezless/commit/c9f9bf4721397116df127c4749d5bf6f83a60f49))
* **vm:** implement llSignRSA and llVerifyRSA ([4da7bdd](https://github.com/i-doll/rezless/commit/4da7bdd4bd8066b0c59b91e3ade01483b8b7b438))
* **vm:** implement the day length, day offset and region time-of-day reads ([ca626f5](https://github.com/i-doll/rezless/commit/ca626f58d14c8ce057e9070a47872761c9dc4275))
* **vm:** implement the ground, water and wind reads ([ca5a1de](https://github.com/i-doll/rezless/commit/ca5a1deb0e38513c1a725cc959a7d70a1251459e))
* **vm:** implement the object animations ([018c67f](https://github.com/i-doll/rezless/commit/018c67f6a77933abfd4f1683dd107c0c26153e14))
* **vm:** implement the object reads ([0af3ceb](https://github.com/i-doll/rezless/commit/0af3ceb0246ba80784f25957bb9cac1be7bdf5ec))
* **vm:** implement the prim and material reads ([e47899a](https://github.com/i-doll/rezless/commit/e47899a919f0c3da5f566950cfc60cce30fa2f49))
* **vm:** implement the region reads ([db247f8](https://github.com/i-doll/rezless/commit/db247f8498959c2bc9e624382af49796f38b1c59))
* **vm:** implement the script start and event-delay reads ([1a72df4](https://github.com/i-doll/rezless/commit/1a72df43c888128388549d5cda2c8723385a5822))
* **vm:** implement the sun and moon reads ([154a83e](https://github.com/i-doll/rezless/commit/154a83e8163efdba747d003f45e7b26587ff6f75))
* **vm:** model avatar animations and overrides ([731bab6](https://github.com/i-doll/rezless/commit/731bab63a62260341c7aa6a8354b4a28ba1a175b))
* **vm:** read touch coordinates, with a keypad example ([67a83f0](https://github.com/i-doll/rezless/commit/67a83f06b5181fb8ed4aaf88975df70f9765402b))
* **vm:** record pathfinding characters and deliver path updates ([4cf00ad](https://github.com/i-doll/rezless/commit/4cf00adb8a8180b9aaa9a7a93171ff1f7152e989))
* **vm:** route touches through a linkset like Second Life ([04d35e0](https://github.com/i-doll/rezless/commit/04d35e0d6b42452b2da4d7dc7934230ead630a3b)), refs [#148](https://github.com/i-doll/rezless/issues/148)
* **vm:** show and answer llDialog and llTextBox, with a menu example ([fc13b69](https://github.com/i-doll/rezless/commit/fc13b69f84fc047c3d05d901dc8c19da0725f273))


### Bug Fixes

* aim seated cameras along the focus direction ([570063c](https://github.com/i-doll/rezless/commit/570063c40a67a9333c4dc2df79c0bb4a8a6487da))
* bound settling and preserve queued collisions ([2100456](https://github.com/i-doll/rezless/commit/2100456acf215f43f39fe92ed5ca0cf21a7927d9))
* preserve attachment lifecycle and transfer restrictions ([2c5366c](https://github.com/i-doll/rezless/commit/2c5366c6b33643feba6964e4fe055b5e4d739b96))
* preserve detach suspension across time advances ([233e802](https://github.com/i-doll/rezless/commit/233e802163e7ad2c6000dcb82797f3751f8e31d1))
* preserve keyframed motion across linking and inventory snapshots ([e3d023d](https://github.com/i-doll/rezless/commit/e3d023df7b7d5b08411f794d3ffe1a7a632c41d7))
* query inert inventory assets in script controls ([8904433](https://github.com/i-doll/rezless/commit/890443317ee21b37899ce9aacd1949e51237d077))
* reject link zero on occupied lone camera seats ([670339f](https://github.com/i-doll/rezless/commit/670339f38d1487aa1e32b04c67dcff321c8feb8c))
* resolve live sensor linkset after linking changes ([c879f96](https://github.com/i-doll/rezless/commit/c879f964f192ba01de85b6ecfacb472ac84795e2))
* resolve offline friends from the local owner fixture ([62fb686](https://github.com/i-doll/rezless/commit/62fb6869db16490aadb1edcbf03e66cd57805d11))
* respect avatar presence in attachment fixtures ([4887a96](https://github.com/i-doll/rezless/commit/4887a96ba9c16a1341e799d41f2c69d57d42e4e3))
* restart the compass timer when permissions return while worn ([12b9736](https://github.com/i-doll/rezless/commit/12b97361af1727207e74d369d3fe7a273cc2cb55))
* share seated camera pose with HUD projection ([c0f61ac](https://github.com/i-doll/rezless/commit/c0f61ac1fa94db66acefd7e34f765d1a783ae0d2))
* stabilize target motion integration and rez ownership ([95ee128](https://github.com/i-doll/rezless/commit/95ee128049bca3044e1c832a09f29b3bee21e909))
* stop settling handlers suspended by detach ([6ad86b2](https://github.com/i-doll/rezless/commit/6ad86b2c56484a54658413dcc9177451b38157ac))
* synchronize seated avatars and restrict home teleport authority ([bd4b783](https://github.com/i-doll/rezless/commit/bd4b783832ce7b9c23f4444241658972d705c15c))
* synchronize temporary object expiration with flag changes ([951652e](https://github.com/i-doll/rezless/commit/951652eca2dc4c66e48d267e79a166893cdfe8f0))
* validate inventory transfers and normalize recipient keys ([5d611c3](https://github.com/i-doll/rezless/commit/5d611c31431784a128ed4aec322c3803112386d0))
* **vm:** accept RSA keys whose size is not a whole number of bytes ([0e8516a](https://github.com/i-doll/rezless/commit/0e8516a09f4900e81eadd471118a73944b0c8739))
* **vm:** cap merged linkset data, count broken-off URLs and skip stopped scripts on link changes ([c5184ee](https://github.com/i-doll/rezless/commit/c5184ee55180f21a403ae2084f57e1c0d8021dd8))
* **vm:** count broken-off prims' scripts in the region's active script count ([c3d2044](https://github.com/i-doll/rezless/commit/c3d2044b8e680ac16bc374401c3056781373aa9e))
* **vm:** count free URLs per region and release a removed script's URLs ([c085c22](https://github.com/i-doll/rezless/commit/c085c221ccec2657030e1f97cd242263680b8a0e))
* **vm:** decode incoming bodies as Second Life does ([4101b9d](https://github.com/i-doll/rezless/commit/4101b9d173cc4fcea1913e6b31d2b1fd60fcb65d))
* **vm:** find unkeyed prims and drop deleted objects from key lookups ([3682844](https://github.com/i-doll/rezless/commit/3682844b7d2138d7e6015de12fac28bd356c0d31))
* **vm:** fold inventory permissions into OBJECT_PERMS_COMBINED ([fcb6f0b](https://github.com/i-doll/rezless/commit/fcb6f0b61a8105c273826b7de2e54c03b1361bb4))
* **vm:** grant the experience permissions to the script when an experience is accepted ([50820f1](https://github.com/i-doll/rezless/commit/50820f1543f925e2fbebba030d4d7a419771eb9d))
* **vm:** handle empty \Q\E, U+FEFF and inherited names in notecard search ([6d28fd9](https://github.com/i-doll/rezless/commit/6d28fd971a91a85e22979f22c41fa8bb655fd52f))
* **vm:** look up built-in animations by own name and match keys in any case ([dc71719](https://github.com/i-doll/rezless/commit/dc7171973ee7017e61a2296716ba26bd84cf39b9))
* **vm:** make llGetTimeOfDay follow the region's day length and offset ([bf40b04](https://github.com/i-doll/rezless/commit/bf40b049683d9e7ccebd3565cb7732fe57e5f7a4))
* **vm:** measure hole shapes and taper direction in prim volume ([ebd66c3](https://github.com/i-doll/rezless/commit/ebd66c325d0c6e12bf81498cf1e7293305d20cce))
* **vm:** preserve combat lifecycle and parcel settings ([531867a](https://github.com/i-doll/rezless/commit/531867a0fc1033a4b0aea18d863211402f57852f))
* **vm:** release controls when permission is lost and dequeue control events ([026f9ab](https://github.com/i-doll/rezless/commit/026f9abdef01bbe9cb7e3275d7ee7f8088196b1e))
* **vm:** resolve animation stop inventory names before UUIDs ([50a4a9c](https://github.com/i-doll/rezless/commit/50a4a9c63864ea1db69bd62ffcecaca8dab24eba))
* **vm:** start prims at no health and normalise the spin axis ([0815f1b](https://github.com/i-doll/rezless/commit/0815f1bfe78531e2a2bfcb8920e0caf24e62b9a6))
* **vm:** stop llKeysKeyValue before the answer passes 4097 bytes ([751354c](https://github.com/i-doll/rezless/commit/751354cb9f157b44a255c1764ead07e7e45d94f6))
* **vm:** support case classes, word anchors and any-case keys in notecard search ([2f827e6](https://github.com/i-doll/rezless/commit/2f827e6640006661b510f40688fca5fbc1ca04fa))
* **vm:** take the longest notecard match and locate matches in linear time ([2b60b62](https://github.com/i-doll/rezless/commit/2b60b62bdcd8ba21408be08a042626ab7632a490))
* **vm:** time a held touch from the click and skip stopped scripts at release ([b1e4cb3](https://github.com/i-doll/rezless/commit/b1e4cb3882ba9044b3d62b31b36a24da898a00d6))

## [0.7.0](https://github.com/i-doll/rezless/compare/v0.6.2...v0.7.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **vm:** advanceTime(ms) now ends exactly ms later. A handler that sleeps past that point stays asleep and resumes on a later advanceTime; before, its sleep moved the clock past the horizon. Tests that relied on one advanceTime covering a sleep must advance further.

### Features

* **vm:** let other scripts run while a script sleeps ([686cd68](https://github.com/i-doll/rezless/commit/686cd68f43b847b526e7f0d5d4db9b01d8fc43fc)), refs [#142](https://github.com/i-doll/rezless/issues/142)


### Bug Fixes

* match Second Life string casts, print and for loops ([2227c3f](https://github.com/i-doll/rezless/commit/2227c3f53dbc0d8abfba62b5b4669b2c4d371ed5))
* **vm:** fail print(key) like Mono and apply the zero rule to list vectors ([26b6ce1](https://github.com/i-doll/rezless/commit/26b6ce16da0910a0e78f5ac825e7e0e10bb144c0))
* **vm:** format list floats like casts and normalise JSON -0 ([4232f1d](https://github.com/i-doll/rezless/commit/4232f1d316975303e2158dae3d48e305a702fa15))
* **vm:** halt a script at once when it removes itself ([4d7913d](https://github.com/i-doll/rezless/commit/4d7913d082ebbbe2872425f35aac4e2866ff4afd)), refs [#142](https://github.com/i-doll/rezless/issues/142)
* **vm:** halt a script that called llDie at its next builtin or loop iteration ([659a4f5](https://github.com/i-doll/rezless/commit/659a4f501e0363c6fb060a0042e672882d791877)), refs [#142](https://github.com/i-doll/rezless/issues/142)
* **vm:** keep inventory texture names as given and validate llSetLinkTexture ([bd3c005](https://github.com/i-doll/rezless/commit/bd3c005432d48fb928c69d30696a978bffd48c05))
* **vm:** keep NaN text alpha and colour instead of ignoring the PRIM_TEXT rule ([23512c1](https://github.com/i-doll/rezless/commit/23512c1e8e3ff235f8dc57b9047f4a7f1276c73b))
* **vm:** keep raw JSON tokens and sort rebuilt objects in llJsonSetValue ([06abaed](https://github.com/i-doll/rezless/commit/06abaed748d5256fa037cfbabfc1b9d40ceeacba))
* **vm:** let llOwnerSay run after a script removes itself ([96de8fe](https://github.com/i-doll/rezless/commit/96de8fe2200bfc28d4a4d0215a3582de88f5b507))
* **vm:** match measured cast, CSV and print(key) behaviour ([bd0270f](https://github.com/i-doll/rezless/commit/bd0270f9f29588541ab52182738bf6a9795365b0))
* **vm:** match measured glTF texture names, material names and empty legacy maps ([54cda5e](https://github.com/i-doll/rezless/commit/54cda5e1381340da126db471903a68b3819d8339))
* **vm:** match measured llHash, llListFindListNext and JSON specifiers ([8e4f998](https://github.com/i-doll/rezless/commit/8e4f998fe18f035207ce56f3482be7612a66a214))
* **vm:** match measured missing-item errors, negative faces and PRIM_TEXT bounds ([e60c027](https://github.com/i-doll/rezless/commit/e60c027795bdc0b1e136aa12e9d35791618be313))
* **vm:** match Second Life JSON, list search and linkset data edge cases ([df160d5](https://github.com/i-doll/rezless/commit/df160d528dc9c5df832486078501d4adc8b82bc5))
* **vm:** match Second Life listen, pause, link-key and inventory behaviour ([0ef54f8](https://github.com/i-doll/rezless/commit/0ef54f84e9350d0f85f30cd06157a529d18c2ca6))
* **vm:** match Second Life math, string and base64 edge cases ([ebd0b36](https://github.com/i-doll/rezless/commit/ebd0b369b3625c4a1172c44f5e40af149f8174c2))
* **vm:** match Second Life prim text, names, physics material and defaults ([b4563e6](https://github.com/i-doll/rezless/commit/b4563e69ba9a34185a0302d91a50940456fd214e))
* **vm:** match Second Life texture names and legacy material ranges ([aa50fc4](https://github.com/i-doll/rezless/commit/aa50fc4d93694053630606c49ff7a390dcce5c29))
* **vm:** model unset glTF overrides and implement llSetLinkGLTFOverrides ([45ad2fb](https://github.com/i-doll/rezless/commit/45ad2fbbfb4435f6ca8338f4c1c5f0c2aea986e6)), refs [#144](https://github.com/i-doll/rezless/issues/144)
* **vm:** read an unset material or map as NULL_KEY whatever the prim holds ([b26f6f6](https://github.com/i-doll/rezless/commit/b26f6f6eb65e177795c5097e0af6cb1e9db170c8))
* **vm:** read an unset prim text with alpha 1.0 ([ae65da4](https://github.com/i-doll/rezless/commit/ae65da496580e9315a439acf33eb0bdf9e508b06))
* **vm:** read empty JSON array slots as empty strings, including a trailing comma ([1eca94f](https://github.com/i-doll/rezless/commit/1eca94fda7a39a16dd78e6567c38a002ea091285))
* **vm:** reject wrong-typed glTF override calls, clamp overrides, ignore empty legacy maps ([e5ce777](https://github.com/i-doll/rezless/commit/e5ce777f493027d36f89ef6c0b6890ce46a17c9f))
* **vm:** release frames when a suspended handler is abandoned ([4fbde6f](https://github.com/i-doll/rezless/commit/4fbde6fc66ba636d4ab6343a92d041082d5afcfb)), refs [#142](https://github.com/i-doll/rezless/issues/142)
* **vm:** resolve texture names in the calling prim and store asset keys ([cd9ef1a](https://github.com/i-doll/rezless/commit/cd9ef1a7d36aa577b3986ae722037640db58fb3c))
* **vm:** wait for whole handler chains, and match measured self-reset and NaN sleeps ([ab22418](https://github.com/i-doll/rezless/commit/ab22418f13814ca1db954484a3e04c9b9e7cb6db)), refs [#142](https://github.com/i-doll/rezless/issues/142)
* **vm:** wait only for handlers a reply starts, and keep a dying script dead ([be12f5d](https://github.com/i-doll/rezless/commit/be12f5dca8d6ca288a94f470bc561e660fb67bba)), refs [#142](https://github.com/i-doll/rezless/issues/142)

## [0.6.2](https://github.com/i-doll/rezless/compare/v0.6.1...v0.6.2) (2026-10-30)


### Bug Fixes

* **vm:** drop a leading space from the first llCSV2List item ([0c961c8](https://github.com/i-doll/rezless/commit/0c961c827b23889658fc75eef90b2f36d8130504)), refs [#135](https://github.com/i-doll/rezless/issues/135)
* **vm:** keep the sign of a negative zero in (string) ([cd37e17](https://github.com/i-doll/rezless/commit/cd37e17c61a1a1729988ef2ae9bbd06d03e1ef63)), refs [#137](https://github.com/i-doll/rezless/issues/137)
* **vm:** return an empty string from llList2Key for non-keys and past the end ([26769dc](https://github.com/i-doll/rezless/commit/26769dc804a198d5a395f53d54e9be2e010bf525)), refs [#136](https://github.com/i-doll/rezless/issues/136)

## [0.6.1](https://github.com/i-doll/rezless/compare/v0.6.0...v0.6.1) (2026-10-30)

## [0.6.0](https://github.com/i-doll/rezless/compare/v0.5.0...v0.6.0) (2026-10-30)


### Features

* **vm:** estimate script memory and raise Stack-Heap Collision ([543427f](https://github.com/i-doll/rezless/commit/543427ff22b67f0b6d56c242dc8a62a54a2da1e0))
* **vm:** make the Stack-Heap Collision opt-in with memoryLimit: true ([cb9feb2](https://github.com/i-doll/rezless/commit/cb9feb219e43da86920504e29c31b71a08d797bb))


### Bug Fixes

* **vm:** charge function locals and parameters at their measured sizes ([17abaa5](https://github.com/i-doll/rezless/commit/17abaa50ccb2436b35a5a33fa3731f75641c8edb))
* **vm:** free block locals on jumps and enforce the limit on code alone ([7bc6bd6](https://github.com/i-doll/rezless/commit/7bc6bd6860742a7018a992f44371b25058d87dc5))
* **vm:** keep crashed and failed scripts from running or lingering ([157069c](https://github.com/i-doll/rezless/commit/157069c9314c5bca1defa63981204c8e34e96a2a))
* **vm:** release event parameters and stop the script on reset collisions ([84458a0](https://github.com/i-doll/rezless/commit/84458a00018633f0adc646d542c686889e13bbf0))

## [0.5.0](https://github.com/i-doll/rezless/compare/v0.4.0...v0.5.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* request keys from llHTTPRequest, llRequestAgentData, llGetNotecardLine and friends are now UUIDs instead of http-req-NNNNNNNN / data-req-NNNNNNNN, and http_response / dataserver replies reach every script in the prim. Tests that pinned the old key format need updating.

### Features

* chat between linksets across regions in a World ([90a8670](https://github.com/i-doll/rezless/commit/90a8670dc716e97fe8236e2fee58266fa5adb173))
* **vm:** implement the stubbed list, rotation, permission and inventory functions ([9a2d17d](https://github.com/i-doll/rezless/commit/9a2d17d91c1195ff9c1be154f2e359fb2bb16326))
* **vm:** route script chat to listens in other prims ([14fc93d](https://github.com/i-doll/rezless/commit/14fc93df6a72cf981edf24d0daca1f5c8c40b758))


### Bug Fixes

* match Second Life behaviour measured in-world ([7af6410](https://github.com/i-doll/rezless/commit/7af64101bcc32993ef9dc4e022d8ad5b46ee4900))
* **vm:** address Codex review on the SL parity changes ([bb970eb](https://github.com/i-doll/rezless/commit/bb970eb066526d29cca8d43d646b682298c4adc0))
* **vm:** address second Codex review and model HTTP_EXTENDED_ERROR ([444c3c5](https://github.com/i-doll/rezless/commit/444c3c51fb7cef99d38b902c0b40e279ce7d6248))
* **vm:** clear near-zero half-angle terms in llEuler2Rot ([d096340](https://github.com/i-doll/rezless/commit/d096340dd371f4d60a62e6ef60e449d7dfd4bf56))
* **vm:** discard unanswered permission requests on llResetScript ([aff490c](https://github.com/i-doll/rezless/commit/aff490ccb47191c934da1304ef2ac375b6f0b1c3))
* **vm:** match more of Second Life's linkset data regex dialect ([d45b7c9](https://github.com/i-doll/rezless/commit/d45b7c994dce97f34af0d5d5f963db3787dacdbb))
* **vm:** match Second Life inventory order, linkset data bytes and linkset scale limits ([5a2900c](https://github.com/i-doll/rezless/commit/5a2900ce91ce96a9903a2d6229e53c6978c86f05))
* **vm:** match Second Life's inventory tie order and script names ([a9b9c39](https://github.com/i-doll/rezless/commit/a9b9c39274c4233c3b4e8e83218b49df8f26a706))
* **vm:** match Second Life's llRotBetween axis for opposite vectors ([0d20ac8](https://github.com/i-doll/rezless/commit/0d20ac8aa6297d14fafafef44462459cf0f099c0))
* **vm:** normalise the rotation in llRot2Euler ([68f7ec6](https://github.com/i-doll/rezless/commit/68f7ec6df93d9c48b2b5829071c51aef93bc7a33))
* **vm:** reject negative llList2ListSlice strides and clear permissions on reset ([dbfc984](https://github.com/i-doll/rezless/commit/dbfc984245fdc0390cccc77b4bb5060d083a8465))
* **vm:** size face storage by shape and keep face values by role ([101d943](https://github.com/i-doll/rezless/commit/101d9439ae57858d287ac8dc5f8628890a3a4056))
* **vm:** stop removed scripts at handler boundaries and handle gimbal lock ([f71110b](https://github.com/i-doll/rezless/commit/f71110b4065ad470a318185d4c9bb72e15866f09))
* **vm:** time llGetTime from script creation and reset ([30502a7](https://github.com/i-doll/rezless/commit/30502a7db0d7c0dc6bd0cc7e5a90a030ff85b6a7))
* **vm:** treat \xHH in linkset data patterns as one UTF-8 byte ([27b984d](https://github.com/i-doll/rezless/commit/27b984d33722c640520f7de0365bb9d187e3dc92))

## [0.4.0](https://github.com/i-doll/rezless/compare/v0.3.0...v0.4.0) (2026-10-29)


### ⚠ BREAKING CHANGES

* event parameter names follow the official definitions, so s.fire() payload keys change for 9 events (e.g. listen `message` -> `msg`, changed `change` -> `changes`, http_request `id` -> `request_id`).

### Features

* generate LSL tables from secondlife/lsl-definitions ([2c2cf32](https://github.com/i-doll/rezless/commit/2c2cf32acf56b3329d9e6d431149a4285baad647))

## [0.3.0](https://github.com/i-doll/rezless/compare/v0.2.0...v0.3.0) (2026-10-29)


### Features

* **vm:** drive llGetUnixTime, llGetTimestamp and llGetDate from the virtual clock ([55eee10](https://github.com/i-doll/rezless/commit/55eee104292c0312a2e54cd3e5ba4c25f51dceaa)), refs [#58](https://github.com/i-doll/rezless/issues/58)
* **vm:** implement llGetListEntryType ([4fbae15](https://github.com/i-doll/rezless/commit/4fbae15310d23e8ad179bdf8c792555ce8761fed))
* **vm:** implement llList2CSV ([3bb3a48](https://github.com/i-doll/rezless/commit/3bb3a48cee7145a2a680cac6fe7fd607286f828d)), refs [#68](https://github.com/i-doll/rezless/issues/68)
* **vm:** implement llListSort and llParseStringKeepNulls ([90ba0ec](https://github.com/i-doll/rezless/commit/90ba0ec534bd12609c250c9f4961a1753257eb0d)), refs [#57](https://github.com/i-doll/rezless/issues/57)
* **vm:** implement llXorBase64 ([cc5820e](https://github.com/i-doll/rezless/commit/cc5820ef55bb6e0f9df6f5a584703b9def2306b4)), refs [#67](https://github.com/i-doll/rezless/issues/67)
* **vm:** type-check scripts at load time to match SL's compiler ([b6778f4](https://github.com/i-doll/rezless/commit/b6778f473cdda78995d774c86aa45775651bc269))


### Bug Fixes

* adapt to Vitest 5 matcher types and bump coverage provider ([86fbd5e](https://github.com/i-doll/rezless/commit/86fbd5ef210a9ef7b7dc60ef54f9776a8bf1b6ae))
* **parser:** accept a cast as the operand of a unary operator ([bdbcfd5](https://github.com/i-doll/rezless/commit/bdbcfd541e14dcbcc614a77cd532b030b02b1363)), refs [#55](https://github.com/i-doll/rezless/issues/55)
* **parser:** accept empty statements and reject declarations as unbraced bodies ([5c98717](https://github.com/i-doll/rezless/commit/5c98717209bb098ff5a462b3714a1784f3d08351)), refs [#70](https://github.com/i-doll/rezless/issues/70)
* **parser:** accept quaternion as a type name for rotation ([a741242](https://github.com/i-doll/rezless/commit/a741242816f46e4c9ebe2bf8899cee4fe56fbcb5)), refs [#76](https://github.com/i-doll/rezless/issues/76)
* **parser:** only cast postfix expressions and negative literals ([90c68c6](https://github.com/i-doll/rezless/commit/90c68c69d41cd11f15bf11455e78bb345a41ec29)), refs [#80](https://github.com/i-doll/rezless/issues/80)
* **parser:** parse &gt; inside vector and rotation literals like Second Life ([e994f64](https://github.com/i-doll/rezless/commit/e994f6472d75e00fd951195ed49f5cee1d2ea94c)), refs [#77](https://github.com/i-doll/rezless/issues/77)
* **parser:** read \t as four spaces and accept L"..." strings ([fc2c1fb](https://github.com/i-doll/rezless/commit/fc2c1fb897484ce78b836229b8594a22811842cb)), refs [#75](https://github.com/i-doll/rezless/issues/75)
* **parser:** read integer overflow and float F suffix like Second Life ([320442d](https://github.com/i-doll/rezless/commit/320442d5a9826eeac232a5bde981a5870fcfeac0)), refs [#74](https://github.com/i-doll/rezless/issues/74)
* **parser:** read print after &gt; in a literal's last component as an operand ([b1a9749](https://github.com/i-doll/rezless/commit/b1a9749eff70facc420df462bd1f66d38ebf7a52))
* **parser:** reject event names in expressions and state changes ([7c46dc1](https://github.com/i-doll/rezless/commit/7c46dc1ded0e04509f915005f3e69c08f4f7dc4a))
* **parser:** reject event names used as identifiers ([9f5f192](https://github.com/i-doll/rezless/commit/9f5f1928cfff1431cedb565208b77d7aa5941699)), refs [#54](https://github.com/i-doll/rezless/issues/54)
* **parser:** reject unary + ([72545f4](https://github.com/i-doll/rezless/commit/72545f40a051421fb9bb2b5454add54e7c478d64)), refs [#73](https://github.com/i-doll/rezless/issues/73)
* **parser:** round float literals to 32 bits ([2bbb970](https://github.com/i-doll/rezless/commit/2bbb970f37a4b26cfcbb9067fb04c2609155596c)), refs [#89](https://github.com/i-doll/rezless/issues/89)
* **parser:** support the print keyword and reserve event and print ([69d1e14](https://github.com/i-doll/rezless/commit/69d1e14e26d76986d890ce880f348b8b13559450)), refs [#72](https://github.com/i-doll/rezless/issues/72)
* **vm:** close more gaps between the type checker and SL's compiler ([cd5725f](https://github.com/i-doll/rezless/commit/cd5725f87a1c463bc2d65f8de0abec94b2e86941))
* **vm:** halt when a list is used as a list element ([c7ed779](https://github.com/i-doll/rezless/commit/c7ed779d1d330920a03eb8a2faf62068f9b444b7)), refs [#81](https://github.com/i-doll/rezless/issues/81)
* **vm:** keep &lt;&gt; together in llCSV2List and match its space and empty-string rules ([23d9e25](https://github.com/i-doll/rezless/commit/23d9e25447e5b13b8dd61839e32df31f39aecc86)), refs [#59](https://github.com/i-doll/rezless/issues/59)
* **vm:** look up builtins, constants and events by own keys only ([6e38a3c](https://github.com/i-doll/rezless/commit/6e38a3c7e151b4240fbbc0d66633497375c133b6))
* **vm:** match element types in llListFindList ([a515146](https://github.com/i-doll/rezless/commit/a515146da939d5a877aaee48ebc5f0c6a4158080)), refs [#56](https://github.com/i-doll/rezless/issues/56)
* **vm:** match more of SL's compile-time checks in the type checker ([3682263](https://github.com/i-doll/rezless/commit/36822635807fc6289989c291d403db3a270d5ce1))
* **vm:** pass startUnixTime through loadLinkset and wrap llGetUnixTime to 32 bits ([ff500eb](https://github.com/i-doll/rezless/commit/ff500ebf13e06f629b0ca9d727125ff13a135109))
* **vm:** print whole floats as floats in llList2CSV and llDumpList2String ([197f0f4](https://github.com/i-doll/rezless/commit/197f0f4461b6f816d2428158e6a589d56ea70ad7))
* **vm:** promote integers to 32-bit floats before builtin calls and vector scaling ([d7a4ac5](https://github.com/i-doll/rezless/commit/d7a4ac57090fd09958b1ed972a3cf9a46642338b))
* **vm:** put labels in the variable namespace and reject non-function calls ([b2d2d77](https://github.com/i-doll/rezless/commit/b2d2d774a65c089efc09ace1c6399fbc4b651c7a))
* **vm:** record element types on lists returned by builtins ([c012e07](https://github.com/i-doll/rezless/commit/c012e07266c72e811e6f61cdd5caef92ddd27f4d)), refs [#103](https://github.com/i-doll/rezless/issues/103)
* **vm:** reject calls to undeclared functions and let declared ones return values ([3a26188](https://github.com/i-doll/rezless/commit/3a261885459f8c5c81ef641c2cc5d1a67b93b6b0)), refs [#69](https://github.com/i-doll/rezless/issues/69) [#79](https://github.com/i-doll/rezless/issues/79)
* **vm:** reject declared functions that clash with script names ([35fcb2a](https://github.com/i-doll/rezless/commit/35fcb2a3dd340e1c3826827d51751b2e4c6c86bd))
* **vm:** reject logical ! on non-integer operands (SL parity) ([9ca325d](https://github.com/i-doll/rezless/commit/9ca325d9f50598e5e65fca43d152aaf780d1c07e)), refs [#52](https://github.com/i-doll/rezless/issues/52)
* **vm:** reject reading a component of a constant ([b94966d](https://github.com/i-doll/rezless/commit/b94966d155514c2bb4787593ee8ab6a51e2f0884)), refs [#71](https://github.com/i-doll/rezless/issues/71)
* **vm:** round computed floats to 32 bits ([054ba9f](https://github.com/i-doll/rezless/commit/054ba9feedc57454f21db2ae886f92d95164863a)), refs [#96](https://github.com/i-doll/rezless/issues/96)
* **vm:** round float constants and global vector literals, promote ints in == ([6919ac4](https://github.com/i-doll/rezless/commit/6919ac4b73542bbc2f98320893b5b69dc66888ae))
* **vm:** sort llListSort strings by code point ([d9bbcf2](https://github.com/i-doll/rezless/commit/d9bbcf288b61cf22849f4c02c7167f464194e1c7))
* **vm:** spell nan and inf the LSL way in llList2CSV and llDumpList2String ([2852f1d](https://github.com/i-doll/rezless/commit/2852f1dc9216a10d09e8a1d133259c395178b4d0))
* **vm:** stop clamping out-of-range indexes in list range functions ([a49e60f](https://github.com/i-doll/rezless/commit/a49e60faca7b56638ad42735e37af506a6276c81)), refs [#64](https://github.com/i-doll/rezless/issues/64)
* **vm:** store a negative specular rotation as 0 and the colour in 8 bits ([8467b53](https://github.com/i-doll/rezless/commit/8467b53a8cbbbb60cc994b53ce62fce4d8fb2195))
* **vm:** use SL's message for a bare return in a typed function ([7f0b5e6](https://github.com/i-doll/rezless/commit/7f0b5e6d0f1eab329ce90c9be312011723b24695))
* **vm:** wrap negated integers in global initialisers to 32 bits ([5ebe75e](https://github.com/i-doll/rezless/commit/5ebe75ed2cd6dc8c5fdfe908ca880535aedb5a09))
* **vm:** wrap negated integers in global vector and rotation components ([840c889](https://github.com/i-doll/rezless/commit/840c889ed903c38993a121f08158cd36926497a3))


### Performance Improvements

* **test:** disable vitest per-file isolation ([97ee0d7](https://github.com/i-doll/rezless/commit/97ee0d755e502585dae03fc36c6c1dc1a33f830e))

## [0.2.0](https://github.com/i-doll/rezless/compare/v0.1.2...v0.2.0) (2026-06-03)


### Features

* **vm:** implement llGetOwnerKey ([cff69b3](https://github.com/i-doll/rezless/commit/cff69b3fe234c1185b7a8e82654278447a46b7dd))


### Bug Fixes

* **vm:** canonicalize keys in llGetOwnerKey lookup ([4fc60ba](https://github.com/i-doll/rezless/commit/4fc60ba39e5079a00c9ffb119837275f95b1fcea))
* **vm:** carry value in UPDATE event when WriteProtected is effectively unprotected ([5e4666c](https://github.com/i-doll/rezless/commit/5e4666c5e4ad24d455a42ecd8de9e48b77f0bb9f)), refs [#43](https://github.com/i-doll/rezless/issues/43)
* **vm:** emit deleted-key CSV in linkset_data MULTIDELETE event ([9ec4900](https://github.com/i-doll/rezless/commit/9ec4900c9ac33048f5405f0e4288d0da3b0709c5)), refs [#43](https://github.com/i-doll/rezless/issues/43)
* **vm:** pass value through linkset_data UPDATE event for unprotected writes ([235e40d](https://github.com/i-doll/rezless/commit/235e40d97de5fbae667ff44a6acc904606e5a06c)), refs [#43](https://github.com/i-doll/rezless/issues/43)
* **vm:** short-circuit NULL_KEY in llGetOwnerKey ([2db450a](https://github.com/i-doll/rezless/commit/2db450abd5ab01f1fe6f0d53c0a95eedf9e9e19f))
* **vm:** sort MULTIDELETE keys in ASCII-lex order (SL parity) ([9bdeb9d](https://github.com/i-doll/rezless/commit/9bdeb9d5edc0a8e2abb13ec770635c3d0718901b)), refs [#43](https://github.com/i-doll/rezless/issues/43)
* **vm:** strictly partition protected linkset-data entries ([3f79da3](https://github.com/i-doll/rezless/commit/3f79da3407cd72c5bea2413717237af37de0bdad)), refs [#43](https://github.com/i-doll/rezless/issues/43)

## [0.1.2](https://github.com/i-doll/rezless/compare/v0.1.1...v0.1.2) (2026-05-06)


### Bug Fixes

* **release:** publish via npm OIDC instead of pnpm publish ([4d02998](https://github.com/i-doll/rezless/commit/4d0299806e09c17bdbc13a73c7ca7a05299cb31b))

## [0.1.1](https://github.com/i-doll/rezless/compare/v0.1.0...v0.1.1) (2026-05-06)


### Bug Fixes

* **vm:** keep numeric LSL strings quoted in llList2Json (BUG-6284) ([a9a49ed](https://github.com/i-doll/rezless/commit/a9a49ed63d511860ef7fe22471673a97d665d245)), refs [#39](https://github.com/i-doll/rezless/issues/39)

## 0.1.0 (2026-05-03)


### Features

* add LSL script coverage (statement, branch, function, state) ([3e5fd46](https://github.com/i-doll/rezless/commit/3e5fd4638589f6134fd5be3e0f012025d0c44b14))
* **constants:** export the full LSL constant surface ([c38bf8d](https://github.com/i-doll/rezless/commit/c38bf8d9f049398d2a252348d7bbafbda40aaa35))
* **linksetdata:** implement LSD builtins, event, and scoreboard example ([0bd846a](https://github.com/i-doll/rezless/commit/0bd846afc18bbfdeac067f0d748ea734e1ffe7f7))
* phase 0+1 — workspace skeleton, kwdb codegen, hello-world e2e ([4eba9c1](https://github.com/i-doll/rezless/commit/4eba9c1ca6b1c41e34160486270e1a6ae3b830d7))
* phase 0+1 — workspace skeleton, kwdb codegen, hello-world e2e ([ccbe974](https://github.com/i-doll/rezless/commit/ccbe974ef2de127b036e64a6e4a65f3aff55b5f6))
* **phase-2:** multi-state, jump/labels, user functions, payload binding ([090ab02](https://github.com/i-doll/rezless/commit/090ab02525dfeeecade662b5772a23f880c34c8c))
* **phase-2:** variables, operators, types, control flow ([561edcb](https://github.com/i-doll/rezless/commit/561edcbc8543b24c1482663d1023d8cbeb89549e))
* **phase-3:** hashes, base64, llSetText, llDie, llResetScript ([d9c0475](https://github.com/i-doll/rezless/commit/d9c0475f3c89b1c5fb4e49e30ccabfb2fca6ddcb))
* **phase-3:** linked messages, dataserver, llDetected* ([ef8b8e4](https://github.com/i-doll/rezless/commit/ef8b8e48e9134223c22c6d8b7edff71ca27409a2))
* **phase-3:** llHTTPRequest + http_response, kwdb constants in scope ([331e488](https://github.com/i-doll/rezless/commit/331e488e9c1cb9aaf8e4ec745aef6fbceb7e3f3b))
* **phase-3:** llListen + llListenRemove + llListenControl, deliverChat ([0384a17](https://github.com/i-doll/rezless/commit/0384a17704856e3af32a38a1538dfe8563328f66))
* **phase-3:** math, strings, lists, identity, seeded llFrand ([9e73f97](https://github.com/i-doll/rezless/commit/9e73f97f14fd8f38d28a19155e9696297ae50b83))
* **phase-3:** virtual clock, llSetTimerEvent, llSleep, llGetTime ([4b8d26a](https://github.com/i-doll/rezless/commit/4b8d26a165c5ab567c4057a80c8c0366c9fb780f))
* **phase-4:** toHaveSentHTTP + toHaveListened matchers, 4 examples, README ([f7a774f](https://github.com/i-doll/rezless/commit/f7a774fe774b1c934bfc5678fb0122fbdf9d011d))
* **release:** auto-tag + auto-release on version bump merged to main ([e61e8a2](https://github.com/i-doll/rezless/commit/e61e8a23f151b473384268190da791a65a3ae744))
* **vitest:** auto-activate on --coverage, fix worker dump timing, add HTML ([eb5199e](https://github.com/i-doll/rezless/commit/eb5199eb17b24f632b401f86befb07baa8a07892))
* **vitest:** lslvm-coverage CLI + group reports by (filename, source) ([24ecfb0](https://github.com/i-doll/rezless/commit/24ecfb012a3658ce96ff533cd6563a76536df61a))
* **vm:** implement llJson* and llList2Json builtins ([e58e3b4](https://github.com/i-doll/rezless/commit/e58e3b4fcd16f010d534b6ef00343792eccd8e88))
* **vm:** implement llSetPrimitiveParams + alt accessors ([868da9c](https://github.com/i-doll/rezless/commit/868da9caa5b1035510de4e9eb35db25285cc358d))
* **vm:** multi-script per prim and multi-prim linkset support ([dde70fd](https://github.com/i-doll/rezless/commit/dde70fdbecd69a4dfc665aa7f385a6d05a1baf1a))


### Bug Fixes

* address PR review feedback for LSL coverage ([584761e](https://github.com/i-doll/rezless/commit/584761e009fc6b5212ad12c82ce3951a951daf75))
* kwdb constant decoding + jump scoping ([6653d6c](https://github.com/i-doll/rezless/commit/6653d6c40cebe7efc1ef5e304cc9bb28ad2e8afc))
* **linksetdata:** Delete returns NOTFOUND for missing keys, ENOKEY for empty name ([1ac3f23](https://github.com/i-doll/rezless/commit/1ac3f231b4012430528569988e8182eab854bbf5))
* **linksetdata:** empty key name returns ENOKEY, not OK ([1abe314](https://github.com/i-doll/rezless/commit/1abe3143137849a51eb311678d3b5587dc7cfe84))
* **linksetdata:** empty-value Write on missing key returns NOTFOUND ([0e03293](https://github.com/i-doll/rezless/commit/0e0329354f157edf983ab493edfa4e96c319d614))
* **linksetdata:** ReadProtected returns unprotected values regardless of password ([f1fa603](https://github.com/i-doll/rezless/commit/f1fa60313e956f529a84c7ed582bd7687c54d8b7))
* llHMAC returns Base64; drainQueue stops on llDie ([4ba46e0](https://github.com/i-doll/rezless/commit/4ba46e014c0a45f90efa42f55ebab57e7a3e095a))
* **parser:** diagnose bare 0x hex literal instead of emitting NaN ([5a73ebb](https://github.com/i-doll/rezless/commit/5a73ebbc8fd4d083bc67022aa08e7ee4fd45788b))
* **parser:** drop non-standard f/F suffix on numeric literals ([84c79b8](https://github.com/i-doll/rezless/commit/84c79b8495aebd0d5485398605dfcbb00c99a13f))
* **parser:** peek before consuming exponent so 1e doesn't pretend to be a float ([08be634](https://github.com/i-doll/rezless/commit/08be634ba575f1c15655c29a8089cb263f07c96b))
* restore package.json structure after peer-dep edit ([b289be4](https://github.com/i-doll/rezless/commit/b289be44d721a715f8b02881df6fddff2a479c85))
* **vitest:** HTML slug collision, dead lineHits branch, registry doc ([07fe7e2](https://github.com/i-doll/rezless/commit/07fe7e2a5d4e7a99d45c51a878f485c67317ffe9))
* **vitest:** loadLinkset scripts map uses Object.create(null) ([c87f0b4](https://github.com/i-doll/rezless/commit/c87f0b461af5443db1e4381449aca4c99bafa092))
* **vitest:** loadLinkset throws on duplicate script inventory names ([9c633c9](https://github.com/i-doll/rezless/commit/9c633c96646814c95ee2ae4ef0e2b968c9a88834))
* **vitest:** summary aggregate shadow, CLI value-required errors, summary toggle ([16a42a9](https://github.com/i-doll/rezless/commit/16a42a9e778e63e9c75494690eb182cc08d3258f))
* **vm:** add clearLinkedMessages helpers to Script and Linkset ([b5e1da3](https://github.com/i-doll/rezless/commit/b5e1da38bbf4ba60c085094258e173bc1539ea47))
* **vm:** address inline review feedback on prim-params PR ([f20ffa7](https://github.com/i-doll/rezless/commit/f20ffa7c640aab371eaed640b869ad60bb1810ba))
* **vm:** address multi-script review — schedule llResetOtherScript, drop dup catch ([bd19de3](https://github.com/i-doll/rezless/commit/bd19de3b59b298256085de003b5eacc1eaed7d7a))
* **vm:** address prim-params review feedback ([346dd10](https://github.com/i-doll/rezless/commit/346dd10828ee0b76a80dae369a558e61c7b216a9))
* **vm:** centralize ll-builtin delay handling in dispatcher ([b7ec5c4](https://github.com/i-doll/rezless/commit/b7ec5c40590699bb921c033c2caf4d09526884d4))
* **vm:** defaultPrimParams returns fresh vector instances per call ([4b1e627](https://github.com/i-doll/rezless/commit/4b1e627930f6e416f84061a8cc01800be282894c))
* **vm:** inventory acquire-time string + paused-script reset semantics ([4431af6](https://github.com/i-doll/rezless/commit/4431af6d2a4fba51503d78cb0f6b7300ace1d950))
* **vm:** llDie kills every script in the linkset, not just the caller ([71d238a](https://github.com/i-doll/rezless/commit/71d238a402e71b6e50e9709e5b7e6f1f486c7fb0))
* **vm:** llGetInventoryAcquireTime returns ISO 8601 UTC ([f961e2d](https://github.com/i-doll/rezless/commit/f961e2d970dfcec90dff031c379ea47c19a90a52))
* **vm:** llSetScriptState resume realigns timer to avoid catch-up flood ([45228f4](https://github.com/i-doll/rezless/commit/45228f4bdc031e520bb56be764ee27e514a8e1ed))
* **vm:** llSleep advances at least one server frame (~22.22ms) ([1193afe](https://github.com/i-doll/rezless/commit/1193afe7376df543da3a2cb159385a6ff5f5170d))
* **vm:** llSleep(0) and negative values are a no-op ([e009de4](https://github.com/i-doll/rezless/commit/e009de4db03ec49a275e96ee417f7ce07f9e2370))
* **vm:** notecard dataserver events schedule after kwdb throttle delay ([4ccb48c](https://github.com/i-doll/rezless/commit/4ccb48cea2afcac03e15867b773ab1fd4e782dcb))
* **vm:** notecard EOF/NAK semantics, scriptName from loadLinkset, llDie cancels timer ([5666a8b](https://github.com/i-doll/rezless/commit/5666a8b8752b18d2be0f20996f1583f9c5300a55))
* **vm:** pass through numeric LSL strings as bare JSON numbers in llList2Json ([0a91740](https://github.com/i-doll/rezless/commit/0a917403bbe57d4a7588f203cc8b9ee43e29c339))
* **vm:** paused and dead scripts do not generate timer events ([a788766](https://github.com/i-doll/rezless/commit/a7887666fcb71bc79c853615732143ae30ff0b40))
* **vm:** revert PI_BY_TWO in llRot2Euler back to Math.PI / 2 ([7e66466](https://github.com/i-doll/rezless/commit/7e66466392a5ecdff0fac4893b8e132fb3ff00bd))
* **vm:** writePrimType returns null for unknown shape kinds ([9845836](https://github.com/i-doll/rezless/commit/98458363d874019a6dd6fb12a7e9ac9dcab1a3e8))


### Performance Improvements

* **vm:** hoist allScripts() out of Linkset.drainQueue inner loop ([f9636a3](https://github.com/i-doll/rezless/commit/f9636a3863a3f5e277d6cd970f5ebe2fd5ba7d9c))
