import { describe, it, expect } from 'vitest'
import { loadLinkset, World, DEBUG_CHANNEL, type Script, type Vector, type Rotation } from '../src/index.js'

const OWNER = 'af576265-1cc4-46de-98d1-1d0d64d10d3b'
const A1 = '41d16feb-53f0-e280-a791-d658b78ee8c7'
const A2 = '2bd62658-bd71-7342-07c0-f6b6e7d46835'
const B1 = '0c0171d6-1dd8-2709-fbf2-fe5a9b50619f'
const B2 = '0129045e-650c-d8b6-ec19-fe32d3e4d339'
const UNKNOWN = '6a3c0e6e-1f6d-4a3b-9b62-2f0c1d1e7a55'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const CHANGED_LINK = 32
const Z90: Rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }

const NAMES = `list names() {
  list l; integer n = llGetNumberOfPrims(); integer i;
  if (n == 1) return [llGetObjectName()];
  for (i = 1; i <= n; i++) l += llGetLinkName(i);
  return l;
}`

const WATCHER = `list seen; default {
  changed(integer c) { seen += [c, llGetLinkNumber(), llGetNumberOfPrims()]; }
  linkset_data(integer action, string name, string value) { seen += ["lsd", name]; }
}`

/**
 * The probe objects on Aditi, SLua Tideland, 2026-10-31: A is a 0.4 m box A1
 * at <114, 46, 1997> with child A2 1 m along x; B is B1 at <114, 49, 1997>
 * turned 90 degrees about z, with child B2 at <115, 49, 1997> unturned. A
 * watcher script in every prim records its changed events. The conductor in
 * A1 asks for PERMISSION_CHANGE_LINKS and runs `body` once it is answered.
 */
async function scene(
  body: string,
  opts: { grant?: boolean; loneB?: boolean; conductorIn?: 'A1' | 'A2'; seedB?: string[] } = {},
) {
  const world = new World({ startUnixTime: 1_793_474_000 })
  world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
  const conductor = {
    name: 'conductor',
    source: {
      source: `list out; list seen; float dt;
        ${NAMES}
        float timed(key k, integer parent) { float t = llGetTime(); llCreateLink(k, parent); return llGetTime() - t; }
        default {
          state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
          run_time_permissions(integer p) { ${body} }
          changed(integer c) { seen += [c]; }
        }`,
    },
  }
  const watcher = (name: string) => ({ name, source: { source: WATCHER } })
  const conductorIn = opts.conductorIn ?? 'A1'
  const a = await loadLinkset({
    world,
    region: 'SLua Tideland',
    owner: OWNER,
    position: { x: 114, y: 46, z: 1997 },
    prims: [
      { key: A1, name: 'A1', scripts: [watcher('wA1'), ...(conductorIn === 'A1' ? [conductor] : [])] },
      { key: A2, name: 'A2', scripts: [watcher('wA2'), ...(conductorIn === 'A2' ? [conductor] : [])] },
    ],
  })
  a.prims[1]!.params.position = { x: 1, y: 0, z: 0 }
  const b = await loadLinkset({
    world,
    region: 'SLua Tideland',
    owner: OWNER,
    position: { x: 114, y: 49, z: 1997 },
    prims: [
      { key: B1, name: 'B1', scripts: [watcher('wB1')] },
      ...(opts.loneB ? [] : [{ key: B2, name: 'B2', scripts: [watcher('wB2')] }]),
    ],
  })
  b.prims[0]!.params.rotation = Z90
  if (!opts.loneB) {
    b.prims[1]!.params.position = { x: 0, y: -1, z: 0 }
    b.prims[1]!.params.rotation = { x: 0, y: 0, z: -Math.SQRT1_2, s: Math.SQRT1_2 }
  }
  b.scripts.wB1!.seedLinksetData(
    opts.seedB ? opts.seedB.map((k) => [k, { value: 'x'.repeat(4000) }] as const) : [['b1', { value: 'B' }]],
  )
  const scripts: Record<string, Script> = { ...a.scripts, ...b.scripts }
  for (const s of Object.values(scripts)) s.start()
  const c = scripts.conductor!
  if (opts.grant === false) c.denyPermissions()
  else c.grantPermissions()
  c.advanceTime(5000)
  return { world, a, b, scripts, c, out: c.global('out') as unknown[] }
}

