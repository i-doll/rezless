import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/PRIM_POSITION
// https://wiki.secondlife.com/wiki/LlSetPos
// https://wiki.secondlife.com/wiki/LlSetPrimitiveParams
// https://wiki.secondlife.com/wiki/LlSetLinkPrimitiveParamsFast
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono and SLua. A two-prim linkset of
// 0.5 m boxes, the root at <120, 52, 1998> and the child 1 m along the root's x axis, rezzed and then
// worn on the chest and on HUD center. The script in the root moved a prim to its PRIM_POS_LOCAL
// plus an offset with each setter, read PRIM_POS_LOCAL back, and put the prim back where it was.

const OWNER = '00000000-0000-4000-8000-000000000687'

const HELPERS = `
vector loc(integer L) { return llList2Vector(llGetLinkPrimitiveParams(L, [PRIM_POS_LOCAL]), 0); }
`

type V3 = { x: number; y: number; z: number }

async function object(root: string, opts: { point?: number; child?: string; language?: 'lsl' | 'slua' } = {}) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, name: 'probe', username: 'probe', position: { x: 118, y: 48, z: 1997.5 } })
  const slua = opts.language === 'slua'
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: OWNER, position: { x: 120, y: 52, z: 1998 },
    prims: [
      { scripts: [{ name: 'root', ...(slua ? { language: 'slua' as const } : {}), source: { source: slua ? root : HELPERS + root, filename: slua ? 'root.luau' : 'root.lsl' } }] },
      { scripts: opts.child ? [{ name: 'child', source: { source: HELPERS + opts.child } }] : [] },
    ],
  })
  linkset.prims[1]!.params.position = { x: 1, y: 0, z: 0 }
  if (opts.point) {
    linkset.attachToAvatar(OWNER, opts.point)
    linkset.prims[0]!.params.position = { x: 0, y: 0, z: 0 }
  }
  for (const s of Object.values(scripts)) s!.start()
  return { linkset, scripts }
}

/** Runs `cases` (each `<setter call>` moving link L from s to s + off) and returns how far link L moved. */
const sweep = (L: number, calls: string[], offsets: string[]) => `
list out;
default { state_entry() {
  integer c; integer o;
  for (c = 0; c < ${calls.length}; ++c) for (o = 0; o < ${offsets.length}; ++o) {
    vector off = llList2Vector([${offsets.join(', ')}], o);
    vector s = loc(${L});
    vector t = s + off;
    ${calls.map((call, i) => `if (c == ${i}) ${call};`).join('\n    ')}
    out += loc(${L}) - s;
    llSetLinkPrimitiveParamsFast(${L}, [PRIM_POS_LOCAL, s]);
  }
} }
`

/** The several-rule calls of the probe, aimed at link L, each from where L started. */
const multi = (L: number) => `
list out;
vector s;
next() { out += loc(${L}) - s; llSetLinkPrimitiveParamsFast(${L}, [PRIM_POS_LOCAL, s]); if (${L} == 1) llSetRegionPos(s); }
default { state_entry() {
  s = loc(${L});
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_POSITION, s + <8,0,0>, PRIM_POSITION, s + <16,0,0>]); next();
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_POSITION, s + <50,0,0>, PRIM_POSITION, s + <50,0,0>]); next();
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_POSITION, s + <50,0,0>, PRIM_POSITION, s + <50,0,0>, PRIM_POSITION, s + <50,0,0>, PRIM_POSITION, s + <50,0,0>]); next();
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_POS_LOCAL, s + <50,0,0>, PRIM_POSITION, s + <50,0,0>]); next();
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_LINK_TARGET, ${L}, PRIM_POSITION, s + <50,0,0>, PRIM_LINK_TARGET, ${L}, PRIM_POSITION, s + <50,0,0>]); next();
  llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_LINK_TARGET, ${L}, PRIM_POSITION, s + <50,0,0>]); next();
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_POSITION, s + <50,0,0>]);
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_POSITION, s + <50,0,0>]); next();
  llSetLinkPrimitiveParamsFast(${L}, [PRIM_POSITION, s + <50,0,0>, PRIM_SIZE, <0.5,0.5,0.5>]); next();
} }
`

const OFFSETS = ['<9,0,0>', '<10,0,0>', '<11,0,0>', '<50,0,0>', '<8,8,0>', '<0,0,11>', '<-30,40,0>']

