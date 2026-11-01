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

Use `world.sitAvatar(avatar, prim)` and `world.standAvatar(avatar)` to seed
simulator seating independently of viewer restrictions. Explicit user attempts
use `world.userSitAvatar(avatar, prim, offset?)` and `world.userStandAvatar(avatar)`;
both return whether the action was accepted. `avatar.sittingOn` identifies the occupied prim. Seated poses
follow the current prim transform with the offset captured at seating; editing
the target affects future sits. Deleting the object clears occupancy. Seating updates
`AGENT_SITTING` and `AGENT_ON_OBJECT`, clears movement bits, and fires
`changed(CHANGED_LINK)` throughout the object. The sit-target readers return
its sitter only while the target is enabled. `llSitOnLink` requires an allowed
experience and an accepted avatar; `llUnSit` needs no runtime permission for a
sitter on its own object. Land ownership also permits unsitting other sitters.

With `standtp=n`, user stand, force unsit, `llUnSit` and seat deletion return the
avatar to its saved global origin. Viewer object-sit requests save that origin;
Kokua also saves it when a new standtp rule is added. RLVa refuses another object
sit while seated under standtp and ignores a zero global origin. Kokua requires
direct parcel teleport routing. Return travel bypasses teleport restrictions,
preserves facing and delivers attachment teleport and region changes after virtual
time advances. Existing unsit checks still decide whether a viewer stand may begin.

`llSetAgentRot` requires animation permission and changes yaw. A rotation
requested while sitting applies when standing. `llTeleportAgent` and
`llTeleportAgentGlobalCoords` require teleport permission from the owner, or
an accepted experience. Temporary attachments reject teleport calls and new
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
* **identity**: `llGetOwner`, `llGetCreator`, `llGetKey`, `llGetObjectName`, `llSetObjectName`, `llGetScriptName`, seeded `llGenerateKey`
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
* **game control**: `llGetGameControlMode`, `llGetGameControlModeAxes`, `llGetGameControlModeButtons`. Set an avatar's viewer-derived values with `s.setGameControl(agent, { mode, axes, buttons })`, then use `s.sendGameControl(agent, { buttons, axes })` to supply separate raw event input. Delivery requires `PERMISSION_GAME_CONTROL` from that agent. Each event retains its own semantic snapshot across sleeps and later fixture updates. Outside the event, queries return `-1`, `[]` and `0`. Axes are floats with the supplied mode-dependent length, including cursor pixel coordinates. Fixtures share state within a World and can be cleared with `s.setGameControl(agent, null)`. Controller mapping and automatic viewer mode changes are not simulated.
* **controls**: `llTakeControls`, `llReleaseControls` (also drops `PERMISSION_TAKE_CONTROLS`) — send input with `s.sendControl(level)` to fire `control`
* **attachments**: `llAttachToAvatar`, `llAttachToAvatarTemp`, `llDetachFromAvatar`, `llGetAttached`, `llGetAttachedList`, `llGetAttachedListFiltered`, `llWorldPosToHUD`. Attach calls require `PERMISSION_ATTACH`; detach requires an avatar permission key but does not require the ATTACH bit. `linkset.attachToAvatar(avatar, point, temporary)` supplies a viewer-worn fixture without granting script permissions; inspect `linkset.attachment` for avatar, point and temporary status. Detach removes the object from region queries, preserves normal attachment script state, and destroys temporary attachments after their final event. Sleeping detach handlers and recurring sensor/target work pause in inventory until fixture rewear. Lists return root keys in attachment order and hide HUDs unless the caller and HUD share an allowed, accepted experience. Set projection camera settings with `s.setCamera`. Bone transforms, avatar inventory persistence and viewer attachment limits are not simulated; other-region avatar fixtures represent child agents for list errors.
* **camera**: `llGetCameraPos`, `llGetCameraRot`, `llGetCameraFOV`, `llGetCameraAspect` require `PERMISSION_TRACK_CAMERA`. Supply viewer camera values with `s.setCamera`. `llSetCameraParams` and `llClearCameraParams` record rules in `s.cameraParams`. `llSetCameraEyeOffset`, `llSetCameraAtOffset`, `llSetLinkCamera` and `llForceMouselook` store settings on each prim as `cameraEyeOffset`, `cameraAtOffset` and `forceMouselook`, without runtime permissions. `World.sitAvatar` snapshots the offsets for subsequent camera position/rotation reads; later setting changes apply on the next sit. `llWorldPosToHUD` uses the same effective camera pose. Camera offsets follow the seated prim transform and survive script reset and inventory copies. Forcing mouselook sets `AGENT_MOUSELOOK` on the next sit; clearing the prim flag leaves the viewer mode alone. Negative link selectors other than `LINK_THIS` select the first other prim, matching the measured simulator behavior. Mouselook eye positions, viewer smoothing and camera collision are outside this model; `s.setCamera` supplies the fallback viewer pose. There is no camera-offset PRIM_* getter.
* **sitting and teleporting**: `llSitOnLink`, `llUnSit`, `llSetAgentRot`, `llTeleportAgent`, `llTeleportAgentGlobalCoords`, `llTeleportAgentHome`, plus the sit-target readers. Configure World avatar fixtures and inspect `s.teleportRequests` as described above.

