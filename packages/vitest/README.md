# rezless

A **Vitest-style test framework for LSL** (Linden Scripting Language).

Tests run in milliseconds, in-process, with a virtual clock and mockable
`ll*` calls — no Second Life or OpenSim dependency.

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript, vm } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'

describe('greeter.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript('./greeter.lsl')
  })

  it('greets a toucher by name', () => {
    s.start()
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'aaa-...', name: 'Alice' }],
    })
    expect(s).toHaveSaid(0, 'Hello, Alice!')
  })

  it('reminds after 60s of silence', () => {
    s.start()
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'Alice' }] })
    expect(s).toBeInState('waiting')
    s.advanceTime(60_000)
    expect(s).toHaveSaid(0, 'Anyone there?')
  })
})
```

## Why

Up to now, the only way to test an LSL script has been to rez it
in-world and exercise it by hand. rezless gives you a real type-checked
TypeScript / Vitest experience with deterministic time, mockable `ll*`
calls, and rich assertions over chat output, state transitions, HTTP
requests, and script globals.

## Packages

| Package | Purpose |
|---|---|
| `@rezless/parser` | Hand-written recursive-descent LSL parser |
| `@rezless/vm` | Tree-walking LSL interpreter, SLua VM (WebAssembly), virtual clock, dispatch |
| `@rezless/vitest` | `loadScript()` + custom matchers |

## Install

### Use it from another project

```sh
pnpm add -D @rezless/vitest vitest
# or: npm i -D @rezless/vitest vitest
```

`vitest` is a peer dependency. Then in your test file:

```ts
import { loadScript } from '@rezless/vitest'
```

### Develop on rezless itself

```sh
pnpm install
pnpm gen          # regenerate ll* stub tables from vendor/lsl_definitions.yaml
pnpm gen:case     # regenerate the llToLower/llToUpper tables from vendor/UnicodeData-2.1.5.txt
pnpm typecheck
pnpm build        # per-package tsc emit
pnpm test
```

## API

### `loadScript(input)` → `Promise<Script>`

```ts
await loadScript('./script.lsl')
await loadScript({
  source: `default { state_entry() { llSay(0, "hi"); } }`,
  filename: 'inline.lsl',         // optional, used in diagnostics
  randomSeed: 42,                 // optional, default 1
  owner: 'aaaa-bbbb-...',         // optional, NULL_KEY default
  startUnixTime: 1700000000,      // optional, Unix time when the virtual clock starts, default 0
  startParameter: 42,             // optional, the start parameter the object was rezzed with, default 0
  startString: 'hello',           // optional, the start string the object was rezzed with, default ""
  objectKey: 'cccc-dddd-...',     // optional, derived from filename
  objectName: 'StarterCube',      // optional, "Object" default
  scriptName: 'greeter',          // optional, derived from filename
  autoGrantPermissions: 'none',   // optional: 'sl', 'none' or (request) => boolean; default is the world's setting. Also a loadLinkset option, per linkset and per script
  functions: {                    // optional, unlisted functions you'll mock
    llNewThing: { returns: 'integer', params: ['string'] },
  },
  stubs: 'warn',                  // optional: 'allow' (default), 'warn' or 'throw' when the script calls a stubbed function
  memoryLimit: true,              // optional, default false: true crashes the script with a Stack-Heap Collision when rezless's rough memory estimate passes the limit
  experience: new Experience({ name: 'Quest' }), // optional: compile the script with an experience; scripts given the same one share its key-value store
})
```

Parse errors and type errors SL would refuse to compile (such as `!` on a key) throw `LslParseError` with `file:line:col` location info.

Calls to functions that aren't built in or defined by the script fail to load, as they do in Second Life. If the script calls a function the LSL definitions don't list yet, declare it in `functions` and give it an implementation with `s.mock`.

### Experience key-value controls

An `Experience` shares its store and request controls across every script given
that instance. Without controls, key-value calls apply immediately and schedule
`dataserver` answers at the current virtual time.

```ts
const experience = new Experience()
experience.failNext(17) // next key-value request answers "0,17" without changing the store
experience.failNext(1, (request) =>
  request.source === 'read_key_value' && request.args[0] === 'score',
) // fail the next matching request; other requests proceed normally

experience.hold()
// Start or drive scripts using this experience: operations and answers now wait.
experience.release(1) // apply and answer the oldest request; keep holding new requests
s.advanceTime(0)      // dispatch its dataserver event
experience.release() // apply and answer all remaining requests, then resume automatic answers
s.advanceTime(0)
```

`failNext` accepts a positive integer XP_ERROR code and an optional predicate over
`{ key, source, args }`, using the same source names and arguments as
`s.dataserverRequests`. Failures are selected when a request arrives; the first
matching failure is consumed once. A held failed request never applies its store
operation. A held successful request reads or changes the store when released,
so competing checked updates see earlier released writes and can answer `0,15`
(`XP_ERROR_RETRY_UPDATE`). `release(count)` accepts a nonnegative integer and
releases at most that many requests in arrival order. Until release, their
`dataserverRequests` entries have `fulfilled: false`. Release schedules answers
at each requesting script's current virtual time; advance each affected linkset
with `advanceTime(0)` to dispatch them to the scripts in its prim.

### `Script` handle

```ts
// Drive events
s.start()                                       // run state_entry of default
s.fire(eventName, payload)                      // payload binds to handler params by spec name
s.advanceTime(ms)                               // advance virtual clock by exactly ms; runs everything due by then
s.deliverChat({ channel, name, key, message })  // fire `listen` on matching active listens
s.respondToHttp(key, { status, body })          // fire `http_response` for a captured llHTTPRequest
s.respondToLastHttp({ status, body })           // same, for the most recent
s.sendHttpRequest(url, { method, headers, body }) // fire `http_request` on a URL from llRequestURL; returns { key, response }
s.grantUrls() / s.denyUrls()                    // grant (default) or deny later llRequestURL / llRequestSecureURL calls
s.deliverEmail({ from, subject, message })      // queue mail on the prim for llGetNextEmail; false when the queue is full
s.respondToDataserver(key, value)               // fire `dataserver` for a captured llRequest*
s.respondToLastDataserver(value)                // same, for the most recent
s.grantPermissions(perms?, request?)            // answer the latest waiting llRequestPermissions, or the dialog of the given entry of s.permissionRequests; fires `run_time_permissions` if the script is waiting for an answer
s.denyPermissions(request?)                     // answer it with No
s.grantExperiencePermissions()                  // accept the latest llRequestExperiencePermissions; fires `experience_permissions`
s.denyExperiencePermissions(reason?)            // decline it; fires `experience_permissions_denied` (XP_ERROR_NOT_PERMITTED by default)
s.answerDialog(text, { name? })                 // answer the latest llDialog / llTextBox as its avatar; fires `listen`
s.sendControl(level)                            // the permission agent holds exactly these CONTROL_* bits; fires `control`
s.setGameControl(agent, { mode, axes, buttons }) // set semantic input shared by scripts in the World; null clears it
s.sendGameControl(agent, { buttons?, axes? })    // deliver raw input plus a semantic snapshot, with permission
s.setCamera({ pos?, rot?, fov?, aspect? })      // set the camera llGetCameraPos / Rot / FOV / Aspect report
s.setAnimationState(avatar, "Standing")          // register an avatar in this region and set its locomotion state
s.mock(name, impl)                              // override any ll* function (real or stubbed) per-test
s.reset()                                       // re-init globals + return to default + state_entry

// Inspect
s.currentState                                  // current LSL state name
s.now                                           // virtual time in ms
s.timerInterval                                 // configured llSetTimerEvent interval (sec, 0 = unset)
s.running                                       // false while paused via llSetScriptState, or after a run-time error
                                                // setting it false drops events fired at the script; setting it true delivers what was already queued
s.crashed                                       // true after a run-time error, until the script runs again
s.global(name)                                  // read a script global
s.setGlobal(name, value)                        // seed a script global
s.chat                                          // [{ channel, text, type, to?, from? }, ...]
s.calls                                         // [{ name, args, returned }, ...]
s.callsOf(name)                                 // filter call log by ll* name
s.httpRequests                                  // [{ key, url, method, body, headers, mimetype, ... }]
s.urls                                          // URLs the script holds from llRequestURL / llRequestSecureURL
s.emails                                        // [{ address, subject, message, time }] sent with llEmail
s.targetedEmails                                // [{ target, subject, message, time }] sent with llTargetedEmail
s.inbox                                         // mail queued on the prim, oldest first
s.dataserverRequests                            // [{ key, source, args, fulfilled }]
s.permissionRequests                            // [{ agent, permissions, answered }]
s.autoGrantPermissions = 'none'                 // 'sl' (default), 'none', or (request) => boolean: which requests the simulator grants itself
s.experience                                    // the Experience the script was given, or null
s.experienceRequests                            // [{ agent, answered }] from llRequestExperiencePermissions
s.teleportRequests                              // teleport attempts, including denials, with time and destination
s.dialogs                                       // [{ kind, agent, message, buttons, channel, objectKey, answered }]
s.controls                                      // llTakeControls arguments: { controls, accept, passOn } or null
s.cameraParams                                  // ReadonlyMap of llSetCameraParams rule -> value
s.getPlayingAnimations(avatar)                   // snapshot of playing animation UUIDs, sorted by UUID
s.listens                                       // [{ handle, channel, name, key, message, active }]
s.linkedMessages                                // [{ target, num, str, id }] sent by THIS script
s.clearLinkedMessages()                         // drop captured llMessageLinked entries
s.linksetData                                   // ReadonlyMap<string, { value, password }> (shared LSD store)
s.seedLinksetData(entries)                      // pre-populate LSD without firing events
s.text                                          // current llSetText: { text, color, alpha } or null
s.objectDesc                                    // current llSetObjectDesc value
s.touchText, s.sitText                          // current llSetTouchText / llSetSitText text, "" if unset
s.payPrice                                      // llSetPayPrice arguments: { price, buttons } or null
s.dead                                          // true once llDie has run
s.wakeAt                                        // virtual ms a sleeping handler wakes at, or undefined when idle

// Multi-script context (auto-allocated for single-script tests)
s.host                                          // the Prim instance hosting this script
s.linkset                                       // the Linkset (shared clock, LSD, link_message bus)
s.scriptName                                    // inventory name; backs llGetScriptName
s.inventoryOffers                               // item snapshots, targets, folder names and root paths
s.viewerRequests                                // URL/map arguments and floater rejection results
s.setAgentInRegion(key, present = true)          // region-presence override, shared across its scripts
```

`start`, `fire`, `reset`, `deliverChat`, `grantPermissions` and the `respondTo*` calls return only after the handlers they started have finished; if one sleeps, the clock moves to its wake time while the other scripts keep running.

Recurring events created during those handlers do not extend the synchronous call forever. Use `advanceTime` to continue their handlers.

`advanceTime(ms)` stops the clock exactly `ms` later, so a handler still sleeping at that point stays asleep and carries on during a later `advanceTime`. This is a breaking change: before, one call ran the whole sleep.

A mock can take time like a builtin delay by calling `ctx.sleep(ms)`; the script pauses for that long after the mock returns.

### `loadLinkset(input)` → `Promise<LoadedLinkset>`

For tests that exercise more than one script — sibling scripts in the same
prim, or scripts spread across a multi-prim linkset — use `loadLinkset`.
Every script shares one virtual clock, one Linkset Data store, and one
`link_message` bus, so `llMessageLinked`, `linkset_data`, `llGetTime`,
`llResetOtherScript`, and `llSetScriptState` all behave as they do in-world.

```ts
import { loadLinkset } from '@rezless/vitest'

const { linkset, prims, scripts } = await loadLinkset({
  prims: [
    {
      name: 'Root',
      scripts: [
        { source: './counter.lsl', name: 'counter' },
        { source: { source: peekerSource, filename: 'peeker.lsl' }, name: 'peeker' },
      ],
      inventory: [
        // notecards, textures, … addressable via llGetInventory* / llGetNotecardLine
      ],
    },
    { name: 'Display', scripts: [{ source: './display.lsl', name: 'display' }] },
  ],
})

scripts['counter'].start()
scripts['display'].start()
scripts['counter'].fire('touch_start', { num_detected: 1 })
expect(scripts['display'].text?.text).toBe('count: 1')

// Linkset-wide helpers
linkset.advanceTime(1_000)              // shared clock; every script's timers advance together
linkset.deliverChat({ channel: 0, name: 'Alice', key: 'k', message: 'hi' })
linkset.touch(2, { face: 0, st: { x: 0.5, y: 0.5, z: 0 }, hold: 1_500, avatar: { key: 'k', name: 'Alice' } })
                                        // click link 2; reaches the scripts Second Life would
                                        //   deliver it to, honouring llPassTouches
linkset.linkedMessages                  // every llMessageLinked across the linkset
linkset.clearLinkedMessages()
linkset.clock.now                       // current virtual time in ms
linkset.clock.pendingEvents()           // snapshot of queued one-shot events:
                                        //   [{ at, target, event, payload }, ...]
```

`scripts` is a flat name → `Script` lookup keyed by inventory name; duplicate
names across prims throw to prevent silent overwrites. Each `Script` is the
same handle described above, so all matchers, mocks, and inspectors keep
working — they're just scoped to one script in a larger system.

Chat a script sends reaches matching `listen` handlers in other prims, named
and keyed after the sending prim. `llWhisper`, `llSay` and `llShout` reach
prims within 10, 20 and 100 m of the sending prim, and so do its
`DEBUG_CHANNEL` errors, which are said. `llRegionSay` reaches every prim in the
region. `llRegionSayTo` reaches only the prim with the target key, or, when
targeting an avatar on a nonzero channel, matching listens in every attachment
that avatar wears in the sender's region. Channel 0 to an avatar reaches no
script. A prim never hears its own chat, and `llOwnerSay` and
`llInstantMessage` never trigger a `listen`.

#### Editing a prim's contents

These calls act as the object's owner editing its contents. Each one sends
`changed(CHANGED_INVENTORY)` to the running scripts in that prim. When no
script in a child prim handles `changed` in its current state, the root's
scripts get the event instead. No other prim hears of it.

```ts
prims[0].addInventory(makeInventoryItem({ name: 'Notes', type: InventoryType.NOTECARD }))
prims[0].replaceInventory('Notes', { notecardLines: ['new text'] })  // saved: same name, new key
prims[0].renameInventory('Notes', 'Settings')
prims[0].removeInventory('Settings')                                 // a removed script stops
prims[0].removeInventory('a', 'b')                                   // deleted together: one event

const door = await addScript(prims[1], { source: 'door.lsl', name: 'door' })  // dropped in: runs state_entry
await addScript(prims[1], { source: 'spare.lsl' }, { running: false })        // dropped in, not running
prims[1].replaceInventory('door', {})                                         // recompiled: resets, new key
prims[1].renameInventory('door', 'gate')                                      // keeps running
```

`addScript` takes a script as `loadLinkset` does and returns it, stopped when
`running` is false; the script is not added to the `scripts` map `loadLinkset`
returned. It is not `prim.addScript`, which places a script with no event.
`prim.dropScript(script)` does the same for a script already built on the prim.

The other scripts hear of a new or recompiled script before it runs, and it
gets no event of its own. Until their `changed` handlers end or sleep, the
script is not there for them: a link message to it is lost, and
`llSetScriptState` on it says it could not find the script. A script added as
not running, or recompiled while stopped, runs `state_entry` once
`llSetScriptState` starts it. Recompiling keeps the script's code; to change
the code, remove the script and add another. A script that nothing has run yet
is not reset by a recompile.

A renamed script gets the event like the others; `llGetScriptName` returns the
new name, while `script.scriptName` keeps the name the script was loaded with.
Renaming inside a prim could not be probed, so those details are assumptions.

A script that has not started yet, or is stopped, gets no event, so items added
before `start()` set the object up quietly. A script busy in a handler gets the
event when the handler ends, and edits made meanwhile are merged into one or
two events. Like `linkset.touch`, an edit runs the handlers it starts to their
end and delivers any other event that is due.

`addInventory` and `addScript` append a number to a name the prim already
holds (`Notes`, `Notes 1`); `addInventory` returns the stored item. The other
three throw for a name the prim does not hold. `llRemoveInventory` from a
script sends no event.

`prim.placeInventory(item)` puts an item in place with no event, for arranging
an object after its scripts have started.

#### Rezzing inventory objects

Give a prim named object definitions through `objects`, then inspect the new
linksets in its World:

```ts
const world = new World()
world.addRegion('Test', { x: 0, y: 0 })
const rezzer = await loadLinkset({
  world, region: 'Test',
  prims: [{
    objects: {
      payload: { prims: [{ name: 'Payload', scripts: [{
        name: 'receiver', source: './receiver.lsl',
      }] }] },
    },
    scripts: [{ name: 'rezzer', source: './rezzer.lsl' }],
  }],
})
rezzer.scripts['rezzer'].start()
const rezzed = world.linksets.filter(object => object !== rezzer.linkset)
expect(rezzed[0].allScripts()[0].global('start')).toBe(42)
```

Here `rezzer.lsl` calls `llRezAtRoot("payload", llGetPos() + <0,0,2>,
ZERO_VECTOR, ZERO_ROTATION, 42)` and `receiver.lsl` stores
`llGetStartParameter()` in its `on_rez` handler. Each rez gets fresh prim keys,
and the rezzing prim receives `object_rez` with the new root key. An inventory
item made with `makeInventoryItem({ name, type: InventoryType.OBJECT, object:
savedLinkset })` supplies an existing linkset instead of an inline definition.

`llRezObject`, `llRezAtRoot` and `llRezObjectWithParams` apply the measured
size-dependent reach, placement and parameter rules. `llDerezObject` removes an
object, marks it temporary, or saves it back into its source inventory item.
Only the original rezzer can derez its copyable objects. Saved objects retain
script globals, LSL state, listeners and timers. Save objects between handlers;
suspended handler continuations are not restored.

`llGetVel` reads initial velocity unless a physics fixture overrides it;
`OBJECT_VELOCITY` reads initial velocity. `llGetForce` defaults to the
force requested through `REZ_ACCEL`. Force, sound, collision and no-entry flags
are captured requests; physical motion, contacts and audio are not simulated.
Temporary objects expire after exactly 60 seconds of virtual time, without
simulator cleanup jitter. Clearing temporary status cancels expiry; re-enabling
it starts a new countdown. Setting it true again keeps the current deadline.
Derez and `llDie` remove objects from `world.linksets`.

#### Several objects in a world

To test chat between separate objects, put their linksets in a `World`. Each
region has a name and the global position of its south-west corner; regions
are 256 m squares. `position` is the root prim's position in its region.

```ts
import { loadLinkset, World } from '@rezless/vitest'

const world = new World({ startUnixTime: 1_700_000_000 })
world.addRegion('Callida', { x: 256768, y: 194560 })
world.addRegion('Opportuna', { x: 256768, y: 194816 })

const door = await loadLinkset({ world, region: 'Callida', position: { x: 5, y: 250, z: 25 }, prims: [...] })
const remote = await loadLinkset({ world, region: 'Opportuna', position: { x: 5, y: 3, z: 25 }, prims: [...] })