const SETTERS = (L: number) => [
  `llSetLinkPrimitiveParams(${L}, [PRIM_POSITION, t])`,
  `llSetLinkPrimitiveParams(${L}, [PRIM_POS_LOCAL, t])`,
  `llSetLinkPrimitiveParamsFast(${L}, [PRIM_POSITION, t])`,
  `llSetLinkPrimitiveParamsFast(${L}, [PRIM_POS_LOCAL, t])`,
]
const SELF_SETTERS = ['llSetPrimitiveParams([PRIM_POSITION, t])', 'llSetPrimitiveParams([PRIM_POS_LOCAL, t])', 'llSetPos(t)']

function expectMoves(actual: unknown, expected: V3[]) {
  const got = actual as V3[]
  expect(got).toHaveLength(expected.length)
  got.forEach((v, i) => {
    expect(v.x, `#${i} x`).toBeCloseTo(expected[i]!.x, 4)
    expect(v.y, `#${i} y`).toBeCloseTo(expected[i]!.y, 4)
    expect(v.z, `#${i} z`).toBeCloseTo(expected[i]!.z, 4)
  })
}

const v = (x: number, y: number, z: number): V3 => ({ x, y, z })
const r = Math.SQRT1_2
const full = [v(9, 0, 0), v(10, 0, 0), v(11, 0, 0), v(50, 0, 0), v(8, 8, 0), v(0, 0, 11), v(-30, 40, 0)]
const times = <T>(n: number, xs: T[]) => Array.from({ length: n }, () => xs).flat()

describe('PRIM_POSITION on a rezzed root', () => {
  // In-world: on the rezzed root, every setter with PRIM_POSITION or PRIM_POS_LOCAL, and llSetPos,
  // moved 9 -> 9, 10 -> 10, 11 -> 10, 50 -> 10, <8,8,0> -> <7.07107,7.07107,0>, <0,0,11> -> <0,0,10>,
  // <-30,40,0> -> <-6,8,0>: at most 10 m, toward the target.
  const capped = [v(9, 0, 0), v(10, 0, 0), v(10, 0, 0), v(10, 0, 0), v(10 * r, 10 * r, 0), v(0, 0, 10), v(-6, 8, 0)]

  it('moves at most 10 m toward the target, for every setter', async () => {
    const { scripts } = await object(sweep(1, [...SETTERS(1), ...SELF_SETTERS], OFFSETS))
    expectMoves(scripts.root!.global('out'), times(7, capped))
  })

  // In-world: [PRIM_POSITION, s+<8,0,0>, PRIM_POSITION, s+<16,0,0>] -> 16; two entries of s+<50,0,0>
  // -> 20; four -> 40; PRIM_POS_LOCAL then PRIM_POSITION -> 20; two PRIM_LINK_TARGET LINK_ROOT
  // blocks -> 20; one PRIM_LINK_TARGET from LINK_SET -> 10; two calls in one event -> 20;
  // PRIM_POSITION then PRIM_SIZE -> 10.
  it('takes each position rule from where the root is by then, so rules add up', async () => {
    const { scripts } = await object(multi(1))
    expectMoves(scripts.root!.global('out'), [16, 20, 40, 20, 20, 10, 20, 10].map((x) => v(x, 0, 0)))
  })

  // In-world, SLua: PRIM_POSITION and PRIM_POS_LOCAL with ll.SetPrimitiveParams and
  // ll.SetLinkPrimitiveParamsFast, and ll.SetPos, moved 9 -> 9, 11 -> 10, 50 -> 10; two
  // PRIM_POSITION entries of s+<50,0,0> -> 20, also as two PRIM_LINK_TARGET blocks.
  it('caps SLua moves the same way', async () => {
    const { scripts } = await object(`
      out = {}
      local function loc() return ll.GetLinkPrimitiveParams(1, {PRIM_POS_LOCAL})[1] end
      local s = loc()
      local function step(f) f(); table.insert(out, loc() - s); ll.SetRegionPos(s) end
      for _, off in {vector(9,0,0), vector(11,0,0), vector(50,0,0)} do
        step(function() ll.SetPrimitiveParams({PRIM_POSITION, s + off}) end)
        step(function() ll.SetLinkPrimitiveParamsFast(1, {PRIM_POS_LOCAL, s + off}) end)
        step(function() ll.SetPos(s + off) end)
      end
      step(function() ll.SetLinkPrimitiveParamsFast(1, {PRIM_POSITION, s + vector(50,0,0), PRIM_POSITION, s + vector(50,0,0)}) end)
      step(function() ll.SetLinkPrimitiveParamsFast(1, {PRIM_LINK_TARGET, 1, PRIM_POSITION, s + vector(50,0,0), PRIM_LINK_TARGET, 1, PRIM_POSITION, s + vector(50,0,0)}) end)
    `, { language: 'slua' })
    expectMoves(scripts.root!.global('out'), [9, 9, 9, 10, 10, 10, 10, 10, 10, 20, 20].map((x) => v(x, 0, 0)))
  })
})

