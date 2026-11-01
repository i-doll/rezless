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
| `@rezless/vm` | Tree-walking interpreter, virtual clock, dispatch |
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
s.grantPermissions(perms?)                      // answer the latest llRequestPermissions; fires `run_time_permissions`
s.denyPermissions()                             // answer it with No
s.grantExperiencePermissions()                  // accept the latest llRequestExperiencePermissions; fires `experience_permissions`
s.denyExperiencePermissions(reason?)            // decline it; fires `experience_permissions_denied` (XP_ERROR_NOT_PERMITTED by default)
s.answerDialog(text, { name? })                 // answer the latest llDialog / llTextBox as its avatar; fires `listen`
s.sendControl(level)                            // the permission agent holds exactly these CONTROL_* bits; fires `control`
s.setCamera({ pos?, rot?, fov?, aspect? })      // set the camera llGetCameraPos / Rot / FOV / Aspect report
s.setAnimationState(avatar, "Standing")          // register an avatar in this region and set its locomotion state
s.mock(name, impl)                              // override any ll* function (real or stubbed) per-test
s.reset()                                       // re-init globals + return to default + state_entry

// Inspect
s.currentState                                  // current LSL state name
s.now                                           // virtual time in ms
s.timerInterval                                 // configured llSetTimerEvent interval (sec, 0 = unset)
s.running                                       // false while paused via llSetScriptState
s.global(name)                                  // read a script global
s.setGlobal(name, value)                        // seed a script global
s.chat                                          // [{ channel, text, type, to? }, ...]
s.calls                                         // [{ name, args, returned }, ...]
s.callsOf(name)                                 // filter call log by ll* name
s.httpRequests                                  // [{ key, url, method, body, headers, mimetype, ... }]
s.urls                                          // URLs the script holds from llRequestURL / llRequestSecureURL
s.emails                                        // [{ address, subject, message, time }] sent with llEmail
s.targetedEmails                                // [{ target, subject, message, time }] sent with llTargetedEmail
s.inbox                                         // mail queued on the prim, oldest first
s.dataserverRequests                            // [{ key, source, args, fulfilled }]
s.permissionRequests                            // [{ agent, permissions, answered }]
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
region, and `llRegionSayTo` only the prim with that key. A prim never hears its
own chat, and `llOwnerSay` and `llInstantMessage` never trigger a `listen`.

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

`llGetVel` and `OBJECT_VELOCITY` read initial velocity. `llGetForce` reads the
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
Each region has one environment, with no parcel or altitude-specific settings.
Lighting and cloud samples stay fixed as time advances.