* **avatar animations**: `llStartAnimation`, `llStopAnimation`, `llGetAnimation`, `llGetAnimationList`, `llGetAnimationOverride`, `llSetAnimationOverride`, `llResetAnimationOverride`. Start/stop require `PERMISSION_TRIGGER_ANIMATION`; set/reset overrides require `PERMISSION_OVERRIDE_ANIMATIONS`; reading overrides accepts either. Inventory animation names take priority over built-ins. Raw UUIDs work for stop only.
* **script memory**: `llGetUsedMemory`, `llGetFreeMemory`, `llGetMemoryLimit`, `llSetMemoryLimit`, `llScriptProfiler`, `llGetSPMaxMemory` — rough numbers, not Second Life's. rezless guesses at code, globals, locals and the call stack, and the guess can be far off: in one comparison, real scripts used 1.7 to 2.8 times more memory in-world than rezless reported. The `memoryLimit` crash uses the same guess. Don't rely on either to tell you whether a script fits in its memory limit; check that in-world.
* **script control**: `llGetStartParameter` (0 after a reset), `llGetStartString`, `llResetOtherScript`, `llSetScriptState`, `llGetScriptState` — pausing parks events for replay on resume, and the timer cadence realigns on resume so paused scripts don't get a flood of catch-up timer events
* **linkset data**: `llLinksetDataWrite`/`Read`/`Delete`/`WriteProtected`/`ReadProtected`/`DeleteProtected`/`DeleteFound`, `llLinksetDataReset`, `llLinksetDataAvailable`, `llLinksetDataCountKeys`/`CountFound`, `llLinksetDataListKeys`/`FindKeys` — fires the `linkset_data` event on every script in the linkset with `LINKSETDATA_UPDATE` / `DELETE` / `RESET` / `MULTIDELETE`. The store survives `llResetScript`. Inspect via `s.linksetData` (a `ReadonlyMap<string, { value, password }>`); pre-populate via `s.seedLinksetData([['k', { value: 'v' }]])`.
* **primitive params**: `llSetPrimitiveParams`, `llSetLinkPrimitiveParams`, `llSetLinkPrimitiveParamsFast`, `llGetPrimitiveParams`, `llGetLinkPrimitiveParams` — full `PRIM_*` rule surface (position / rotation / size / colour / alpha / texture / glow / fullbright / material / physics / flexible / point light / projector / sculpt / GLTF PBR / sit target / click action / text / name / desc / omega / damage / temp-on-rez / cast shadows / …). Honors `PRIM_LINK_TARGET` mid-rule redirects, `ALL_SIDES` expansion, multi-prim get concatenation, unknown-rule termination on get, and the 0.2 s delay on the slow link variant.
* **targets**: `llTarget`, `llTargetRemove`, `llRotTarget`, `llRotTargetRemove`. Each script keeps eight position and eight rotation targets with a shared handle counter. Checks use the current root transform every 44.444 virtual milliseconds, including changes through link parameters. Thresholds are strict; state changes keep targets, resets clear them. Sleeping handlers keep one pending event per target. Simulator frame jitter and script execution throttling are not modeled.
* **collision settings**: `llCollisionFilter`, `llVolumeDetect`, `llCollisionSound`, `llAllowInventoryDrop`, `llSetRemoteScriptAccessPin`. Inspect `s.host.collisionFilter`, `volumeDetect`, `collisionSound`, `allowInventoryDrop`, and `remoteScriptAccessPin`. Tests raise collisions with `s.fire('collision_start', { num_detected: 1, detected: [{ key, name }] })`; filters apply to supplied detected entries, and volume detection suppresses continuous `collision` events. Volume detection updates the linkset's phantom read-back. No physics or overlap detection runs. Collision sounds record the requested sound and gain; audio playback, sound asset resolution and collision particles are not simulated. Inventory drops default to disabled and only a root script can enable them. Remote pins default to zero; setting one stores it and sleeps 0.2 seconds.
* **physics requests**: `llApplyImpulse`, `llApplyRotationalImpulse`, `llSetForce`, `llSetTorque`, `llSetForceAndTorque`, `llSetVelocity`, `llSetAngularVelocity`, `llPushObject`. Calls append `{ name, args }` to the caller's `prim.physics.requests`, preserving call order, vector magnitudes, target keys and local flags, even on nonphysical objects. They do not move objects or change read fixtures.
* **buoyancy and hover requests**: `llSetBuoyancy`, `llSetHoverHeight`, `llGroundRepel`, `llStopHover`. Calls append to the caller's `physics.requests`. Inspect `prim.buoyancy`, `prim.hover` and `prim.groundRepel` for the last requested values. A new request replaces that function's settings; `llStopHover` clears `hover` and leaves ground repel alone. Values retain the requested heights, tau and water argument, including negative and extreme inputs. These are capture records, preserved across script resets and copied independently into inventory snapshots. In Second Life, resetting the setter script cancels its effects; these records do not represent active simulator controllers. No buoyancy, hover or ground-repel motion runs.
* **vehicle requests**: `llSetVehicleType`, `llSetVehicleFlags`, `llRemoveVehicleFlags`, `llSetVehicleFloatParam`, `llSetVehicleVectorParam`, `llSetVehicleRotationParam`. Inspect `prim.vehicle.type`, `flags`, `params` by VEHICLE_* parameter ID, and the ordered `requests` history. Setting a type loads its full documented preset, including friction, motor directions and offset, all float parameters, reference frame and flags. Repeating a type replaces the settings. NONE clears the configuration. Undocumented type values are retained with an empty preset, and later parameter requests are still recorded. Flag calls add/remove bits. Float setters also accept linear/angular friction as a uniform vector; wrong parameter categories leave settings unchanged and emit the measured DEBUG_CHANNEL diagnostic when a vehicle type is set. Calls are recorded per caller even when nonphysical or disabled. Explicit parameter values retain requested magnitudes rather than simulator saturation. LSL has no vehicle parameter getter; exact preset values follow the Second Life wiki, including its unusual SLED hover efficiency 10; an in-world comparison differed from explicitly setting efficiency 1. Records survive resets and copy independently into inventory snapshots. No vehicle dynamics, energy use or active-controller lifecycle runs.
* **physics reads**: Set fields on the root's `physics` fixture to supply `llGetForce`, `llGetTorque`, `llGetVel`, `llGetAccel`, `llGetOmega`, `llGetMass`, `llGetMassMKS`, `llGetCenterOfMass` and `llGetEnergy`. Defaults describe a resting 0.5 m box: zero vectors, mass 1.25 lindograms, massMKS 125 kg, energy 1, center of mass at the current root region position. Null force and velocity fixtures preserve the existing rez-force and initial rez/sensor-velocity fallbacks. The mass fields are independent; Second Life normally returns kilograms at 100 times lindograms. Fixtures and request history survive script resets and copy with inventory snapshots. Supply force/torque read-back in the requested frame. Other shapes, linked physical centers, child-specific acceleration and energy depletion/recovery also need fixtures. No force integration, gravity, collision response, mass calculation, push-permission evaluation or energy simulation runs.
* **move and look targets**: `llMoveToTarget`, `llStopMoveToTarget`, `llLookAt`, `llRotLookAt`, `llStopLookAt`. `advanceTime` applies nominal exponential convergence to physical objects, using the requested tau or strength/damping. Coupled movement and positional look-at use a fixed simulation cadence, so timers and clock partitions do not change the result. Position changes feed `llTarget` events. Move requests wait while physics is off; both look functions snap immediately on nonphysical prims. Child llLookAt callers must compensate for root rotation, matching the simulator convention. Moves over the measured 64 m limit or with tau below .044444 seconds cancel the previous move. Physical look-at strength must be at least .044444; damping is capped at 1. The initiating script owns stop/reset control; sibling scripts can retarget it without taking ownership. Stops hold the current transform. State changes preserve requests; reset of the initiator clears them. Scripted inventory snapshots retain the region target on a fresh clock. Target data lives in `prims[0].targetMotion`. This kinematic model omits gravity, contacts, post-stop inertia, angular wobble, energy use and simulator frame drift; velocity/acceleration reads are not derived from it.
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