describe('PRIM_POSITION on the root from a child script', () => {
  // In-world: a script in the child moved the root with llSetLinkPrimitiveParamsFast(LINK_ROOT,
  // [PRIM_POSITION, t]) and llSetLinkPrimitiveParams(LINK_ROOT, [PRIM_POS_LOCAL, t]). Rezzed, from
  // s to s + <11,0,0> and s + <50,0,0> -> 10 m, s + <1,10,0> -> <0.99504,9.95037,0>, two entries of
  // s + <50,0,0> -> 20. Worn on the chest, to <11,0,0> and <50,0,0> -> <3.5,0,0>, <1,10,0> ->
  // <0.34826,3.48263,0>, two entries of <50,0,0> -> <3.5,0,0>.
  const CHILD = (worn: boolean) => `
list out;
vector root() { return llList2Vector(llGetLinkPrimitiveParams(LINK_ROOT, [PRIM_POS_LOCAL]), 0); }
back(vector s) { llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_POS_LOCAL, s]); if (!${worn ? 'TRUE' : 'FALSE'}) llSetRegionPos(s); }
default { state_entry() {
  vector s = root();
  list offs = [<11,0,0>, <50,0,0>, <1,10,0>];
  integer i;
  for (i = 0; i < 3; ++i) {
    vector t = llList2Vector(offs, i);
    if (!${worn ? 'TRUE' : 'FALSE'}) t += s;
    llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_POSITION, t]); out += root() - s; back(s);
    llSetLinkPrimitiveParams(LINK_ROOT, [PRIM_POS_LOCAL, t]); out += root() - s; back(s);
  }
  llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_POSITION, s + <50,0,0>, PRIM_POSITION, s + <50,0,0>]); out += root() - s;
} }
`

  it('caps the rezzed root as the root\'s own script does', async () => {
    const { scripts } = await object('default { state_entry() { } }', { child: CHILD(false) })
    const diagonal = v(10 / Math.sqrt(101), 100 / Math.sqrt(101), 0)
    expectMoves(scripts.child!.global('out'), [v(10, 0, 0), v(10, 0, 0), v(10, 0, 0), v(10, 0, 0), diagonal, diagonal, v(20, 0, 0)])
  })

  it('keeps the worn root within 3.5 m of its point', async () => {
    const { scripts } = await object('default { state_entry() { } }', { point: 1, child: CHILD(true) })
    const far = v(0.34826, 3.48263, 0)
    expectMoves(scripts.child!.global('out'), [v(3.5, 0, 0), v(3.5, 0, 0), v(3.5, 0, 0), v(3.5, 0, 0), far, far, v(3.5, 0, 0)])
  })
})

describe('PRIM_POSITION on a child prim', () => {
  // In-world: moving the child from the root with llSetLinkPrimitiveParams(Fast), PRIM_POSITION or
  // PRIM_POS_LOCAL, and from the child's own script with llSetPrimitiveParams and llSetPos, moved it
  // the whole offset every time, rezzed and worn alike, up to the 50 m and <-30,40,0> tried.
  it.each([['rezzed', 0], ['worn on the chest', 1], ['worn on HUD center', 35]])('moves it the whole way, %s', async (_, point) => {
    const { scripts } = await object(sweep(2, SETTERS(2), OFFSETS), { point, child: sweep(2, SELF_SETTERS, OFFSETS) })
    expectMoves(scripts.root!.global('out'), times(4, full))
    expectMoves(scripts.child!.global('out'), times(3, full))
  })

  // In-world: the same several-rule calls as on the rezzed root, aimed at the child, moved it
  // 16, 50, 50, 50, 50, 50, 50, 50, rezzed, on the chest and on HUD center.
  it.each([['rezzed', 0], ['worn on the chest', 1], ['worn on HUD center', 35]])('does not let several position rules add up, %s', async (_, point) => {
    const { scripts } = await object(multi(2), { point })
    expectMoves(scripts.root!.global('out'), [16, 50, 50, 50, 50, 50, 50, 50].map((x) => v(x, 0, 0)))
  })
})