const seen = (s: Script | undefined) => s!.global('seen') as unknown[]

const close = (v: Vector | Rotation, digits = 5) =>
  Object.fromEntries(Object.entries(v).map(([k, n]) => [k, expect.closeTo(n as number, digits)]))

describe('llCreateLink', () => {
  // https://wiki.secondlife.com/wiki/LlCreateLink — the target's prims go in
  // from link 2: A1 A2 + B1 B2 -> A1 B1 B2 A2.
  // In-world: llCreateLink(B1, TRUE) from A1 -> "A1,B1,B2,A2", llGetNumberOfPrims
  // 4 straight after the call, the call took 0.11-0.13 s (Aditi, SLua Tideland, 2026-10-31).
  it('links the target in from link 2 when parent is TRUE, after a 0.1 s delay', async () => {
    const { out, c } = await scene('dt = timed(llList2Key(["' + B1 + '"], 0), TRUE); out = names() + [llGetNumberOfPrims(), llGetLinkNumber()];')
    expect(out).toEqual(['A1', 'B1', 'B2', 'A2', 4, 1])
    expect(c.global('dt')).toBeCloseTo(0.1, 5)
  })

  // In-world: every prim of both objects got changed(32) once, reading its new
  // link number and 4 prims: B1 2, B2 3, A2 4, A1 1; the conductor's own
  // changed came after its handler finished.
  it('raises changed(CHANGED_LINK) in every prim of the new linkset', async () => {
    const { scripts } = await scene(`llCreateLink("${B1}", TRUE); out = [llGetListLength(seen)];`)
    expect(scripts.conductor!.global('out')).toEqual([0])
    expect(seen(scripts.conductor)).toEqual([CHANGED_LINK])
    expect(seen(scripts.wA1)).toEqual([CHANGED_LINK, 1, 4])
    expect(seen(scripts.wB1)).toEqual([CHANGED_LINK, 2, 4])
    expect(seen(scripts.wB2)).toEqual([CHANGED_LINK, 3, 4])
    expect(seen(scripts.wA2)).toEqual([CHANGED_LINK, 4, 4])
  })

  // In-world: after linking B to unturned A1, B1 reads PRIM_POS_LOCAL <0, 3, 0>
  // and PRIM_ROT_LOCAL <0, 0, 0.707107, 0.707107>; B2 <1, 3, 0> and the
  // identity; PRIM_POSITION is unchanged for both.
  it('keeps each linked prim where it was, relative to the new root', async () => {
    const { out } = await scene(
      `llCreateLink("${B1}", TRUE); out = llGetLinkPrimitiveParams(2, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION]) + llGetLinkPrimitiveParams(3, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION]);`,
    )
    expect(out).toEqual([
      close({ x: 0, y: 3, z: 0 }),
      close(Z90),
      close({ x: 114, y: 49, z: 1997 }),
      close({ x: 1, y: 3, z: 0 }),
      close({ x: 0, y: 0, z: 0, s: 1 }),
      close({ x: 115, y: 49, z: 1997 }),
    ])
  })

  // In-world: llCreateLink(B1, FALSE) with B1 alone and turned 90 degrees ->
  // "B1,A1,A2", the conductor at link 2; A1 reads PRIM_POS_LOCAL <-3, 0, 0>
  // and PRIM_ROT_LOCAL <0, 0, -0.707107, 0.707107>, A2 <-3, -1, 0>.
  it('makes the target the root when parent is FALSE', async () => {
    const { out } = await scene(
      `llCreateLink("${B1}", FALSE); out = names() + [llGetLinkNumber()] + llGetLinkPrimitiveParams(2, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL]) + llGetLinkPrimitiveParams(3, [PRIM_POS_LOCAL]);`,
      { loneB: true },
    )
    expect(out).toEqual([
      'B1',
      'A1',
      'A2',
      2,
      close({ x: -3, y: 0, z: 0 }),
      close({ x: 0, y: 0, z: -Math.SQRT1_2, s: Math.SQRT1_2 }),
      close({ x: -3, y: -1, z: 0 }),
    ])
  })

  // In-world: with B2 alone and B1 A1 A2 linked, llCreateLink(B2, FALSE) from
  // A1 -> "B2,B1,A1,A2".
  it('puts the script object in from link 2 behind a target that becomes the root', async () => {
    const { out } = await scene(
      `llCreateLink("${B1}", FALSE); llBreakLink(3); llCreateLink("${A2}", FALSE); out = names();`,
      { loneB: true },
    )
    expect(out).toEqual(['A2', 'B1', 'A1'])
  })

  // In-world: llCreateLink on A2, a child of another object, linked that whole
  // object: B2 + (A1, B1, A2) -> "B2,A1,B1,A2".
  it('links the whole object when the key is one of its child prims', async () => {
    const { out } = await scene(`llCreateLink("${B2}", TRUE); out = names();`)
    expect(out).toEqual(['A1', 'B1', 'B2', 'A2'])
  })

  // In-world: llCreateLink(llGetKey(), TRUE) and llCreateLink(llGetLinkKey(1),
  // TRUE) left "B1,A1,A2" as it was, but every prim got changed(32).
  it('changes nothing but raises changed when the target is in its own object', async () => {
    const { out, scripts } = await scene(`llCreateLink(llGetKey(), TRUE); llCreateLink("${A2}", FALSE); out = names();`)
    expect(out).toEqual(['A1', 'A2'])
    expect(seen(scripts.wA1)).toEqual([CHANGED_LINK, 1, 2, CHANGED_LINK, 1, 2])
    expect(seen(scripts.wA2)).toEqual([CHANGED_LINK, 2, 2, CHANGED_LINK, 2, 2])
    expect(seen(scripts.wB1)).toEqual([])
  })

  // In-world: NULL_KEY, the owner's avatar key, an unknown key and "junk" each
  // left the object alone, raised no changed and put nothing on DEBUG_CHANNEL
  // (a relay prim listening there did hear an llRegionSay error); each call
  // still took 0.11 s.
  it('does nothing for a key with no prim, after the delay', async () => {
    const { out, scripts, c } = await scene(
      `out = [timed(NULL_KEY, TRUE), timed(llGetOwner(), TRUE), timed("${UNKNOWN}", TRUE), timed("junk", FALSE)] + names();`,
    )
    expect(out).toEqual([...Array(4).fill(expect.closeTo(0.1, 5)), 'A1', 'A2'])
    expect(seen(scripts.wA1)).toEqual([])
    expect(c.chat.filter((m) => m.channel === DEBUG_CHANNEL)).toEqual([])
  })

  // https://wiki.secondlife.com/wiki/LlCreateLink says a missing
  // PERMISSION_CHANGE_LINKS shouts an error. In-world: without it nothing
  // linked and nothing reached DEBUG_CHANNEL; the call still took 0.11-0.13 s.
  it('does nothing without PERMISSION_CHANGE_LINKS, after the delay', async () => {
    const { out, c, scripts } = await scene(`out = [timed("${B1}", TRUE)] + names();`, { grant: false })
    expect(out).toEqual([expect.closeTo(0.1, 5), 'A1', 'A2'])
    expect(seen(scripts.wB1)).toEqual([])
    expect(c.chat.filter((m) => m.channel === DEBUG_CHANNEL)).toEqual([])
  })
})