CI records both pipelines to Huginn — a coverage-memory service — as separate
components (`js`, `lsl`): each PR gets a sticky comment with patch coverage (of
the lines it changed) and project coverage vs the `main` baseline.

## Examples

`examples/` ships working scripts with tests:

* **hello** — minimal `state_entry { llSay(...) }` + matchers.
* **greeter** — touch + name greeting + state transition + reminder timer.
* **long-press** — a lamp that tells a short tap from a long press with `linkset.touch`'s `hold`.
* **keypad** — a door keypad that reads which key was clicked from `llDetectedTouchST`.
* **menu** — a lamp with a colour menu, answered with `s.answerDialog`.
* **remote** — owner-only listen on a custom channel + command dispatch.
* **fetcher** — `llHTTPRequest` + `http_response` + status handling.
* **http-in** — a sign updated over HTTP: `llRequestURL`, `http_request`
  routing on `x-path-info`, and requests sent with `s.sendHttpRequest`.
* **hud** — a compass HUD that attaches itself with `llAttachToAvatar`,
  points at a landmark with `llWorldPosToHUD`, and detaches on click.
  The camera is set with `s.setCamera`.
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

## RLV/RLVa viewer fixtures

The [RLV/RLVa coverage matrix](docs/rlv-coverage.md) lists delivered command
forms, profile versions, support depths, test references and explicit exclusions.
It is generated from the command manifest and checked by a test. The
[paired viewer example](examples/rlv/README.md) runs one LSL source against both
profiles with version detection, two controllers, status, cleanup and named
channel-policy differences. Run it from the repository root without a build:

```sh
pnpm exec vitest run examples/rlv/paired-viewers.test.ts
```

Avatar-initiated touches use `world.attemptAvatarTouch(avatar, prim, options)`.
Allowed actions deliver normal linkset touch events; blocked actions return a reason
and deliver none. `checkAvatarTouch` exposes the same permission check without event
delivery. Touch restrictions cover world objects, attachments and HUDs, with
profile-specific distance limits and UUID exceptions. `touchthis:<root-uuid>` locks
a target linkset, including HUDs. `touchme` overrides every touch restriction for
its issuing object; Kokua requires a root issuer and Firestorm accepts any prim
in that linkset. RLVa checks `interact` before touch grants for user clicks;
Kokua applies it to world touches after `touchme`.

Editor selection uses `world.attemptAvatarEdit(avatar, prim)` and inventory drops
use `world.attemptAvatarRez(avatar, itemId, position)`. The paired fixture exposes
`edit` and `rez`, with frozen `editActions` and `rezActions` histories. Edit outcomes
include deciding root UUID grants or denials and category locks. Kokua supports
`edit_sec` and issuer-scoped exceptions under `permissive`; RLVa does not.
`interact` blocks inventory drops and user click sitting in both profiles. HUD
touches bypass it. Kokua also blocks direct editing of non-HUD objects; RLVa allows
direct editor selection. Inventory rezzing requires a saved copyable object definition.