describe('PRIM_POSITION on a worn root', () => {
  // In-world, worn on the chest and on HUD center from offset ZERO_VECTOR: every setter, and llSetPos,
  // moved 9, 10, 11 and 50 -> <3.5,0,0>, <8,8,0> -> <2.47487,2.47487,0>, <0,0,11> -> <0,0,3.5>,
  // <-30,40,0> -> <-2.1,2.8,0>.
  const clamped = [v(3.5, 0, 0), v(3.5, 0, 0), v(3.5, 0, 0), v(3.5, 0, 0), v(3.5 * r, 3.5 * r, 0), v(0, 0, 3.5), v(-2.1, 2.8, 0)]

  it.each([['the chest', 1], ['HUD center', 35]])('keeps it within 3.5 m of %s', async (_, point) => {
    const { scripts } = await object(sweep(1, [...SETTERS(1), ...SELF_SETTERS], OFFSETS), { point })
    expectMoves(scripts.root!.global('out'), times(7, clamped))
  })

  // In-world, chest and HUD alike, setting PRIM_POS_LOCAL in turn: <1,0,0> -> <1,0,0>; <1,10,0> ->
  // <0.34826,3.48263,0>; <3,3,0> -> <2.47487,2.47487,0>; <0,0,-5> -> <0,0,-3.5>; <0,3.5,0> ->
  // <0,3.5,0>; <0,3.6,0> -> <0,3.5,0>; <2,2,2> -> <2,2,2>. From <1,0,0>, llSetPos(<1,10,0>) and
  // [PRIM_POSITION, <1,0,0>, PRIM_POSITION, <1,10,0>] -> <0.34826,3.48263,0>: the offset is cut to
  // 3.5 m from the attachment point, not the move.
  it('scales the offset to 3.5 m from the attachment point, wherever it moves from', async () => {
    const { scripts } = await object(`
      list out;
      set(vector p) { llSetLinkPrimitiveParamsFast(1, [PRIM_POS_LOCAL, p]); out += loc(1); }
      default { state_entry() {
        set(<1,0,0>); set(<1,10,0>); set(<1,0,0>); set(<3,3,0>); set(<0,0,-5>);
        set(<0,3.5,0>); set(<0,3.6,0>); set(<2,2,2>); set(<1,0,0>);
        llSetPos(<1,10,0>); out += loc(1);
        set(<1,0,0>);
        llSetLinkPrimitiveParamsFast(1, [PRIM_POSITION, <1,0,0>, PRIM_POSITION, <1,10,0>]); out += loc(1);
      } }
    `, { point: 1 })
    const far = v(0.34826, 3.48263, 0)
    expectMoves(scripts.root!.global('out'), [
      v(1, 0, 0), far, v(1, 0, 0), v(3.5 * r, 3.5 * r, 0), v(0, 0, -3.5),
      v(0, 3.5, 0), v(0, 3.5, 0), v(2, 2, 2), v(1, 0, 0), far, v(1, 0, 0), far,
    ])
  })

  // In-world, SLua on the chest: ll.SetPrimitiveParams, ll.SetLinkPrimitiveParamsFast and ll.SetPos
  // to 9, 11 and 50 m all moved it to <3.5,0,0>.
  it('keeps an SLua move within 3.5 m too', async () => {
    const { scripts } = await object(`
      out = {}
      ll.SetPrimitiveParams({PRIM_POSITION, vector(9,0,0)}); table.insert(out, ll.GetLocalPos())
      ll.SetLinkPrimitiveParamsFast(1, {PRIM_POS_LOCAL, vector(50,0,0)}); table.insert(out, ll.GetLocalPos())
      ll.SetPos(vector(11, 0, 0)); table.insert(out, ll.GetLocalPos())
    `, { point: 1, language: 'slua' })
    expectMoves(scripts.root!.global('out'), [v(3.5, 0, 0), v(3.5, 0, 0), v(3.5, 0, 0)])
  })
})