remote.prims[0].params.position = { x: 5, y: 20, z: 25 } // move it
door.linkset.advanceTime(1_000)                           // advances the whole world
```

Every linkset in a world shares the world's clock, so advancing time on any
script or linkset runs every script's events in time order. Whisper, say and
shout cross region borders; `llRegionSay` and `llRegionSayTo` stay in the
sender's region.

A third argument to `addRegion` sets what scripts read about the region:
`flags`, `agentCount`, `fps`, `simStats` (by `SIM_STAT_*` number), `env`
(by `llGetEnv` name), `dayLength` and `dayOffset` in seconds (default a
four-hour day offset by 57600 s), and `sunRotation` and `moonRotation`, each a
rotation or a function of the fraction of the day gone (default a morning
sun with the moon opposite), `ground` (a height, or a function giving the
height at each whole-metre grid point from -1 to 256; default 22 m), `water` (default 20 m) and
`wind` (a vector, or a function of x and y) and `scriptDanger` (a boolean, or a function of x and y; default false). `llEdgeOfWorld` treats the world's other regions as
the neighbours. A linkset outside a world is alone in a region named
`Rezless`.

```ts
world.addRegion('Sandbox', { x: 256000, y: 256000 }, { flags: REGION_FLAG_SANDBOX, agentCount: 3 })
```

`environment` supplies `llGetEnvironment` result tuples by parameter number:

```ts
world.addRegion('Sandbox', { x: 0, y: 0 }, {
  environment: { [SKY_GAMMA]: [2.5], [WATER_FOG]: [{ x: 0, y: 0.1, z: 0.2 }, 16, 0.25] },
})
```

Unspecified parameters use fixed samples measured on Aditi. Sun and moon
rotations and directions come from `sunRotation` and `moonRotation`, including
when their other tuple values are supplied through `environment`.
`ENVIRONMENT_DAYINFO` follows `dayLength`, `dayOffset` and the virtual clock.
Lighting and cloud samples stay fixed as time advances.

Scripts change the environment like this:

- **`llSetEnvironment`** works on the region for an owner listed in `estateManagers`,
  or on a parcel for its owner, once that parcel has its own environment. The
  overrides are in `region.environmentChanges` (or `parcel.environmentChanges`),
  by track. The z of the position picks the track from the `SKY_TRACKS`
  altitudes, and -1 means every track.
- **`llReplaceEnvironment`** applies a settings item from the prim's inventory:
  `makeInventoryItem({ name, type: InventoryType.SETTING, environment: { environment, sunRotation } })`.
  Replacing a parcel's environment gives the parcel its own copy of the region's.
- **`llSetAgentEnvironment`** and **`llReplaceAgentEnvironment`** need the
  script's `Experience`, allowed on the land and accepted by the agent. They
  record what the viewer was told in `script.viewerRequests`.
- **`llModifyLand`** writes `LAND_LEVEL` and `LAND_REVERT` edits over `ground`
  in `region.terrainEdits`, on parcels the owner owns while the owner is in the
  region. The ground reads and `llCastRay` see these edits. The other actions
  change nothing, because the wiki doesn't say how much they move the land.
- **`llSetGroundTexture`** records rules in `region.groundTextures` for an
  estate manager, up to 4 calls every 2 minutes.

```ts
world.addRegion('Sandbox', { x: 0, y: 0 }, { estateManagers: [owner] })
world.addParcel({ region: 'Sandbox', owner })
```

Second Life's responses when a script has rights follow the wiki; they
haven't been checked in-world. Throttles other than the ground texture one
aren't modelled.

`loadScript` continues to work for single-script tests; under the hood it
auto-allocates a 1-prim/1-script linkset, so existing tests are unaffected.

### Custom matchers

```ts
expect(s).toHaveSaid(0, 'hello')
expect(s).toBeInState('waiting')
expect(s).toHaveCalledFunction('llSetTimerEvent', 60.0)
expect(s).toHaveSentHTTP({ url: '...', method: 'POST', body: '...' })
expect(s).toHaveListened(7, { key: ownerKey })
```

### Avatar names and info

Add an avatar with `world.addAvatar({ region, key, username, displayName, name,
size, info, language, position, group, friends, visualParams })`. Only `region`
and `username` are required. `name` is the legacy sensor name. Returned avatars
are mutable, so a test can move them or change an `AGENT_*` mask between events.
`friends` accepts UUIDs and becomes a mutable `Set`. `visualParams` maps supported
numeric parameter IDs to values in `[0, 1]`; unset supported parameters read 0.
Size defaults to `<0.45, 0.6, 1.9>`, flags to 0, and shared language to empty.
Display name defaults to `name`, then `username`.

`llGetObjectDetails` reads an attachment point from either the root or a child prim.
`OBJECT_TEMP_ATTACHED` is 1 only for the root of a temporary attachment; children
and normal attachments return 0. Rezzed objects return 0 for both attachment flags.
`llGetObjectPrimCount` reads 0 for any prim of a worn object, from its own
scripts and from other objects. `llGetNumberOfPrims` and `OBJECT_PRIM_COUNT`
still count its prims. In `attach(NULL_KEY)` a detached object still reads 0
from `llGetObjectPrimCount`, its prims from `OBJECT_PRIM_COUNT` and 0 from
`OBJECT_ATTACHED_POINT`. For other objects its key is gone by then.

`OBJECT_SERVER_COST` is half a point for each prim and a quarter for each
script the region counted when it last worked the cost out, and never more
than one point for each prim. Second Life counts the scripts again when the
object is rezzed or worn from inventory, when prims are linked or unlinked,
when an avatar sits down on it or stands up, when a script is removed, when a
child prim moves or turns in the object, and when a prim's size, shape,
physics shape type, physics or temporary status changes, including
`llDerezObject(id, DEREZ_MAKE_TEMP)`. `llLookAt` and `llRotLookAt` turning a
child prim do not count again. When a script is added it counts the
scripts that were there before. So a new box with one script reads 0.5 until
one of those changes, and 0.75 after. An object built
with `loadLinkset` is such a box: its last script is not counted. Call
`linkset.recountScripts()` for the value an object fresh from inventory reads.
A stopped script counts, and LSL and SLua scripts count the same. A seated
avatar reads the cost of the object it sits on, and 0 when it stands.
`PRIM_PHYSICS_SHAPE_TYPE` keeps its value when a script sets an unknown type,
or `PRIM_PHYSICS_SHAPE_NONE` on a root prim.

`llSetStatus` flags belong to the object. A script in any prim sets and reads
the same flags, and `PRIM_PHYSICS` and `PRIM_PHANTOM` read the same for every
link. A new object has `STATUS_ROTATE_X`, `STATUS_ROTATE_Y` and
`STATUS_ROTATE_Z` set, and `STATUS_CAST_SHADOWS` never reads as set. Linked
prims take the new root's flags. A prim unlinked from an object keeps its
physics and phantom flags and gets a new object's other flags.

`llGetObjectDetails` reads avatars in the caller's region. Position, rotation,
velocity and size use the live avatar fixture; a seated avatar reports its seat's
root and link number, and includes the seat in its mass. Supply resource totals
with `objectDetails`, for example `{ mass: 80, primCount: 5, scriptMemory: 131072 }`.
These totals include worn objects and remain explicit fixture values when
attachments change. Mass is in kilograms, script memory in bytes and script time
in seconds. Unset totals are zero except health 100, render weight -1, available
attachment slots 38 and animated slots 3. `groupTag` supplies the displayed group
tag; body shape uses `visualParams[80]` and hover height uses `movement.hoverOffset`.

`llGetDisplayName`, `llGetUsername`, `llName2Key`, `llGetAgentInfo`,
`llGetAgentLanguage`, `llGetAgentSize` and `llGetVisualParams` query avatars in
the script's region. `llRequestUserKey` searches all World avatar usernames and
answers every script in the prim through `dataserver`, with a UUID string or
`NULL_KEY`. `llGetAgentList` uses parcel fixtures for parcel scopes and rejects
nonempty options. `llIsFriend` reads fixture friendships; `llSameGroup` compares
active avatar groups, prim groups from `world.sensorProperties`, World object
groups, or a literal group UUID.

These fixtures do not simulate name caches, child agents, historical usernames,
lookup throttles, or physics and animation changes to info flags beyond seating. Positive
friendship, foreign-avatar groups, successful Resident-name lookup and
multi-avatar parcel filtering follow the wiki and need another avatar for
in-world validation. The single-avatar queries, name parsing, dataserver replies,
visual parameters, group changes and standing/sitting/flying/type/away/busy flags
were measured on Aditi in SLua Tideland on 2026-11-01.

### Sitting and teleporting

Use `world.sitAvatar(avatar, prim)` and `world.standAvatar(avatar)` to simulate
viewer seating. `avatar.sittingOn` identifies the occupied prim. A sitter is a
child of the object's root: it moves with the root and stays put when its seat
prim moves or the sit target is edited, which only affects future sits. Deleting the object clears occupancy. Seating updates
`AGENT_SITTING` and `AGENT_ON_OBJECT`, clears movement bits, and fires
`changed(CHANGED_LINK)` throughout the object. The sit-target readers return
the avatar that took the sit target when it sat, for as long as it sits there,
even after the sit target is changed or removed. An avatar that sat before the
sit target was set never takes it. `llSitOnLink` requires an allowed
experience and an accepted avatar; `llUnSit` needs no runtime permission for a
sitter on its own object. Land ownership also permits unsitting other sitters.

`world.sitAvatar` seats the avatar whatever the sit flags say. The wiki says
`SIT_FLAG_SCRIPTED_ONLY` leaves scripted sits open; that was not measured,
because `llSitOnLink` needs an experience. `world.userSitAvatar(avatar, prim)`
is a viewer's sit request, and Second Life refuses it for
`SIT_FLAG_SCRIPTED_ONLY`. The request passes over a scripted-only sit target
and takes the next free one. With no sit target to take, one scripted-only
prim anywhere in the object refuses it: the call returns `false` and no script
in that object gets an event. An avatar sitting on another object stands up
from it, and one sitting on the ground stays there. `@sit:<key>=force` is
refused the same way.

One avatar holds a sit target. A sit request on an object whose sit targets
are all taken seats the avatar on the prim it asked for, where and within the
reach it would sit on a prim without a sit target (below), unless the object
has a scripted-only prim. An avatar seated beside a sit target never takes it
over when the avatar holding it stands. `world.sitAvatar` seats an avatar on a
prim other avatars sit on; when the prim's sit target is taken, at the prim's
centre or at the placement it is given. A sit request that would seat the
avatar where another sitter already is gets refused with `CantSitNoRoom`, and
an avatar sitting on another object stands up from it. Second Life often
seats the avatar at another spot nearby instead of refusing it; rezless does
not model that.

A prim without a sit target is out of reach more than 8 m away, unless
`world.setSitResponse` gives it a response. Second Life's rule for that reach
is not known, and 8 m from the prim's centre is an approximation: it gets 70
of 113 requests measured with prims of several sizes, shapes, turns and
heights right, and 14 of 21 with prims tilted about X or Y. A sit request on a
prim out of reach is refused too, and again an avatar sitting on another
object stands up from it. A sit target seats the avatar at any distance in the
region.

A sit request seats the avatar on a prim without a sit target where Second
Life does on a box. Take the line from a point 3 m behind the avatar and
1.94 m above it to the prim's centre. Seen from above, it leaves the prim
through a side. The avatar sits 0.09 m out from that side, in line with where
the line first meets the prim, and 0.63 m above the prim's top. It sits
upright, facing out from that side, and `PRIM_POS_LOCAL` and `PRIM_ROT_LOCAL`
of its link read that spot. In Second Life this holds for boxes and round
cylinders with an axis vertical. Spheres, tori, most prisms, cylinders with an
oval top and tilted prims seat the avatar elsewhere; rezless seats it on them
by the same rule. The rule was measured for sit requests with no click
offset, as `@sit:<key>=force` sends them, with the avatar's camera at the
viewer's default place. A click elsewhere on
the prim and a moved camera are not modelled. `world.sitAvatar` without a
placement seats the avatar on the prim's sit target, or at its centre when it
has none.

`avatar.viewer.alerts` lists what the region had the viewer show, each with
`name`, `message` and the clock time `at`. A sit request refused for
`SIT_FLAG_SCRIPTED_ONLY` adds `CantSitNoSuitableSurface`, "There is no suitable
surface to sit on, try another spot.", unless the avatar sits on that object
or the message last showed 10 s ago or less. A request refused for a prim out
of reach adds nothing. A request refused because another sitter is at the
spot adds `CantSitNoRoom`, "No room to sit here, try another spot.".

A seated avatar is a link of the object, numbered after the prims. Several
sitters are numbered in seating order, and later sitters move down a link when
an earlier one stands. The first other link of a lone prim with several
sitters is the first sitter. `llGetNumberOfPrims` counts it, `llGetObjectPrimCount` does not, and a
lone prim is link 1 instead of 0 while someone sits on it. `llGetLinkKey`,
`llGetLinkName`, `llGetObjectLinkKey` and `llGetLinkPrimitiveParams` read the
avatar at its link number. `llSetLinkPrimitiveParams(Fast)` moves the sitter
with `PRIM_POS_LOCAL`, `PRIM_ROT_LOCAL`, `PRIM_POSITION` and `PRIM_ROTATION`,
all relative to the root; any other rule on an avatar link does nothing and
ends the rule list. `LINK_SET`, `LINK_ALL_OTHERS` and `LINK_ALL_CHILDREN` reach
the prims only. Unlinking a prim stands everyone seated on the object; linking
keeps them seated where they are. Media set through an avatar link with
`llSetLinkMedia` stays with the avatar.

In most link-taking calls a link number below `LINK_THIS`, such as -5 or -100,
names the first link that is not the caller: link 2 from the root, the root
from a child, and the sitter from a lone prim someone sits on. Calls that take
`LINK_SET`, `LINK_ALL_OTHERS` and `LINK_ALL_CHILDREN` as groups of prims read
it that way. That was measured in Second Life for `llMessageLinked` and the
calls that set prim parameters, colour, alpha, texture, material and sit flags.
The link sound calls and `llSetLinkTextureAnim` follow the same rule without a
measurement, because no script can read their effect back. Calls that take one
link (`llGetLinkKey`, `llGetLinkName`, `llGetLinkSitFlags`,
`llAvatarOnLinkSitTarget`, `llLinkSitTarget`, `llSetLinkCamera`, the link media
calls) read the three group flags as the first other link as well.
`llGetLinkPrimitiveParams` returns an empty list for the three flags, and a
`PRIM_LINK_TARGET` inside it takes one link, counted from the link the read
started on and not from the calling prim. `llGetLinkNumberOfSides`,
`llIsLinkGLTFMaterial` and `llGetObjectLinkKey` answer `LINK_THIS` and no other
negative number. `llBreakLink` reads `LINK_THIS` as the root and every other
negative number as link 2, whichever prim calls it.

Link 0 is the root when a child prim calls and names nothing when the root
calls. A lone prim is link 0 until an avatar sits on it. That was measured for
the calls above; the link sound calls and `llSetLinkTextureAnim` follow it
without a measurement. `llGetObjectLinkKey` reads link 0 as the root from any
prim, `llBreakLink(0)` does nothing, and `llSitOnLink` keeps its own rule, which
needs an experience to measure. `llGetLinkSitFlags` and
`PRIM_SIT_FLAGS` report `SIT_FLAG_SIT_TARGET` while the prim has a sit target;
a script cannot set that bit. `PRIM_ALLOW_UNSIT` and `PRIM_SCRIPTED_SIT_ONLY`
are the matching bits of the sit flags. A media error is said by the link the
call named: that prim, or the seated avatar from where it sits. The calling
script's `chat` keeps the error, with `from` set to that link's key when it is
not the script's own prim. Objects the avatar wears hear it from the avatar.

`llSetAgentRot` requires animation permission and changes yaw. A rotation
requested while sitting applies when standing. `llTeleportAgent` and
`llTeleportAgentGlobalCoords` require teleport permission from the owner, or
an accepted experience. Holding someone else's teleport permission gets
"Script trying to teleport agent without current permission!". An avatar out of
the region is passed over without a word. A non-owner who granted the permission
gets "Teleport LSL functions can only teleport the owner of the object."
Temporary attachments reject teleport calls and new
teleport-permission requests. Accepted teleports stand a sitter and move the avatar fixture.
Read attempts, including denials, through `s.teleportRequests`; `accepted`
means script checks passed, not confirmation from a remote simulator. Local
look-at vectors denote positions; cross-region vectors denote directions.
Map landmark asset UUIDs to `{ region, position }` in `world.landmarks`.
`llTeleportAgentHome` requires parcel ownership under both the script and target avatar and sleeps
five seconds. Supply `avatar.home` or the `addAvatar` option `home` to move to
a virtual destination; without it an authorized home request is recorded only.

The model does not simulate avatar skeleton offsets, occupied avatar links in
prim counts, parcel access/routing, group land powers, teleport throttles,
viewer smoothing, or network failures. Sitting does not choose animations.
Successful forced seating needs an experience-enabled parcel for in-world
validation. Cross-region and real
home success were not probed because i Doll must stay in SLua Tideland.

### Avatar animations

Use `s.setAnimationState(avatar, "Standing")` to register an avatar and choose its locomotion state. `s.getPlayingAnimations(avatar)` returns the same UUIDs as `llGetAnimationList`. Animation state is shared by scripts in the same region of a `World`, or the same linkset when no world is supplied. It survives script reset and removal. Permission-granted animation calls also register their target avatar, initially standing.

`llGetAnimation` reports locomotion, even while a script plays another animation. Overrides change the animation used for that state. Playback records animation UUIDs; it does not simulate asset duration, blending or priorities. Tests drive locomotion changes explicitly with `setAnimationState`. In a world, sitting and standing set it as well: "Sitting" on an object, "Sitting on Ground" on the ground. Standing up, the avatar reads `AGENT_IN_AIR` and "Striding" for 50 ms, then "Standing"; after a stand from an object it also reads `AGENT_WALKING` and "Walking" from 350 to 480 ms. After a teleport, from a seat or not, it reads `AGENT_IN_AIR` and "Falling Down" for 600 ms, then "Landing" for 250 ms, then "Standing". An avatar that arrives from another region reads without `AGENT_ATTACHMENTS` and `AGENT_SCRIPTED` for its first 350 ms there. A flying avatar that sits down with no sit pilot keeps `AGENT_FLYING` for 320 ms; if it stands up in that time it reads "Hovering Up" until the flag clears, or "Hovering" after a teleport, then falls as after a teleport. With no state recorded, an avatar in the region reads its `llGetAgentInfo` flags: "Sitting", "Sitting on Ground", "Hovering" when flying, otherwise "Standing". An avatar of the world in another region reads "", and a teleport takes the avatar's state with it.

Use `world.addParcel({ region, bounds, owner, ...settings })` to configure parcel
reads. Bounds use region coordinates with `min` inclusive and `max` exclusive;
omitting bounds covers the region. Later parcels take precedence in overlaps.
Queries clamp x/y to the region edges and ignore z. Parcel details include
`name`, `description`, `group`, `area`, `flags`, `seeAvatars`, `landingPoint`,
`landingLookAt` and `tpRouting`. `maxPrims` and `primCounts` by `PARCEL_COUNT_*`
category are explicit fixture values; VM objects do not change land impact.
Capacity budgets may include fractions; queries truncate after aggregation.
Same-owner totals include only parcels in the caller's region. `primOwners`
maps owner UUIDs to land impact. Only the parcel owner can read it or `musicURL`.
On group-owned land (`owner` equal to `group`), a group member's object also
sees the `llGetParcelPrimOwners` strides its owner's role `powers` allow, while
the owner is in the region. `returnGroupOwned` shows the group's own stride,
`returnGroupSet` shows the owners listed in the parcel's `groupSetOwners`, and
`returnNonGroup` shows every other owner. Roles come from the avatar's `groups`
fixture. Without a parcel fixture, land is unowned
with empty strings and zero land impact.

Each configured parcel has an `effects` log. Entries contain `function`, `args`,
`source` prim key, `owner`, virtual `time` in milliseconds, `accepted`, and any
immediate `result`. Both refused and accepted requests are recorded. Acceptance
means the fixture's permission and argument checks passed, not that an external
transaction completed. Requests without a parcel fixture have no persistent log.

`llSetParcelMusicURL` updates `musicURL` for the land owner; subsequent reads see
it. `llParcelMediaCommandList` updates shared `media` settings for owner calls,
and `llParcelMediaQuery` reads them with LSL types. Agent-targeted media commands
stay in the log without changing shared settings. Playback has no renderer.
Ban/pass list edits and ejections are recorded without simulating access or
moving avatars. Object returns are recorded without deleting objects or changing
fixture land-impact counts; accepted return requests report zero objects returned.

`llSetParcelForSale` requires owner-granted `PERMISSION_PRIVILEGED_LAND_ACCESS`
and stores validated options in `parcel.sale`. Set `inEscrow: true` on a parcel
fixture to refuse a sale. Region `estateManagers` lists the UUIDs allowed to
submit `llManageEstateAccess` requests. These requests do not model estate-wide
list propagation or throttling. `llTransferOwnership` records an offer to an
avatar fixture in the same region without changing ownership or inventory.
Attachment and object transfer/copy permissions are not modeled.

Both money functions require `PERMISSION_DEBIT` granted by the object owner;
asking anyone else for it fails with a debug error. They record requests and
keep no balance. `llGiveMoney` always returns zero and says the measured debug
error for missing debit, a bad destination or an amount below 1.
`llTransferLindenDollars` returns a request key and queues `transaction_result`:
success for the owner or a World avatar, `LINDENDOLLAR_ENTITYDOESNOTEXIST` for a
known object, and the measured error for missing debit or invalid arguments.
A transfer to any other key stays pending. Tests can supply its result with
`s.fire('transaction_result', { id, success, data })`.

Refusals, errors, return codes and forced delays were measured on Aditi in
SLua Tideland on 2026-11-01. Successful mutations and offers follow the wiki;
land/estate rights were unavailable, and actual parcel edits, returns, ejections,
payments and ownership transfers were prohibited. No debit permission was
requested in-world. Group return-power reads follow the wiki; no group with
return powers on group-owned land was available to measure them.

### Paired RLV/RLVa fixtures

The [coverage matrix](../../docs/rlv-coverage.md) lists each delivered command
form for Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2, with support depth,
comparison and test references. It also lists unsupported commands, settings,
recovery, rendering and inventory variants. Its generator reads `RLV_MANIFEST`;
the documentation test fails if the published matrix drifts.

The [paired viewer example](../../examples/rlv/README.md) runs one LSL file
against both profiles, with two independent controller objects, status queries,
scoped cleanup and named negative-channel expectations. It checks omitted and
explicitly disabled viewers with the same source too.

Run these commands from the repository root. The root Vitest configuration
uses workspace source aliases, so no build or development server is required.
A fresh checkout can use `pnpm install --frozen-lockfile --ignore-scripts`.

```sh
# Runnable paired example and manifest/document synchronization.
pnpm exec vitest run examples/rlv/paired-viewers.test.ts packages/vitest/test/rlv-coverage-doc.test.ts
# Focused detection, restrictions, status, actions and channel-policy integration.
pnpm exec vitest run packages/vitest/test/rlv-profiles.test.ts packages/vitest/test/rlv-version.test.ts packages/vitest/test/rlv-restrictions.test.ts packages/vitest/test/rlv-status.test.ts packages/vitest/test/rlv-sendchannel.test.ts packages/vitest/test/rlv-channels.test.ts
# Disabled-viewer regressions, including the end-to-end relay fixture.
pnpm exec vitest run examples/rlv/paired-viewers.test.ts packages/vitest/test/rlv-profiles.test.ts packages/vitest/test/rlv-status.test.ts packages/vitest/test/rlv-relay.test.ts -t 'disabled|inert'
# Every viewer integration suite.
pnpm exec vitest run packages/vitest/test/rlv-*.test.ts
# Update the generated matrix after a manifest change.
pnpm exec tsx scripts/rlv-coverage.ts
```

Select `viewer: { profile: 'rlva' }` for Firestorm or
`viewer: { profile: 'rlv' }` for Kokua on `World.addAvatar`.
Inspect `avatar.viewer.restrictions.snapshot()` for per-prim rules,
`avatar.viewer.commandLog` for query and forced-action outcomes, and
`avatar.viewer.diagnostics` for unsupported forms. Explicit avatar actions have
separate results, such as `fixture.chatActions` and `fixture.teleportActions`.
`enforced` applies only to the operation and options in the coverage contract.
`state-only` means a stored rule has no corresponding action enforcement.
Version replies and command discovery never prove complete conformance.


`acceptpermission` answers complete covered `llRequestPermissions` requests and
records them as answered before delivering `run_time_permissions`. Kokua covers
controls, animation while sitting, and attach permission from owned objects,
including worn objects. Firestorm covers controls and attach permission from
owned objects that are not already attachments. Requests with any other bits
stay pending for `grantPermissions` or `denyPermissions`. Activation applies to
all requesting objects; UUID options do not create exceptions. The simulator's
own grants to a sitter or a wearer come first and apply with or without the
rule; set `s.autoGrantPermissions = 'none'` to see the viewer's replies alone.
Alternate auto-attach settings are outside this contract.

Viewer emulation is opt-in per avatar through
`world.addAvatar({ username, region, viewer: { profile: 'rlv' } })`.
Omitting `viewer`, or selecting `disabled`, leaves script chat and avatar behavior
unchanged. `avatar.viewer.reference` identifies the implementation and viewer version;
`avatar.viewer.diagnostics` belongs to that avatar alone. The reference versions
are Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2.

`loadRlvPair({ source })` loads the same LSL into separate Worlds for `rlv` and
`rlva`. Each fixture exposes `world`, `avatar`, and `script`. Scripts are not
started, so tests can seed state before calling `script.start()`.

```ts
import { loadRlvPair, rlvExpectationFor, type RlvExpectations } from '@rezless/vitest'