describe('llBreakLink', () => {
  // In-world: from A1 B1 B2 A2, llBreakLink(3) -> "A1,B1,A2" straight away
  // with no delay; B2 got changed(32) reading link 0 of 1 prim, the others
  // their new link numbers of 3; B2 stayed at <115, 49, 1997>.
  it('breaks a child off and renumbers the rest', async () => {
    const { out, scripts, world } = await scene(
      `llCreateLink("${B1}", TRUE); float t = llGetTime(); llBreakLink(3); out = [llGetTime() - t] + names();`,
    )
    expect(out).toEqual([0, 'A1', 'B1', 'A2'])
    expect(seen(scripts.wB2)).toEqual([CHANGED_LINK, 3, 4, CHANGED_LINK, 0, 1])
    expect(seen(scripts.wA2)).toEqual([CHANGED_LINK, 4, 4, CHANGED_LINK, 3, 3])
    const b2 = world.linksets.find((l) => l.prims[0]?.key === B2)!
    expect(b2.prims).toHaveLength(1)
    expect(b2.prims[0]!.regionPosition()).toEqual(close({ x: 115, y: 49, z: 1997 }))
  })

  // https://wiki.secondlife.com/wiki/LlBreakLink — a script can delink any
  // prim, the root too. In-world: from a child, llBreakLink(1) broke the root
  // off and the rest kept linking with the next prim as root; from the root,
  // llBreakLink(1) broke the root itself off.
  it('breaks the root off with link 1, from a child or from the root', async () => {
    const fromChild = await scene(`llCreateLink("${B1}", TRUE); llBreakLink(1); out = names() + [llGetLinkNumber()];`, {
      conductorIn: 'A2',
    })
    expect(fromChild.out).toEqual(['B1', 'B2', 'A2', 3])
    const fromRoot = await scene(`llCreateLink("${B1}", TRUE); llBreakLink(1); out = names() + [llGetLinkNumber()];`)
    expect(fromRoot.out).toEqual(['A1', 0])
    expect(seen(fromRoot.scripts.wB1)).toEqual([CHANGED_LINK, 2, 4, CHANGED_LINK, 1, 3])
  })

  // In-world, from root and from child of a 4-prim object: 0 and 5 broke
  // nothing; LINK_THIS (-4) broke the root (link 1); -1, -2, -3, -5, -6, -100
  // and -2147483648 broke link 2.
  it('reads link 0 and numbers past the end as nothing, LINK_THIS as the root and other negatives as link 2', async () => {
    const run = async (link: string, conductorIn: 'A1' | 'A2' = 'A1') =>
      (await scene(`llCreateLink("${B1}", TRUE); llBreakLink(${link}); out = names();`, { conductorIn })).out
    expect(await run('0')).toEqual(['A1', 'B1', 'B2', 'A2'])
    expect(await run('0', 'A2')).toEqual(['A1', 'B1', 'B2', 'A2'])
    expect(await run('5')).toEqual(['A1', 'B1', 'B2', 'A2'])
    expect(await run('LINK_THIS')).toEqual(['A1'])
    expect(await run('LINK_THIS', 'A2')).toEqual(['B1', 'B2', 'A2'])
    for (const link of ['LINK_SET', 'LINK_ALL_OTHERS', 'LINK_ALL_CHILDREN', '-5', '-2147483648']) {
      expect(await run(link)).toEqual(['A1', 'B2', 'A2'])
    }
  })

  // In-world: llBreakLink(2) without PERMISSION_CHANGE_LINKS left the object
  // linked and put nothing on DEBUG_CHANNEL.
  it('does nothing without PERMISSION_CHANGE_LINKS', async () => {
    const { out, c } = await scene('llBreakLink(2); llBreakAllLinks(); out = names();', { grant: false })
    expect(out).toEqual(['A1', 'A2'])
    expect(c.chat.filter((m) => m.channel === DEBUG_CHANNEL)).toEqual([])
  })

  // In-world: a lone prim's llBreakLink(0) and llBreakAllLinks raised no changed.
  it('leaves a lone prim alone', async () => {
    const { out, scripts } = await scene('llBreakLink(2); llBreakLink(0); llBreakAllLinks(); out = names();', {
      conductorIn: 'A2',
    })
    expect(out).toEqual(['A2'])
    expect(seen(scripts.wA2)).toEqual([CHANGED_LINK, 0, 1])
  })
})

