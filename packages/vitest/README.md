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
pnpm gen          # regenerate ll* stub tables from vendor/kwdb.xml
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
  objectKey: 'cccc-dddd-...',     // optional, derived from filename
  objectName: 'StarterCube',      // optional, "Object" default
  scriptName: 'greeter',          // optional, derived from filename
})
```

Parse errors throw `LslParseError` with `file:line:col` location info.

### `Script` handle

```ts
// Drive events
s.start()                                       // run state_entry of default
s.fire(eventName, payload)                      // payload binds to handler params by kwdb-spec name
s.advanceTime(ms)                               // advance virtual clock; drains timer + queued events
s.deliverChat({ channel, name, key, message })  // fire `listen` on matching active listens
s.respondToHttp(key, { status, body })          // fire `http_response` for a captured llHTTPRequest
s.respondToLastHttp({ status, body })           // same, for the most recent
s.respondToDataserver(key, value)               // fire `dataserver` for a captured llRequest*
s.respondToLastDataserver(value)                // same, for the most recent
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
s.dataserverRequests                            // [{ key, source, args, fulfilled }]
s.listens                                       // [{ handle, channel, name, key, message, active }]
s.linkedMessages                                // [{ target, num, str, id }] sent by THIS script
s.clearLinkedMessages()                         // drop captured llMessageLinked entries
s.linksetData                                   // ReadonlyMap<string, { value, password }> (shared LSD store)
s.seedLinksetData(entries)                      // pre-populate LSD without firing events
s.text                                          // current llSetText: { text, color, alpha } or null
s.objectDesc                                    // current llSetObjectDesc value
s.dead                                          // true once llDie has run