const pair = await loadRlvPair({ source: `
  integer replies;
  default {
    state_entry() { llListen(42, "", NULL_KEY, ""); llOwnerSay("@version=42"); }
    listen(integer channel, string name, key id, string message) { ++replies; }
  }
` })
const expectations: RlvExpectations<number> = {
  shared: { kind: 'expected', value: 1 },
}
for (const profile of ['rlv', 'rlva'] as const) {
  const { script } = pair[profile]
  script.start()
  script.advanceTime(1000)
  const result = rlvExpectationFor(expectations, profile)
  if (result.kind !== 'expected') throw new Error(result.reason)
  expect(script.global('replies')).toBe(result.value)
}
```

The relay integration test runs the same MIT-licensed LSL relay and controller
fixtures under both profiles and disabled mode. The relay description contains
one authorized controller object UUID; an empty value denies all senders. The
controller description contains the wearer UUID and relay UUID, separated by a
comma. Only detach add/remove and fixed-channel status queries are allowed.
The fixtures use relay protocol 1.100 framing, per-command acknowledgements,
version and release. Pong receives no acknowledgement; recovery and optional
meta-commands remain outside the fixture. An `ok` confirms relay acceptance even
when the viewer is disabled or rejects a negative reply channel. Query results
travel from the avatar through the relay to the controller on a separate channel.
Release clears the relay issuer's rules and preserves unrelated issuers.

For divergent cases, replace `shared` with named `rlv` and `rlva` expectations.
An expectation can instead be `{ kind: 'unsupported', reason }`. These are
inspectable data; the helper does not skip tests or turn unsupported cases
into successful assertions.

Single or comma-separated `version`, `versionnew` and `versionnum` queries on profile-valid channels
(excluding DEBUG_CHANNEL) now queue avatar replies through normal listen matching.
Replies can reach the issuing prim and other listening prims or linksets; they use
the owner avatar's UUID and name. Script chat capture still contains the original
`llOwnerSay` messages only. `avatar.viewer.commandLog` records each command's
`sourcePrim`, status and optional `{ channel, text }` reply. Unsupported forms
also produce `avatar.viewer.diagnostics`; disabled viewers record neither.

Batches execute in order, skip empty comma entries, and continue after a failed
token. Each record preserves the token as `command` with one leading `@` and
exposes normalized `parsed` fields (`behaviour`, `option`, `parameter`, `kind`)
when the grammar accepts it. Status distinguishes `applied`, `replied`, `malformed`, and
`unsupported`. Parameter kinds are `add`, `remove`, `clear`, `force`, `query`,
and `unknown`; classification alone never applies restrictions or force effects.
Only a leading `@` in owner chat activates dispatch. Numeric channel parameters
accept decimal prefixes, including a sign and leading whitespace.

Kokua RLV `2.09.35.00` reports API `2093500` even for `versionnum:impl` and unknown options.
Firestorm RLVa `2.4.2` reports API `3040300`, implementation `2040213` for `:impl`, and an empty
reply for unknown numeric options. Both string queries ignore options. Kokua's
string suffix is the fixed fixture viewer version `26.4.0`.

`avatar.viewer.restrictions.snapshot()` returns a frozen array of frozen rules,
optionally filtered by emitter prim UUID with `.snapshot(sourcePrim)`. Each rule has
`sourcePrim`, `behaviour`, `option`, canonical `rule`, and `support`. The no-option
`tplm` form has `state-only` support. Its action is not enforced, and its command-log
status remains `unsupported` for action effects. No-option `sendchat` is enforced
by explicit avatar chat actions. No-option `tploc` is enforced for forced location travel. Seating
forms `sit`, `unsit` and numeric `sittp[:distance]` have
`enforced` support for explicit user actions and log `applied`. Diagnostics
distinguish updated state from unsupported forms.

No-option `detach` has `enforced` support. `fixture.attemptDetach(attachment)`
attempts to remove an attachment worn by the fixture avatar; omitting the argument
selects the fixture script's attachment. `attemptViewerDetach(avatar, linkset)`
exposes the same action directly. Both return `allowed`, `blocked`, or `no-op`.
Root and child locks protect the whole attachment until the last relevant issuer
removes its rule. Allowed fixture actions remove the attachment immediately;
advance its clock to deliver queued `attach(NULL_KEY)` events.

`@detachme=force` respects all root and child locks, including the issuer's own.
Kokua resolves child emitters to the containing attachment and ignores options.
RLVa child self-detach is inert even unlocked; nonempty options fail. An allowed
force command queues simulator completion after the LSL handler yields, so an
immediate `llGetAttached` still reads the prior point. Accepted viewer work
survives removal of the issuing script and ends when the linkset is removed. Command-log status is
`enforced`, with an `allowed`, `blocked`, `no-op`, or `failed-option` outcome.
Lock add/remove commands use `applied`. `llDetachFromAvatar` remains a separate
simulator action and bypasses viewer locks, retaining its root/permission checks.
Named-point locks and bare `detach=force` are described under attachment point
locks. Locked inventory attachments use the recovery lifecycle described below. Direct shared-folder removal and its nostrip
checks are described under Force removal and clothing actions.

Rules use emitter prim UUIDs, so scripts on one prim share state and separate
prims remain independent. `n`/`add` and `y`/`rem` are aliases. Duplicates and absent
removes do not change state. `@clear`, `@clear=`, and `@clear=<substring>` affect
only that emitter. Filters match canonical rule text, including options.
Kokua retains unknown wire names and options with `unsupported` effects. Firestorm
stores those no-option forms, notification registrations and the sendchannel forms below; other families
and option forms remain unsupported. Neither profile stores query or force parameters.

The `sendchannel` family has `enforced` support through explicit avatar actions.
`fixture.sendChat(channel, message, volume?)` or
`world.sendAvatarChat(avatar, channel, message, volume?)` sends avatar chat from
the current avatar position. Volume is `whisper`, `say` or `shout`, defaulting
to `say`, with hearing ranges of 10, 20 and 100 m through normal listener matching
across regions. Public chat also reaches avatar received-chat records at that range. These actions support channel 0 and
positive signed 32-bit channels. Negative and invalid action channels return
`unsupported`; automatic query reply channel policy is separate. Payload limits are outside this action fixture.

```ts
const pair = await loadRlvPair({ source: `integer heard; default {
  state_entry() {
    llListen(42, "", llGetOwner(), "");
    llOwnerSay("@sendchannel=n,sendchannel:42=add");
  }
  listen(integer channel, string name, key id, string message) { ++heard; }
}` })
for (const fixture of Object.values(pair)) {
  fixture.script.start()
  expect(fixture.sendChat(42, 'allowed').status).toBe('sent')
  expect(fixture.sendChat(43, 'denied').status).toBe('blocked')
  expect(fixture.script.global('heard')).toBe(1)
  expect(fixture.chatActions.at(-1)?.reason).toBe('sendchannel')
}
```

Ordinary `sendchannel` accepts an exception from any prim. `sendchannel_sec`
requires every secure issuer to grant its own exception. `permissive=n` extends
that requirement to every restricting issuer; removing it restores ordinary
cross-prim exceptions. Both ordinary and secure option forms grant exceptions.
RLVa accepts positive numeric option prefixes; Kokua matches the literal decimal
channel text. Channel 0 bypasses sendchannel restrictions. Other command families
are not affected by this fixture's permissive evaluation.

No-option `sendchat` filters channel 0 with the profile's default OOC and
ellipsis settings. Ordinary speech becomes `...`; `((OOC))` and short slash
gestures pass. Safe emotes truncate at twenty units or a period-based limit. Kokua counts
UTF-8 bytes. RLVa counts characters but uses the period's UTF-8 byte offset
to set the shorter limit. Kokua accepts colon poses and discards text
before an embedded `/me`. RLVa additionally filters question marks in emotes.
Both block DEBUG_CHANNEL under `sendchat`. Other private channels remain
independent. Gesture expansion and alternate settings are outside this action fixture.

`emote=n` removes the safe-emote length and sentence limits under `sendchat`;
forbidden punctuation still becomes ellipsis. `redirchat:<channel>=n` and
`rediremote:<channel>=n` suppress the original public message and send one copy
per issuer and option to every allowed target. Each target respects `sendchannel`
and `sendchannel_except`. Frozen action records include `redirected` entries
with channel, message, volume, delivery status and denying restrictions. No target
receiving the message means status `blocked`; the reason names the redirect family.

Kokua redirects OOC and gestures under its default settings. Its `sendchat`
filter runs before `rediremote` unless `redirchat` is active. With `redirchat`,
unredirected emotes receive punctuation checks without truncation. Redirects retain
the transformed volume. Nonempty unusable channel options suppress public chat
without sending a copy. RLVa redirects before `sendchat`, leaves OOC and short
slash gestures public, and sends redirects as shouts with a 1023-byte UTF-8 limit.
It rejects unusable channel options and blocks DEBUG_CHANNEL for the matching
redirect family. Both support add/remove aliases and issuer-scoped clear.
Payload limits for Kokua, gesture expansion and alternate settings are outside
this redirection contract.

`sendchannel_except:<channel>` is an additional channel denial and overrides
`sendchannel` exceptions. Kokua checks literal decimal channel text directly.
RLVa accepts positive numeric prefixes and activates its exclusion list only
while a no-option `sendchannel_except=n` rule exists. The switch and list entries
may come from different issuers. RLVa also supports `sendchannel_except_sec`: every
secure issuer must list the channel before it is denied. With `permissive=n`,
every activating issuer must list it. Kokua leaves the secure form unsupported.
Public chat and automatic replies are unaffected.

No-option `chatshout` converts public shouts to say, `chatwhisper` converts
public whispers to say, and `chatnormal` converts public say and shout to whisper.
Kokua applies `chatwhisper`, then `chatshout`, then `chatnormal`. RLVa applies `chatnormal` first and performs only one transformation.
With both `chatwhisper` and `chatnormal`, a requested whisper stays whisper in
Kokua and becomes say in RLVa. Private channels bypass these restrictions.
The delivered volume determines both script and avatar hearing range.
Nonempty options and secure aliases remain unsupported.

Action records retain the requested `volume`; sent actions also include
`deliveredVolume`. Volume changes keep status `sent`, and active volume rules
appear in `restrictions`. `reason` continues to describe text filtering or denial.
Successful action records include `deliveredMessage`; `message` retains the
original attempt. Rewritten actions have reason `sendchat` and status `sent`.
Blocked DEBUG_CHANNEL actions have reason `sendchat` and no delivered message.

Supported restriction commands have command-log status `applied`. Frozen
`fixture.chatActions` snapshots, also available through `avatarChatLog(avatar)`,
retain every attempted channel, message, status and denying restrictions with
issuer UUIDs. A denied action creates no listener event or synthetic chat notice.
Script `llSay` and `llRegionSay` output and automatic viewer query replies remain
independent of this action policy.

`@notify:<channel>[;<filter>]=n|add` registers restriction notifications;
`y|rem` removes the issuing prim's exact wire registration. Different prims may
subscribe independently. Identical adds do not duplicate registrations. Substring
filters match rule names and options, excluding the parameter suffix. Messages
start with `/` and contain no issuer UUID. They enter ordinary LSL `listen`
events as avatar-origin replies, using the query reply channel, range and length
policy independently of sendchannel restrictions.

Kokua normalizes notification suffixes to `=n` and `=y`, suppresses duplicate adds
and reports absent removals. Firestorm preserves aliases, including the first
stored alias when an add is repeated, and reports failed external add/remove
commands. Kokua sends `/clear[:filter]` before removing matching rules, then sends
individual `=y` notices while subscriptions remain. Firestorm removes matching
rules before notifying remaining subscribers of `/clear[:filter]`; internal
individual removals stay silent. Missing-emitter collection follows those clear
sequences. Subscriptions persist through script reset and removal and are collected
with other rules when their emitter disappears. Collection notifications retain
the original viewer identity if the emitter changes owner.

Both profiles accept numeric channel prefixes. RLVa requires a positive channel
other than DEBUG_CHANNEL and at most one filter field; empty filters are accepted.
Kokua also delivers on negative channels and DEBUG_CHANNEL, skips empty semicolon
fields and uses the first nonempty filter field. Zero and nonnumeric channels
never deliver. Kokua retains invalid wire registrations for inspection.
Inventory-offer notifications are described under Inventory offer decisions.
Clothing, attachment and seating action notifications remain outside this
fixture. Successful registration commands have `applied` status;
unsupported forms remain visible in command logs and diagnostics.

Script reset, state changes, and script removal preserve rules. Missing prims lose
their rules on virtual-time viewer collection. RLVa distinguishes known and
never-resolved issuers; Kokua collects all missing issuers on its maintenance
pass. Startup phases and collection settings are described under Viewer sessions.
Linking and unlinking keep rules associated with their emitter UUID.

`@getstatus[:<filter>[;<separator>]]=<channel>` replies with the calling prim's
stored rules. `@getstatusall` includes every emitter. Both use substring filters
on canonical rule text, including options, and prefix each match with the
separator. No matches produce one empty reply. Rules retain insertion order
within a prim; avatar-wide replies visit prim UUIDs in ascending order and retain
duplicates across prims. Removing and re-adding a rule puts it last in that prim.

The default separator is `/`, including an explicitly empty separator. Kokua
keeps everything after the first semicolon as the separator; Firestorm uses only
the second field and ignores later fields. For `@getstatus:;a;b=<channel>` with
one stored `sit` rule, Kokua returns `a;bsit` and Firestorm returns `asit`.
Queries report only stored rules and do not extend restriction support.
`getRlvStatus(profile, avatar.viewer.restrictions, option?, sourcePrim?)` from
`@rezless/vm` returns the same untruncated wire string for assertions or other
query handlers. Omit `sourcePrim` to include all prims. Snapshots retain their
separate inspection order.

`seedRlvInventory(avatar, { sharedRootId, entries })` replaces one avatar's
inventory fixture. Each entry has a stable `id`, `parentId` (or `null`), `name`
and `kind` (`folder` or `item`). Entry order defines direct-child order. The
shared root is explicit; `null` means absent even if a folder is named `#RLV`.
The same configuration can be supplied as `viewer.inventory` to `world.addAvatar`.
Re-seeding retains detached objects and their script state while their item IDs
remain in the new entries. An explicit `wornAttachments` mapping can associate
an existing detached object with an item by root key, or replace that item's
previous root mapping. Removing an item also drops its remembered object.
`avatar.viewer.inventory.snapshot()` returns frozen copies. Duplicate IDs,
missing or non-folder parents, invalid shared roots and cycles are rejected
without replacing the previous fixture. Ordinary inventory can be seeded
outside the shared root. Prim contents remain separate. Inventory offers append content only after an explicit acceptance.
Folder `folded: true` supplies the effective RLVa folded-folder state, including
legacy naming; automatic naming and attachment-point inference are outside this fixture.

`@getinv[:<path>]=<channel>` returns direct folder names through the existing
reply queue and channel policy. Names retain fixture order, casing, commas and
duplicates. Items, empty names and dot-prefixed names are omitted. An absent
shared root, missing path or empty folder produces one empty message.

Both profiles match paths without case sensitivity and prefer exact names over
partial names. RLVa chooses the first exact duplicate and permits explicit
hidden paths. Its listings also omit slash-bearing and effectively folded folders.
Kokua excludes hidden paths, chooses the last exact duplicate, strips pipe suffixes
from path segments, and matches the longest span of a slash-bearing folder name.
Empty slash segments are ignored; a slash-only path selects the root for RLVa
and yields an empty result for Kokua. Neither profile escapes the shared tree.
`getRlvInventoryList(profile, avatar.viewer.inventory, path?)` returns the
untruncated result from `@rezless/vm`. Inventory links, live fetching and
automatic naming remain unsupported. `getinvworn` and direct attachment wear
have separate contracts below.

`@getattach[:<point>]=<channel>` reads existing live linkset attachments for the
owning avatar, using the attachment avatar rather than the object's owner.
Without a point it returns 56 characters: a reserved `0`, then occupancy bits
for attachment IDs 1 through 55. Multiple objects at one point produce one bit.
Named queries return `1` or `0`; invalid names produce an empty reply. RLVa
records `outcome: 'failed-option'` on that reply; Kokua has no option failure. `root`
aliases `avatar center`. HUD names use `center`, `top`, and so on, without a
`hud ` prefix. Attach and detach fixtures through `linkset.attachToAvatar` and
`linkset.detachFromAvatar`; replies observe the current state. HUDs appear in
these queries even though `llGetAttachedList` omits them.

Only RLVa supports `@getattachnames[:<group>]=<channel>`. It returns capitalized,
comma-separated occupied point names once each in attachment-ID order. Empty
occupancy produces an empty reply. Groups are `head`, `torso`, `arms`, `legs`
and `hud`; unknown options include all points. The `hud` filter uses viewer
group 8, which contains Jaw and newer skeleton points. HUD points themselves
use group 9 and are included when querying all points.

`RLV_ATTACHMENT_POINTS` exposes the frozen canonical table.
`getRlvAttachmentReply(linkset, avatar.viewer, behaviour, option?)` returns the
untruncated text, or `undefined` for unsupported queries. `setRlvAttachmentBridge(
avatar.viewer, rootKey)` identifies an existing valid Firestorm bridge fixture;
pass `undefined` to clear it. RLVa excludes this object only at Center 2. Kokua
counts it normally. No bridge is synthesized or inferred from an object's name.
`RLVA_ATTACHMENT_SETTINGS.hideLockedAttachments` is fixed at the reference
default `false`, so self-locked attachments remain visible. Lock-filter setting
overrides, `getaddattachnames` and `getremattachnames` remain outside the
query forms. Attachment lock enforcement has a separate contract.

`RLV_MANIFEST` schema version 3 lists covered forms, reference implementation
versions, files and symbols, and wiki comparisons. Query support marked `enforced`
means a reply is delivered; version reporting does not imply support for other
commands or viewer actions. Per-object compatibility settings remain outside the covered forms.

Object replies use the avatar UUID, name and current position. Positive replies
reach listeners within 100 m across region boundaries, including the issuing prim.
Kokua accepts signed nonzero channels; its negative replies use dialog delivery
within 20 m in the avatar's current region. RLVa rejects negative channels, zero
and DEBUG_CHANNEL. Kokua permits DEBUG_CHANNEL and delivers it through the shout path.
Rejected channels do not produce an empty reply; valid queries with empty results do.

`sendViewerReply(linkset, avatar, channel, message)` from `@rezless/vm` exposes the
same delivery policy to fixtures and future query handlers. It returns the attempted
`{ channel, text }` reply, or `undefined` for rejection or a disabled viewer. Kokua
cuts raw UTF-8 bytes at 1,023 for positive channels and 254 for negative channels;
incomplete characters become U+FFFD in VM strings. RLVa keeps complete characters
within 1,023 bytes. Query replies produce one message, without splitting. Ordinary
script chat uses its existing routing and limits.


### Viewer editing and inventory rezzing

`fixture.edit(prim)` opens the editor through the profile's edit permissions.
`world.attemptAvatarEdit(avatar, prim)` exposes the same action. Outcomes are
`opened`, `blocked`, or `unsupported`, with a reason and deciding restrictions.
`fixture.editActions` returns frozen action records. Root UUID options to `edit`
grant access to the whole linkset; `editobj:<root-uuid>` denies it. Child UUIDs do
not target the root. `editworld` and `editattach` independently deny world and
attached objects, including HUDs for `editattach`.

Kokua RLV 2.09.35.00 supports `edit_sec`. Each secure issuer must grant its own
exception, and `permissive=n` extends that rule to ordinary edit locks. Firestorm
RLVa 2.4.2 rejects `edit_sec` and keeps edit exceptions permissive. Kokua's
`interact` blocks direct editing of non-HUD targets; RLVa's direct editor check
allows it. Editor selection has no touch-distance check.

`fixture.rez(itemId, position)` and `world.attemptAvatarRez(avatar, itemId, position)`
drop a saved inventory object into the avatar's current region. `rez` and
`interact` block drops in both profiles. Outcomes are `rezzed`, `blocked`, or
`unsupported`, with deciding restrictions and the created `object` on success.
`fixture.rezActions` records attempts. Seed an object definition through an inventory
entry's `object` and `assetType: 'object'`. Allowed drops create fresh keys, retain
saved script state and queue `on_rez(0)`. Copyable inventory items stay available.
Missing object definitions and no-copy inventory transfers return `unsupported`.
Parcel build permissions, land capacity and simulator placement are outside this
fixture. The supplied position is the new root position.

`fixture.take(prim, { copy })` and `world.attemptAvatarTake(avatar, prim, { copy })` take
an object the avatar owns into inventory, or a copy of it. Outcomes are `taken`, `blocked`
or `unsupported`, with deciding restrictions and the saved `object` on success;
`fixture.takeActions` records attempts. A taken object leaves the world, and an avatar
sitting on the object is stood up either way. Worn objects, objects of another owner and
a take of the seat the avatar sits on are `unsupported`: no viewer offers that Take. The
refusals follow the viewers' menu code. Firestorm RLVa 2.4.2 blocks a copy of the seat its
avatar sits on under `unsit`, and blocks a take under `rez`, under `edit` (even with an
exception for the object) and under an edit lock on the object. Kokua RLV 2.09.35.00 blocks a
take under `rez` and has no check on a copy. `linkset.copy()` and `llDerezObject` are the
simulator's side and take no notice of the viewer's restrictions.

`interact` blocks user click sitting and inventory drops in both profiles. HUD
touches bypass it. RLVa applies it before `touchme`; Kokua applies it to world
touches after `touchme`, leaving attachment touch checks unchanged. Forced sitting
and simulator actions remain independent.



### Avatar movement restrictions

`fixture.move(action)` and `world.attemptAvatarMovement(avatar, action)` accept
`fly`, `land`, `jump`, `alwaysrun`, `temprun` and `walk`. Results report `allowed`,
a denial reason and deciding restrictions; `fixture.movementActions` retains them.
Flight changes update `AGENT_FLYING` for `llGetAgentInfo`. Either run mode sets
`AGENT_ALWAYS_RUN`; walking or clearing the final active mode removes that bit. Jump records upward
input permission without simulating airborne motion. Seated avatars cannot take off.

Both profiles stop flight on `fly=n`. Firestorm RLVa 2.4.2 separately clears and
blocks always-run and temporary-run modes; `jump=n` blocks upward input while
grounded. Kokua RLV 2.09.35.00 clears both run modes under `temprun=n`, and under
`alwaysrun=n` when always-run is active. Removing locks never restores modes.
Only RLVa supports `fly[:true|false|0|1]=force`, exempting the issuing prim from
its own flight lock. Other issuers still block forced takeoff.

`getAvatarMovementState(avatar)` initializes mutable `avatar.movement` state.
An initial `AGENT_ALWAYS_RUN` info bit seeds always-run mode. Set the movement
fields explicitly when a fixture needs to distinguish temporary running.
`adjustheight` force changes its `hoverOffset`, clamped to -2 through 2 metres,
without moving the avatar. Relative `reference;scalar[;offset]` forms with a
nonzero scalar need an explicit `pelvisToFoot` skeleton distance. Kokua uses
integer-prefix centimetres and retains that fallback for a zero scalar; RLVa
accepts decimal numeric prefixes and validates every field. Set `hoverEnabled=false`
to model an RLVa region without hover support for a server-baked avatar.

`getRlvViewerState(avatar)` exposes `adjustheight`'s current hover offset and
RLVa's `allowidle` policy: a 1800-second idle threshold and preservation of away
state on away-animation completion. It does not run an idle timer or set
`AGENT_AWAY`. Kokua keeps `jump`, `allowidle` and forced flight unsupported.

### Viewer seating

Explicit user seating uses `fixture.userSit(prim, offset?)` and
`fixture.userStand()`. Both return a boolean and drain due events. World callers
can use `world.userSitAvatar(avatar, prim, offset?)` and
`world.userStandAvatar(avatar)`, then advance virtual time to deliver events.
These attempts enforce `interact`, `sit`, seated `unsit`, and `sittp[:distance]` without issuer
exemptions. The optional offset is a region-axis pick offset, independent of the
configured sit target. The minimum numeric distance applies, defaults to
1.5 m and excludes the exact boundary. Kokua compares signed limits; RLVa squares
the combined limit. Both profiles accept hexadecimal prefixes, infinity and NaN.
Kokua uses `atof` prefixes, invalid text means zero, numeric overflow becomes
infinity and underflow becomes zero. Its minimum starts at one million metres,
ignoring NaN and positive infinity. RLVa uses `stof` prefixes and rejects malformed
text and numeric overflow or underflow. Its sorted modifier list inserts equal or
unordered values before existing values. Removing a NaN rule cannot remove its
modifier by float equality; session reset clears it.
`world.sitAvatar`, `world.standAvatar`, `llSitOnLink` and `llUnSit` retain their
independent simulator behavior. Force-sit issuer rules remain profile specific.


`getsitid` uses the existing reply-channel policy. It returns the null UUID
standing and the linkset root UUID on an object, including child sit targets.
Firestorm RLVa 2.4.2 reports the avatar UUID during ground sitting; Kokua RLV
2.09.35.00 reports null on the ground. Query options are ignored.

`sit:<uuid>=force` seats the owner through World seating without granting script
permissions. It uses the requested free sit target, then the first free configured
target in link order. Objects must be live, unattached and in the avatar's region;
occupied seats and unknown targets leave the current seat intact. Neither viewer
imposes a distance cap on forced sits. Configured targets work throughout the
same region. Plain prims use explicit simulator responses for farther surfaces:

```ts
world.setSitResponse(seat, {
  position: { x: 0, y: -10.09, z: 0.88 }, // Prim-local final avatar position.
  rotation: { x: 0, y: 0, z: -Math.SQRT1_2, s: Math.SQRT1_2 },
  autopilot: { durationMs: 2000, success: true }, // Optional navigation outcome.
})
```

A response without `autopilot` seats immediately. Otherwise virtual time completes
the pilot before seating and `CHANGED_LINK`; failure leaves the avatar standing.
Already seated on the same linkset, the viewer bypasses autopilot. Command logs
record `pending` followed by the completion outcome. `world.cancelSitAutopilot(avatar)`
cancels the pilot. New accepted sits replace pending ones; session reset discards
them. Position, region and parent changes cancel outstanding pilots, including a
teleport back to the original coordinates. Completion rechecks occupancy and target
lifetime before seating.

`world.setSitResponse(seat, null)` refuses a request, and `undefined` restores the
default. Responses snapshot their inputs. Positions and rotations follow the seat
when it moves. Defaults retain configured sit targets and nearby plain-prim centre
poses within 8 m. Far plain prims without a response refuse with `world-constraint`
instead of `unsupported`. Simulator seating through `world.sitAvatar` bypasses
these viewer response fixtures. User attempts still check their clicked point
against `sittp` before accepting a response; forced sits bypass that restriction.
Pathfinding, automatic collision placement and avatar body offsets remain explicit
inputs rather than a simulated physics or avatar skeleton.

Force `sit`, `sitground` and `unsit` reach World seating 225 ms of virtual time
after the command (the grid switched between 0.2 and 0.25 s), and the command log
records `pending` first. Until then `getsitid`, later commands in the same message
and event, and `llGetAgentInfo` see the old seat, so step virtual time (250 ms is
enough) after an RLV force sit or stand before reading the seat. Lock checks run
at the command.

Empty and null-UUID sit requests ground sitting in RLVa and have no effect in
Kokua. `sitground=force` ground-sits in both profiles and ignores its option.
Ground sitting sets `AGENT_SITTING`, clears `AGENT_ON_OBJECT`, and removes an
existing object seat. From a seat, the avatar stands first, so the seat's
`CHANGED_LINK` handler reads it standing, and sits on the ground 300 ms later (the grid's delay varied between 0.265 and
0.53 s in seven runs over two sessions);
advance virtual time to finish it. The command log records `pending`, then the outcome. A later sit request drops it. Kokua checks
its sit locks again before that ground sit; RLVa does not. In RLVa a standtp return
replaces it, and RLVa then ground-sits the avatar at its next stand from an object. `unsit=force` stands the avatar. Successful object sit/stand
operations produce normal `CHANGED_LINK` events; ground sitting adds no object link.
A forced ground sit of a seated avatar is a stand followed by a ground sit, so the seat's
`changed` handler reads the avatar as standing, as in Second Life.

Object force sit obeys all no-option `sit` locks and, while already sitting, all
`unsit` locks. RLVa force unsit and ground sit exempt only the issuing prim;
Kokua force unsit and ground sit exempt no emitter, and its ground sit also obeys
an enforced `interact` lock. Force commands retain these checks independently of user attempts.

`standtp=n` returns the avatar after user stand, force unsit, `llUnSit`, or seat
deletion. Viewer object-sit requests from standing save the global return origin.
Kokua also saves the current position when a new rule is added, including while
seated; duplicate adds leave it intact. RLVa does not capture an origin when the
rule is added after sitting, and refuses object-sit requests while already seated
under `standtp`. RLVa ignores a zero global origin; Kokua can return there.

The return uses `World.teleportAvatar`, preserves facing, and sends the normal
`CHANGED_TELEPORT` and applicable `CHANGED_REGION` events to worn scripts. Advance
virtual time to complete it. A return already queued survives removal of the rule. Viewer session reset cancels
pending returns and clears saved origins.
Kokua returns only with direct parcel teleport routing, the default when no parcel
fixture is supplied. RLVa returns regardless of that setting. Return travel
bypasses `unsit`, `sittp`, `tploc`, `tplocal`, and `tplm`; these locks still govern
ordinary actions, including whether user stand or force unsit is accepted.
Login persistence and Kokua's optional standtp defeat setting are outside the fixture.

Inspect `avatar.viewer.commandLog` records with `status: 'action'`: `action`,
`actionOutcome` (`applied`, `unchanged`, `refused` or `pending`), requested `target`, resulting
`seat`, and an optional refusal `reason`. These are synchronous fixture outcomes,
not confirmations from a network simulator. Unsupported forms retain diagnostics.
The manifest includes `getsitid`, force `sit`/`sitground`/`unsit`, and add/remove
`sit`/`unsit`/`sittp`/`standtp` forms in command discovery.