describe('llBreakAllLinks', () => {
  // In-world: from a child of B1 A1 A2, every prim came apart straight away and
  // each got one changed(32) reading link 0 of 1 prim; each kept its region
  // position and rotation (B1 <114, 49, 1997> turned 90 degrees).
  it('breaks every prim apart, raising changed in each', async () => {
    const { out, scripts, world } = await scene(`llCreateLink("${B1}", TRUE); llBreakAllLinks(); out = names() + [llGetLinkNumber()];`, {
      conductorIn: 'A2',
    })
    expect(out).toEqual(['A2', 0])
    for (const w of ['wA1', 'wA2', 'wB1', 'wB2']) expect(seen(scripts[w]).slice(-3)).toEqual([CHANGED_LINK, 0, 1])
    expect(world.linksets.filter((l) => l.prims.length > 0)).toHaveLength(4)
    const b1 = world.linksets.find((l) => l.prims[0]?.key === B1)!.prims[0]!
    expect(b1.regionPosition()).toEqual(close({ x: 114, y: 49, z: 1997 }))
    expect(b1.params.rotation).toEqual(close(Z90))
  })
})

describe('linkset data across link changes', () => {
  // https://wiki.secondlife.com/wiki/Category:LSL_LinksetData — on a merge the
  // new root's data is kept and the old root's pairs move over.
  // In-world: linking B (keys w-B1, w-B2) into A (cond, w-A1, w-A2) -> all
  // five keys; breaking a child off left it with none; breaking the root off
  // (LINK_THIS, llBreakLink(1)) kept the data with the root and left the rest
  // with none.
  it('merges into the new root and stays with the root prim on a break', async () => {
    const lsd = `llLinksetDataListKeys(0, -1)`
    const { out, scripts } = await scene(
      `llLinksetDataWrite("a", "A"); out = [llDumpList2String(${lsd}, ",")]; llCreateLink("${B1}", TRUE); out += llDumpList2String(${lsd}, ","); llBreakLink(3); llBreakLink(1); out += llDumpList2String(${lsd}, ",");`,
    )
    expect(out).toEqual(['a', 'a,b1', 'a,b1'])
    expect([...scripts.wB1!.linksetData.keys()]).toEqual([])
    expect([...scripts.wB2!.linksetData.keys()]).toEqual([])
  })

  // In-world: A holding a=A linked Y holding a=Y and y=Y -> a=A,y=Y, with no
  // linkset_data event in either script; Y broken off read nothing; linking
  // Y back with parent FALSE (Y root, empty) -> a=A,y=Y again.
  it('keeps the root value on a clash and raises no linkset_data', async () => {
    const { out, scripts } = await scene(
      `llLinksetDataWrite("b1", "A"); out = [llLinksetDataRead("b1")]; llCreateLink("${B1}", TRUE); out += [llLinksetDataRead("b1")]; llBreakLink(2); out += [llLinksetDataRead("b1")]; llCreateLink("${B1}", FALSE); out += [llLinksetDataRead("b1"), llGetListLength(llLinksetDataListKeys(0, -1))];`,
      { loneB: true },
    )
    expect(out).toEqual(['A', 'A', 'A', 'A', 1])
    expect(seen(scripts.wA1).filter((x) => x === 'lsd')).toHaveLength(1)
    expect(seen(scripts.wB1)).not.toContain('lsd')
    expect(scripts.wB1!.linksetData.get('b1')?.value).toBe('A')
  })
})