`acceptpermission` answers complete covered `llRequestPermissions` requests and
records them as answered before delivering `run_time_permissions`. Kokua covers
controls, animation while sitting, and attach permission from owned objects,
including worn objects. Firestorm covers controls and attach permission from
owned objects that are not already attachments. Requests with any other bits
stay pending for `grantPermissions` or `denyPermissions`. Activation applies to
all requesting objects; UUID options do not create exceptions. Simulator implicit
permissions and alternate auto-attach settings are outside this contract.

Optional per-avatar RLV and RLVa fixtures expose immutable per-prim restriction
snapshots for no-option `detach`, `sendchat`, `sit`, `unsit`, `tploc`, and `tplm`.
The seating rules are enforced by explicit user actions. Attachment locks enforce explicit viewer detach and attach attempts. Named `detach` locks block removal in both profiles and adding in RLVa; `addattach` and `remattach` lock adding and removal globally or by point. Bare, point and root-UUID force detach honor every issuer lock. Root self-detach
respects every issuer lock; child self-detach resolves the attachment in Kokua
and is inert in RLVa. Simulator detach remains separate. Locked inventory attachments recover at their
original point: Kokua delays and replaces occupants; RLVa adds after inventory
saving or its watchdog timeout. `tploc` constrains location travel; `tplm` enforces landmark travel. Explicit user landmark and map actions record deciding restrictions and outcomes. Avatar teleport offers support acceptance, decline, tplure exceptions and accepttp automatic acceptance. Teleport requests enforce tprequest and accepttprequest, and send ordinary offers when accepted. `emote` extends safe emotes; `redirchat` and `rediremote` route avatar chat to allowed option channels with profile-specific filtering and volume. Public `sendchat` filtering rewrites speech and emotes per profile and blocks DEBUG_CHANNEL. `sendchannel_except` denies listed private channels; RLVa requires its no-option activation switch. Avatar chat supports whisper, say and shout with matching script and avatar hearing ranges. Public `chatshout`, `chatwhisper` and `chatnormal` transform volume per profile and retain requested and delivered volumes. Prepared gesture actions record playback outcomes and enforce `sendgesture` before emitting chat through the avatar chat rules. Explicit avatar chat actions enforce `sendchannel`,
its numeric exceptions, `sendchannel_sec`, and this family's `permissive` scope.
Denied attempts are logged; simulator chat builtins stay independent.
`World.attemptAvatarIM` records sender IM actions, enforcing `sendim`, `sendimto`,
`startim` and `startimto` with UUID exceptions and secure issuer scope. Start locks
block new conversations; send locks deliver the default blocked notice. Existing
and incoming conversations permit replies under start locks. Firestorm also
supports secure targeted aliases. Recipient receive restrictions still apply.
Frozen `receivedIMLog` snapshots expose delivered object IMs and avatar IMs.
`World.sendAvatarIM` applies `recvim`, `recvimfrom`, UUID exceptions and secure
issuer scope to online avatar IMs; `llInstantMessage` object deliveries bypass
these filters. Kokua replaces restricted text with `...`; Firestorm displays
`*** IM blocked by your viewer`.
Frozen per-avatar `receivedChatLog` snapshots expose received local chat and emotes.
Receive restrictions apply speaker exceptions and targeted denials per profile,
without changing simulator listens or the sender's action record. `getstatus` and `getstatusall` reply with stored
rules using profile-specific separators, substring filters and UUID ordering.
RLVa `getcommand` discovers implemented manifest forms with substring, type and
separator options. Frozen form metadata distinguishes state-only restrictions
from enforced replies; unsupported forms stay out of discovery. Command logs
expose unsupported outcomes without adding wire acknowledgements.
`getattach` reads current attachment point occupancy, including HUDs, using
the canonical 55-point table. RLVa also supports occupied point names and group
filters through `getattachnames`, `getaddattachnames` and `getremattachnames`; Kokua leaves those queries unsupported.
`notify` registers emitter-scoped restriction notifications with substring filters.
Both profiles deliver avatar-origin messages; aliases, duplicate operations and
clear ordering follow the selected viewer profile.
Kokua fixtures accept a per-avatar `blacklist` of wire names, with `%f` entries
for force commands. `versionnumbl` and filtered `getblacklist` expose it. Ignored
adds still notify; force commands have no effect. RLVa uses `rlvaNoSetEnv` to
disable `setenv` add/remove separately and has neither blacklist query.
Environment force/query forms use a per-avatar `environment` fixture for sky
settings, named presets and daytime samples. `setenv` locks changes from other
issuers. Vector formats, legacy aliases, numeric ranges and daytime replies
follow the selected profile. `avatar.viewer.environment.sky` exposes a frozen
snapshot; asset loading and rendering remain external.
Unsupported effects keep their diagnostics under either setting.
See the [paired viewer fixtures](packages/vitest/README.md#paired-rlvrlva-fixtures)
for profile differences and lifecycle behavior.
Force `sit` and `unsit` update World seating and expose action outcomes in the
viewer command log. `getsitid` reports the object root, null standing, or the avatar
UUID for RLVa ground sitting. Profile-specific force lock checks are supported;
plain-prim surface placement beyond the fixture's 8 m radius is unsupported.
User sit/stand attempts have no issuer exemption. `sittp[:distance]` combines
finite decimal limits by minimum, defaults to 1.5 m, and rejects the exact boundary.
Distances use the clicked point in global coordinates, including the optional
region-axis offset. Non-finite, hexadecimal and overflow options remain inspectably
unsupported. Simulator `llSitOnLink` and `llUnSit` bypass viewer locks.
`standtp` returns after standing or simulator unsitting, using a viewer sit origin.
Kokua also saves the position on a new rule and requires direct parcel routing;
RLVa rejects seated object-sit requests and ignores zero global origins. Return
travel bypasses teleport locks and sends normal changes to worn scripts.

Camera fixtures support `setcam_fov=force`, `getcam_fov`, aggregated
`setcam_fovmin/max` restrictions and their queries. `changeRlvFov(avatar, radians)`
attempts a user lens change; `getRlvFov(avatar)` reads its effective angle.
Enabled profiles share this lens with permission-gated `llGetCameraFOV` reads,
and a FOV passed to `script.setCamera` is a user lens change.
RLVa uses three-decimal replies and empty unset bounds; Kokua uses six decimals
and zoom-derived bounds. Camera distance bounds and their `camdist*` aliases
clamp permission-gated pose reads. RLVa also supports camera-origin bounds and
`getcam_avdist`; Kokua supports `getcam_zoom*`. The `camzoom*` aliases constrain
the lens with profile-specific directions. `setRlvCameraOrigins` supplies joint
and camera-origin positions, and `getRlvCameraLimits` exposes effective bounds
and RLVa's `setcam_avdist` silhouette threshold. Rendering is outside this fixture.

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

`attachall`, `attachallover` and `attachalloverorreplace` wear recursive shared folders,
with `addoutfitall` and `addoutfitallover` aliases. Kokua also accepts
`addoutfitalloverorreplace`. `detachall` removes folder contents recursively;
`remoutfit:<folder>` removes direct folder attachments and clothing.
Hidden and folded folders follow the selected profile, with per-item outcomes.

`attachthis` and its `over`, `overorreplace` and recursive `attachallthis` forms
select shared folders from the issuing attachment, a named attachment point,
a clothing layer or a worn object UUID. `detachthis` and `detachallthis` remove
the selected folder contents. Point and layer selectors include every worn item.
Existing wear, removal, lock and folder-prefix rules apply. The `addoutfitthis`
and `addoutfitallthis` aliases follow the same behavior; their `overorreplace`
variants are available only in Kokua. Kokua resolves child prims to their root;
RLVa child prims have no inventory item identity and select no folder.


`seedRlvInventory` supplies a per-avatar inventory tree with stable IDs, parent
relations and an explicit shared root. `getinv` returns direct folder names with
profile-specific path matching and visibility filters.

`findfolder` and `findfolders` search the shared inventory with profile-specific
traversal, hidden-folder and separator rules. `getpath` and `getpathnew` query
existing worn attachment paths through optional `wornAttachments` item-to-root
mappings in `seedRlvInventory`. They observe attachment changes without spawning
or wearing objects. Outfit-layer path selectors remain unsupported.

RLV/RLVa outfit reads include `getoutfit` and `getinvworn`. RLVa also answers
`getoutfitnames`, `getaddoutfitnames` and `getremoutfitnames` using worn layers
and active clothing locks; Kokua leaves these queries unsupported. Seed wearable layers
and worn item IDs with `seedRlvInventory`; inventory replies combine clothing
with mapped live attachments. The manifest describes profile differences and
direct folded-folder queries. These reads do not wear or
remove items. See the outfit fixture documentation in `packages/vitest/README.md`.

Viewer fixtures also support explicit startup and session reset. Not-ready viewers
retain commands; Kokua can bypass retention for version requests, while RLVa can
flush version queries during its misc startup phase. Virtual-time collection
separates known and never-resolved issuers, and completed RLVa detach clears rules
immediately. Viewer object-list membership can be supplied independently of range
or region. Session reset cancels retained work and undelivered viewer replies.

Force `tpto` resolves global or named-region coordinates through explicit World
regions and records requested destinations, resulting avatar state and refusals.
Kokua truncates coordinates and ignores the supplied angle; RLVa preserves
fractions and supports radian facing. Teleport lock and issuer-exemption behavior
is profile specific. Moves stand normally without granting simulator permissions. Worn objects follow
the avatar into the new region, keep hearing its viewer and get teleport and
region `changed` events.
Forced location travel applies parcel landing points and facing, anywhere routing,
and diversion from blocked parcels to the nearest available location in the region.
If no location is available, travel refuses before standing. Parcel owners and
configured estate owners/managers bypass routing. Final heights use the region's
bilinear terrain with a fixed 0.975 m settled clearance. Collision geometry,
telehubs and camera pose are excluded.

RLV/RLVa force removal covers direct shared-folder attachments with
`@detach:<path>=force` and selected or all clothing layers with
`@remoutfit[:<layer>]=force`. Bodyparts remain worn and every controller's
removal locks apply. Per-item results are available in `removeResults` on the
viewer command log. Global and named `addoutfit`/`remoutfit` locks also apply to
the paired fixture's explicit `attemptWearable(itemId, wear)` clothing action.
`sharedwear`, `unsharedwear`, `sharedunwear` and `unsharedunwear` additionally
lock explicit user clothing and mapped attachment actions by shared inventory
ancestry, including replacement of protected attachments. The paired fixture
documentation describes folded-folder and issuer-precedence differences.


Captured avatar `llGiveInventoryList` offers can be resolved with
`respondRlvInventoryOffer(avatar, offer, { accept, allowSharedRouting })` from
`@rezless/vitest`. Offers stay pending until explicitly resolved. Shared routing
requires `allowSharedRouting: true`; omitted or false accepts into ordinary
inventory, and `accept: false` adds nothing. The inventory fixture's
`forbidGiveToRlv` setting also prevents shared routing. Acceptance appends frozen
item metadata and queues profile-specific notify messages without wearing content.
See the vitest inventory offer documentation for root and path differences.

`getRlvViewerState(avatar, { target?, distance?, hud? })` returns a frozen array
of viewer restriction effects, each with `behaviour`, `support`, `restricted`,
and frozen `rules` containing options, exceptions and issuing prims. Omit the
context for the default target policy; provide an avatar UUID for name exceptions
or an exact prim UUID for hover text, distance in metres for nametags, and
`hud: true/false` for HUD/world hover text. Unsupported effects have
`restricted: null`. The query covers inventory, location/maps, names/nametags,
nearby lists, hover text, self visibility, note/script/texture viewing and
transparent/wireframe controls. It reports restriction policy independently of
current window openness or rendered pixels. Removal, clear and session cleanup
are reflected in the next snapshot.

Firestorm RLVa 2.4.2 applies UUID exceptions, self exemptions, strict issuer
checks and the smallest nametag distance (strictly inside the boundary).
Kokua RLV 2.09.35.00 shares name and nametag UUID exceptions for name censoring;
nametag hiding has no exception and also follows name hiding with the default
settings. Its self visibility, transparent/wireframe controls, strict nametag
forms and nametag distance modifiers remain inspectably unsupported.

Camera render effects share `getRlvViewerState`: texture replacement, overlay
alpha/texture/tint and touch blocking, and sphere mode/origin/distance/value/param
configuration are exposed as frozen `parameters`. Firestorm keeps independent
sphere issuers and selects overlay hierarchies; Kokua combines spheres by mode
and leaves overlays unsupported. See the [render effect contract](packages/vitest/README.md#camera-render-effects).


RLV avatar movement inputs use `world.attemptAvatarMovement(avatar, action)`
(or paired-fixture `move`), returning allowed/blocked outcomes and deciding
restrictions. Flight updates `AGENT_FLYING`; run locks stop the corresponding
viewer modes, with profile-specific clearing behavior. RLVa additionally
supports jump restrictions and forced flight. Hover adjustment and RLVa idle
policy are exposed through `getRlvViewerState`; jump physics and automatic
away timers are not simulated. See the vitest RLV movement documentation.

Debug commands use per-avatar `viewer.debugSettings` initial values and
`avatar.viewer.debugSettings` state. Both profiles enforce the `setdebug` lock
against other issuers and permit writes to AvatarSex and
RenderResolutionDivisor. RLVa additionally exposes the read-only AspectRatio
query. See the vitest debug settings documentation for defaults, conversion
rules and permission-setting queries.

Group fixtures use `avatar.group` as the active UUID and `avatar.groups` for
membership names and optional roles. `setgroup` locks explicit user activation
through `world.userChangeAvatarGroup(avatar, key)`. Forced changes update the
same group read by `llSameGroup` and sensors; `getgroup` replies with the active
name or `none`. Name matching, issuer exemptions and throttling follow each
profile. See the vitest group documentation.

## License

The rezless project is licensed under the **Apache License, Version 2.0** —
see [`LICENSE`](LICENSE).

LSL function/event/constant signatures come from Linden Lab's official
[secondlife/lsl-definitions](https://github.com/secondlife/lsl-definitions),
vendored at `vendor/lsl_definitions.yaml` and licensed under the **MIT
License**; see [`NOTICE`](NOTICE) for the full attribution.