### Command discovery and shared folder queries

`@getcommand[:<substring>[;<type>[;<separator>]]]=<channel>` is available in the
Firestorm RLVa 2.4.2 fixture. It lists implemented manifest forms, including
state-only restrictions, rather than the full viewer dictionary, in the
dictionary's order. Environment and debug settings and the overlay and sphere
modifiers are not dictionary entries, so they stay out of discovery. The default
and `any` type include add, force and reply forms; `add`, `force` and `reply`
select one type. Names match substrings. The separator defaults to `;`; an
explicit empty separator concatenates names. Extra fields are ignored and wire
options are lowercased. No matches and unknown types each deliver one empty
reply, but unknown types also record `invalid-option`. Replies use the existing
channel and length policy. Kokua RLV 2.09.35.00 has no discovery query handler;
its numeric query produces no reply, while add/remove follows generic wire-rule
storage with unsupported effects.

`getRlvCommandCoverage(profile)` from `@rezless/vm` returns frozen form snapshots
with `behaviour`, `type`, `option` and `support`. Manifest `commandForms` entries
are the discovery registry. Include each implemented form and give it its own
support depth; unsupported entries describe recognized forms without advertising
them. `getRlvCommands(profile, option?)` returns untruncated discovery text, or
`undefined` for Kokua. Discovery orders restrictions before force commands and
replies, and names within each type; separate forms can repeat a name.

Unsupported command-log records retain status `unsupported` and expose an
`outcome` for `unknown-behaviour`, `wrong-parameter-kind`, `unsupported-form` or
`invalid-channel`. Diagnostic details include the same outcome. Unknown means
absent from the profile's manifest registry, which does not model every viewer
command. Existing state-only restriction diagnostics and snapshots describe the
retained state separately. No failure acknowledgement is invented on the wire.

`seedRlvInventory` also accepts `wornAttachments: [{ itemId, rootKey }]`.
Each mapping identifies a seeded item and the root UUID of an existing linkset.
Items and roots must be unique; invalid mappings leave the previous fixture
intact. Seeding mappings does not attach objects. Queries read the current live
avatar attachment state, in attachment order, so detachment, reattachment and
point changes take effect immediately. Duplicate item names retain their identity.

`@findfolder:<criteria>=<channel>` returns one matching shared folder path;
`@findfolders:<criteria>=<channel>` returns all matching paths. All nonempty
`&&` terms must match the folder name without case sensitivity. Kokua traverses
children before their parent and takes the first match, skipping dot- and
tilde-prefixed subtrees. RLVa traverses parents first and picks the deepest
single match, with the first match winning ties. Its hidden, tilde-prefixed and
slash-bearing names do not match, but their descendants remain searchable.
Multiple results preserve traversal order and commas in names remain unescaped.
Kokua alone accepts a custom separator after a semicolon on `findfolders`.

`@getpath[:<selector>]=<channel>` and `@getpathnew[:<selector>]=<channel>`
accept a clothing/bodypart layer, an attachment point, an attachment object UUID,
or an empty selector for the issuer. Inventory UUIDs cannot select objects. Only paths under the explicit
shared root are exposed. `getpath` selects the first result; `getpathnew` lists
all paths with commas, including duplicate paths. Kokua retains empty positions
for point attachments without shared inventory items; RLVa omits those items.
RLVa collapses an effectively folded containing folder to its parent. These
fixtures cover modifiable attachments; no-mod folder-name inference, inventory
links and wear operations are outside these path-query fixtures.

Layer selectors read `wornWearables` in fixture order, representing wearable order
in Kokua and current-outfit item order in RLVa. Both skip clothing outside the
shared root before choosing the first `getpath` result. Empty layers and absent
shared roots reply with an empty string. All 17 clothing and bodypart layers are
recognized. Kokua preserves empty shared-root positions in `getpathnew`; RLVa
inserts commas only after a nonempty reply, omitting leading empty paths.
Invalid selectors reply empty, with `failed-option` in RLVa.


### Outfit and worn inventory queries

`seedRlvInventory(avatar, config)` accepts `wearableType` on item entries and
`wornWearables`, an array of those item IDs. Layers are `gloves`, `jacket`,
`pants`, `shirt`, `shoes`, `skirt`, `socks`, `underpants`, `undershirt`, `skin`,
`eyes`, `hair`, `shape`, `alpha`, `tattoo`, `physics` and `universal`.
Use `assetType: 'object'` for unworn object items; items in `wornAttachments`
also count as objects. Set `modifiable: false` for Kokua no-mod folder scoring.
IDs, layer names and wearable identity are validated before replacing a fixture.
Snapshots own their copies, and replacing a fixture immediately changes replies.

```ts
seedRlvInventory(avatar, {
  sharedRootId: 'root',
  entries: [
    { id: 'root', parentId: null, name: '#RLV', kind: 'folder' },
    { id: 'outfit', parentId: 'root', name: 'Outfit', kind: 'folder' },
    { id: 'shirt', parentId: 'outfit', name: 'Shirt', kind: 'item', wearableType: 'shirt' },
    { id: 'jacket', parentId: 'outfit', name: 'Jacket', kind: 'item', wearableType: 'jacket' },
  ],
  wornWearables: ['shirt'],
})
// @getoutfit:shirt=<channel> replies "1".
// @getinvworn:Outfit=<channel> replies "|20".
```

`getoutfit` returns 17 occupancy bits in the layer order above, without a
reserved prefix, or one bit for a named layer. Bodyparts are explicit fixtures;
an empty fixture has no implicit shape, skin, hair or eyes. Multiple worn items
in one layer still occupy one bit. Unshared worn wearables count too. Invalid
selectors return the full bitmap in Kokua RLV 2.09.35.00, or an empty reply with
`failed-option` in Firestorm RLVa 2.4.2. RLVa uses `RlvHideLockedLayers=false`;
lock-filter overrides are unsupported.

Firestorm RLVa 2.4.2 also supports the optionless queries
`@getoutfitnames=<channel>`, `@getaddoutfitnames=<channel>` and
`@getremoutfitnames=<channel>`. Replies are comma-separated lowercase layer
names in this order: shape, skin, hair, eyes, shirt, pants, shoes, socks,
jacket, gloves, undershirt, underpants, skirt, alpha, tattoo, physics, universal.
Each layer appears once. Empty results still deliver a reply; nonempty options
return an empty reply with `failed-option`. Kokua RLV 2.09.35.00 has no handlers
for these queries and leaves them inspectably unsupported.

`getoutfitnames` lists occupied layers, including bodyparts and unshared items.
`getaddoutfitnames` lists layers that allow either replacement or addition.
Global and named `addoutfit` locks exclude their layers. When a `remoutfit` lock
protects a worn layer, replacement is unavailable: bodyparts and physics cannot
add a second item, while other clothing can add only below 60 total worn clothing
items. A layer with no locked worn items remains replaceable, including at capacity.
`getremoutfitnames` lists layers with at least one removable worn clothing item.
Bodyparts never qualify. Every issuer's global and named `remoutfit` locks apply,
including the query issuer's own locks. Item and parent `nostrip` names are
case sensitive, with ancestry followed through folded folders. These queries use
the same explicit inventory and layer locks as the clothing actions; inventory
links and composite outfits remain outside the fixture. Folder removal locks also filter removal names and prevent replacement at clothing capacity.

`getinvworn` returns `|<direct><descendants>` for the selected folder, followed
by comma-separated child names and their codes. Each digit is 0 for no wearable
items, 1 for none worn, 2 for some worn, or 3 for all worn. Clothing, bodyparts
and objects count together. Only current live attachments for that avatar make
mapped object items worn. Ordinary nonwearable inventory does not count.
Kokua preserves fixture child order and ignores items directly under the shared
root. Its single no-mod object folders named with an attachment point use 10/30
codes and contribute to their parent's direct count, including hidden no-mod
folders. Normal hidden subtrees do not contribute.

RLVa orders immediate children by UUID, includes direct root items, and retains
slash names and unescaped commas in child listings. Effective `folded` child
folders with exactly one object contribute their direct items to the containing
folder instead of appearing as children. Folded clothing and bodyparts with
`nostrip` in the item or folded ancestry through the first non-folded parent do
not contribute.
Folded children with any other object
count do not contribute; normal hidden subtrees do not contribute. The fixture
uses `RLVaEnableSharedWear=true`; naming inference and setting overrides are
unsupported. A directly selected folded folder becomes the collection root in RLVa. Its
direct items count normally, including clothing marked `nostrip`, and its visible
children retain their own scores. Kokua retains its no-mod sentinel scoring for
the same fixture. Missing paths and absent shared roots send
empty replies. Both queries participate in RLVa `getcommand` discovery.

These queries do not perform wear/removal, baking or rendering. Item links count
target occupancy; gestures and folder-link occupancy are outside their covered forms.
`getpath` and `getpathnew` also query the folders of worn items on each layer.

### Viewer sessions

Viewer delivery controls are opt-in and shared by all scripts using an avatar.
They leave normal query and force-action handling unchanged until called:

```ts
avatar.viewer.dropNext(command => command.startsWith('@getinv='))
avatar.viewer.answerNext('', command => command.startsWith('@getpath'))
avatar.viewer.hold()
// Drive scripts: query replies and forced inventory actions wait in one queue.
avatar.viewer.release(1) // schedule the oldest delivery; keep holding new work
script.advanceTime(0)
avatar.viewer.release() // schedule everything remaining and resume automatic delivery
script.advanceTime(0)
```

`dropNext(predicate?)` suppresses one matching query reply;
`answerNext(text, predicate?)` replaces one with the supplied text. The predicate
receives the individual RLV command string, including `@`, option and channel.
Omitting it matches any query. Overrides stack in registration order: each query
consumes the first matching override, leaving nonmatching ones for later queries.
They are selected when the query arrives, before holding; forced actions and
restriction notifications do not consume them. Chosen text follows the profile's
reply length and channel rules. An empty `getpath` answer is an empty chat
message on the requested channel, with the avatar as speaker, without separators
or an added folder prefix.

`hold()` queues replies and forced inventory actions, including folder wear and
removal and `detachme`. `release(count)` accepts a nonnegative safe integer and schedules at most
that many deliveries in send order; zero does nothing, and an oversized count
drains the queue while continuing to hold new work. With no count, `release()`
drains it and resumes automatic delivery. New replies stay behind released work
until it dispatches. Released work runs on the scheduler,
never inside the handler that sent it. Advance a linkset in the world to dispatch
it. Query values and accepted force-action plans are captured when sent; the
queued actions apply when dispatched. Released replies use the listeners present
at delivery: reset scripts can hear them through a newly installed listener,
removed scripts cannot, and a removed listener receives nothing. Other listening
scripts can still hear the reply. Viewer session reset cancels held replies.
Accepted forced actions survive removal of their issuing script.

Viewers default to ready. Pass `viewer: { profile: 'rlva', ready: false }` to
`World.addAvatar`, or `viewer: { ready: false }` to `loadRlvPair`, to retain startup
commands. `setRlvViewerReady(avatar)` releases them in wire order. Command logs
record retention with `status: 'queued'` and record execution separately.
After release, call `script.advanceTime(0)` to drain queued LSL listener replies.

Kokua RLV 2.09.35.00 answers version queries during startup unless
`doNotQueueVersionRequests: false` is supplied. Firestorm RLVa 2.4.2 retains
incoming queries. `avatar.viewer.session.setStartupPhase('misc')` enables its
early version flush every 2000 virtual milliseconds, grouped as version,
versionnew, then versionnum. Other commands wait for readiness.

`setRlvObjectAvailable(avatar, primKey, false)` removes an issuer from the viewer
object list while leaving its simulator object intact. Pass `true` when the
viewer resolves it again. Distance and region changes alone preserve object
references. Deletion and taking an object out of the World make it unavailable.
RLVa checks every 30000 ms from the first restriction and stops on an empty
collection pass. Clearing the last rule preserves that deadline until the pass;
known missing issuers
expire on the next check, while never-resolved issuers expire on the twenty-first
miss. Completed detach immediately clears known RLVa attachment rules and notify
registrations. A locked inventory attachment that detaches anyway queues recovery
before those rules are cleared. Seed its item identity through `wornAttachments`;
no shared-folder placement is required. Unmapped and temporary attachments do
not recover. The original point takes precedence over inventory item naming.

Kokua RLV 2.09.35.00 waits 15000 virtual milliseconds after the last newly queued
item, then recovers items in queue order. Only one item per point is queued.
Recovery replaces occupants and bypasses add/remove locks. Pending recovery
pauses collection and retains incoming commands, with the configured version
query bypass. Failed recovery retries once elapsed whole seconds exceed 60;
new commands then pass through, while earlier retained work waits for success.
Successful recovery releases that work and preserves the recovered object's
restrictions and retained prim identities, including after a region change.

Firestorm RLVa 2.4.2 adds recovered items alongside existing occupants, bypassing
wear locks. `avatar.viewer.session.savedAttachment(itemId)` supplies an inventory
save acknowledgement; advance the clock by zero to complete its queued request.
A watchdog ticking every 10000 ms from the first pending detach requests recovery
once more than 15000 ms have elapsed, including after a failed acknowledged
attempt. Later failed watchdog requests retry after more than 30000 ms. Further
save acknowledgements can request recovery until the first watchdog attempt. Missing inventory items cancel
pending recovery. Commands continue during recovery, and cleared self restrictions
are not restored. The registered valid bridge is exempt.

Both profiles deliver `attach(NULL_KEY)` at point zero, followed on recovery by
`on_rez` and `attach(owner)` at the original point. Notify subscriptions receive
`/detached illegally <Point>` and `/reattached legally <Point>`. Viewer session
reset and avatar removal cancel recovery. Kokua reattach-delay setting overrides
are unsupported.

Kokua uses time-based maintenance after readiness. The default first wait and
interval are both 10000 ms. `initialGarbageCollectionAdditionalWait`, default
5000 ms, adds to a 5000 ms minimum. `garbageCollectionAdditionalInterval`, default
8000 ms, adds to a 2000 ms minimum. These additions must be finite and nonnegative.
`useNewGarbageCollectionTiming` defaults true. Set it false for the legacy frame
counter: the first collection runs after 200 eligible frames, then every frame
(the counter never resets). `garbageCollectionFramesPerSecond` maps virtual time
to viewer frames, defaults to 60 and must be finite and positive. Frames count
only while ready and not waiting for attachment recovery, even with no issuers.
Frame mode ignores the time and visibility settings.

Time mode defaults to `garbageCollectionIgnoreFirstFullyVisible=true`. Set it
false to delay scheduling until the avatar first de-clouds plus
`garbageCollectionFirstFullyVisibleDelay` (default 15000 ms), or until
`garbageCollectionFirstFullyVisibleTimeout` (default 45000 ms after readiness),
whichever comes first. `firstFullyVisibleAt` supplies the de-cloud moment in
milliseconds from session binding; absent means still clouded. This represents
the avatar becoming fully loaded, independently of whether it is hidden by a
restriction. The visibility gate and first collection use strict deadlines,
executed on the next virtual viewer frame; the initial 5000 ms plus configured
additional wait starts after the gate opens. Visibility times must be finite
and nonnegative. These settings do not change RLVa's collection schedule. All missing
Kokua issuers, including never-resolved or detached prims, expire on a maintenance
pass. Collection sends `/clear`, with individual removal notices only for Kokua.

`resetRlvViewerSession(avatar)` silently clears restrictions, registrations,
retained work and undelivered viewer replies, and returns to not-ready state.
Scripts and inventory retain simulator state. Script reset alone preserves viewer
rules. Commands sent again by scripts after a new session begins can reapply them.
The session binds its virtual clock on the first command; fixtures that need an
earlier origin can call `avatar.viewer.session.bind(linkset, avatar)` explicitly.
`loadRlvPair` binds each session when its fixture is created.

`tpto:<x>/<y>/<z>[;<angle>]=force` and
`tpto:<region>/<x>/<y>/<z>[;<angle>]=force` move the owner through explicit
`world.addRegion` fixtures. Region names resolve case-insensitively; global
coordinates use half-open 256 m region bounds. Unknown destinations refuse
without changing the avatar. `fixture.teleportActions` exposes requested global
coordinates, resolved destinations, resulting state and refusal reasons.
Successful moves stand the avatar with normal link events and grant no script
permissions. Worn objects move with the avatar: they report its region, keep
hearing its viewer replies and get `changed(CHANGED_TELEPORT)`, with
`CHANGED_REGION` added when the region changes. Simulator teleport builtins retain their permission and experience checks.

Kokua truncates coordinate prefixes to integers, discards empty slash fields and
pads missing global fields with zero. Supplied angles do not set facing. Global
moves temporarily exempt the issuer's bare `tploc`, `tplocal`, `unsit` and `sittp`
locks; named-region callbacks run with those locks restored. Remaining `tploc`
locks block every move. Same-region `tplocal` limits are inclusive. Named moves
with an angle preserve orientation and respect all `sittp` limits.

RLVa preserves fractional coordinates and uses an optional radian angle as the
horizontal facing direction. It accepts numeric angle prefixes and final-coordinate
suffixes, rejects malformed or empty angles, and ignores extra semicolon fields.
Moves below 256 m in XY obey strict XYZ `sittp` and `tplocal` limits; longer moves
obey `tploc`. The bare `tplocal` limit is 1.5 m and its maximum is 256 m. Only the
force issuer is exempt from lock-presence checks; competing distance modifiers
still use the global minimum. Foreign seated `unsit` blocks travel. `tplm` and UUID
`tploc` options do not grant exceptions for location teleports.

User landmark and map travel use `fixture.userTeleportLandmark(globalPosition)`
and `fixture.userTeleportMap(globalPosition)`; inspect immutable outcomes through
`fixture.userTeleportActions`. The World equivalents are
`world.userTeleportAvatarViaLandmark(avatar, globalPosition)` and
`world.userTeleportAvatarViaMap(avatar, globalPosition)`. Landmarks supply resolved
global coordinates and obey `tplm`, independently of `tploc` and local distance
limits. Map travel follows each profile's location policy described above, with
no issuer exemption. Both actions enforce seated `unsit`, record the deciding
restrictions, and reuse normal stand and worn-object events. The exported
`userTeleportRestrictions(world, avatar, kind, globalPosition)` returns the
applicable locks without moving the avatar. Unknown destinations and foreign
avatars refuse without changing state. Home travel and startup scheduling are
outside these actions.

Kokua coordinate fields use decimal integer prefixes, so hexadecimal and
non-finite fields become zero. Overflowing integer coordinates remain inspectably
unsupported. Its angles accept `atof` prefixes without changing facing. RLVa scans
global coordinates as doubles and named-region coordinates as floats, accepting
hexadecimal and non-finite values as well as overflow and underflow. Its angles
accept `stof` prefixes, including hexadecimal and explicit infinity or NaN, but
reject numeric overflow and underflow. Non-finite angles normalize to a zero
facing request and preserve orientation. World fixtures refuse non-finite
positions without changing avatar state. The `tplocal` cap maps NaN to 256 m.
Collision geometry and camera pose are outside the fixture.

### Force-wearing shared attachments

`attach`, `attachover` and `attachoverorreplace` accept a shared folder path
and `=force`. Give each object item an `object` definition from `loadLinkset`:

```ts
const cuff = await loadLinkset({ prims: [{ name: 'Cuff' }] })
seedRlvInventory(avatar, {
  sharedRootId: 'root',
  entries: [
    { id: 'root', parentId: null, name: '#RLV', kind: 'folder' },
    { id: 'cuffs', parentId: 'root', name: 'Cuffs', kind: 'folder' },
    { id: 'cuff', parentId: 'cuffs', name: 'Cuff (left hand)', kind: 'item',
      assetType: 'object', object: cuff.linkset },
  ],
})
// @attach:Cuffs=force copies the definition into the avatar's World at Left Hand.
```

Actions run when the issuing script yields, even if the issuing object is gone
by then. Kokua ignores a leading `#RLV/` in force folder paths; RLVa treats it
as a folder name. They preserve item IDs, copy
script state without granting permissions, and use the existing attachment
clock and events. Repeated wear keeps an already-worn object. Detaching and
wearing again reuses its saved state. Source definitions stay in inventory.
`getpath`, `getattach` and `getinvworn` read the resulting attachments.
Existing `wornAttachments` mappings can identify live fixtures without a definition.

Both profiles add for `attachover`. `attach` and `attachoverorreplace` replace
named points, except that a folder beginning with `+` makes them add.
Kokua RLV 2.09.35.00 always adds unnamed items at their saved point.
Firestorm RLVa 2.4.2 replaces at the saved point for unnamed items. Set
`sharedWear: false` in the inventory config to skip unnamed RLVa items.
New definitions default to Right Hand. RLVa keeps the last named replacement
per point and processes its pending requests in item UUID order; Kokua processes
items in fixture order.

Kokua uses the rightmost recognized parenthesised point in an item name.
RLVa trims the last parenthesised item text, then falls back to the legacy
folder point. A no-mod RLVa item prefers the folder point. For folded children,
set `folded: true` and provide exactly one object in RLVa. Kokua collects a
single no-mod object in a point-named child folder. Ordinary subfolders are
not traversed.

A named replacement cannot displace a no-option `detach=n` locked occupant.
Add still works. Unnamed RLVa replacement keeps locked occupants and removes
unlocked ones. Point and folder locks also constrain these actions.
Each command record exposes `wearResults` with item IDs, resolved points and
attached, already-worn, blocked, skipped or unsupported outcomes. Unsupported
contents or missing definitions do not prevent supported items from wearing.
Item links use `linkTargetId` as described below. Asset fetching remains unsupported.

### Blacklist fixtures

Pass `viewer: { blacklist: ['sit', 'unsit%f'] }` to `loadRlvPair`, or include
`blacklist` in the viewer configuration for `World.addAvatar`. Kokua ignores
blacklisted adds after notifying subscribers, and ignores force commands listed
with `%f`. Removes remain available and `notify` registrations are exempt.
`versionnumbl` appends the entries to the numeric version; `getblacklist` returns
them in order, optionally filtered by substring.

RLVa ignores that list and supports neither query. Its separate
`viewer: { rlvaNoSetEnv: true }` fixture returns `failed-disabled` for `setenv`
add/remove before callbacks. Ignored
commands have `status: 'ignored'` and `outcome: 'ignored-blacklist'` or
`'failed-disabled'`; commands without implemented effects retain diagnostics.

### Environment settings

Pass `viewer: { environment: { sky, sharedSky, fixed, presets, daytimeSkies } }`
to `loadRlvPair` or `World.addAvatar`. The avatar's `viewer.environment.sky`
returns a frozen snapshot. Each avatar starts with default sky settings and a
shared environment unless `fixed: true` is supplied. `setenv=n` locks environment
changes from other issuers; its own issuer can still use force commands.
Remove the lock with `setenv=y` or `clear`. `rlvaNoSetEnv` disables the RLVa lock
add/remove forms independently of environment force/query support. Kokua's
`debugSettings: { noSetEnv: true }` ignores environment lock adds and all
force changes, while queries remain available. With that setting off, Kokua
lock adds enable atmosphere shaders and temporarily remove/reapply the issuer's
own lock around a force command, including its restriction notifications.

`setenv_<setting>:<value>=force` changes sky settings and
`getenv_<setting>=<channel>` replies after the script yields. Supported settings
include atmosphere, clouds, lighting, sun/moon angles and texture UUIDs.
The [coverage matrix](../../docs/rlv-coverage.md) lists every supported alias.
Kokua accepts slash or semicolon vectors and replies with semicolons and six
significant digits. RLVa requires slash vectors and replies with slashes and
six decimals. Both parse scalar numeric prefixes; Kokua converts nonnumeric
input to zero. RLVa rejects it. Non-finite numeric values and float32 overflow are unsupported and leave sky
values unchanged. Scalar settings retain values outside UI slider
ranges except for clamped sun/moon elevation and Kokua's gamma mapping.

`sky` and `sharedSky` use setting names without the command prefix. Their values
are native sky values: ambient and sunlight colors scale by three, blue colors
by two, density multiplier by 0.001. Kokua haze density scales by four and cloud
scrolling adds ten. Glow size/focus use their command units; sun/moon angles use
radians. For example `sky: { starbrightness: 0.5, ambient: [0.3, 0.6, 0.9] }`
starts with ambient command values of `0.1/0.2/0.3`. Snapshots expose these same
fixture units. Sky defaults come from the default sky, independent of region
weather or elapsed simulator time.

`presets` entries contain `name`, `asset`, `type: 'sky' | 'daycycle'`,
`location: 'inventory' | 'library'` and `sky`. Kokua resolves names in the
inventory environment folder; RLVa resolves sky and daycycle names in the
library. Asset UUIDs select matching fixtures directly. An asset without a
matching fixture records `selectedAsset` and leaves sky values unchanged.
Asset fetching and sky rendering are external. Kokua `getenv_preset` and
`getenv_asset` return the last named preset; individual edits clear it.
Those queries are unsupported in RLVa.