describe('linkset data over capacity on a merge', () => {
  // https://wiki.secondlife.com/wiki/Category:LSL_LinksetData — when the
  // merged data does not fit, some of the old root's pairs are discarded,
  // and which ones may be arbitrary. In-world: 17 keys of 4000 bytes on each
  // side (63004 bytes free each) linked -> 32 keys, all 17 of the new root's
  // and 15 of the other's, 2944 bytes free; Second Life dropped q108 and
  // q113. rezless keeps the other side's keys in write order while they fit.
  it('moves over only the pairs that fit', async () => {
    const fill = (prefix: string) =>
      `string v = "${'x'.repeat(4000)}"; integer i; for (i = 100; i < 117; i++) llLinksetDataWrite("${prefix}" + (string)i, v);`
    const { out } = await scene(
      `${fill('p')} out = [llLinksetDataAvailable()]; llCreateLink("${B1}", TRUE); out += [llLinksetDataCountKeys(), llLinksetDataAvailable(), llGetListLength(llLinksetDataFindKeys("^p", 0, -1))];`,
      { loneB: true, seedB: Array.from({ length: 17 }, (_, i) => `q${100 + i}`) },
    )
    expect(out).toEqual([63004, 32, 2944, 17])
  })
})

describe('changed events from several link changes in one handler', () => {
  const count = async (body: string, watch: string) => {
    const { scripts } = await scene(body)
    return seen(scripts[watch]).filter((c) => c === CHANGED_LINK).length
  }

  // In-world, counting the calling script's changed events: two or three
  // llCreateLink in one handler -> 2, llCreateLink, llSleep(1), llCreateLink
  // -> 2; two or three llBreakLink in a row -> 1; llBreakLink, llSleep(1),
  // llBreakLink -> 2. A watcher in a prim that stayed linked through two
  // breaks in a row got one changed; one that was idle between two links got
  // one per link.
  it('queues one changed for a script per run of changes, and at most one more after it pauses', async () => {
    expect(await count(`llCreateLink("${B1}", TRUE); llBreakLink(2); llBreakLink(2);`, 'conductor')).toBe(2)
    expect(await count(`llBreakLink(2); llCreateLink("${B1}", TRUE); llCreateLink("${A2}", TRUE);`, 'conductor')).toBe(2)
    expect(await count(`llCreateLink("${B1}", TRUE); llSleep(1.0); llBreakLink(2); llBreakLink(2); llBreakLink(2);`, 'conductor')).toBe(2)
    expect(await count(`llCreateLink("${B1}", TRUE); llBreakLink(2); llSleep(1.0); llBreakLink(2);`, 'conductor')).toBe(2)
    expect(await count(`llCreateLink("${B1}", TRUE); llSleep(1.0); llBreakLink(3); llBreakLink(3);`, 'wA1')).toBe(2)
  })

  // In-world: a watcher stopped with llSetScriptState through llBreakLink,
  // llCreateLink and llBreakLink, with a second's sleep between each, got no
  // changed events once it was running again; its next link raised one as
  // usual (Aditi, SLua Tideland, 2026-10-31).
  it('drops link changes for a stopped script', async () => {
    const body = `llSetScriptState("wA1", FALSE); llCreateLink("${B1}", TRUE); llSleep(1.0); llBreakLink(2); llSleep(1.0); llBreakLink(2); llSleep(1.0); llSetScriptState("wA1", TRUE);`
    expect(await count(body, 'wA1')).toBe(0)
  })
})