Land edit rights are not modelled. `llSetEnvironment` and
`llReplaceEnvironment` return `ENV_NO_PERMISSIONS`; `llModifyLand` leaves the
terrain unchanged; `llSetGroundTexture` returns 0 and reports the missing
estate permission on `DEBUG_CHANNEL`. Attempts remain in `script.calls`.
Successful land edits and both agent environment functions remain unfinished
under [#157](https://github.com/i-doll/rezless/issues/157).

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
viewer seating. `avatar.sittingOn` identifies the occupied prim. Seated poses
follow the current prim transform; deleting the object clears occupancy. Seating updates
`AGENT_SITTING` and `AGENT_ON_OBJECT`, clears movement bits, and fires
`changed(CHANGED_LINK)` throughout the object. The sit-target readers return
its sitter only while the target is enabled. `llSitOnLink` requires an allowed
experience and an accepted avatar; `llUnSit` needs no runtime permission for a
sitter on its own object. Land ownership also permits unsitting other sitters.

`llSetAgentRot` requires animation permission and changes yaw. A rotation
requested while sitting applies when standing. `llTeleportAgent` and
`llTeleportAgentGlobalCoords` require teleport permission from the owner, or
an accepted experience. They stand a sitter and move the avatar fixture.
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
validation. Foreign-avatar cases need a second avatar. Cross-region and real
home success were not probed because i Doll must stay in SLua Tideland.

### Avatar animations

Use `s.setAnimationState(avatar, "Standing")` to register an avatar and choose its locomotion state. `s.getPlayingAnimations(avatar)` returns the same UUIDs as `llGetAnimationList`. Animation state is shared by scripts in the same region of a `World`, or the same linkset when no world is supplied. It survives script reset and removal. Permission-granted animation calls also register their target avatar, initially standing.

`llGetAnimation` reports locomotion, even while a script plays another animation. Overrides change the animation used for that state. Playback records animation UUIDs; it does not simulate asset duration, blending or priorities. Tests drive locomotion changes explicitly with `setAnimationState`.

Use `world.addParcel({ region, bounds, owner, ...settings })` to configure parcel
reads. Bounds use region coordinates with `min` inclusive and `max` exclusive;
omitting bounds covers the region. Later parcels take precedence in overlaps.
Queries clamp x/y to the region edges and ignore z. Parcel details include
`name`, `description`, `group`, `area`, `flags`, `seeAvatars`, `landingPoint`,
`landingLookAt` and `tpRouting`. `maxPrims` and `primCounts` by `PARCEL_COUNT_*`
category are explicit fixture values; VM objects do not change land impact.
Capacity budgets may include fractions; queries truncate after aggregation.
Same-owner totals include only parcels in the caller's region. `primOwners`
maps owner UUIDs to land impact. Only the parcel owner can read it or `musicURL`;
group return powers are not modeled. Without a parcel fixture, land is unowned
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

Both money functions require `PERMISSION_DEBIT` granted by the object owner.
They only record requests and never pay. `llGiveMoney` always returns zero;
missing debit permission also produces the measured debug error.
`llTransferLindenDollars` returns a request key and queues `transaction_result`
for missing debit or locally invalid arguments. Valid authorized requests remain
pending. Tests can supply their result with
`s.fire('transaction_result', { id, success, data })`.

Refusals, errors, return codes and forced delays were measured on Aditi in
SLua Tideland on 2026-11-01. Successful mutations and offers follow the wiki;
land/estate rights were unavailable, and actual parcel edits, returns, ejections,
payments and ownership transfers were prohibited. No debit permission was
requested in-world. Group return powers remain unimplemented.

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
* **object reads**: `llKey2Name`, `llGetObjectDetails`, `llGetObjectLinkKey`, `llGetObjectPrimCount`, `llGetObjectMass`, `llGetBoundingBox`, `llGetGeometricCenter` (any prim in the caller's region; avatar keys still read like unknown keys in these object queries), `llGetObjectPermMask`
* **environment**: `llGetEnvironment` (region values configured by parameter number), `llSetEnvironment` and `llReplaceEnvironment` (permission refusal only), `llGetDayLength`, `llGetDayOffset`, `llGetRegionDayLength`, `llGetRegionDayOffset`, `llGetRegionTimeOfDay` (seconds into the region's day, moving with the virtual clock), `llGetSunRotation`, `llGetSunDirection`, `llGetMoonRotation`, `llGetMoonDirection` and their `llGetRegion*` forms
* **ground, water and wind**: `llModifyLand` and `llSetGroundTexture` (permission refusal only), `llGround` (interpolated between whole-metre heights), `llGroundNormal`, `llGroundSlope`, `llGroundContour`, `llWater` and `llWind`, read from the region's `ground`, `water` and `wind` settings
* **HTTP**: `llHTTPRequest`, `llHTTPResponse`, `llRequestURL`, `llRequestSecureURL`, `llReleaseURL`, `llGetFreeURLs` (20000 per region), `llGetHTTPHeader`, `llSetContentType` — send requests to a script's URL with `s.sendHttpRequest`; one it doesn't answer gets a 504 after 25 seconds
* **email**: `llEmail`, `llGetNextEmail`, `llTargetedEmail` (each send sleeps 20 seconds) — mail to `<key>@lsl.secondlife.com` reaches that prim's queue, which holds 101 mails; queue a test's mail with `s.deliverEmail`
* **pathfinding**: `llCreateCharacter`, `llUpdateCharacter`, `llDeleteCharacter`, `llEvade`, `llExecCharacterCmd`, `llFleeFrom`, `llNavigateTo`, `llPatrolPoints`, `llPursue`, `llWanderWithin`, `llGetClosestNavPoint`, `llGetStaticPath`. Inspect `s.character.options` for explicit requested configuration and `s.character.commands` for command history. The character belongs to the object and survives script resets. `s.pathUpdate(type)` sends an event with an empty reserved list to the root prim's scripts. Movement, capsule fitting, option clamping and navmesh baking are not simulated. Set fixed query answers with `s.setNavigationResults({ closestNavPoint: [point], staticPath: [start, end, 0] })`, or use `s.mock` for answers that depend on query arguments. Without fixtures, closest-point queries return `[]` and static-path queries return `[PU_FAILURE_INVALID_GOAL]`; an out-of-range static-path radius returns `[]`.
* **sound**: `llPlaySound`, `llLoopSound`, `llLoopSoundMaster`, `llLoopSoundSlave`, `llPlaySoundSlave`, `llTriggerSound`, `llTriggerSoundLimited`, `llStopSound`, `llPreloadSound`, `llAdjustSoundVolume`, `llSetSoundQueueing`, `llSetSoundRadius`, and the `llLinkPlaySound`, `llLinkStopSound`, `llLinkAdjustSoundVolume`, `llLinkSetSoundQueueing`, `llLinkSetSoundRadius` variants. Inspect `prims[i].sound` from `loadLinkset`: `current` holds the last attached request or `null` after stop, `queueing` and `radius` hold settings, and `triggers` and `preloads` record one-shot requests. Names resolve in the calling prim's sound inventory; UUIDs work without inventory. Volume records the documented 0–1 range, while radius records the requested value. Audio playback, duration, queue progression, synchronization and effective audibility limits are not simulated.
* **prim media**: `llSetPrimMediaParams`, `llGetPrimMediaParams`, `llClearPrimMedia`, `llSetLinkMedia`, `llGetLinkMedia`, and `llClearLinkMedia`. Inspect `prims[i].media`, a map from face number to values indexed by `PRIM_MEDIA_*` constants. Setters validate atomically and return simulator status codes. Getters return values in requested order; clearing removes the face entry. Permission masks and URL whitelists are stored and validated, but browser rendering and avatar interaction are not simulated. Media link calls select one prim, including the measured first-other-prim behavior of negative selectors other than `LINK_THIS`.
* **particles**: `llParticleSystem` and `llLinkParticleSystem`. Inspect `prims[i].particles` for the last accepted request, with its raw `rules` and resolved `texture` UUID. Empty lists and wrong value types clear it. Unknown rule ids, noninteger ids and trailing unpaired rules are silent. Texture names resolve in each target prim's inventory; missing names use the default particle texture. Numeric values retain their requested magnitude. Viewer clamping, quantization, particle motion and rendering are not simulated.
* **linked**: `llMessageLinked` (full `LINK_THIS` / `LINK_SET` / `LINK_ALL_OTHERS` / `LINK_ALL_CHILDREN` / `LINK_ROOT` / specific-link routing across the linkset, with correct `sender_num`)
* **link info**: `llGetLinkNumber`, `llGetNumberOfPrims`, `llGetLinkKey`, `llGetLinkName`
* **link changes**: `llCreateLink`, `llBreakLink`, `llBreakAllLinks` (need `PERMISSION_CHANGE_LINKS`; each raises `changed(CHANGED_LINK)` in the prims it touches; linked prims stay where they were, and the root keeps the linkset data)
* **object animations**: `llStartObjectAnimation`, `llStopObjectAnimation`, `llGetObjectAnimationNames` (each prim keeps its own list; animations play only when the linkset is loaded with `animesh: true`)
* **avatar names and info**: `llGetDisplayName`, `llGetUsername`, `llName2Key`, `llRequestUserKey`, `llGetAgentInfo`, `llGetAgentLanguage`, `llGetAgentList`, `llGetAgentSize`, `llGetVisualParams`, `llIsFriend`, `llSameGroup`. Configure avatars with `world.addAvatar` as described above.
* **dataserver**: `llRequestAgentData`, `llRequestInventoryData`, `llRequestSimulatorData`, `llRequestUsername`, `llRequestDisplayName`
* **combat**: `llDamage`, `llAdjustDamage`, `llSetDamage`, `llGetHealth`. Set `linkset.damageEnabled` for the object's parcel; it defaults to the region's damage flag. `s.setCombatAvatar(id, { health, damageEnabled, scripts })` supplies an avatar and its attachment scripts. Damage waits for all `on_damage` handlers, including sleepers, before applying avatar health changes and queuing `final_damage`. `on_death` notifies attachments when avatar health reaches zero. Object health stays under script control through `PRIM_HEALTH`. Set `linkset.damageThrottleExempt` for a parcel-owner or land-group source. Physics contacts, seated-avatar redistribution, regeneration and death teleports are not simulated.
* **rezzing**: `llRezObject`, `llRezAtRoot`, `llRezObjectWithParams`, `llDerezObject`, `llGetVel`, `llGetForce`. Supply inventory objects through a prim fixture's `objects` definitions and inspect rezzed linksets in `world.linksets`, as described above.
* **sensors**: `llSensor`, `llSensorRepeat`, `llSensorRemove` fire `sensor` / `no_sensor` with detected data. Sensors find other loaded linksets and targets placed with `world.addObject({ region, name, position, scripted, active, physical })` or `world.addAvatar({ region, key, name, username, position })`. Targets also accept `owner`, `group`, `rotation` and `velocity`; returned targets can be moved between scans. `world.sensorProperties.set(linkset, { group, velocity, active })` supplies these properties for loaded linksets. Without an activity override, a loaded script with a timer, active listener or sleeping handler counts as active. Scans use exact name/key filters, a strict radius capped at 96 m, and the nearest 32 results. Positive repeats use virtual time at the requested interval; simulator frame cadence and lag are not modeled. The measured Aditi simulator returned no matches for `DAMAGEABLE`, including targets with damage handlers and health 100, so this VM does the same. Attachment and seated-avatar sensor geometry are not simulated.
* **raycasts**: `llCastRay` queries loaded prims and `world.addObject` / `world.addAvatar` fixtures in the same region. Prims and avatars use oriented boxes; object fixtures accept `size` and `phantom`. Hits are nearest first, with the requested cap, rejection mask, phantom detection and data flags. Linked roots report link 0 and children their link number. Rays starting inside a box miss it; entry-face starts hit, and the endpoint is excluded. Terrain uses the region's bilinear `ground` grid. Supply a measured terrain index with `groundLinkNumber`, a number or `(x, y) => number`; its fixture default is 0. Actual prim/mesh shapes, avatar capsules, simulator load errors and raycast quotas are not simulated.
* **detected**: `llDetectedKey`/`Name`/`Owner`/`Group`/`Pos`/`Rot`/`Vel`/`Type`/`LinkNumber`/`Grab`/`TouchPos`/`TouchFace`/`TouchST`/`TouchUV`/`TouchNormal`/`TouchBinormal`/`Rezzer`/`Damage`
* **math**: `llAbs`, `llFabs`, `llRound` (banker's), `llCeil`, `llFloor`, `llPow`, `llSqrt`, `llSin`/`Cos`/`Tan`/`Asin`/`Acos`/`Atan2`, `llLog`/`Log10`, seeded `llFrand`, `llVecMag`/`Norm`/`Dist`, `llRot2Euler`/`Euler2Rot`, `llRot2Fwd`/`Left`/`Up`, `llRot2Axis`/`Angle`, `llAxisAngle2Rot`, `llRotBetween`, `llAngleBetween`, `llAxes2Rot`, `llLinear2sRGB`/`llsRGB2Linear`
* **string**: `llStringLength`, `llSubStringIndex`, `llGetSubString`, `llDeleteSubString`, `llInsertString`, `llStringTrim`, `llToLower`/`Upper`, `llReplaceSubString`, `llEscapeURL`/`UnescapeURL`
* **list**: `llGetListLength`, `llList2Integer`/`Float`/`String`/`Key`/`Vector`/`Rot`, `llList2List`, `llList2ListStrided`, `llList2ListSlice`, `llListRandomize` (seeded), `llDeleteSubList`, `llListInsertList`, `llListReplaceList`, `llListFindList`, `llListSort`, `llListSortStrided`, `llDumpList2String`, `llList2CSV`, `llCSV2List`, `llParseString2List`, `llParseStringKeepNulls`
* **json**: `llJson2List`, `llJsonGetValue`, `llJsonSetValue`, `llJsonValueType`, `llList2Json` — full LSL JSON semantics including the FDDx-range type-tag sentinels (`JSON_OBJECT`/`ARRAY`/`NUMBER`/`STRING`/`NULL`/`TRUE`/`FALSE`/`INVALID`/`DELETE`), `JSON_APPEND`, the empty-value short-circuit (`{"k":,}` → `JSON_NULL`) on `Get`/`Type`, duplicate-key collapse on `Set`, force-fit auto-creation of nested objects/arrays through deep specifier paths, and the kept-as-is rule for nested JSON-shaped strings in `llList2Json`.
* **identity**: `llGetOwner`, `llGetOwnerKey`, `llGetCreator`, `llGetKey`, `llGetObjectName`, `llSetObjectName`, `llGetScriptName`, seeded `llGenerateKey`
* **hash**: `llMD5String`, `llSHA1String`, `llSHA256String`, `llHMAC`
* **RSA**: `llSignRSA`, `llVerifyRSA` (sha1, sha224, sha256, sha384 or sha512; RSA keys only)
* **base64**: `llStringToBase64`/`Base64ToString`, `llIntegerToBase64`/`Base64ToInteger`, `llXorBase64`
* **object**: `llSetText`, `llSetObjectDesc`, `llGetObjectDesc`, `llSetTouchText`, `llSetSitText`, `llSetPayPrice` (stored on the prim for tests to read), `llDie` (kills every script in the linkset), `llResetScript`
* **inventory**: `llGetInventoryNumber`/`Name`/`Type`/`Key`/`Creator`/`Desc`/`AcquireTime`/`PermMask` against the host prim's inventory; notecards via `llGetNotecardLine` / `llGetNumberOfNotecardLines` (correct EOF / NAK semantics, ISO 8601 UTC acquire-time strings); regex search in notecards via `llFindNotecardTextSync` / `llFindNotecardTextCount`; `llRemoveInventory` (a script that removes itself halts at once)
* **giving inventory**: `llGiveInventory`, `llGiveInventoryList`, `llGiveAgentInventory`; inspect `s.inventoryOffers`. World prim recipients receive items and `changed`; `llAllowInventoryDrop` lets the root enable foreign-owner drops, excluding scripts. List variants omit missing/no-copy items. Avatar offers are recorded without simulating acceptance or throttles. Foreign permissions and no-copy moves follow the wiki and need a second avatar for in-world validation. Attachment inventory restrictions and automatic child/recent avatar presence are not modeled.
* **remote script loading**: `llRemoteLoadScriptPin` copies an executable inventory script into a same-owner prim with a matching nonzero PIN, including negative PINs. It replaces the same inventory name, discards saved state, starts running or stopped with the supplied start parameter, and sleeps three seconds. Existing receiver scripts get `CHANGED_INVENTORY`; the fresh copy starts with `state_entry`, without `on_rez`. Reset clears its start parameter. Missing/wrong-type names, mismatched PINs and self-loads report the measured errors. Unknown targets are silent. Cross-owner modification grants are unsupported and denied. No-copy sources are refused with a generic error; exact no-copy errors and foreign-owner permission behavior need a second owner for in-world measurement. Passive script assets without an executable `Script` instance cannot be loaded.
* **viewer requests**: `llLoadURL`, `llMapDestination`, `llMapBeacon`; inspect `s.viewerRequests`. Region presence reads World avatar fixtures, with the owner or current detected avatar as defaults; override it with `s.setAgentInRegion`. `llOpenFloater` records arguments and returns `-1`: the fixture cannot represent a Linden-owned privileged experience. Requests record viewer instructions; they do not open UI.
* **permissions**: `llRequestPermissions`, `llGetPermissions`, `llGetPermissionsKey` — answer requests with `s.grantPermissions` / `s.denyPermissions`
* **experiences**: `llGetExperienceDetails`, `llGetExperienceErrorMessage`, `llAgentInExperience`, `llRequestExperiencePermissions` (an agent who already accepted is granted at once; answer others with `s.grantExperiencePermissions` / `s.denyExperiencePermissions`), and the key-value store: `llCreateKeyValue`, `llReadKeyValue`, `llUpdateKeyValue`, `llDeleteKeyValue`, `llKeyCountKeyValue`, `llKeysKeyValue`, `llDataSizeKeyValue`, which answer through `dataserver` on every script in the prim with `1,<result>` or `0,<XP_ERROR_*>`. Without an experience they answer `0,5`. Seed or inspect the store with `experience.seed([['k', 'v']])` and `experience.store`; pass `allowedHere: false` for land that doesn't allow the experience.
* **controls**: `llTakeControls`, `llReleaseControls` (also drops `PERMISSION_TAKE_CONTROLS`) — send input with `s.sendControl(level)` to fire `control`
* **camera**: `llGetCameraPos`, `llGetCameraRot`, `llGetCameraFOV`, `llGetCameraAspect` (zero values without `PERMISSION_TRACK_CAMERA`; set them with `s.setCamera`), `llSetCameraParams`, `llClearCameraParams` (rules recorded in `s.cameraParams`)
* **sitting and teleporting**: `llSitOnLink`, `llUnSit`, `llSetAgentRot`, `llTeleportAgent`, `llTeleportAgentGlobalCoords`, `llTeleportAgentHome`, plus the sit-target readers. Configure World avatar fixtures and inspect `s.teleportRequests` as described above.

* **avatar animations**: `llStartAnimation`, `llStopAnimation`, `llGetAnimation`, `llGetAnimationList`, `llGetAnimationOverride`, `llSetAnimationOverride`, `llResetAnimationOverride`. Start/stop require `PERMISSION_TRIGGER_ANIMATION`; set/reset overrides require `PERMISSION_OVERRIDE_ANIMATIONS`; reading overrides accepts either. Inventory animation names take priority over built-ins. Raw UUIDs work for stop only.
* **script memory**: `llGetUsedMemory`, `llGetFreeMemory`, `llGetMemoryLimit`, `llSetMemoryLimit`, `llScriptProfiler`, `llGetSPMaxMemory` — rough numbers, not Second Life's. rezless guesses at code, globals, locals and the call stack, and the guess can be far off: in one comparison, real scripts used 1.7 to 2.8 times more memory in-world than rezless reported. The `memoryLimit` crash uses the same guess. Don't rely on either to tell you whether a script fits in its memory limit; check that in-world.
* **script control**: `llGetStartParameter` (0 after a reset), `llGetStartString`, `llResetOtherScript`, `llSetScriptState`, `llGetScriptState` — pausing parks events for replay on resume, and the timer cadence realigns on resume so paused scripts don't get a flood of catch-up timer events
* **linkset data**: `llLinksetDataWrite`/`Read`/`Delete`/`WriteProtected`/`ReadProtected`/`DeleteProtected`/`DeleteFound`, `llLinksetDataReset`, `llLinksetDataAvailable`, `llLinksetDataCountKeys`/`CountFound`, `llLinksetDataListKeys`/`FindKeys` — fires the `linkset_data` event on every script in the linkset with `LINKSETDATA_UPDATE` / `DELETE` / `RESET` / `MULTIDELETE`. The store survives `llResetScript`. Inspect via `s.linksetData` (a `ReadonlyMap<string, { value, password }>`); pre-populate via `s.seedLinksetData([['k', { value: 'v' }]])`.
* **primitive params**: `llSetPrimitiveParams`, `llSetLinkPrimitiveParams`, `llSetLinkPrimitiveParamsFast`, `llGetPrimitiveParams`, `llGetLinkPrimitiveParams` — full `PRIM_*` rule surface (position / rotation / size / colour / alpha / texture / glow / fullbright / material / physics / flexible / point light / projector / sculpt / GLTF PBR / sit target / click action / text / name / desc / omega / damage / temp-on-rez / cast shadows / …). Honors `PRIM_LINK_TARGET` mid-rule redirects, `ALL_SIDES` expansion, multi-prim get concatenation, unknown-rule termination on get, and the 0.2 s delay on the slow link variant.
* **targets**: `llTarget`, `llTargetRemove`, `llRotTarget`, `llRotTargetRemove`. Each script keeps eight position and eight rotation targets with a shared handle counter. Checks use the current root transform every 44.444 virtual milliseconds, including changes through link parameters. Thresholds are strict; state changes keep targets, resets clear them. Sleeping handlers keep one pending event per target. Simulator frame jitter and script execution throttling are not modeled.
* **collision settings**: `llCollisionFilter`, `llVolumeDetect`, `llCollisionSound`, `llAllowInventoryDrop`, `llSetRemoteScriptAccessPin`. Inspect `s.host.collisionFilter`, `volumeDetect`, `collisionSound`, `allowInventoryDrop`, and `remoteScriptAccessPin`. Tests raise collisions with `s.fire('collision_start', { num_detected: 1, detected: [{ key, name }] })`; filters apply to supplied detected entries, and volume detection suppresses continuous `collision` events. Volume detection updates the linkset's phantom read-back. No physics or overlap detection runs. Collision sounds record the requested sound and gain; audio playback, sound asset resolution and collision particles are not simulated. Inventory drops default to disabled and only a root script can enable them. Remote pins default to zero; setting one stores it and sleeps 0.2 seconds.
* **kinematic motion**: `llSetKeyframedMotion`, `llSetRegionPos`. Advance virtual time to interpolate translation and rotation through keyframes, with forward, loop, reverse and ping-pong playback, and play/pause/stop commands shared by the object's scripts. KFM requires a nonphysical linkset with a convex or no-physics prim. Region moves enforce coordinate and altitude limits, snap to the configured terrain, and have no forced delay. Simulator drift, selection pauses, region crossings, movement events, parcel-entry restrictions and attachment motion are not simulated. Invalid requests leave existing motion unchanged; diagnostic text is not synthesized.
* **prim accessors** (alternative single-rule shortcuts that read/write the same backing store): `llSetPos`/`llGetPos`/`llGetLocalPos`/`llGetRootPosition`, `llSetRot`/`llSetLocalRot`/`llGetRot`/`llGetLocalRot`/`llGetRootRotation`, `llSetScale`/`llGetScale`/`llScaleByFactor`/`llGetMaxScaleFactor`/`llGetMinScaleFactor`, `llGetLinkNumberOfSides`, `llSetColor`/`llGetColor`/`llSetAlpha`/`llGetAlpha`, `llSetTexture`/`llGetTexture`/`llGetTextureOffset`/`llGetTextureScale`/`llGetTextureRot`/`llScaleTexture`/`llOffsetTexture`/`llRotateTexture`, `llSetLinkColor`/`llSetLinkAlpha`/`llSetLinkTexture`, `llSetTextureAnim`/`llSetLinkTextureAnim`/`llSetLinkTextureAnimOverrideMe`, `llSetRenderMaterial`/`llGetRenderMaterial`/`llSetLinkRenderMaterial`/`llIsLinkGLTFMaterial`/`llSetLinkGLTFOverrides`, `llSetStatus`/`llGetStatus`/`llSetLinkStatus`, `llSetClickAction`, `llTargetOmega`, `llSetPhysicsMaterial`/`llGetPhysicsMaterial`, `llPassCollisions`/`llPassTouches`, `llSitTarget`/`llLinkSitTarget`/`llAvatarOnSitTarget`/`llAvatarOnLinkSitTarget`/`llSetLinkSitFlags`/`llGetLinkSitFlags`.

The full LSL constant surface (every `PRIM_*`, `STATUS_*`, `LINK_*`,
`INVENTORY_*`, `MASK_*`, `LINKSETDATA_*`, …) is re-exported from
`@rezless/vitest`, so tests can compare numeric returns against named
constants instead of magic numbers.

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
- LSL coverage lands at `coverage/lsl/`:
  - `lcov.info` — opens in VS Code Coverage Gutters / Codecov / Coveralls
  - `coverage-final.json` — Istanbul-shaped, mergeable with JS coverage
  - `html/index.html` — browseable per-file source view with line annotations
  - per-file pass/total table on stdout

Two alternative activation paths:

```ts
// Per-test, programmatic — useful for in-test assertions.
const s = await loadScript({ source, filename, coverage: true })
s.start()
expect(s.coverage!.functions.find((f) => f.name === 'bump')!.hits).toBeGreaterThan(0)
```

```sh
# Without the reporter installed — env var collects, CLI renders.
LSL_COVERAGE=1 pnpm test
pnpm exec rezless-coverage
```

By default, reports for synthetic filenames (`<inline>`, names without a
path separator, paths that don't exist on disk) are omitted — they're
almost always throwaway test fixtures. Pass `--include-fixtures` to the
CLI, or `{ includeFixtures: true }` to the reporter, to keep them.

`examples/coverage/` has a runnable demo.

## Examples

`examples/` ships working scripts with tests:

* **hello** — minimal `state_entry { llSay(...) }` + matchers.
* **greeter** — touch + name greeting + state transition + reminder timer.
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

The rezless project is licensed under the **Apache License, Version 2.0** —
see [`LICENSE`](LICENSE).

LSL function/event/constant signatures come from Linden Lab's official
[secondlife/lsl-definitions](https://github.com/secondlife/lsl-definitions),
vendored at `vendor/lsl_definitions.yaml` and licensed under the **MIT
License**; see [`NOTICE`](NOTICE) for the full attribution.