RLVa `setenv_daytime` accepts zero through one. Supply `daytimeSkies` keyed by
fractional time to select a fixed sky sample; without a matching sample it leaves
the sky unchanged. Kokua's daytime form freezes the current sky without changing
the sun position. `setenv_daytime:-1=force` restores `sharedSky` in both profiles;
Kokua also accepts any negative time and `setenv_reset=force`.
RLVa daytime replies are `2.000000` for a fixed sky or `-1.000000` otherwise.
Kokua replies `-1` after individual edits, or `0`/`1` for a named preset according
to whether the sun is below/above the horizon. Kokua legacy east-angle and
sun-position queries return both values separated by a semicolon; RLVa returns
only the requested angle. These fixtures do not advance a daycycle clock.

### Force removal and clothing actions

`@detach:<shared-path>=force` removes mapped direct attachments and effective
folded attachment children. Ordinary nested folders and siblings survive.
`@remoutfit:<layer>=force` removes the selected clothing layer;
`@remoutfit=force` removes clothing across shared and unshared inventory.
Skin, eyes, hair and shape remain worn. Every issuer's detach and layer removal
locks apply, including locks issued by the force-command emitter.

Each command records frozen `removeResults` with inventory `itemId`, `outcome`
(`removed`, `not-worn`, `blocked`, `skipped` or `unsupported`) and an optional
reason. The aggregate outcome distinguishes allowed, blocked, no-op, partial,
failed-option and unsupported-form. These are fixture observations; no wire
acknowledgement is emitted. Query replies reflect completed removals after the
script yields. Attachment events follow the existing simulator lifecycle.

`fixture.attemptWearable(itemId, wear)` explicitly adds or removes a clothing
item and returns `allowed`, `blocked` or `no-op`. Global and named
`addoutfit`/`remoutfit` locks constrain those actions. Seeding inventory stays
unrestricted. Bodypart changes and replacement layering are outside this helper.

Kokua layer removal honors ancestor folder names containing `nostrip`, case
insensitively; item-name protection applies only to folder removal.
RLVa checks item and parent names case sensitively, walking through folded
parents. A registered valid RLVa bridge is protected. Folder removal results
follow seed order for Kokua and inventory ID order for RLVa.

Multiple-folder delimiters remain unsupported. Point-group removal is described below.
Mixed folder contents retain unsupported items and report each result.
Invalid layer/path force options are inert in Kokua and fail in RLVa.


### Attachment point locks and removal

`@detach:<point>=n|y` locks removal at that point in both profiles; Firestorm
RLVa 2.4.2 also locks adding there. Kokua RLV 2.09.35.00 allows adding at a
named detach-locked point. `@addattach[:<point>]=n|y` and
`@remattach[:<point>]=n|y` lock adding and removal respectively, with an empty
option applying globally. Canonical point names are case insensitive, and
`root` aliases Avatar Center. Locks remain independent for each issuer.

`attemptViewerAttach(avatar, object, point, replace = false)` attempts explicit
user wear at a canonical point from 1 through 55, returning `allowed`, `blocked`
or `no-op`. Replacement honors every occupant removal lock. The object must be
unworn, live, owned by that avatar and in the avatar's World and region.
`attemptViewerDetach` and `fixture.attemptDetach` enforce removal locks.
Seeding attachment state through `attachToAvatar` stays unrestricted.

`@detach[:<point|uuid|group>]=force` removes all removable attachments, attachments at
a named point, or one root UUID. `remattach` is a force synonym, including the
existing direct folder form. UUIDs identify world objects, rather than inventory
items. Kokua resolves a child UUID to its root; RLVa accepts a child UUID as a
no-op, leaving the attachment worn. Point and UUID options take precedence over folder paths. Force
removal checks every lock, nostrip protection and the registered RLVa bridge.
Unmapped attachment results use the root UUID as `itemId`. Removals finish after
the script yields, with normal attachment events. Point and all-point commands
select currently attached targets when received; pending wear requests in the
same command batch are not included.

RLVa recognizes `head`, `torso`, `arms`, `legs` and `hud` groups when no shared
folder matches the option. Each current occupant is checked independently for
removal protection. The `hud` selector uses viewer group 8, including Jaw and
newer skeleton points; it excludes screen HUD points in group 9. Empty groups
are successful no-ops. Kokua treats group names as shared-folder paths and does
nothing when the path is missing. Recursive `detachall` has no group selector.

RLVa `@getaddattachnames[:<group>]=<channel>` returns points that allow adding,
even when replacement is locked. `@getremattachnames[:<group>]=<channel>` returns
points with at least one force-removable occupant. Both use canonical capitalized
names, comma separators, attachment-ID order, and the group filters documented
for `getattachnames`. Empty results produce an empty reply. Kokua leaves these
queries inspectably unsupported. Both queries participate in RLVa `getcommand`.

### Inventory offer decisions

`respondRlvInventoryOffer(avatar, script.inventoryOffers[index], decision)` resolves
one captured `llGiveInventoryList` avatar offer. Giving leaves the offer pending.
The helper refuses a different recipient, a fabricated offer, or a second decision.
Single-item and `llGiveAgentInventory` offers return an inspectable `unsupported`
result; disabled viewer profiles remain inert.

```ts
import { respondRlvInventoryOffer } from '@rezless/vitest'

const result = respondRlvInventoryOffer(avatar, script.inventoryOffers[0]!, {
  accept: true,
  allowSharedRouting: true,
})
script.advanceTime(0) // Deliver queued notify messages to LSL listeners.
```

`accept: false` declines without adding inventory. Shared routing requires the
explicit `allowSharedRouting: true` opt-in. Omitted or false routes accepted content
to ordinary inventory. The inventory fixture setting `forbidGiveToRlv: true` also
prevents shared routing. These controls authorize inventory insertion under #RLV.
Acceptance never wears or attaches items.

Successful results include `folderId`, a destination `status` of
`accepted-in-shared` or `accepted-in-inventory`, and `routed` indicating whether
the shared path move and rename completed. Accepted item entries expose frozen
`content` containing delivery-time item metadata and transferred permissions.
Existing snapshots and worn state survive acceptance.

Kokua RLV 2.09.35.00 requires an existing shared root and reports the original
folder name for accepted or declined offers. Firestorm RLVa 2.4.2 creates a missing
root and reports the final shared path on acceptance. It reports ordinary acceptance
or decline only for case-sensitive `#RLV/~` offers. RLVa paths deeper than four
segments including #RLV stay at the initial destination without rename or acceptance
notice; `routed` is false. Kokua permits deeper paths. Both reuse exact
case-insensitive parents and create distinct leaf folders for duplicate offers.

### RLV/RLVa camera lens

`setcam_fov:<radians>=force` changes the enabled avatar viewer's lens.
`setcam_fovmin:<radians>=n|y` and `setcam_fovmax:<radians>=n|y` aggregate
the strongest bounds across prims. `getcam_fov`, `getcam_fovmin` and
`getcam_fovmax` use the normal profile reply-channel policy.

```ts
changeRlvFov(fixture.avatar, 0.8) // user attempt, clamped to active bounds
expect(getRlvFov(fixture.avatar)).toBeCloseTo(0.8)
```

The lens is per avatar, defaults to pi/3 and uses viewport aspect 1.4242.
For an enabled viewer, a FOV passed to `script.setCamera` is a user lens change
and stays within active limits. Position reads also obey active distance limits.
`llGetCameraFOV` reads the permission agent's lens only with
`PERMISSION_TRACK_CAMERA`; viewer commands never grant that permission.

| Case | Kokua RLV 2.09.35.00 | Firestorm RLVa 2.4.2 |
| --- | --- | --- |
| Query precision | Six decimals, exact halves to even | Three decimals, exact halves to even |
| Unset limits | `0.000001` / `-0.000001` | Empty strings |
| Empty force angle | Zero, clamped to physical minimum | Reset to pi/3 |
| Empty limit angle | 1.5 radians | Rejected |
| Invalid numeric text | Zero prefix conversion | Rejected; valid numeric prefixes accepted |
| Contradictory bounds | Collapse to minimum FOV | Below minimum selects minimum; otherwise above maximum selects maximum |
| Last limit removed | Keep current angle | Restore saved angle, or pi/3 if persistence was disabled before the first limit |
| Query option | Ignored | Empty reply with failed-option outcome |

Explicit `nan`/`inf` values follow each profile's float behavior. RLVa retains
a NaN limit modifier after its wire restriction is removed; limit queries can
therefore return `nan` with an empty restriction snapshot. Finite values added
later can mask it. Query-visible modifiers and active restrictions are distinct.
User lens changes update the angle without changing its persistence mode.
Keyboard and preference UI event delivery are outside scripted in-world probes;
user lens attempts use the same lens setter as forces. Rendering and window resizing are outside this fixture.

### RLV/RLVa camera distance

`setcam_avdistmin:<metres>=n|y` and `setcam_avdistmax:<metres>=n|y`, including
the older `camdistmin` and `camdistmax` names, constrain the camera position
around a joint reference. Bounds aggregate across issuers and release through
remove, clear and viewer collection. Mouselook bypasses position clamping.
`llGetCameraPos` still requires `PERMISSION_TRACK_CAMERA`. Viewer queries work
independently of simulator permissions.

```ts
setRlvCameraOrigins(fixture.avatar, {
  avatar: { x: 128, y: 128, z: 22 }, // viewer joint reference
  camera: { x: 124, y: 128, z: 24 }, // default camera origin
})
fixture.script.setCamera({ pos: { x: 118, y: 128, z: 24 } })
const limits = getRlvCameraLimits(fixture.avatar)
const position = getRlvCameraPosition(fixture.avatar)
```

References use region coordinates. The default joint reference is the avatar's
position. The default camera origin is the fixture position supplied through
`script.setCamera`. Skeleton transforms, collision and smoothing are outside
the fixture. `setRlvCameraOrigins(avatar, {})` clears both explicit references.
A camera exactly at its clamp reference has no direction to scale. A positive
minimum then produces non-finite coordinates through the profile clamp arithmetic;
supply a nonzero camera offset when asserting finite distance-limited poses.
Pose reads also apply the limits to seated camera offsets and HUD projection.

| Case | Kokua RLV 2.09.35.00 | Firestorm RLVa 2.4.2 |
| --- | --- | --- |
| Unset avatar distance queries | `-1000000.000000` / `750000.000000` | Empty strings |
| Bound reply precision | Six decimals | Three decimals |
| Contradictory distance bounds | Minimum collapses to maximum | Both modifiers retained, clamp maximum before minimum |
| Empty distance bound | 1.5 metres | Rejected |
| Current-distance query | Unsupported | `getcam_avdist`, measured from avatar position |
| Origin bounds | Unsupported | `setcam_origindistmin` / `setcam_origindistmax` |
| Origin bound queries | Unsupported | Unsupported |
| `camzoommin` / `camzoommax` | Minimum / maximum magnification | Minimum / maximum FOV using pi/3 divided by multiplier |
| Empty zoom multiplier | 1.5 | 1 |
| Zoom queries | `getcam_zoom`, `getcam_zoommin`, `getcam_zoommax` | Unsupported |

Removing a final RLVa zoom alias keeps the current lens. Unlike native FOV limits,
zoom aliases do not save or restore the user lens. They still count as active FOV
restrictions, so a native limit added while an alias is active retains the previous
saved baseline.

In RLVa, equal avatar distance bounds override origin bounds. Otherwise active
origin bounds take precedence over avatar bounds. Numeric prefixes, explicit
non-finite values and query options follow each profile's camera parsing policy.
Kokua caps the default maximum avatar distance at 750000 metres because of its
default drawing limits.

RLVa `setcam_avdist:<metres>=n|y` selects a silhouette threshold rather than
moving the camera. `getRlvCameraLimits(avatar).silhouetteDistance` exposes the
strongest threshold as viewer state. Kokua leaves this command inspectably
unsupported. Rendering silhouettes is outside the fixture.


### RLV/RLVa camera control

Camera unlocking locks (`setcam_unlock` and `camunlock`) reset the camera to
an avatar-following rear view in both profiles. Firestorm RLVa 2.4.2 also
supports `setcam`, `setcam_mouselook`, `setcam_eyeoffset`,
`setcam_eyeoffsetscale` and `setcam_focusoffset`. Exclusive `setcam` control
selects one issuer for distance and FOV limits and rejects competing force
changes. Offset restrictions use first-added precedence; force offsets require
all offset restrictions to be released. Empty offset restrictions and all
focus-offset restrictions fail; focus-offset force commands accept slash-separated
vectors. Entry into the override preset copies the rear-view defaults,
resetting all controls, including the triggering value. Subsequent offset
changes apply to the active preset. Kokua RLV
2.09.35.00 keeps these additional forms unsupported.

`setRlvCameraPreset(avatar, { origin?, eye?, focus?, scale? })` supplies explicit
head/joint and rear-preset inputs. Defaults are avatar position, eye
`-3/0/0.75`, focus `1/0/1` and scale `1`. Offsets follow avatar rotation;
seated camera offsets take precedence. Camera position and rotation reads and
HUD projection share the effective pose and distance limits. Tracking reads
still require `PERMISSION_TRACK_CAMERA`. The first global RLVa mouselook
lock clears `AGENT_MOUSELOOK`, even for a nonprimary issuer. Subsequent entry
checks the primary issuer and camera minimum. Additional nonprimary locks do
not repeat the initial exit; removal does not restore mouselook.
Skeleton animation, camera lag, smoothing and collision are outside this fixture.

### Viewer UI restrictions