// Multi-script context (auto-allocated for single-script tests)
s.host                                          // the Prim instance hosting this script
s.linkset                                       // the Linkset (shared clock, LSD, link_message bus)
s.scriptName                                    // inventory name; backs llGetScriptName
```

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

### Implemented `ll*` functions

The real-impl set covers the most common use cases. Anything outside it
falls through to a typed stub that returns the kwdb-documented default
and records the call. Use `s.mock(name, fn)` to provide your own
behaviour for any function the script under test calls. Builtin
function delays (e.g. the 0.2s delay on `llSetLinkPrimitiveParams`) are
honored centrally in the dispatcher.

* **chat**: `llSay`, `llShout`, `llWhisper`, `llOwnerSay`
* **listen**: `llListen`, `llListenRemove`, `llListenControl`
* **time**: `llSetTimerEvent`, `llSleep`, `llGetTime`, `llGetAndResetTime`, `llResetTime`
* **HTTP**: `llHTTPRequest`, `llHTTPResponse`
* **linked**: `llMessageLinked` (full `LINK_THIS` / `LINK_SET` / `LINK_ALL_OTHERS` / `LINK_ALL_CHILDREN` / `LINK_ROOT` / specific-link routing across the linkset, with correct `sender_num`)
* **link info**: `llGetLinkNumber`, `llGetNumberOfPrims`, `llGetLinkKey`, `llGetLinkName`
* **dataserver**: `llRequestAgentData`, `llRequestInventoryData`, `llRequestSimulatorData`, `llRequestUsername`, `llRequestDisplayName`
* **detected**: `llDetectedKey`/`Name`/`Owner`/`Group`/`Pos`/`Rot`/`Vel`/`Type`/`LinkNumber`/`Grab`/`TouchPos`
* **math**: `llAbs`, `llFabs`, `llRound` (banker's), `llCeil`, `llFloor`, `llPow`, `llSqrt`, `llSin`/`Cos`/`Tan`/`Asin`/`Acos`/`Atan2`, `llLog`/`Log10`, seeded `llFrand`, `llVecMag`/`Norm`/`Dist`, `llRot2Euler`/`Euler2Rot`
* **string**: `llStringLength`, `llSubStringIndex`, `llGetSubString`, `llDeleteSubString`, `llInsertString`, `llStringTrim`, `llToLower`/`Upper`, `llReplaceSubString`, `llEscapeURL`/`UnescapeURL`
* **list**: `llGetListLength`, `llList2Integer`/`Float`/`String`/`Key`/`Vector`/`Rot`, `llList2List`, `llDeleteSubList`, `llListInsertList`, `llListReplaceList`, `llListFindList`, `llDumpList2String`, `llCSV2List`, `llParseString2List`
* **json**: `llJson2List`, `llJsonGetValue`, `llJsonSetValue`, `llJsonValueType`, `llList2Json` — full LSL JSON semantics including the FDDx-range type-tag sentinels (`JSON_OBJECT`/`ARRAY`/`NUMBER`/`STRING`/`NULL`/`TRUE`/`FALSE`/`INVALID`/`DELETE`), `JSON_APPEND`, the empty-value short-circuit (`{"k":,}` → `JSON_NULL`) on `Get`/`Type`, duplicate-key collapse on `Set`, force-fit auto-creation of nested objects/arrays through deep specifier paths, and the kept-as-is rule for nested JSON-shaped strings in `llList2Json`.
* **identity**: `llGetOwner`, `llGetCreator`, `llGetKey`, `llGetObjectName`, `llSetObjectName`, `llGetScriptName`
* **hash**: `llMD5String`, `llSHA1String`, `llSHA256String`, `llHMAC`
* **base64**: `llStringToBase64`/`Base64ToString`, `llIntegerToBase64`/`Base64ToInteger`
* **object**: `llSetText`, `llSetObjectDesc`, `llGetObjectDesc`, `llDie` (kills every script in the linkset), `llResetScript`
* **inventory**: `llGetInventoryNumber`/`Name`/`Type`/`Key`/`Creator`/`Desc`/`AcquireTime`/`PermMask` against the host prim's inventory; notecards via `llGetNotecardLine` / `llGetNumberOfNotecardLines` (correct EOF / NAK semantics, ISO 8601 UTC acquire-time strings)
* **script control**: `llResetOtherScript`, `llSetScriptState`, `llGetScriptState` — pausing parks events for replay on resume, and the timer cadence realigns on resume so paused scripts don't get a flood of catch-up timer events
* **linkset data**: `llLinksetDataWrite`/`Read`/`Delete`/`WriteProtected`/`ReadProtected`/`DeleteProtected`/`DeleteFound`, `llLinksetDataReset`, `llLinksetDataAvailable`, `llLinksetDataCountKeys`/`CountFound`, `llLinksetDataListKeys`/`FindKeys` — fires the `linkset_data` event on every script in the linkset with `LINKSETDATA_UPDATE` / `DELETE` / `RESET` / `MULTIDELETE`. The store survives `llResetScript`. Inspect via `s.linksetData` (a `ReadonlyMap<string, { value, password }>`); pre-populate via `s.seedLinksetData([['k', { value: 'v' }]])`.
* **primitive params**: `llSetPrimitiveParams`, `llSetLinkPrimitiveParams`, `llSetLinkPrimitiveParamsFast`, `llGetPrimitiveParams`, `llGetLinkPrimitiveParams` — full `PRIM_*` rule surface (position / rotation / size / colour / alpha / texture / glow / fullbright / material / physics / flexible / point light / projector / sculpt / GLTF PBR / sit target / click action / text / name / desc / omega / damage / temp-on-rez / cast shadows / …). Honors `PRIM_LINK_TARGET` mid-rule redirects, `ALL_SIDES` expansion, multi-prim get concatenation, unknown-rule termination on get, and the 0.2 s delay on the slow link variant.
* **prim accessors** (alternative single-rule shortcuts that read/write the same backing store): `llSetPos`/`llGetPos`/`llGetLocalPos`/`llGetRootPosition`, `llSetRot`/`llSetLocalRot`/`llGetRot`/`llGetLocalRot`/`llGetRootRotation`, `llSetScale`/`llGetScale`/`llScaleByFactor`/`llGetMaxScaleFactor`/`llGetMinScaleFactor`, `llSetColor`/`llGetColor`/`llSetAlpha`/`llGetAlpha`, `llSetTexture`/`llGetTexture`/`llGetTextureOffset`/`llGetTextureScale`/`llGetTextureRot`/`llScaleTexture`/`llOffsetTexture`/`llRotateTexture`, `llSetLinkColor`/`llSetLinkAlpha`/`llSetLinkTexture`, `llSetTextureAnim`/`llSetLinkTextureAnim`/`llSetLinkTextureAnimOverrideMe`, `llSetRenderMaterial`/`llGetRenderMaterial`, `llSetStatus`/`llGetStatus`/`llSetLinkStatus`, `llSetClickAction`, `llTargetOmega`, `llSetPhysicsMaterial`/`llGetPhysicsMaterial`, `llPassCollisions`/`llPassTouches`, `llSitTarget`/`llLinkSitTarget`/`llAvatarOnSitTarget`/`llAvatarOnLinkSitTarget`/`llSetLinkSitFlags`/`llGetLinkSitFlags`.

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

LSL function/event/constant signatures come from
[Sei-Lisa/kwdb](https://github.com/Sei-Lisa/kwdb), vendored at
`vendor/kwdb.xml` and licensed under **LGPL-3.0-or-later**. Files
mechanically derived from it (`packages/vm/src/generated/*.ts`) remain
under that licence; see [`NOTICE`](NOTICE) for the full attribution.

Apache 2.0 is one-way compatible with LGPL-3 (per the FSF), so a
combined work that includes both can be redistributed under LGPL-3
terms — which is what consumers receive when they use rezless.