describe('link changes outside a world', () => {
  // A broken-off prim stays in the region, so the URL it holds still counts
  // against the region's 20000 (see http-in.test.ts).
  it('keeps counting a broken-off prim\'s running scripts in the region', async () => {
    const { scripts } = await loadLinkset({
      owner: OWNER,
      prims: [
        {
          key: A1,
          scripts: [
            {
              name: 'conductor',
              source: {
                source: `list out;
                  default {
                    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
                    run_time_permissions(integer p) { out = [llGetSimStats(SIM_STAT_ACTIVE_SCRIPT_COUNT)]; llBreakLink(2); out += llGetSimStats(SIM_STAT_ACTIVE_SCRIPT_COUNT); }
                  }`,
              },
            },
          ],
        },
        { key: A2, scripts: [{ name: 'idle', source: { source: 'default { state_entry() { } }' } }] },
      ],
    })
    scripts.idle!.start()
    scripts.conductor!.start()
    scripts.conductor!.grantPermissions()
    expect(scripts.conductor!.global('out')).toEqual([2, 2])
  })

  it('keeps counting a broken-off prim\'s URLs', async () => {
    const { scripts } = await loadLinkset({
      owner: OWNER,
      prims: [
        {
          key: A1,
          scripts: [
            {
              name: 'conductor',
              source: {
                source: `list out;
                  default {
                    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
                    run_time_permissions(integer p) { out = [llGetFreeURLs()]; llBreakLink(2); out += llGetFreeURLs(); }
                  }`,
              },
            },
          ],
        },
        { key: A2, scripts: [{ name: 'url', source: { source: 'default { state_entry() { llRequestURL(); } }' } }] },
      ],
    })
    scripts.url!.start()
    scripts.conductor!.start()
    scripts.conductor!.grantPermissions()
    expect(scripts.conductor!.global('out')).toEqual([19999, 19999])
  })

  // The same rules as above; a prim broken off a linkset with no world keeps
  // its clock, so its scripts still get their events and it can link back.
  it('keeps a broken-off prim on the same clock and linkable', async () => {
    const { scripts } = await loadLinkset({
      owner: OWNER,
      prims: [
        {
          key: A1,
          name: 'A1',
          scripts: [
            {
              name: 'conductor',
              source: {
                source: `list out; ${NAMES}
                  default {
                    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
                    run_time_permissions(integer p) { llBreakLink(2); out = names(); llSetTimerEvent(1.0); }
                    timer() { llSetTimerEvent(0); llCreateLink("${A2}", TRUE); out += names(); }
                  }`,
              },
            },
          ],
        },
        { key: A2, name: 'A2', scripts: [{ name: 'wA2', source: { source: WATCHER } }] },
      ],
    })
    scripts.conductor!.start()
    scripts.wA2!.start()
    scripts.conductor!.grantPermissions()
    scripts.conductor!.advanceTime(2000)
    expect(scripts.conductor!.global('out')).toEqual(['A1', 'A1', 'A2'])
    expect(seen(scripts.wA2)).toEqual([CHANGED_LINK, 0, 1, CHANGED_LINK, 2, 2])
  })
})