Use `getRlvViewerState(avatar, context?)` to assert on show/view restrictions.
It returns frozen effects with support depth, resolved `restricted` state and
issuer rules including options and exceptions. `restricted: null` identifies an
unsupported effect. See the [viewer-state query contract](../../README.md#rlvrlva-viewer-fixtures)
for target UUID, distance and HUD/world context and profile differences.

```ts
const inventory = getRlvViewerState(fixture.avatar).find(effect => effect.behaviour === 'showinv')!
expect(inventory.restricted).toBe(true)
expect(inventory.rules[0]).toMatchObject({ sourcePrim: fixture.script.host.key, option: '' })
```

### Camera render effects

The same `getRlvViewerState` query includes `setcam_textures`, `setoverlay`,
`setoverlay_touch` and `setsphere`. Their `parameters` contain the replacement
`texture` UUID, `overlays`, or `spheres`. Each overlay includes its issuer,
`enabled` hierarchy selection, `alpha`, `texture`, `tint` and `blockTouch`.
Each sphere includes `mode`, `origin`, `param` (four components), `distmin`,
`distmax`, `distextend`, `valuemin`, `valuemax` and `tween`. Firestorm spheres
also identify `sourcePrim`; Kokua combines them by mode. All snapshots are frozen.

```ts
const sphere = getRlvViewerState(fixture.avatar).find(e => e.behaviour === 'setsphere')!
expect(sphere.parameters?.spheres?.[0]).toMatchObject({ mode: 0, distmax: 8 })
```

Both profiles support `setcam_textures` and `camtextures`. Firestorm selects the
first retained texture modifier and canonicalizes the alias. An unoptioned
Firestorm rule inserts the default texture as a modifier with the same insertion
priority as an explicit UUID, so a later UUID does not override it. Kokua selects the
last changed texture, including removals. An unoptioned rule uses the viewer's
default texture. Firestorm supports overlay alpha/texture/tint force modifiers
and touch blocking; these effects remain inspectably unsupported in Kokua.

Firestorm accepts up to six independent sphere issuers. Its local force
modifiers require an active base restriction from the same issuer; an empty
modifier restores its default. Kokua accepts sphere parameters as add/remove
restrictions and force aliases, including before activation, and clears those
parameters when that issuer removes `setsphere`. Kokua combines minimum distances,
origin, extension and tween, maximum values, multiplied blend RGB, maximum blur
kernel size or component-wise maxima according to mode. Negative numeric
parameters clamp to zero. `setsphere_color` remains unsupported in Kokua.
Tween values expose configured targets and duration; this query does not render
pixels or interpolate animations. `setoverlay_tween` remains unsupported.

### Implemented `ll*` functions

The real-impl set covers the most common use cases. Anything outside it
falls through to a typed stub that returns the documented default
and records the call. Use `s.mock(name, fn)` to provide your own
behaviour for any function the script under test calls. Builtin
function delays (e.g. the 0.2s delay on `llSetLinkPrimitiveParams`) are
honored centrally in the dispatcher. Pass `stubs: 'warn'` or
`stubs: 'throw'` to `loadScript` to see when a test leans on a stub.

* **chat**: `llSay`, `llShout`, `llWhisper`, `llOwnerSay`
* **listen**: `llListen`, `llListenRemove`, `llListenControl`
* **dialogs**: `llDialog`, `llTextBox` — answer them with `s.answerDialog`; the answer reaches listens within 20 m of the prim that showed it
* **time**: `llSetTimerEvent`, `llSleep` (other scripts keep running while one sleeps), `llGetTime`, `llGetAndResetTime`, `llResetTime`, `llGetUnixTime`, `llGetTimestamp`, `llGetDate`, `llGetGMTclock`, `llGetWallclock` (US Pacific time), `llGetTimeOfDay` (seconds into the region's day) (start at `startUnixTime` and move with the virtual clock), `llGetRegionTimeDilation` (always 1.0), `llMinEventDelay` (spaces out timer and touch events; one waiting click is kept and later clicks are dropped)
* **region**: `llGetRegionName`, `llGetRegionCorner`, `llGetRegionFlags`, `llGetRegionFPS`, `llGetRegionAgentCount`, `llGetSimStats`, `llGetEnv`, `llGetSimulatorHostname`, `llEdgeOfWorld`, `llScriptDanger`
* **parcel effects and payments**: `llSetParcelMusicURL`, the six land ban/pass list functions, `llEjectFromLand`, `llReturnObjectsByID`, `llReturnObjectsByOwner`, `llSetParcelForSale`, `llManageEstateAccess`, `llParcelMediaCommandList`, `llParcelMediaQuery`, `llGiveMoney`, `llTransferLindenDollars`, `llTransferOwnership`. See the fixture and record-only limits above.
* **parcels**: `llGetParcelDetails`, `llGetParcelFlags`, `llGetParcelMaxPrims`, `llGetParcelPrimCount`, `llGetParcelPrimOwners`, `llGetParcelMusicURL`, `llGetLandOwnerAt`, `llOverMyLand`
* **object reads**: `llKey2Name`, `llGetObjectDetails`, `llGetObjectLinkKey`, `llGetObjectPrimCount`, `llGetObjectMass`, `llGetBoundingBox`, `llGetGeometricCenter` (any prim in the caller's region; `llGetObjectDetails` also reads local avatars, including seated roots and avatar resource totals), `llGetObjectPermMask` (the root prim's `permMask`, which a test can set to make an object no-modify or restrict its next owner)
* **environment**: `llGetEnvironment` (region values configured by parameter number), `llSetEnvironment`, `llReplaceEnvironment`, `llSetAgentEnvironment`, `llReplaceAgentEnvironment`, `llGetDayLength`, `llGetDayOffset`, `llGetRegionDayLength`, `llGetRegionDayOffset`, `llGetRegionTimeOfDay` (seconds into the region's day, moving with the virtual clock), `llGetSunRotation`, `llGetSunDirection`, `llGetMoonRotation`, `llGetMoonDirection` and their `llGetRegion*` forms
* **ground, water and wind**: `llModifyLand` (levelling and reverting only) and `llSetGroundTexture`, `llGround` (interpolated between whole-metre heights), `llGroundNormal`, `llGroundSlope`, `llGroundContour`, `llWater` and `llWind`, read from the region's `ground`, `water` and `wind` settings
* **HTTP**: `llHTTPRequest`, `llHTTPResponse`, `llRequestURL`, `llRequestSecureURL`, `llReleaseURL`, `llGetFreeURLs` (20000 per region), `llGetHTTPHeader`, `llSetContentType` — send requests to a script's URL with `s.sendHttpRequest`; one it doesn't answer gets a 504 after 25 seconds
* **email**: `llEmail`, `llGetNextEmail`, `llTargetedEmail` (each send sleeps 20 seconds) — mail to `<key>@lsl.secondlife.com` reaches that prim's queue, which holds 101 mails; queue a test's mail with `s.deliverEmail`
* **pathfinding**: `llCreateCharacter`, `llUpdateCharacter`, `llDeleteCharacter`, `llEvade`, `llExecCharacterCmd`, `llFleeFrom`, `llNavigateTo`, `llPatrolPoints`, `llPursue`, `llWanderWithin`, `llGetClosestNavPoint`, `llGetStaticPath`. Inspect `s.character.options` for explicit requested configuration and `s.character.commands` for command history. The character belongs to the object and survives script resets. `s.pathUpdate(type)` sends an event with an empty reserved list to the root prim's scripts. Movement, capsule fitting, option clamping and navmesh baking are not simulated. Set fixed query answers with `s.setNavigationResults({ closestNavPoint: [point], staticPath: [start, end, 0] })`, or use `s.mock` for answers that depend on query arguments. Without fixtures, closest-point queries return `[]` and static-path queries return `[PU_FAILURE_INVALID_GOAL]`; an out-of-range static-path radius returns `[]`.
* **sound**: `llPlaySound`, `llLoopSound`, `llLoopSoundMaster`, `llLoopSoundSlave`, `llPlaySoundSlave`, `llTriggerSound`, `llTriggerSoundLimited`, `llStopSound`, `llPreloadSound`, `llAdjustSoundVolume`, `llSetSoundQueueing`, `llSetSoundRadius`, and the `llLinkPlaySound`, `llLinkStopSound`, `llLinkAdjustSoundVolume`, `llLinkSetSoundQueueing`, `llLinkSetSoundRadius` variants. Inspect `prims[i].sound` from `loadLinkset`: `current` holds the last attached request or `null` after stop, `queueing` and `radius` hold settings, and `triggers` and `preloads` record one-shot requests. Names resolve in the calling prim's sound inventory; UUIDs work without inventory. Volume records the documented 0–1 range, while radius records the requested value. Audio playback, duration, queue progression, synchronization and effective audibility limits are not simulated.
* **prim media**: `llSetPrimMediaParams`, `llGetPrimMediaParams`, `llClearPrimMedia`, `llSetLinkMedia`, `llGetLinkMedia`, and `llClearLinkMedia`. Inspect `prims[i].media`, a map from face number to values indexed by `PRIM_MEDIA_*` constants. Setters validate atomically and return simulator status codes. Getters return values in requested order; clearing removes the face entry. Permission masks and URL whitelists are stored and validated, but browser rendering and avatar interaction are not simulated. Media link calls select one prim, including the measured first-other-prim behavior of negative selectors other than `LINK_THIS`.
* **particles**: `llParticleSystem` and `llLinkParticleSystem`. Inspect `prims[i].particles` for the last accepted request, with its raw `rules` and resolved `texture` UUID. Empty lists and wrong value types clear it. Unknown rule ids, noninteger ids and trailing unpaired rules are silent. Texture names resolve in each target prim's inventory; missing names use the default particle texture. Numeric values retain their requested magnitude. Viewer clamping, quantization, particle motion and rendering are not simulated.
* **linked**: `llMessageLinked` (full `LINK_THIS` / `LINK_SET` / `LINK_ALL_OTHERS` / `LINK_ALL_CHILDREN` / `LINK_ROOT` / specific-link routing across the linkset, with correct `sender_num`)
* **link info**: `llGetLinkNumber`, `llGetNumberOfPrims`, `llGetLinkKey`, `llGetLinkName`
* **link changes**: `llCreateLink`, `llBreakLink`, `llBreakAllLinks` (need `PERMISSION_CHANGE_LINKS` and an object its owner can modify, and `llCreateLink` a target with the same owner that the owner can modify too, or nothing happens; each raises `changed(CHANGED_LINK)` in the prims it touches; linked prims stay where they were, and the root keeps the linkset data)
* **object animations**: `llStartObjectAnimation`, `llStopObjectAnimation`, `llGetObjectAnimationNames` (each prim keeps its own list; animations play only when the linkset is loaded with `animesh: true`)
* **avatar names and info**: `llGetDisplayName`, `llGetUsername`, `llName2Key`, `llRequestUserKey`, `llGetAgentInfo`, `llGetAgentLanguage`, `llGetAgentList`, `llGetAgentSize`, `llGetVisualParams`, `llIsFriend`, `llSameGroup`. Configure avatars with `world.addAvatar` as described above.
* **dataserver**: `llRequestAgentData`, `llRequestInventoryData`, `llRequestSimulatorData`, `llRequestUsername`, `llRequestDisplayName`
* **combat**: `llDamage`, `llAdjustDamage`, `llSetDamage`, `llGetHealth`. Set `linkset.damageEnabled` for the object's parcel; it defaults to the region's damage flag. `s.setCombatAvatar(id, { health, damageEnabled, scripts })` supplies an avatar and its attachment scripts. Damage waits for all `on_damage` handlers, including sleepers, before applying avatar health changes and queuing `final_damage`. `on_death` notifies attachments when avatar health reaches zero. Object health stays under script control through `PRIM_HEALTH`. Set `linkset.damageThrottleExempt` for a parcel-owner or land-group source. Physics contacts, seated-avatar redistribution, regeneration and death teleports are not simulated.
* **rezzing**: `llRezObject`, `llRezAtRoot`, `llRezObjectWithParams`, `llDerezObject`, `llGetVel`, `llGetForce`. Supply inventory objects through a prim fixture's `objects` definitions and inspect rezzed linksets in `world.linksets`, as described above.
* **sensors**: `llSensor`, `llSensorRepeat`, `llSensorRemove` fire `sensor` / `no_sensor` with detected data. Sensors find other loaded linksets and targets placed with `world.addObject({ region, name, position, scripted, active, physical })` or `world.addAvatar({ region, key, name, username, position })`. Targets also accept `owner`, `group`, `rotation` and `velocity`; returned targets can be moved between scans. `world.sensorProperties.set(linkset, { group, velocity, active })` supplies these properties for loaded linksets. Without an activity override, a loaded script with a timer, active listener or sleeping handler counts as active. Scans use exact name/key filters, a strict radius capped at 96 m, and the nearest 32 results. Positive repeats use virtual time at the requested interval; simulator frame cadence and lag are not modeled. An LSL script in an object rezzed from inventory keeps its repeating sensor, its `llTarget` and `llRotTarget` targets, its listens and its timer, with the time that was left to the next scan or tick. The measured Aditi simulator returned no matches for `DAMAGEABLE`, including targets with damage handlers and health 100, so this VM does the same. Attachment and seated-avatar sensor geometry are not simulated.
* **raycasts**: `llCastRay` queries loaded prims and `world.addObject` / `world.addAvatar` fixtures in the same region. Prims and avatars use oriented boxes; object fixtures accept `size` and `phantom`. Hits are nearest first, with the requested cap, rejection mask, phantom detection and data flags. Linked roots report link 0 and children their link number. Rays starting inside a box miss it; entry-face starts hit, and the endpoint is excluded. Terrain uses the region's bilinear `ground` grid. Supply a measured terrain index with `groundLinkNumber`, a number or `(x, y) => number`; its fixture default is 0. Actual prim/mesh shapes, avatar capsules, simulator load errors and raycast quotas are not simulated.
* **detected**: `llDetectedKey`/`Name`/`Owner`/`Group`/`Pos`/`Rot`/`Vel`/`Type`/`LinkNumber`/`Grab`/`TouchPos`/`TouchFace`/`TouchST`/`TouchUV`/`TouchNormal`/`TouchBinormal`/`Rezzer`/`Damage`
* **math**: `llAbs`, `llFabs`, `llRound` (halves round up), `llCeil`, `llFloor`, `llPow`, `llSqrt`, `llSin`/`Cos`/`Tan`/`Asin`/`Acos`/`Atan2`, `llLog`/`Log10`, seeded `llFrand`, `llVecMag`/`Norm`/`Dist`, `llRot2Euler` (the same floats as Second Life for every rotation measured)/`Euler2Rot`, `llRot2Fwd`/`Left`/`Up`, `llRot2Axis`/`Angle`, `llAxisAngle2Rot`, `llRotBetween` (the same floats as Second Life for every pair measured but a few opposite ones), `llAngleBetween`, `llAxes2Rot`, `llLinear2sRGB`/`llsRGB2Linear`
* **string**: `llStringLength`, `llSubStringIndex`, `llGetSubString`, `llDeleteSubString`, `llInsertString`, `llStringTrim`, `llToLower`/`Upper`, `llReplaceSubString`, `llEscapeURL`/`UnescapeURL`
* **list**: `llGetListLength`, `llList2Integer`/`Float`/`String`/`Key`/`Vector`/`Rot`, `llList2List`, `llList2ListStrided`, `llList2ListSlice`, `llListRandomize` (seeded), `llDeleteSubList`, `llListInsertList`, `llListReplaceList`, `llListFindList`, `llListSort`, `llListSortStrided`, `llDumpList2String`, `llList2CSV`, `llCSV2List`, `llParseString2List`, `llParseStringKeepNulls`. `llList2CSV` and `llList2Json` print a NaN as `nan`; Second Life prints `nan` or `-nan` by the NaN's sign bit, which the VM's floats do not carry.
* **json**: `llJson2List`, `llJsonGetValue`, `llJsonSetValue`, `llJsonValueType`, `llList2Json` — full LSL JSON semantics including the FDDx-range type-tag sentinels (`JSON_OBJECT`/`ARRAY`/`NUMBER`/`STRING`/`NULL`/`TRUE`/`FALSE`/`INVALID`/`DELETE`), `JSON_APPEND`, the empty-value short-circuit (`{"k":,}` → `JSON_NULL`) on `Get`/`Type`, duplicate-key collapse on `Set`, force-fit auto-creation of nested objects/arrays through deep specifier paths, and the kept-as-is rule for nested JSON-shaped strings in `llList2Json`.
* **identity**: `llGetOwner`, region-wide `llGetOwnerKey`, `llGetCreator`, `llGetKey`, `llGetObjectName`, `llSetObjectName`, `llGetScriptName`, seeded `llGenerateKey`
* **hash**: `llMD5String`, `llSHA1String`, `llSHA256String`, `llHMAC`
* **RSA**: `llSignRSA`, `llVerifyRSA` (sha1, sha224, sha256, sha384 or sha512; RSA keys only)
* **base64**: `llStringToBase64`/`Base64ToString`, `llIntegerToBase64`/`Base64ToInteger`, `llXorBase64`
* **object**: `llSetText`, `llSetObjectDesc`, `llGetObjectDesc`, `llSetTouchText`, `llSetSitText`, `llSetPayPrice` (stored on the prim for tests to read), `llDie` (kills every script in the linkset), `llResetScript`
* **inventory**: `llGetInventoryNumber`/`Name`/`Type`/`Key`/`Creator`/`Desc`/`AcquireTime`/`PermMask` against the host prim's inventory; notecards via `llGetNotecardLine` / `llGetNumberOfNotecardLines` (correct EOF / NAK semantics, ISO 8601 UTC acquire-time strings); regex search in notecards via `llFindNotecardTextSync` / `llFindNotecardTextCount`; `llRemoveInventory` (a script that removes itself halts at once; faces, maps and a sculpt that used a removed texture go back to their defaults, and faces lose a removed material)
* **giving inventory**: `llGiveInventory`, `llGiveInventoryList`, `llGiveAgentInventory`; inspect `s.inventoryOffers`. World prim recipients receive items and `changed`. A prim owned by someone else, or one its owner cannot modify, takes gifts only after a script in that prim calls `llAllowInventoryDrop(TRUE)`, scripts included, and its scripts get `CHANGED_ALLOWED_DROP`. A gift to another owner gets the item's next-owner permissions; a no-transfer item is refused, and a no-copy item moves. List variants omit missing/no-copy items. Avatar offers are recorded without simulating acceptance or throttles. Attachment inventory restrictions and automatic child/recent avatar presence are not modeled.
* **remote script loading**: `llRemoteLoadScriptPin` copies an executable inventory script into a prim its owner can modify, with a matching nonzero PIN, including negative PINs. It replaces the same inventory name, discards saved state, starts running or stopped with the supplied start parameter, and sleeps three seconds. Running scripts in the receiving prim get `CHANGED_INVENTORY` under the rule for editing a prim's contents: a script that has not started yet, or is stopped, gets no event, and a script asleep in a handler gets it when the handler ends, where a load with a gift, or with an owner drop, during one sleep gives one event. Scripts in the linkset's other prims get nothing. The fresh copy gets no `changed`; it starts with `state_entry`, without `on_rez`. Reset clears its start parameter. Missing/wrong-type names, mismatched PINs, targets owned by someone else or no-modify for the owner, and self-loads report the measured errors. Unknown targets are silent. A no-copy script moves out of the loading prim. Passive script assets without an executable `Script` instance cannot be loaded.
* **viewer requests**: `llLoadURL`, `llMapDestination`, `llMapBeacon`; inspect `s.viewerRequests`. `llMapDestination` in a rezzed object reaches only the avatar who clicked it, once per click. Outside a click it reaches nobody, so fire clicks with `linkset.touch`. In an attachment it reaches only the owner, and nobody when someone else clicked. Region presence reads World avatar fixtures, with the owner or current detected avatar as defaults; override it with `s.setAgentInRegion`. `llOpenFloater` records arguments and returns `-1`: the fixture cannot represent a Linden-owned privileged experience. Requests record viewer instructions; they do not open UI.
* **permissions**: `llRequestPermissions`, `llGetPermissions`, `llGetPermissionsKey` — answer requests with `s.grantPermissions` / `s.denyPermissions`. A request to an avatar sitting on the object or wearing it is granted at once, as in Second Life, when it asks only for controls, animation, camera tracking, camera control or game control; a wearer is also granted attach and animation overrides. One other bit leaves the whole request waiting. A request that was granted this way has nothing left to answer, so `s.grantPermissions()` after it throws. Set `s.autoGrantPermissions = 'none'` before the request to switch these grants off, or give it a function that decides per request; `new World({ autoGrantPermissions })` sets it for every script that has no setting of its own. `loadScript` takes it as an option, and `loadLinkset` takes it for the whole linkset (objects in its prims' contents included) and for each script. Copies of the script keep the setting, and a viewer under `@acceptpermission` still replies. Bits outside 1 to 12 and 14 to 20 are dropped from a request. A sitter or wearer who is asked for nothing gets `run_time_permissions(0)` whatever the setting, and anyone else gets no event. Second Life acts on the first answer only, Yes or No, and the script then stops waiting. The other dialogs stay on the avatar's screen: pass an entry of `s.permissionRequests` to answer one. Answering a dialog the script has stopped waiting for does nothing but use the dialog up (answering it again throws), unless the script has asked again since; then the answer is honoured, with the old dialog's bits, and the newer dialog is the one that does nothing. An automatic grant and a reset end the wait in the same way and leave the dialogs up. `s.grantPermissions()` without an entry throws when no request is waiting. A script loses controls and camera control, with no event, when its sitter stands, moves to another seat or is unseated, and when its attachment is rezzed again after a detach; the other bits stay, and `s.cameraParams` is emptied because the camera goes back to the avatar. To the simulator an avatar sitting on the ground (`world.sitAvatarOnGround`) is a standing avatar for every object it does not wear: it grants only an attachment's request without a dialog, it refuses a request for camera control from any other object, and standing up from the ground takes nothing back and leaves every open dialog answerable. A viewer's `@acceptpermission` reply is separate: the Kokua profile answers an animation request while the avatar sits, on the ground too. Sitting a seated avatar on the ground stands it up from the seat first, so the seat's scripts lose what a stand takes. A request that includes `PERMISSION_CONTROL_CAMERA` to an avatar who is neither sitting on the object nor wearing it is refused whole when it is made, as in Second Life: the script hears "Camera control currently only supported for attachments and objects on which you are sitting." on `DEBUG_CHANNEL`, nothing waits to be answered, and what the script held stays. A script loaded with `loadScript` alone has no avatar to sit on it, so it always gets this refusal. To hold camera control in a test, seat an avatar on the object with `world.sitAvatar` or attach it; an `autoGrantPermissions` function that returns true also grants it. A request to a key that is not an avatar fails whatever it asks for, even nothing: the script hears "Unable to find specified agent to request permissions." on `DEBUG_CHANNEL`, no event fires and nothing waits to be answered (an `autoGrantPermissions` function that returns true still grants it). In a world the key has to be one of its avatars, in any region, or the wearer, so add the avatar with `world.addAvatar` before the script asks. Outside a world the script's owner counts as an avatar, and so does any other valid key except `NULL_KEY` and a prim's. When a sitter stands, or moves to another object, a script on the seat that holds permissions for that avatar stops waiting for its dialogs, and the permission key goes if nothing is left. A script that holds nothing for the avatar keeps waiting, and a request made while seated can then be granted after the stand, camera control included, as Second Life does. A dialog raised before the object went into inventory, by a detach or a take, is not honoured afterwards: answering it throws. A copy of an object, rezzed from a prim's contents (also after `llDerezObject`) or from an avatar's inventory, or worn from inventory, keeps the permissions and permission key its scripts held, without the requests that were still waiting. It comes back without controls and camera control when it is rezzed or worn again after a detach, or was taken while the permission avatar sat on it. A copy rezzed or worn by a different owner starts with no permissions, even ones the new owner had granted, and its scripts get `changed(CHANGED_OWNER)` after `on_rez`, or after `attach` when it is worn. An object loaded without an owner counts as the rezzer's own. `llAttachToAvatarTemp` that hands the object to another avatar leaves every script in it with no permissions, and then gives each script `attach` and `changed(CHANGED_OWNER)`. A dialog raised before is not honoured afterwards, even after the script asks again: answering it throws. A request to anyone but the owner for a bit only the owner can grant (debit, release ownership, change links, change joints, change permissions, silent estate management, return objects, privileged land access) is refused, except from a group-deeded object (not measured), with "Script asking non-owner for run time permissions only owner can grant" on `DEBUG_CHANNEL`, and an attachment asking anyone but its wearer for attach permission hears "Attachment cannot request permissions to attach"; nothing waits to be answered and what the script held stays (an `autoGrantPermissions` function that returns true still grants either). A stand by one avatar leaves what a script holds for another, but a stand by the avatar it holds for ends its wait on a dialog sent to anyone. `world.attemptAvatarRez` does not rez an item that is worn. `linkset.copy()` of an object that is sat on stands the sitter up first, as taking the object or a copy of it does in Second Life; the scripts of the original get the stand's `changed(CHANGED_LINK)`, and those of the copy get one after `on_rez` each time that saved object is rezzed, or after `attach` when it is worn. An object loaded without an owner counts as the rezzer's own. When `llDerezObject` takes the object to inventory, its scripts that are running and not asleep run that event before the object goes. `linkset.copy({ world })`, which puts the copy in the world, leaves the sitter seated; the copy's scripts hold what a stand would leave. An SLua script goes through inventory as its LSL twin does, and keeps its variables, event handlers, timers, listens and coroutines as well as its permissions. Code that was asleep when the object was copied, in `llSleep` or in a function's forced delay, finishes its sleep in the copy and runs to its end before `on_rez`, as in Second Life: an LSL handler with its locals and `llDetected*` data, and SLua code in a handler or at the script's top level. Time in inventory does not count towards the sleep, the original carries on as well when the copy was a Take Copy, and every object rezzed from the saved one finishes the sleep for itself. An LSL copy does not run the handler's earlier calls again: it takes what they returned from the original. Events that were waiting for the sleeping handler go into the copy too and run after `on_rez`, and before `attach` when the copy is worn; if the handler goes on to change state, they and the `on_rez` are dropped. A copy that comes out with 64 events waiting gets no `on_rez`. An `on_rez` still waiting from an earlier rez stays in the queue and runs after the new one. Waiting events keep the order they came in; in Second Life a waiting chat line runs ahead of the other waiting events, whether or not the object is taken. A test that changes a global of a sleeping script with `setGlobal` can make the copy's handler take another path than the original's did; `copy()` throws when the copy's run no longer makes the calls the original made.
* **experiences**: `llGetExperienceDetails`, `llGetExperienceErrorMessage`, `llAgentInExperience`, `llRequestExperiencePermissions` (an agent who already accepted is granted at once; answer others with `s.grantExperiencePermissions` / `s.denyExperiencePermissions`), and the key-value store: `llCreateKeyValue`, `llReadKeyValue`, `llUpdateKeyValue`, `llDeleteKeyValue`, `llKeyCountKeyValue`, `llKeysKeyValue`, `llDataSizeKeyValue`, which answer through `dataserver` on every script in the prim with `1,<result>` or `0,<XP_ERROR_*>`. Without an experience they answer `0,5`. Seed or inspect the store with `experience.seed([['k', 'v']])` and `experience.store`; pass `allowedHere: false` for land that doesn't allow the experience.
* **game control**: `llGetGameControlMode`, `llGetGameControlModeAxes`, `llGetGameControlModeButtons`. Set an avatar's viewer-derived values with `s.setGameControl(agent, { mode, axes, buttons })`, then use `s.sendGameControl(agent, { buttons, axes })` to supply separate raw event input. Delivery requires `PERMISSION_GAME_CONTROL` from that agent. Each event retains its own semantic snapshot across sleeps and later fixture updates. Outside the event, queries return `-1`, `[]` and `0`. Axes are floats with the supplied mode-dependent length, including cursor pixel coordinates. Fixtures share state within a World and can be cleared with `s.setGameControl(agent, null)`. Controller mapping and automatic viewer mode changes are not simulated.
* **controls**: `llTakeControls`, `llReleaseControls` (also drops `PERMISSION_TAKE_CONTROLS`) — send input with `s.sendControl(level)` to fire `control`
* **attachments**: `llAttachToAvatar`, `llAttachToAvatarTemp`, `llDetachFromAvatar`, `llGetAttached`, `llGetAttachedList`, `llGetAttachedListFiltered`, `llWorldPosToHUD`. Attach calls require `PERMISSION_ATTACH`, and `llAttachToAvatar` with that permission from anyone but the owner says "Script trying to attach to someone other than owner!". `llAttachToAvatarTemp` with another avatar's grant hands the object to that avatar: the object and its contents take their next-owner permissions, the caller's permissions are cleared, and `attach` runs before `changed(CHANGED_OWNER)`; no-transfer contents refuse it. Detach requires an avatar permission key but does not require the ATTACH bit. `linkset.attachToAvatar(avatar, point, temporary)` supplies a viewer-worn fixture without granting script permissions; inspect `linkset.attachment` for avatar, point and temporary status. Detach removes the object from region queries, preserves normal attachment script state, and destroys temporary attachments after their final event. Sleeping detach handlers and recurring sensor/target work pause in inventory until fixture rewear. A sleep does not run down in inventory: a handler asleep at the detach sleeps the rest of its time after the rewear, and the events that were waiting for it run then, after `on_rez` and before the two `attach` events. Lists return root keys in attachment order and hide HUDs unless the caller and HUD share an allowed, accepted experience. Set projection camera settings with `s.setCamera`. Bone transforms, avatar inventory persistence and viewer attachment limits are not simulated; other-region avatar fixtures represent child agents for list errors.
* **camera**: `llGetCameraPos`, `llGetCameraRot`, `llGetCameraFOV`, `llGetCameraAspect` require `PERMISSION_TRACK_CAMERA`. Supply viewer camera values with `s.setCamera`. `llSetCameraParams` records rules for the script's permission avatar, and every script in the prim with that avatar's key shares them in `s.cameraParams` (a script with no key, after a reset, sees all of the prim's rules). `llClearCameraParams` empties them from any such script, whatever bits it holds. A reset keeps the rules, and so does a request that drops camera control. Any sitter standing up from the object empties every avatar's rules set from it, and so does a detach. `llSetCameraEyeOffset`, `llSetCameraAtOffset`, `llSetLinkCamera` and `llForceMouselook` store settings on each prim as `cameraEyeOffset`, `cameraAtOffset` and `forceMouselook`, without runtime permissions. `World.sitAvatar` snapshots the offsets for subsequent camera position/rotation reads; later setting changes apply on the next sit. `llWorldPosToHUD` uses the same effective camera pose. Camera offsets follow the seated prim transform and survive script reset and inventory copies. Forcing mouselook sets `AGENT_MOUSELOOK` on the next sit; clearing the prim flag leaves the viewer mode alone. Negative link selectors other than `LINK_THIS` select the first other prim, matching the measured simulator behavior. Mouselook eye positions, viewer smoothing and camera collision are outside this model; `s.setCamera` supplies the fallback viewer pose. There is no camera-offset PRIM_* getter.
* **sitting and teleporting**: `llSitOnLink`, `llUnSit`, `llSetAgentRot`, `llTeleportAgent`, `llTeleportAgentGlobalCoords`, `llTeleportAgentHome`, plus the sit-target readers. Configure World avatar fixtures and inspect `s.teleportRequests` as described above.

* **avatar animations**: `llStartAnimation`, `llStopAnimation`, `llGetAnimation`, `llGetAnimationList`, `llGetAnimationOverride`, `llSetAnimationOverride`, `llResetAnimationOverride`. Start/stop require `PERMISSION_TRIGGER_ANIMATION`; set/reset overrides require `PERMISSION_OVERRIDE_ANIMATIONS`; reading overrides accepts either. Inventory animation names take priority over built-ins. Raw UUIDs work for stop only.
* **script memory**: `llGetUsedMemory`, `llGetFreeMemory`, `llGetMemoryLimit`, `llSetMemoryLimit`, `llScriptProfiler`, `llGetSPMaxMemory` — rough numbers, not Second Life's. rezless guesses at code, globals, locals and the call stack, and the guess can be far off: in one comparison, real scripts used 1.7 to 2.8 times more memory in-world than rezless reported. The `memoryLimit` crash uses the same guess. Don't rely on either to tell you whether a script fits in its memory limit; check that in-world.
* **script control**: `llGetStartParameter` (0 after a reset), `llGetStartString`, `llResetOtherScript`, `llSetScriptState`, `llGetScriptState` — a stopped script loses every event raised while it is stopped (link messages, chat, touches, linkset data, `changed`, dataserver replies, HTTP responses) and gets the ones that were already queued when it starts again. A script that stops itself stops at once and carries on from that statement when started. Timer ticks missed while stopped collapse into one, after the events that were waiting (none if one of them turns the timer off); the next tick keeps the old schedule if that is still ahead and otherwise comes a full interval later. A sensor scan missed while stopped follows the tick, and a repeating sensor then starts its interval again. `llResetOtherScript` on a running script drops the link messages its caller sends in the same handler. A run-time error crashes the script, for example `Math Error` (a division or modulo by zero, or a float division that gives NaN), `Too Many Listens` or `Stack-Heap Collision`: the prim says `<prim name> [script:<script name>] Script run-time error` and then the error on `DEBUG_CHANNEL`, the call that ran the handler throws, and `llGetScriptState` reads 0. `llSetScriptState` can't start a crashed script. `llResetOtherScript` restarts it, and a crashed LSL script in an object rezzed from inventory runs `state_entry` of the state it was in, then `on_rez`, then its overdue timer tick and sensor scan. A crashed SLua script stays crashed there, and the rezzed prim says both error lines again.
* **linkset data**: `llLinksetDataWrite`/`Read`/`Delete`/`WriteProtected`/`ReadProtected`/`DeleteProtected`/`DeleteFound`, `llLinksetDataReset`, `llLinksetDataAvailable`, `llLinksetDataCountKeys`/`CountFound`, `llLinksetDataListKeys`/`FindKeys` — fires the `linkset_data` event on every script in the linkset with `LINKSETDATA_UPDATE` / `DELETE` / `RESET` / `MULTIDELETE`. The store survives `llResetScript`. Inspect via `s.linksetData` (a `ReadonlyMap<string, { value, password }>`); pre-populate via `s.seedLinksetData([['k', { value: 'v' }]])`.
* **primitive params**: `llSetPrimitiveParams`, `llSetLinkPrimitiveParams`, `llSetLinkPrimitiveParamsFast`, `llGetPrimitiveParams`, `llGetLinkPrimitiveParams` — full `PRIM_*` rule surface (position / rotation / size / colour / alpha / texture / glow / fullbright / material / physics / flexible / point light / projector / sculpt / GLTF PBR / sit target / click action / text / name / desc / omega / damage / temp-on-rez / cast shadows / …). Honors `PRIM_LINK_TARGET` mid-rule redirects, `ALL_SIDES` expansion, unknown-rule termination on get, and the 0.2 s delay on the slow link variant. A rule that is unknown or given a value of the wrong type says its error on `DEBUG_CHANNEL` and ends the call, and so does a glow outside 0 to 1, as measured on the main grid; on the Aditi beta grid these end the call silently and an out-of-range glow skips just that rule. A list cut short ends the call silently, and an out-of-range material, text colour or full-bright value skips just that rule (Aditi). As in Second Life, `PRIM_PROJECTOR` can be set but not read: on get it gives nothing and ends the read. A `PRIM_LINK_TARGET` that names no prim also ends a read, and on get a negative link other than `LINK_THIS` reads one prim (link 2 from the root, the root from a child, none in a lone prim). The three multi-prim selectors still give `[]` as the link argument of `llGetLinkPrimitiveParams`.
* **primitive rotations**: `PRIM_ROTATION` and `llGetRot` read a child's region rotation; `PRIM_ROT_LOCAL` and `llGetLocalRot` read its rotation relative to the root. Setting a child's `PRIM_ROTATION` stores the requested rotation multiplied by the root rotation in LSL order, unless it already equals the child's local rotation. Root setters use the requested rotation directly. On an attachment root with a wearer fixture, `PRIM_ROTATION` and `llGetRot` return the avatar rotation, while local reads return the attachment rotation. Attachment children compose their local rotation with the avatar rotation for global reads, independent of the attachment root's rotation.
* **targets**: `llTarget`, `llTargetRemove`, `llRotTarget`, `llRotTargetRemove`. Each script keeps eight position and eight rotation targets with a shared handle counter. Checks use the current root transform every 44.444 virtual milliseconds, including changes through link parameters. Thresholds are strict; state changes keep targets, resets clear them. Sleeping handlers keep one pending event per target. Simulator frame jitter and script execution throttling are not modeled.
* **collision settings**: `llCollisionFilter`, `llVolumeDetect`, `llCollisionSound`, `llAllowInventoryDrop`, `llSetRemoteScriptAccessPin`. Inspect `s.host.collisionFilter`, `volumeDetect`, `collisionSound`, `allowInventoryDrop`, and `remoteScriptAccessPin`. Tests raise collisions with `s.fire('collision_start', { num_detected: 1, detected: [{ key, name }] })`; filters apply to supplied detected entries, and volume detection belongs to the whole object: while it is on, only the root's scripts get `collision_start` and `collision_end`, and no script gets `collision`, so fire them at a root script; one fired at a child's script is dropped. It keeps the object phantom, and a prim unlinked from the object keeps it. No physics or overlap detection runs. Collision sounds record the requested sound and gain; audio playback, sound asset resolution and collision particles are not simulated. Inventory drops default to disabled; each prim has its own setting, changed by a script in that prim. Remote pins default to zero; setting one stores it and sleeps 0.2 seconds.
* **physics requests**: `llApplyImpulse`, `llApplyRotationalImpulse`, `llSetForce`, `llSetTorque`, `llSetForceAndTorque`, `llSetVelocity`, `llSetAngularVelocity`, `llPushObject`. Calls append `{ name, args }` to the caller's `prim.physics.requests`, preserving call order, vector magnitudes, target keys and local flags, even on nonphysical objects. They do not move objects or change read fixtures.
* **buoyancy and hover requests**: `llSetBuoyancy`, `llSetHoverHeight`, `llGroundRepel`, `llStopHover`. Calls append to the caller's `physics.requests`. Inspect `prim.buoyancy`, `prim.hover` and `prim.groundRepel` for the last requested values. A new request replaces that function's settings; `llStopHover` clears `hover` and leaves ground repel alone. Values retain the requested heights, tau and water argument, including negative and extreme inputs. These are capture records, preserved across script resets and copied independently into inventory snapshots. In Second Life, resetting the setter script cancels its effects; these records do not represent active simulator controllers. No buoyancy, hover or ground-repel motion runs.
* **vehicle requests**: `llSetVehicleType`, `llSetVehicleFlags`, `llRemoveVehicleFlags`, `llSetVehicleFloatParam`, `llSetVehicleVectorParam`, `llSetVehicleRotationParam`. Inspect `prim.vehicle.type`, `flags`, `params` by VEHICLE_* parameter ID, and the ordered `requests` history. Setting a type loads its full documented preset, including friction, motor directions and offset, all float parameters, reference frame and flags. Repeating a type replaces the settings. NONE clears the configuration. Undocumented type values are retained with an empty preset, and later parameter requests are still recorded. Flag calls add/remove bits. Float setters also accept linear/angular friction as a uniform vector; wrong parameter categories leave settings unchanged and emit the measured DEBUG_CHANNEL diagnostic when a vehicle type is set. Calls are recorded per caller even when nonphysical or disabled. Explicit parameter values retain requested magnitudes rather than simulator saturation. LSL has no vehicle parameter getter; exact preset values follow the Second Life wiki, including its unusual SLED hover efficiency 10; an in-world comparison differed from explicitly setting efficiency 1. Records survive resets and copy independently into inventory snapshots. No vehicle dynamics, energy use or active-controller lifecycle runs.
* **physics reads**: Set fields on the root's `physics` fixture to supply `llGetForce`, `llGetTorque`, `llGetVel`, `llGetAccel`, `llGetOmega`, `llGetMass`, `llGetMassMKS`, `llGetCenterOfMass` and `llGetEnergy`. Defaults describe a resting 0.5 m box: zero vectors, mass 1.25 lindograms, massMKS 125 kg, energy 1, center of mass at the current root region position. Null force and velocity fixtures preserve the existing rez-force and initial rez/sensor-velocity fallbacks. The mass fields are independent; Second Life normally returns kilograms at 100 times lindograms. Fixtures and request history survive script resets and copy with inventory snapshots. Supply force/torque read-back in the requested frame. Other shapes, linked physical centers, child-specific acceleration and energy depletion/recovery also need fixtures. No force integration, gravity, collision response, mass calculation, push-permission evaluation or energy simulation runs.
* **move and look targets**: `llMoveToTarget`, `llStopMoveToTarget`, `llLookAt`, `llRotLookAt`, `llStopLookAt`. `advanceTime` applies nominal exponential convergence to physical objects, using the requested tau or strength/damping. Coupled movement and positional look-at use a fixed simulation cadence, so timers and clock partitions do not change the result. Position changes feed `llTarget` events. Move requests wait while physics is off; both look functions snap immediately on nonphysical prims. Child llLookAt callers must compensate for root rotation, matching the simulator convention. Moves over the measured 64 m limit or with tau below .044444 seconds cancel the previous move. Physical look-at strength must be at least .044444; damping is capped at 1. The initiating script owns stop/reset control; sibling scripts can retarget it without taking ownership. Stops hold the current transform. State changes preserve requests; reset of the initiator clears them. Scripted inventory snapshots retain the region target on a fresh clock. Target data lives in `prims[0].targetMotion`. This kinematic model omits gravity, contacts, post-stop inertia, angular wobble, energy use and simulator frame drift; velocity/acceleration reads are not derived from it.
* **kinematic motion**: `llSetKeyframedMotion`, `llSetRegionPos`. Advance virtual time to interpolate translation and rotation through keyframes, with forward, loop, reverse and ping-pong playback, and play/pause/stop commands shared by the object's scripts. KFM requires a nonphysical linkset with a convex or no-physics prim. Region moves enforce coordinate and altitude limits, snap to the configured terrain, and have no forced delay. Simulator drift, selection pauses, region crossings, movement events, parcel-entry restrictions and attachment motion are not simulated. Invalid requests leave existing motion unchanged; diagnostic text is not synthesized.
* **prim accessors** (alternative single-rule shortcuts that read/write the same backing store): `llSetPos`/`llGetPos`/`llGetLocalPos`/`llGetRootPosition`, `llSetRot`/`llSetLocalRot`/`llGetRot`/`llGetLocalRot`/`llGetRootRotation`, `llSetScale`/`llGetScale`/`llScaleByFactor`/`llGetMaxScaleFactor`/`llGetMinScaleFactor`, `llGetLinkNumberOfSides`, `llSetColor`/`llGetColor`/`llSetAlpha`/`llGetAlpha`, `llSetTexture`/`llGetTexture`/`llGetTextureOffset`/`llGetTextureScale`/`llGetTextureRot`/`llScaleTexture`/`llOffsetTexture`/`llRotateTexture`, `llSetLinkColor`/`llSetLinkAlpha`/`llSetLinkTexture`, `llSetTextureAnim`/`llSetLinkTextureAnim`/`llSetLinkTextureAnimOverrideMe`, `llSetRenderMaterial`/`llGetRenderMaterial`/`llSetLinkRenderMaterial`/`llIsLinkGLTFMaterial`/`llSetLinkGLTFOverrides`, `llSetStatus`/`llGetStatus`/`llSetLinkStatus`, `llSetClickAction`, `llTargetOmega`, `llSetPhysicsMaterial`/`llGetPhysicsMaterial`, `llPassCollisions`/`llPassTouches`, `llSitTarget`/`llLinkSitTarget`/`llAvatarOnSitTarget`/`llAvatarOnLinkSitTarget`/`llSetLinkSitFlags`/`llGetLinkSitFlags`.
* **scripted prim changes**: Colour and alpha setters raise `changed(CHANGED_COLOR)` in the target prim, including repeated values. Material IDs and `PRIM_GLTF_*` overrides raise `CHANGED_RENDER_MATERIAL` when their stored values change. `PRIM_TYPE` keeps each value inside Second Life's limits (a cut is at least 0.02 wide, hollow stops at 0.95, or 0.7 for a square hole in a round or triangular profile, and profile cuts and hollow move in steps of 0.00001) and counts faces as Second Life does. `PRIM_TYPE` changes raise `CHANGED_SHAPE` in the target prim; size changes raise `CHANGED_SCALE` in the root, while `llScaleByFactor` notifies every prim even at factor 1. Media setters raise `CHANGED_MEDIA` in the target prim, including repeated values; clearing absent media raises nothing. Pending setter events combine their bits, with at most two waiting per script across sleeps; stopped scripts receive none. Script texture writes, `PRIM_SLICE`, `llSetLinkGLTFOverrides`, inventory removals and allowed-drop toggles do not raise these events.

The full LSL constant surface (every `PRIM_*`, `STATUS_*`, `LINK_*`,
`INVENTORY_*`, `MASK_*`, `LINKSETDATA_*`, …) is re-exported from
`@rezless/vitest`, so tests can compare numeric returns against named
constants instead of magic numbers.

## SLua scripts

rezless also runs SLua scripts: Luau written against Second Life's `ll`,
`LLEvents` and `LLTimers` APIs. They run in SLua's own VM
([secondlife/slua](https://github.com/secondlife/slua), compiled to
WebAssembly and shipped in `@rezless/vm`), so the language behaves exactly as
it does in SLua, while `ll.*` calls reach the same rezless functions, mocks
and world fixtures LSL scripts use. The VM is built from SLua's `v0.710.12`
release, with Luau's flags left off. A region on the Aditi beta grid,
measured in November 2026, has that release's libraries and gave its
answers for the list, math and string helpers SLua runs itself. SLua's
`main` branch is different: it has an `integer` library and more in `math`
and `buffer`, which the region measured didn't have.

```ts
const s = await loadScript('./greeter.luau') // .lua / .luau files load as SLua
// or: await loadScript({ source, language: 'slua' })
s.start() // runs the script from the top
s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'Alice' }] })
expect(s).toHaveSaid(0, 'Hello, Alice!')
```

* **Events**: `start()` runs the script's top level, which registers its
  handlers with `LLEvents`. `fire` takes the same payloads as for LSL. Touch,
  collision, sensor and damage handlers receive their `DetectedEvent` list.
  `LLTimers` and `ll.Sleep` run on the virtual clock. Handlers for events
  SLua doesn't deliver are refused, as in SLua. `ll.GetTime`, `os.clock`
  and `LLTimers` share one clock, which restarts on a reset.
* **Sleeps**: as in SLua, a sleeping call (`ll.Sleep`, or a function with a
  built-in delay) returns at once and the script sleeps at its next point
  where it can yield. That is usually right away, even inside coroutines. A
  sleep inside a metamethod waits for the next such point.
* **`ll` and `llcompat`**: `ll` uses SLua's native conventions. Indexes are
  1-based, and "not found" (-1) is `nil`. Boolean-like integers are booleans.
  Keys are `uuid`s and lists are tables. `llcompat` keeps LSL's values.
  Too few arguments raise `Fewer arguments than expected, 1 < 2`, before
  any argument's type is looked at, and extra arguments are ignored. That
  held for every function measured. Wrong-typed arguments raise SLua's errors.
  String parameters
  take strings and `uuid`s (read as their text), but not numbers:
  `ll.OwnerSay(5)` raises `string expected, got number`. Second Life did
  this for every function measured, whether SLua's type definitions write
  the parameter `string | uuid` or `string`. `integer`s are refused as
  well. Three functions that are SLua's own code differ, as
  measured: `ll.ToUpper` and `ll.ToLower` take a number but not a `uuid`,
  and `ll.DumpList2String`'s separator takes neither. In a list, a `uuid`
  or a number is not read as a string where that was measured:
  `ll.Dialog` reports such a button list as LSL does, and
  `ll.ParseString2List` ignores one among its separators and spacers.
  Numeric strings are accepted as numbers. An integer parameter takes a
  boolean as 1 or 0, except a 1-based index in `ll`; float, string, key,
  vector and rotation parameters refuse one, again for every function
  measured.
  In a list, a whole Lua number that fits an LSL integer is sent as an
  integer and any other number as a float, so `ll.List2CSV({1, 1.5})` is
  `1, 1.500000` and a whole number works as a JSON specifier. `ll.ListSort`,
  `ll.ListSortStrided`, `ll.ListFindList`, `ll.ListFindListNext`,
  `ll.ListFindStrided`, `ll.ListStatistics`, `ll.ListRandomize` and
  `ll.List2ListStrided` still read every Lua number as a 32-bit float, so `ll.ListSort` orders whole and fractional numbers
  together, where LSL sorts each type on its own. A boolean in a list is
  sent as 1 or 0, but `ll.ListFindList` only matches it with another
  boolean and `ll.ListSort` orders booleans among themselves.
  A list argument that isn't a table raises `expected a table`, and one
  holding anything LSL lists can't hold raises `Don't know how to decode
  this`, or `Can't have undefined in an argument` for a `nil` in the
  middle.
  `ll.GetTexture` returns a `uuid` when the face holds a texture by key,
  and the item's name as a string when the prim holds the texture as an
  item, even if that name reads like a key. The other functions measured
  that return a name or a key are as LSL types them.
* **List results**: some entries of a list result are not what LSL's types
  say. These were measured entry by entry:
  * Booleans from `ll`, numbers from `llcompat`:
    `PRIM_PHYSICS`, `PRIM_PHANTOM`, `PRIM_TEMP_ON_REZ`, `PRIM_FULLBRIGHT`,
    `PRIM_ALLOW_UNSIT`, `PRIM_SCRIPTED_SIT_ONLY`, the first value of
    `PRIM_FLEXIBLE`, `PRIM_POINT_LIGHT`, `PRIM_SIT_TARGET` and
    `PRIM_REFLECTION_PROBE`, and the double-sided flag of
    `PRIM_GLTF_BASE_COLOR`; `OBJECT_PHYSICS`, `OBJECT_PHANTOM`,
    `OBJECT_TEMP_ON_REZ`, `OBJECT_TEMP_ATTACHED`, `OBJECT_LOCKED` and
    `OBJECT_VOLUME_DETECT`; `PARCEL_DETAILS_SEE_AVATARS` and
    `PARCEL_DETAILS_SCRIPT_DANGER`; the seven on/off prim media settings;
    `SKY_TEXTURE_DEFAULTS`, `WATER_TEXTURE_DEFAULTS` and the on/off value
    of `SKY_CLOUDS`, `SKY_MOON` and `SKY_SUN`. Every other entry measured
    is a number, such as `PRIM_SIT_FLAGS`, `PRIM_BUMP_SHINY` and
    `OBJECT_SELECT_COUNT`.
  * `uuid`s from both `ll` and `llcompat`: the texture of `PRIM_TEXTURE`,
    `PRIM_NORMAL`, `PRIM_SPECULAR`, a sculpt's map in `PRIM_TYPE` and the
    `PRIM_GLTF_*` rules, and `PRIM_RENDER_MATERIAL`. When the prim holds
    the asset as an item, the entry is the item's name as a string, except
    in the `PRIM_GLTF_*` rules, which give the key. An unset `PRIM_GLTF_*`
    texture is `""`.

  A boolean entry stays a boolean when it goes back into a list function:
  `ll.ListFindList` finds it with `false`, not with `0`.
* **Integer arguments out of range**: an integer parameter cuts a Lua
  number to a whole 64-bit number and keeps its low 32 bits, so
  `ll.IntegerToBase64(2^32 + 5)` encodes 5. A number that doesn't fit 64
  bits (`1e20`, infinity, NaN) is 0. A 1-based index in `ll` from 2^31 up,
  or below -2^31, is read as the lowest integer, which is before the start
  of any string or list: `ll.InsertString("abc", 2^31, "x")` is `"xabc"`,
  and `ll.ListFindStrided` with such a start finds nothing. The functions
  SLua runs itself (`ll.GetSubString`, `ll.List2String`, …) do their own
  conversion and are not changed.
* **Error positions**: every script's chunk is called `lua_script`, as in
  Second Life, whatever file the test loaded. A message caught by `pcall`
  reads `lua_script:12: …`, and `debug.info` and `debug.traceback` say the
  same. A compile error still names the file, since a script never sees
  its own.
* **Integers**: there is no `integer` library, so `integer.create(7)` fails
  with `attempt to index nil with 'create'`. `ll.GetListEntryType` (and
  `llcompat.GetListEntryType`) returns an `integer`, not a number. Every
  other function measured returns numbers unless it is handed an `integer`.
  An `integer` never equals a number, so write
  `tonumber(ll.GetListEntryType(list, i)) == TYPE_FLOAT`. It can't be
  compared with `<` to a number or concatenated, indexing a list with one
  gives `nil`, and an `integer` 0 counts as false. Arithmetic with a number gives a number.
  In a list it is an LSL integer. The functions SLua runs itself don't take
  a boolean as a list value: `ll.DumpList2String({true}, ",")` raises
  `non-LSL value in list`, `ll.List2String({true}, 1)` is `""` and
  `ll.List2Float({true}, 1)` is 0.
* **What runs where**: list and math helpers that SLua implements itself
  (`ll.List2String`, `ll.DumpList2String`, `ll.Abs`, …) run in the VM.
  Everything else reaches rezless and can be mocked with
  `s.mock('llName', …)`.
* **Crashes and resets**: a run-time error crashes the script as in LSL. The
  prim says the same first line on `DEBUG_CHANNEL`, then `runtime error`
  (`Unknown runtime error` when the error value is not a string or a number,
  `not enough memory` when memory runs out, `Too Many Listens` for the 66th
  listen, which `pcall` can't catch). The call that ran it throws the Lua message.
  `ll.ResetScript` starts a fresh VM and runs the script again. `pcall`
  can't catch `ll.ResetScript` or an error thrown by a mock. `ll.Die`
  returns, and the script stops at its next `ll` call (which still runs),
  as LSL scripts do in rezless.
* **Environment**: scripts get the libraries SLua's host gives them. There
  is no `getfenv`, `setfenv` or `ares`. `gcinfo()` reports the script's own
  memory. `coroutine.running()` is `nil` at the top level, in a handler and
  in a timer callback, and the coroutine inside one. A `coroutine.yield()`
  outside any coroutine carries on at once and returns nothing, except in
  a metamethod or an `xpcall` handler, where it is an error.
* **Memory**: SLua scripts get 128 KiB, counting what running handlers
  hold. With `memoryLimit: true` the VM enforces it, and a script that goes
  past it fails with `not enough memory`, which `pcall` can catch. A
  runaway recursion ends this way, not in a stack overflow. The stack a
  handler grew is given back when the handler ends. A script whose code
  alone takes all 128 KiB fails as it starts, before any of it runs. `ll.GetUsedMemory`, `ll.GetFreeMemory`, and
  `ll.ScriptProfiler` with `ll.GetSPMaxMemory` all read the VM's own count.
  `llcompat.SetMemoryLimit` takes a limit from what the script uses up to
  131072, and with `memoryLimit: true` the VM enforces the new limit.
* **Test helpers**: `s.global(name)` and `s.setGlobal(name, value)` read and
  write Lua globals (not locals). `s.printed` collects `print()` output.
  `s.language` is `'slua'`.
* **Mixed objects**: `loadLinkset` takes `.luau` scripts next to `.lsl` ones,
  and they talk through link messages, chat and the rest as usual.
* **Coverage**: the reporters cover SLua scripts too.
  * Statements.
  * Branches: `if`/`elseif`, `while`, `repeat`, numeric and generic `for`,
    `and`/`or`, and if-expressions. A `for` loop's two outcomes are "another
    iteration" and "ran out" (leaving by `break` or `return` counts as
    neither). A `repeat` loop's are its `until` condition's, so "true" is
    the loop ending.
  * Functions: event handlers are named after their event.
  * Coverage adds its counters to the script as the globals `__rz_s`,
    `__rz_b` and `__rz_f`, and only when coverage is on. Memory use is
    unaffected.

Not modelled yet:

* `ll.GetUsedMemory()` reads 71 bytes more than in Second Life from the
  start of a script.
* `print()` goes to `s.printed`, not chat.
* A string that isn't a valid UUID becomes `nil` where SLua wants a `uuid`.
  So a mock or fixture key like `'k1'` arrives as `nil`, as an invalid key
  would in SLua.
* Mocks of functions SLua implements itself (see above) are never called.
* `s.global(name)` reads a table as a list of its LSL values, skipping
  nested tables and functions. It can't read a function.

`scripts/build-slua-wasm.sh` rebuilds `packages/vm/wasm/slua.wasm` from SLua's
source at that release, with the case tables `pnpm gen:case` writes in place of
SLua's own. It needs Emscripten and CMake.

## Coverage

`@rezless/vitest` ships an LSL coverage collector that tracks four kinds of
coverage per script: **statement**, **branch** (if / while / for / do-while
arms), **function** (user functions and event handlers), and **state**
("did we ever enter `state idle`?"). Off by default; opt in once in your
`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { LslCoverageReporter } from '@rezless/vitest/reporter'

export default defineConfig({
  test: {
    reporters: ['default', new LslCoverageReporter()],
    coverage: {
      // your @vitest/coverage-v8 config (provider, include, exclude, ...)
    },
  },
})
```

The reporter is dormant during plain `vitest run`. When you invoke
`vitest run --coverage`, both pipelines fire:

- JS coverage from `@vitest/coverage-v8` lands at `coverage/`.
- LSL coverage lands at `coverage/lsl/`, and SLua coverage at
  `coverage/slua/`, so each can be its own component in a coverage service.
  Each holds:
  - `lcov.info` — opens in VS Code Coverage Gutters / Codecov / Coveralls
  - `coverage-final.json` — Istanbul-shaped, mergeable with JS coverage
  - `html/index.html` — browseable per-file source view with line annotations
- A per-file pass/total table on stdout, for both languages.
- `LslCoverageReporter`'s `outputDir` and `sluaOutputDir` options, and
  `rezless-coverage`'s `-o` and `--slua-output` flags, move them.

Two alternative activation paths:

```ts
// Per-test, programmatic — useful for in-test assertions.
const s = await loadScript({ source, filename, coverage: true })
s.start()
expect(s.coverage!.functions.find((f) => f.name === 'bump')!.hits).toBeGreaterThan(0)
```

Without the reporter installed, the env var collects and the CLI renders.
Add the setup file that saves each test file's coverage for the CLI:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['@rezless/vitest/coverage-setup'],
  },
})
```

```sh
LSL_COVERAGE=1 pnpm test
pnpm exec rezless-coverage
```

The setup file writes nothing in a run without `LSL_COVERAGE=1`, so it can
stay in the config. `LslCoverageReporter` adds it by itself.

By default, reports for synthetic filenames (`<inline>`, names without a
path separator, paths that don't exist on disk) are omitted — they're
almost always throwaway test fixtures. Pass `--include-fixtures` to the
CLI, or `{ includeFixtures: true }` to the reporter, to keep them.

`examples/coverage/` has a runnable demo.

## Examples

`examples/` ships working scripts with tests:

* **hello** — minimal `state_entry { llSay(...) }` + matchers.
* **greeter** — touch + name greeting + state transition + reminder timer.
* **slua-greeter** — the greeter as an SLua script: an `LLEvents` touch
  handler and an `LLTimers` reminder that is replaced on each touch.
* **slua-menu** — the menu in SLua: a `listen` handler, `ll.Dialog`, and an
  `LLTimers` timeout that closes the menu.
* **slua-multi-script** — an SLua counter in the root prim driving an LSL
  display in a child prim with link messages.
* **slua-settings** — owner-only chat commands that keep settings as JSON
  (`lljson`) in linkset data, so they survive `ll.ResetScript`.
* **slua-coverage** — statement, branch (per `and`/`or` term) and function
  coverage of a `.luau` script.
* **long-press** — a lamp that tells a short tap from a long press with `linkset.touch`'s `hold`.
* **keypad** — a door keypad that reads which key was clicked from `llDetectedTouchST`.
* **menu** — a lamp with a colour menu, answered with `s.answerDialog`.
* **remote** — owner-only listen on a custom channel + command dispatch.
* **fetcher** — `llHTTPRequest` + `http_response` + status handling.
* **nametag** — `llRequestAgentData` + `dataserver` + floating text.
* **mocking** — patterns for `script.mock(...)`: pinning a real built-in
  to a deterministic value, providing custom logic for an unimplemented
  function, observing call args via the call log, and stateful mocks
  that aggregate across multiple events.
* **scoreboard** — Linkset Data: per-name counters, regex key lookup
  via `llLinksetDataFindKeys`, `linkset_data` event handling, and
  state that survives `llResetScript`.
* **multi-script** — two scripts in different prims of the same linkset:
  a counter in the root prim drives a display in a child prim via
  `llMessageLinked`, and a third script writing the same LSD key
  refreshes the display via the broadcast `linkset_data` event.
  Wired up with `loadLinkset({ prims: [...] })`.
* **coverage** — opt-in coverage tracking: a small voter script
  exercising statement / branch / function / state coverage with
  in-test assertions on `script.coverage`.
* **json** — JSON config blob with nested paths: `set theme.color red`
  / `get theme.color` / `keys` commands, persisted to Linkset Data so
  the document survives `llResetScript`. Exercises all five JSON
  builtins, nested-object force-fit on `llJsonSetValue`, and the
  bare-word/sentinel round-trip on `llJsonGetValue`.

## License

The rezless project is licensed under the **MIT License** —
see [`LICENSE`](LICENSE).

LSL function/event/constant signatures come from Linden Lab's official
[secondlife/lsl-definitions](https://github.com/secondlife/lsl-definitions),
vendored at `vendor/lsl_definitions.yaml` and licensed under the **MIT
License**; see [`NOTICE`](NOTICE) for the full attribution.

### Received local chat and emotes

`fixture.receivedChat` and `receivedChatLog(avatar)` return frozen per-avatar
snapshots of displayed local chat. Each record includes `text`, chat `type`, and a
copied `speaker` with `key`, `name`, `owner`, and `source` (`avatar` or `object`).
Object whisper, say, shout, owner chat and avatar-directed region chat reach the
record through their delivery routes. `world.sendAvatarChat` records nearby avatar
speech, including the speaker's own view. Private channels and IMs are excluded.
Script listens and original send-action records retain their simulator text.

`recvchat` and `recvemote` accept speaker UUID exceptions. Ordinary exceptions may
come from another issuer; `_sec` global locks and `permissive=n` require each
restricting issuer's own exception. `recvchatfrom:<uuid>` and
`recvemotefrom:<uuid>` independently deny that speaker. Add/remove aliases and clear
update subsequent deliveries; existing snapshots remain unchanged.

With the default OOC and ellipsis settings, restricted speech becomes `...` and
restricted emotes become `/me ...`. Firestorm RLVa 2.4.2 leaves emotes unchanged
under `recvchat`, exempts self chat and owner chat, and matches targeted rules
against the speaker UUID. Kokua RLV 2.09.35.00 shortens emotes under `recvchat`,
filters self chat and unattached owner chat, and also matches targeted rules
against object owner UUIDs. Kokua replaces text from an embedded `/me` onward
under `recvemote`; Firestorm requires a leading emote. Both exempt owned
attachments and direct region chat, and consume owner commands. Firestorm also
supports `_sec` aliases for the targeted rules; Kokua leaves those unsupported.
Alternate OOC/ellipsis settings, emote extensions and object-to-avatar name
impersonation are outside this fixture.


`fixture.receivedIM` and `receivedIMLog(avatar)` expose frozen snapshots of IMs
with the same copied `speaker` identity as received chat, `text`, and `type: 'im'`.
`llInstantMessage` delivers object IMs to matching avatars anywhere in the World,
using the builtin's truncated text and preserving the script's send record.
Object IMs bypass `recvim` and `recvimfrom` in both profiles.

`world.sendAvatarIM(sender, recipientKey, text)` delivers online one-to-one
avatar IMs independently of sender-side restrictions. `recvim` has sender UUID
exceptions; `recvim_sec` and `permissive=n` require issuer-scoped exceptions.
`recvimfrom:<uuid>` independently denies the sender. Kokua displays `...` for
restricted avatar IMs; Firestorm displays `*** IM blocked by your viewer`.
Firestorm also supports `recvimfrom_sec`: each secure issuer must list the sender;
`permissive=n` requires every targeted issuer to list it. Kokua leaves that alias
inspectably unsupported. Add/remove aliases and clear affect later deliveries.
Distance options, group IMs, offline messages, privileged senders, automatic
replies, custom viewer strings, name/location censoring and mute settings are
outside this delivery contract.

### Avatar gesture actions

`world.playAvatarGesture(avatar, { id, chat })` plays a prepared gesture;
paired fixtures expose `playGesture`, and `gestureActions` or
`avatarGestureLog(avatar)` return immutable outcome records. Optional `chat`
contains `{ channel, message }` steps after channel parsing. Both Kokua RLV
2.09.35.00 and Firestorm RLVa 2.4.2 enforce no-option
`@sendgesture=n|add|y|rem` per issuer. A blocked gesture records `blocked` with
reason `sendgesture` and emits no chat. Allowed gestures record `played` even
when a chat restriction filters or blocks an individual chat step. Each step
uses normal avatar chat volume and the existing sendchat, volume, redirection,
channel and receive rules; its chat action is included in the gesture record.

Gesture IDs identify fixture actions. Asset loading, chat-trigger expansion,
animations, sounds and timed steps are external. Option, query and force forms
remain unsupported. RLVa `getcommand` discovers the supported add form.

```ts
const action = fixture.playGesture({
  id: 'wave',
  chat: [{ channel: 0, message: '/me waves.' }],
})
expect(action.status).toBe('played')
expect(action.chat[0]?.deliveredMessage).toBe('/me waves.')
```

### Sending avatar IMs

`fixture.sendIM(recipientKey, text)` and
`world.attemptAvatarIM(sender, recipientKey, text)` apply sender restrictions.
`fixture.imActions` and `avatarIMLog(sender)` expose frozen action snapshots with
`recipient`, original `message`, `status` (`sent`, `blocked`, or `unsupported`),
`reason`, deciding `restrictions`, and `deliveredMessage` when text was delivered.
The recipient must be another avatar in the World. Invalid, unknown, self and
null recipients report unsupported. The lower-level `world.sendAvatarIM` remains
a delivery method independent of sender restrictions.

`sendim` and `startim` accept recipient UUID exceptions. Ordinary exceptions may
come from any issuer; global `_sec` locks and `permissive=n` require each
restricting issuer's own exception. `sendimto:<uuid>` and `startimto:<uuid>` deny
the recipient independently of global grants. Firestorm RLVa 2.4.2 also supports
`sendimto_sec` and `startimto_sec`: each secure issuer must list the recipient;
`permissive=n` extends this to all targeted issuers. Kokua RLV 2.09.35.00 leaves
these targeted secure aliases inspectably unsupported.

Start restrictions block new conversations without delivery. Outgoing and incoming
avatar IMs open a conversation; later sends in that conversation bypass start
restrictions. Send restrictions still apply and replace text with
`*** IM blocked by sender's viewer` in both profiles. Such actions report `blocked`
and retain the replacement in `deliveredMessage`. Delivered text then passes
through the recipient's `recvim` rules and lands in its received-IM record.
Add/remove aliases and clear affect subsequent attempts without changing snapshots.
Distance options, group/offline IMs, closing sessions, long-message
truncation/splitting, automatic replies and custom viewer strings are outside
this action contract.

### Recursive force wear and folder removal

`attachall`, `attachallover` and `attachalloverorreplace` include visible
subfolders, and accept the `addoutfitall` and `addoutfitallover` aliases.
Kokua also implements `addoutfitalloverorreplace`; RLVa leaves it unsupported.
`detachall` removes attachments and clothing recursively. `remoutfit:<folder>`
uses the direct folder removal rules, including clothing and folded objects.
Bodyparts stay worn during removal. Frozen `wearResults` and `removeResults`
record each selected item's outcome, including layer and attachment lock denials.
Clothing wear reports `worn`; attachment wear reports `attached`.

Kokua wear skips hidden descendants except single no-mod objects in point-named
folders. Its recursive removal includes hidden descendants. RLVa skips hidden
trees except effective folded children, which do not expose ordinary descendants.
Folded clothing contributes on wear when strippable, but not on removal.
A folder's `+` prefix requests add. Kokua evaluates each folder separately;
RLVa descendants inherit the containing folder's action. RLVa replacement keeps
all accepted clothing of a layer by adding after the first item; Kokua replaces
the top item sequentially. Kokua checks replacement removal before the add
lock, so a denied add can still remove an unprotected top item. A removal lock
retains that occupant but permits adding the new clothing. RLVa denies replacement
when an occupied layer is removal-locked. Replacement preserves clothing protected by profile-specific
nostrip names for ordinary clothing. RLVa physics has one slot: add replaces its
occupant unless layer removal is locked, including automatic replacement of
nostrip physics. Kokua permits multiple physics items. Layer and attachment locks
constrain every form. Both profiles limit clothing to 60 items. At capacity the
appearance manager can replace an unlocked top item. Kokua preserves nostrip
clothing during this fallback; RLVa automatically replaces it. If no slot can be freed the result reports a clothing-capacity denial.

Folder options select one path. Kokua strips a pipe annotation from each path
component, so `Base|33/Child|30` selects `Base/Child`. RLVa resolves the literal
option. Neither profile interprets pipes or semicolons as multiple folder paths.
Gestures and environment settings remain outside these force-wear fixtures.

Direct `attach`, `attachover` and `attachoverorreplace` also wear clothing.
Both profiles replace shape, skin, hair and eyes in their single slots, even
for add forms, subject to layer locks. Removal leaves these bodyparts worn.

Seed an item link with `{ id, parentId, name, kind: 'item', linkTargetId }`.
The target supplies the type, name, permissions and object definition. Worn
wearable IDs and attachment mappings use the target ID; per-item command results
use the selected link ID. Duplicate links do not duplicate worn occupancy.
Broken targets and links to links stay inspectably unsupported.

Kokua clothing force wear checks the target folder; linked object additions
check the link folder. RLVa add checks use the link folder. RLVa attachment
points prefer the target's item/folder point and then the link's containing
folder; the link alias never supplies a point. Folder occupancy replies count
item links using target occupancy. Layer, attachment, folder and shared-wear
locks remain effective. RLVa removal checks the target folder and all shared
item-link folders, so another locked link can protect the same worn target.

RLVa discovers folder links throughout the selected subtree, including ordinary
children during direct wear and hidden descendants. It follows each link for one
target level, including eligible folded children. Ordinary target descendants, further folder links, hidden targets,
`outfitFolder: true` categories and targets within the selected subtree are
excluded. Kokua keeps folder links inspectably unsupported. Folder-link
occupancy queries and live inventory fetching remain outside this fixture.

`attachthis` and its `over`, `overorreplace` and recursive `attachallthis` forms
select shared folders from the issuing attachment, a named attachment point,
a clothing layer or a worn object UUID. `detachthis` and `detachallthis` remove
the selected folder contents. Point and layer selectors include every worn item.
Existing wear, removal, lock and folder-prefix rules apply. The `addoutfitthis`
and `addoutfitallthis` aliases follow the same behavior; their `overorreplace`
variants are available only in Kokua. Kokua resolves child prims to their root;
RLVa child prims have no inventory item identity and select no folder.



### RLV/RLVa avatar touch

Use `fixture.touch(prim, { face, hold, offset })` or
`world.attemptAvatarTouch(avatar, prim, options)` for avatar-initiated touches.
`offset` is a global-axis displacement from the clicked prim's center to the picked
point. The action records the distance, status, denial reason and contributing
restrictions. `fixture.touchActions` retains immutable attempts.
`checkAvatarTouch(world, avatar, prim, options)` checks permission without delivering
events. An allowed action calls `Linkset.touch`, including ordinary touch passing,
face detection and hold timing. A blocked action delivers no touch events.
Direct `Linkset.touch` remains a simulator event fixture.

Both profiles enforce `fartouch`/`touchfar`, `touchall`, `touchworld`, `touchattach`,
`touchattachself`, `touchattachother` and `touchhud`. Distance defaults to 1.5 metres;
the minimum active option wins, and the comparisons include equality. Distance uses the
clicked child prim rather than the linkset root. UUID exceptions use the root.
HUDs bypass `touchall`, attachment locks and distance limits.

`touchthis:<root-uuid>=n` denies touches anywhere in that linkset, including HUDs.
A child UUID does not lock its parent. Other touch exceptions and `permissive=n`
do not override this denial. `touchme=n` overrides every touch restriction,
including `touchthis`, for the issuing object. Kokua requires the root prim to issue
it; Firestorm accepts a grant from any prim in the target linkset. The grant never
allows unrelated targets. Both commands support add/remove aliases and issuer-scoped
clear. Bare `touchthis`, `touchme` options and secure variants remain unsupported.


Kokua RLV 2.09.35.00 checks distance only for world objects. Invalid distance text
becomes zero, and negative limits block even zero-distance world touches.
`touchworld` and `touchhud` support root UUID exceptions, `_sec` forms and
`permissive=n` issuer scoping. Attachment locks accept no object exceptions;
`touchattachother:<avatar-uuid>` denies that wearer's attachments.
The named game HUD login exemption is outside this fixture.

Firestorm RLVa 2.4.2 uses object ownership for self attachment checks and also checks
distance for other avatars' attachments. It squares
the radius, so negative options behave like their magnitude. Invalid or out-of-range
numeric options remain unsupported. The squared radius uses float32 precision while
the squared distance uses double precision. A 0.7-metre option can therefore block
a target at 0.7 metres. `touchattach:<root-uuid>` allows an attachment
under both general and self/other locks; a wearer UUID allows that avatar's attachments.
`touchattachother:<avatar-uuid>` still denies that wearer. World, HUD and attachment
exceptions remain permissive under `permissive=n`; touch `_sec` forms remain unsupported.

### Shared and unshared user wear locks

`sharedwear`, `unsharedwear`, `sharedunwear` and `unsharedunwear` enforce
no-option add/remove restrictions on `attemptWearable(itemId, wear)`,
`attemptViewerAttach` and `attemptViewerDetach`. The shared root and every
hidden or ordinary descendant count as shared; a folder merely named `#RLV`
outside the configured root does not. Without a shared root, existing folders
are unshared. Attachment classification uses the seeded item-to-root mapping.
Missing mappings and missing containing folders give this family no item to lock.
Replacement checks the incoming item and every occupant before detaching any.
Point and clothing layer restrictions remain effective alongside these locks.

Firestorm RLVa 2.4.2 uses the effective folded containing folder. Its unshared
lock grants access to the shared subtree: an earlier grant suppresses later
shared denials from the same issuer, while another issuer's denial still blocks.
Kokua RLV 2.09.35.00 checks shared and unshared locks independently using the
actual parent folder. Remove aliases and clear affect subsequent actions without
changing previous inventory snapshots. Item-link clothing actions use the same
locks; force actions follow the folder-wear contract. Recently received-item
exemptions and startup appearance recovery are outside this contract.

### Forced location landing

Force `tpto` applies the destination parcel's `tpRouting`: `0` blocks, `1`
uses `landingPoint` if set, and `2` allows anywhere. The default is `1`;
an absent or zero landing point leaves the requested location intact.
`landingPoint` is region-local and `landingLookAt` supplies the arrival facing,
overriding a command angle when routing uses that point. Anywhere routing ignores
both landing fields. Parcel owners and the region's `estateManagers` list,
which includes the estate owner, bypass parcel routing.

Blocked destinations divert to the nearest available location within the region,
using the effective policy of overlapping rectangular parcels. Land without a
parcel fixture is available. Equal-distance destinations use increasing x then y
order. A diverted destination can itself route to a landing point. With no
available location, the command refuses without standing or moving attachments.
Viewer restrictions still check the requested destination before routing.

After routing, the region's bilinear `ground` grid sets a minimum height with
0.975 m of settled clearance. This fixed clearance represents the fixture's
settled avatar centre; it does not simulate avatar shapes or falling. Requested
heights above that minimum remain intact. Command records retain the requested
coordinates and the final result separately. Worn objects receive normal teleport
and region events at the final destination. Telehubs, collision geometry and
camera pose are outside this contract. Explicit map, landmark and offer actions
keep their separate destination contracts.

### Avatar teleport offers

`world.offerTeleport(sender, recipient, destination)` delivers an offer with resolved
global coordinates. `world.respondTeleportOffer(recipient, offer, 'accept' | 'decline')`
consumes a pending offer once. `teleportOfferLog(avatar)` returns frozen receipt and
response snapshots, including the sender, destination, outcome and deciding locks.
Paired fixtures expose `receiveTeleportOffer`, `respondTeleportOffer` and `teleportOffers`.

Both profiles check `tplure` and seated `unsit` before `accepttp` automatic acceptance.
UUID options on `tplure` allow that sender; UUID options on `accepttp` auto-accept only
that sender. `tplure_sec` and `permissive=n` require exceptions from each restricting
issuer. Firestorm RLVa 2.4.2 also supports `accepttp_sec`; Kokua RLV 2.09.35.00 leaves
it inspectably unsupported. Remove aliases and clear affect subsequent offers.
Pending callbacks retain their receipt-time permission and do not recheck later locks.
Map and landmark locks do not block offers. Accepted offers use normal avatar
teleport movement and attachment events without granting script permissions.
Maturity, mute, busy and friend preferences, administrator offers and simulator
landing adjustments are outside this fixture.


### Avatar teleport requests

`world.requestTeleport(requester, recipient)` asks the recipient to send an offer
back to the requester. `world.respondTeleportRequest(recipient, request, 'accept' | 'decline')`
consumes a pending request once. `teleportRequestLog(avatar)` returns frozen receipt
and response snapshots. Paired fixtures expose `receiveTeleportRequest`,
`respondTeleportRequest` and `teleportRequests`.

Both profiles enforce `tprequest` before `accepttprequest` automatic acceptance.
UUID options on `tprequest` allow that requester; UUID options on `accepttprequest`
auto-accept only that requester. `tprequest_sec` and `permissive=n` require exceptions
from every restricting issuer. Firestorm RLVa 2.4.2 supports `accepttprequest_sec`;
Kokua RLV 2.09.35.00 leaves it inspectably unsupported. Remove aliases and clear
affect subsequent requests. Pending callbacks do not recheck later locks.

Acceptance records the resulting ordinary offer in `request.offer` and in the
requester's offer history. Its destination is the host's global position when
responding. The host stays put; the requester travels only when its own offer
policy or manual response accepts that offer. A blocked offer still leaves the
request accepted. Host `unsit`, `tplure`, map and landmark locks do not block requests.
Maturity, mute, busy and friend preferences, outgoing message filtering and
simulator landing adjustments are outside this fixture.


### Folder wear and removal locks

`attachthis`, `attachallthis`, `detachthis` and `detachallthis` accept add/remove
restrictions independently of their force forms. `this` locks one folder;
`allthis` includes its descendants. Their `_except` forms grant a path for the
same issuer. A second issuer's denial still blocks the action. Locks constrain
explicit user clothing and mapped attachment actions, force wear/removal and
replacement occupants. Simulator fixture mutations remain unrestricted.

RLVa resolves an omitted option from the issuing root attachment, or selects
folders containing items currently worn on a named point or clothing layer.
Kokua no-option attach locks have no folder effect; no-option detach locks use
the issuing attachment's folder. Kokua point and layer locks inspect eligible
folder contents. Both profiles accept shared paths using their folder lookup
rules. RLVa exceptions require an existing shared path; UUID, point, layer and
empty exception options stay unsupported. Folded items use the containing folder.

Exceptions grant only their issuer's locks. Kokua direct denials override grants
at the same folder. RLVa processes same-folder grants and denials in insertion
order; a grant encountered before a denial skips that issuer. A descendant grant
exempts the matching node or subtree from an ancestor subtree denial.

Kokua clothing replacement removes an eligible top item before checking the
incoming folder lock. Force bodypart replacement checks layer locks rather than
folder locks. RLVa checks the incoming folder before changing any occupant.

### RLV/RLVa debug settings

`viewer.debugSettings` configures initial effective `avatarSex`,
`renderResolutionDivisor`, `aspectRatio`, `windLightUseAtmosShaders`, and Kokua
`noSetEnv`. Values are stored per avatar in `avatar.viewer.debugSettings`.
AvatarSex defaults to 0, the resolution divisor to 1, atmospheric shaders to
true, and the fixture viewport ratio to 16/9. Permission queries read
`inventory.forbidGiveToRlv` and, for RLVa, `viewer.rlvaNoSetEnv`.

Both profiles implement `setdebug=n|add|y|rem`. A lock prevents another issuer's
`setdebug_*:<value>=force` commands; its own forces remain allowed. Removing or
clearing a lock leaves the current values in place. Kokua enables atmospheric
shaders when adding the lock unless `noSetEnv` is true.

Both profiles allow writes to `AvatarSex` and `RenderResolutionDivisor` and
queries for those settings, `RestrainedLoveForbidGiveToRLV`,
`RestrainedLoveNoSetEnv`, and `WindLightUseAtmosShaders`. Names are case
insensitive. Query options are ignored. Unknown queries return an empty reply;
unknown and read-only writes leave values unchanged. Kokua converts writable
values with an integer prefix and stores unsigned values. RLVa validates its
unsigned resolution divisor and leaves it unchanged on invalid input. RLVa's
AvatarSex accepts boolean text and returns the accepted text, including spaces.
It changes the query fixture without changing the avatar's body.

RLVa also answers read-only `getdebug_aspectratio` with three decimal places;
Kokua returns an empty reply for that setting. Settings persistence and renderer
changes are outside this fixture.

RLVa normalizes all folded ancestors when checking an item's folder policy.
Its live selectors require items inside the shared inventory tree. At clothing
capacity, a locked item anywhere on the incoming layer prevents a force add,
even when the top item is unlocked. Kokua folder attach selectors compare the
literal option to the canonical point name, so `root` does not alias
`avatar center` in these restrictions.


### RLV/RLVa active groups

`world.addAvatar({ ..., group, groups })` supplies the initial active group UUID
and membership records `{ key, name, roles?, activeRole? }`. Existing
`avatar.group` remains the live UUID read by `llSameGroup` and sensor detection.
`avatar.groups` is mutable fixture state; membership records supplied at creation
are copied. `roles` contains `{ key, name }` records; `activeRole` stores the
selected role UUID for that group.

`world.userChangeAvatarGroup(avatar, key)` (paired-fixture `userChangeGroup`)
returns false for a nonmember UUID or a `setgroup=n|add` lock. The null UUID
clears the active group. `setgroup=y|rem` and `clear` release locks without
restoring a previous group. Force commands never grant group membership.

Both profiles support `@setgroup:<name|none>=force` with case-insensitive names.
Kokua RLV 2.09.35.00 requires a full name, strips a leading `#RLV/`, and any
no-option group lock blocks force activation, including the issuer's own lock.
Unknown names leave the group unchanged; UUID and role selectors are unsupported.
Firestorm RLVa 2.4.2 also accepts membership UUIDs, the null UUID and name prefixes.
Exact names take precedence; otherwise the last matching membership wins.
Its force command bypasses the issuer's lock but respects every other issuer.
An optional `;<role>` selects a case-insensitive role name with exact precedence
or the last prefix match in role UUID order. An unknown role leaves the existing
role unchanged while still activating the group.

RLVa valid force requests share a 60000 ms virtual-time throttle. A lock owner
may make one extra request before expiry, restarting that interval; further
requests fail with `failed-throttled`. Invalid targets do not consume it.
Kokua has no force throttle. User changes do not consume the force throttle.

`@getgroup=<channel>` returns the original group name or the literal `none`.
Both profiles ignore query options and apply their ordinary reply-channel rules.
Replies use explicit membership metadata; an active UUID without a corresponding
membership name returns an empty name. Group commands participate in RLVa
`getcommand` discovery. A session reset clears locks and force throttling while
preserving the avatar's active group and membership data.


### Avatar payments and object purchases

`fixture.pay(target, amount)` and `world.attemptAvatarPay(avatar, target, amount)`
inject a completed payment after checking the payer's viewer restrictions.
The target is a live `Prim` or an avatar in the same World. Amounts are integers
from zero through 2147483647. An allowed object payment queues `money(id, amount)`
on the selected prim's running handlers. The recipient is the object's owner.
A payment through an attachment goes to its wearer and sends no attachment event.
`fixture.payActions` records `paid`, `blocked`, and `unsupported` outcomes,
including the target, effective recipient, amount and deciding restrictions.
Pay-price settings and running money handlers supply object pay eligibility.
Payment injection does not simulate the pay dialog or validate its button choices.

`world.setObjectSale(prim, { type: 'original' | 'copy' | 'contents', price })`
sets sale information on the object's root. Pass `null` to clear it.
`fixture.buy(prim)` and `world.attemptAvatarBuy(avatar, prim)` capture a viewer
purchase request with a frozen sale snapshot. All three sale types and zero-price
purchases use the same permission check. `fixture.buyActions` records `requested`,
`blocked`, or `unsupported`. Purchases do not send money events. Account balances,
transaction settlement, ownership changes and purchase inventory delivery are
outside these fixtures. `llGiveMoney` and `llTransferLindenDollars` retain their
existing permission-gated request capture.

Firestorm RLVa 2.4.2 applies `pay` to avatar payments and `buy` to object payments
and purchases. Both accept no-option `n`, `add`, `y`, and `rem`; clearing one issuer
preserves other issuers' locks. Options, secure variants and force forms are
unsupported. Kokua RLV 2.09.35.00 has neither restriction handler; its retained
unknown rules remain inspectably unsupported and do not block these actions.

RLVa action checks normalize all folded ancestors. Point and clothing selectors
fold their containing folder once, while no-option attachment locks retain the
issuing item's immediate folder. A selector target inside a folded category can
therefore differ from the effective folder checked by a user action.

RLVa clothing availability replies share the action folder policy.
`getremoutfitnames` omits a layer when every worn clothing item is protected.
`getaddoutfitnames` permits addition below capacity but denies replacement when
a folder-locked occupant prevents it, including at the 60-item limit.
