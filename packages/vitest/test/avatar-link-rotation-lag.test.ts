import { describe, it, expect } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/PRIM_ROTATION
// https://wiki.secondlife.com/wiki/PRIM_ROT_LOCAL
// https://wiki.secondlife.com/wiki/LlGetObjectDetails
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono. The probe avatar sat on a
// 0.5 m box with a sit target 0.6 m up, whose script set rotations on the avatar's link and read
// them back. Each line gives PRIM_ROTATION, PRIM_ROT_LOCAL and OBJECT_ROT of the avatar as Euler
// angles in tenths of a degree, as the probe printed them.

const PROBE = `
integer av;
key avk;
integer step;
integer cmd;
string F(float f) { return (string)llRound(f * 10.0); }
string D(rotation r) { vector e = llRot2Euler(r) * RAD_TO_DEG; return F(e.x) + "/" + F(e.y) + "/" + F(e.z); }
rotation Z(float d) { return llEuler2Rot(<0, 0, d * DEG_TO_RAD>); }
R(string label) {
  list p = llGetLinkPrimitiveParams(av, [PRIM_ROTATION, PRIM_ROT_LOCAL]);
  llSay(0, label + " rot=" + D(llList2Rot(p, 0)) + " loc=" + D(llList2Rot(p, 1))
    + " obj=" + D(llList2Rot(llGetObjectDetails(avk, [OBJECT_ROT]), 0)));
}
SR(float d) { llSetLinkPrimitiveParamsFast(av, [PRIM_ROTATION, Z(d)]); }
run() {
  llSleep(1.0);
  R("a0");
  SR(10); R("a1");
  SR(20); R("a2");
  llSetLinkPrimitiveParamsFast(av, [PRIM_ROT_LOCAL, Z(30)]); R("a3");
  llSetLinkPrimitiveParamsFast(av, [PRIM_ROTATION, Z(40), PRIM_ROTATION, Z(50)]); R("a4");
  SR(60); SR(70); R("a5");
  llSleep(2.0); R("a6");
  SR(80); llSleep(2.0); R("a7");
  SR(90);
  step = 0;
  llSetTimerEvent(1.0);
}
fine() {
  SR(10); llSleep(0.0); R("f0");
  SR(20); llSleep(0.01); R("f1");
  SR(30); llSleep(0.03); R("f2");
  SR(40); llSleep(0.06); R("f3");
  SR(50); llSleep(0.1); R("f4");
  SR(60); llSleep(0.25); R("f5");
  SR(70); llSleep(0.5); R("f6");
  llSleep(1.0); R("f7");
  llSetLinkPrimitiveParamsFast(av, [PRIM_ROT_LOCAL, Z(20)]);
  llSetLinkPrimitiveParamsFast(1, [PRIM_ROTATION, Z(-30)]); R("f8");
  llSleep(1.0); R("f9");
  llSetLinkPrimitiveParamsFast(1, [PRIM_ROTATION, ZERO_ROTATION]); R("f10");
}
default {
  changed(integer c) {
    if (!(c & CHANGED_LINK)) return;
    av = llGetNumberOfPrims(); avk = llGetLinkKey(av);
    if (av > 1) { R("c0"); llSleep(0.6); R("c1"); }
  }
  touch_start(integer n) {
    av = llGetNumberOfPrims(); avk = llGetLinkKey(av);
    if (cmd == 0) run(); else fine();
    ++cmd;
  }
  timer() {
    if (step == 0) { R("a8"); SR(100); R("a9"); step = 1; return; }
    llSetTimerEvent(0.0);
    R("a10");
    llSetLinkPrimitiveParamsFast(av, [PRIM_ROT_LOCAL, ZERO_ROTATION]);
  }
}
`

const z = (deg: number) => ({ x: 0, y: 0, z: Math.sin(deg * Math.PI / 360), s: Math.cos(deg * Math.PI / 360) })

async function seated(opts: { root: number, standing: number, target: number }) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const key = '00000000-0000-4000-8000-000000000620'
  const avatar = world.addAvatar({
    region: 'home', key, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 117, y: 50, z: 20 }, rotation: z(opts.standing),
  })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: key, position: { x: 118, y: 50, z: 20 },
    prims: [{ name: 'seat', scripts: [{ name: 'probe', source: { source: PROBE } }] }],
  })
  scripts.probe!.start()
  const prim = linkset.prims[0]!
  prim.params.rotation = z(opts.root)
  prim.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: z(opts.target) }
  linkset.advanceTime(100)
  expect(world.sitAvatar(avatar, prim)).toBe(true)
  linkset.advanceTime(2000)
  const said = () => scripts.probe!.chat.filter((c) => c.channel === 0).map((c) => c.text)
  const touch = () => {
    const before = said().length
    linkset.touch(1, { avatar: { key, name: 'av' } })
    linkset.advanceTime(20000)
    return said().slice(before)
  }
  return { sit: said(), touch }
}

describe("PRIM_ROTATION read on a seated avatar's link", () => {
  it('shows a rotation set on the link about 0.31 s later, under an unturned root', async () => {
    // In-world: every read in the same event as the set gave the rotation from before the event,
    // through PRIM_ROTATION and OBJECT_ROT alike, while PRIM_ROT_LOCAL gave the new value at once.
    // After a sleep of 2 s, or in the next timer event 1 s on, both gave the last set.
    const { touch } = await seated({ root: 0, standing: 0, target: 0 })
    expect(touch()).toEqual([
      'a0 rot=0/0/0 loc=0/0/0 obj=0/0/0',
      'a1 rot=0/0/0 loc=0/0/100 obj=0/0/0',
      'a2 rot=0/0/0 loc=0/0/200 obj=0/0/0',
      'a3 rot=0/0/0 loc=0/0/300 obj=0/0/0',
      'a4 rot=0/0/0 loc=0/0/500 obj=0/0/0',
      'a5 rot=0/0/0 loc=0/0/700 obj=0/0/0',
      'a6 rot=0/0/700 loc=0/0/700 obj=0/0/700',
      'a7 rot=0/0/800 loc=0/0/800 obj=0/0/800',
      'a8 rot=0/0/900 loc=0/0/900 obj=0/0/900',
      'a9 rot=0/0/900 loc=0/0/1000 obj=0/0/900',
      'a10 rot=0/0/1000 loc=0/0/1000 obj=0/0/1000',
    ])
  })

  it('takes the shown local rotation times the live root rotation, under a turned root', async () => {
    // In-world, root turned 50 degrees: through PRIM_ROTATION the link took the set rotation times
    // the root's as its local one (see the #557 tests), and the read lagged the same way.
    const { touch } = await seated({ root: 50, standing: 0, target: 0 })
    // a7 reads a half turn, whose Euler sign hangs on the last bit of the product; the grid gave
    // -180 degrees, rezless 180. Only which set the read shows is compared there.
    const halfTurn = (lines: string[]) => lines.map((l) => l.replaceAll('/-1800', '/1800'))
    expect(halfTurn(touch())).toEqual(halfTurn([
      'a0 rot=0/0/500 loc=0/0/0 obj=0/0/500',
      'a1 rot=0/0/500 loc=0/0/600 obj=0/0/500',
      'a2 rot=0/0/500 loc=0/0/700 obj=0/0/500',
      'a3 rot=0/0/500 loc=0/0/300 obj=0/0/500',
      'a4 rot=0/0/500 loc=0/0/1000 obj=0/0/500',
      'a5 rot=0/0/500 loc=0/0/1200 obj=0/0/500',
      'a6 rot=0/0/1700 loc=0/0/1200 obj=0/0/1700',
      'a7 rot=0/0/-1800 loc=0/0/1300 obj=0/0/-1800',
      'a8 rot=0/0/-1700 loc=0/0/1400 obj=0/0/-1700',
      'a9 rot=0/0/-1700 loc=0/0/1500 obj=0/0/-1700',
      'a10 rot=0/0/-1600 loc=0/0/1500 obj=0/0/-1600',
    ]))
    // In-world: a set showed after sleeps adding up to 0.35 s from it, not after 0.2 s, and each set
    // kept its own delay: after the set to 110 degrees and 0.25 s, the read showed the set before
    // it (f5). Timing reads in a loop after 40 sets, the read changed 0.289 to 0.378 s after the
    // set, 0.311 s most often (14 of the region's 1/45 s frames). Turning the root changed the read
    // at once, with the old local rotation (f8: local 120 shown, root -30, read 90). The probe
    // waited out f6 in a 0.5 s busy loop, as rezless runs a loop in no time; the sleep here stands in.
    expect(touch()).toEqual([
      'f0 rot=0/0/500 loc=0/0/600 obj=0/0/500',
      'f1 rot=0/0/500 loc=0/0/700 obj=0/0/500',
      'f2 rot=0/0/500 loc=0/0/800 obj=0/0/500',
      'f3 rot=0/0/500 loc=0/0/900 obj=0/0/500',
      'f4 rot=0/0/500 loc=0/0/1000 obj=0/0/500',
      'f5 rot=0/0/1500 loc=0/0/1100 obj=0/0/1500',
      'f6 rot=0/0/1700 loc=0/0/1200 obj=0/0/1700',
      'f7 rot=0/0/1700 loc=0/0/1200 obj=0/0/1700',
      'f8 rot=0/0/900 loc=0/0/200 obj=0/0/900',
      'f9 rot=0/0/-100 loc=0/0/200 obj=0/0/-100',
      'f10 rot=0/0/200 loc=0/0/200 obj=0/0/200',
    ])
  })

  it('shows the standing rotation as the local one until the sit rotation arrives', async () => {
    // In-world: in the changed event of the sit, the avatar standing at -7.3 degrees and sitting on an
    // unturned box with a sit target turned 45 degrees read -7.3 (-0.3 on that run); standing at
    // 58.1 degrees on a box turned 50 degrees it read 108.1. After 0.6 s both read the sit rotation.
    const plain = await seated({ root: 0, standing: -7.3, target: 45 })
    expect(plain.sit).toEqual(['c0 rot=0/0/-73 loc=0/0/450 obj=0/0/-73', 'c1 rot=0/0/450 loc=0/0/450 obj=0/0/450'])
    const turned = await seated({ root: 50, standing: 58.1, target: 0 })
    expect(turned.sit).toEqual(['c0 rot=0/0/1081 loc=0/0/0 obj=0/0/1081', 'c1 rot=0/0/500 loc=0/0/0 obj=0/0/500'])
  })
})

// In-world, second session (2026-11-24): two 0.5 m boxes A and B on unturned roots, A with its sit
// target unturned and B with its sit target turned 45 degrees, and a small box C worn on the chest.
const SEATS = `
integer av;
key avk;
integer quick;
string F(float f) { return (string)llRound(f * 10.0); }
string D(rotation r) { vector e = llRot2Euler(r) * RAD_TO_DEG; return F(e.x) + "/" + F(e.y) + "/" + F(e.z); }
rotation Z(float d) { return llEuler2Rot(<0, 0, d * DEG_TO_RAD>); }
string me() { return llGetSubString(llGetObjectName(), -1, -1); }
R(string label) {
  list p = llGetLinkPrimitiveParams(av, [PRIM_ROTATION, PRIM_ROT_LOCAL]);
  llSay(0, me() + " " + label + " n=" + (string)llGetNumberOfPrims() + " rot=" + D(llList2Rot(p, 0)) + " loc=" + D(llList2Rot(p, 1))
    + " obj=" + D(llList2Rot(llGetObjectDetails(llGetOwner(), [OBJECT_ROT]), 0)));
}
W(string label) {
  llSay(0, me() + " " + label + " n=" + (string)llGetNumberOfPrims() + " obj=" + D(llList2Rot(llGetObjectDetails(llGetOwner(), [OBJECT_ROT]), 0)));
}
SR(float d) { llSetLinkPrimitiveParamsFast(av, [PRIM_ROTATION, Z(d)]); }
find() { av = llGetNumberOfPrims(); avk = llGetLinkKey(av); }
default {
  state_entry() { llListen(6200, "", NULL_KEY, ""); }
  changed(integer c) {
    if (!(c & CHANGED_LINK)) return;
    find();
    if (llGetAgentSize(avk) == ZERO_VECTOR) return;
    R("c0");
    if (quick) { quick = 0; llUnSit(avk); W("q1"); return; }
    llSleep(0.6); R("c1");
  }
  listen(integer ch, string n, key id, string m) {
    if (llGetSubString(m, 0, 1) != me() + ":") return;
    m = llDeleteSubString(m, 0, 1);
    find();
    if (m == "quick") { quick = 1; return; }
    if (m == "uns") { R("u0"); llUnSit(avk); W("u1"); return; }
    if (llGetSubString(m, 0, 5) == "linkf ") {
      SR(0); llSleep(1.0); R("f0");
      SR(70); llCreateLink((key)llGetSubString(m, 6, -1), FALSE); find(); R("f1");
      llSleep(1.0); R("f2");
      return;
    }
    if (llGetSubString(m, 0, 5) == "linkg ") {
      llSetLinkPrimitiveParamsFast(av, [PRIM_ROT_LOCAL, Z(50)]); llSleep(1.0); R("g0");
      llCreateLink((key)llGetSubString(m, 6, -1), FALSE); find(); R("g1");
      llSleep(1.0); R("g2");
      return;
    }
    if (m == "perm") { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); return; }
    if (m == "standctl") { SR(100); llSleep(1.0); R("k0"); llUnSit(avk); W("k1"); return; }
    if (m == "stand") { SR(0); llSleep(1.0); R("s0"); SR(100); R("s1"); llUnSit(avk); W("s2"); return; }
    if (m == "att") { SR(0); llSleep(1.0); SR(130); llRegionSay(6201, "now"); R("t0"); llSleep(1.0); R("t1"); return; }
    if (llGetSubString(m, 0, 4) == "link ") {
      SR(0); llSleep(1.0); R("l0");
      SR(70); llCreateLink((key)llGetSubString(m, 5, -1), TRUE); find(); R("l1");
      llSleep(1.0); R("l2");
    }
  }
}
`
const WORN = `
string F(float f) { return (string)llRound(f * 10.0); }
string D(rotation r) { vector e = llRot2Euler(r) * RAD_TO_DEG; return F(e.x) + "/" + F(e.y) + "/" + F(e.z); }
default {
  state_entry() { llListen(6201, "", NULL_KEY, ""); }
  listen(integer ch, string n, key id, string m) {
    llSay(0, "C a0 rot=" + D(llGetRot()));
    llSleep(1.0);
    llSay(0, "C a1 rot=" + D(llGetRot()));
  }
}
`

async function seats() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const key = '00000000-0000-4000-8000-000000000620'
  const avatar = world.addAvatar({
    region: 'home', key, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 117, y: 50, z: 20 }, rotation: z(5.8),
  })
  const load = (name: string, x: number, source: string) => loadLinkset({
    world, region: 'home', owner: key, position: { x, y: 50, z: 20 },
    prims: [{ name, scripts: [{ name: 'probe', source: { source } }] }],
  })
  const a = await load('probe A', 118, SEATS)
  const b = await load('probe B', 119.5, SEATS)
  const c = await load('probe C', 118, WORN)
  for (const l of [a, b, c]) l.scripts.probe!.start()
  a.linkset.prims[0]!.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: z(0) }
  b.linkset.prims[0]!.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: z(45) }
  c.linkset.attachToAvatar(key, 1)
  const lines: string[] = []
  const heard = () => {
    lines.length = 0
    for (const l of [a, b, c]) lines.push(...l.scripts.probe!.chat.filter((m) => m.channel === 0).map((m) => m.text))
    return lines
  }
  const wait = (ms: number) => a.linkset.advanceTime(ms)
  const command = (text: string) => {
    a.scripts.probe!.fire('listen', { channel: 6200, name: 'av', id: key, msg: text })
    wait(5000)
  }
  return { world, avatar, a, b, heard, wait, command }
}

describe("a seated avatar's rotation around a set", () => {
  it('shows the delayed rotation to an attachment too', async () => {
    // In-world: C heard A's region say 0.111 s after the set to 130 degrees and read llGetRot
    // 0 degrees; a second later it read 130.
    const f = await seats()
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    f.command('A:att')
    expect(f.heard().filter((l) => !l.includes(' c'))).toEqual([
      'A t0 n=2 rot=0/0/0 loc=0/0/1300 obj=0/0/0',
      'A t1 n=2 rot=0/0/1300 loc=0/0/1300 obj=0/0/1300',
      'C a0 rot=0/0/0',
      'C a1 rot=0/0/1300',
    ])
  })

  it('stands the avatar at the rotation the region shows', async () => {
    // In-world: llUnSit right after a set to 100 degrees left the standing avatar at the 0 degrees
    // the region still showed; after a settled set it stood at 100. (A second later the standing
    // avatar had turned to about 6 degrees, which the viewer chose.)
    const f = await seats()
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    f.command('A:standctl')
    expect(f.heard().filter((l) => l.startsWith('A k'))).toEqual(['A k0 n=2 rot=0/0/1000 loc=0/0/1000 obj=0/0/1000', 'A k1 n=1 obj=0/0/1000'])
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    f.command('A:stand')
    expect(f.heard().filter((l) => l.startsWith('A s'))).toEqual([
      'A s0 n=2 rot=0/0/0 loc=0/0/0 obj=0/0/0', 'A s1 n=2 rot=0/0/0 loc=0/0/1000 obj=0/0/0', 'A s2 n=1 obj=0/0/0',
    ])
  })

  it('shows the last seat\'s rotation on a new seat until the new one arrives', async () => {
    // In-world: seated on A at 0 degrees, the avatar sat on B; B's changed event read 0, and 0.6 s
    // later the 45 degrees of B's sit target.
    const f = await seats()
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    const before = f.heard().length
    f.world.sitAvatar(f.avatar, f.b.linkset.prims[0]!)
    f.wait(2000)
    expect(f.heard().slice(before).filter((l) => l.startsWith('B'))).toEqual([
      'B c0 n=2 rot=0/0/0 loc=0/0/450 obj=0/0/0', 'B c1 n=2 rot=0/0/450 loc=0/0/450 obj=0/0/450',
    ])
  })

  it('keeps a rotation on its way through a relink', async () => {
    // In-world: a set to 70 degrees and llCreateLink(B, TRUE) in the same event, which returned
    // 0.111 s later: the read after the link still gave 0, and the new rotation showed 0.333 s after
    // the set, as without the link.
    const f = await seats()
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    f.command('A:perm')
    f.a.scripts.probe!.grantPermissions()
    f.command(`A:link ${f.b.linkset.prims[0]!.key}`)
    expect(f.heard().filter((l) => l.startsWith('A l'))).toEqual([
      'A l0 n=2 rot=0/0/0 loc=0/0/0 obj=0/0/0', 'A l1 n=3 rot=0/0/0 loc=0/0/700 obj=0/0/0', 'A l2 n=3 rot=0/0/700 loc=0/0/700 obj=0/0/700',
    ])
  })
})

// In-world, third session (2026-11-24): the same boxes with A's root turned 50 degrees and B's
// turned 30, each set with llSetRot.
async function turnedSeats() {
  const f = await seats()
  f.a.linkset.prims[0]!.params.rotation = z(50)
  f.b.linkset.prims[0]!.params.rotation = z(30)
  return f
}

describe("a seated avatar's rotation under turned roots", () => {
  it('stands the avatar at the local rotation shown, not turned by the root', async () => {
    // In-world: seated on A with its local rotation 0, PRIM_ROTATION read 50; llUnSit left the
    // standing avatar at 0. Standing up inside the sit's changed event, before the seat's rotation
    // arrived, left it at the -7.2 degrees it stood at before sitting (the read there was 42.8).
    // Over the next second the viewer turned the standing avatar on its own.
    const f = await turnedSeats()
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    f.command('A:uns')
    expect(f.heard().filter((l) => l.startsWith('A u'))).toEqual(['A u0 n=2 rot=0/0/500 loc=0/0/0 obj=0/0/500', 'A u1 n=1 obj=0/0/0'])
    f.avatar.rotation = z(-7.2)
    f.command('A:quick')
    const before = f.heard().length
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    expect(f.heard().slice(before)).toEqual(['A c0 n=2 rot=0/0/428 loc=0/0/0 obj=0/0/428', 'A q1 n=1 obj=0/0/-72'])
  })

  it('carries the local rotation shown over to a new seat under another root', async () => {
    // In-world: from A, where the local rotation 0 read 50, the avatar sat on B: B's changed event
    // read 30, that same 0 times B's root, and 0.6 s later 75, B's sit target times its root.
    const f = await turnedSeats()
    f.world.sitAvatar(f.avatar, f.a.linkset.prims[0]!)
    f.wait(2000)
    const before = f.heard().length
    f.world.sitAvatar(f.avatar, f.b.linkset.prims[0]!)
    f.wait(2000)
    expect(f.heard().slice(before).filter((l) => l.startsWith('B'))).toEqual([
      'B c0 n=2 rot=0/0/300 loc=0/0/450 obj=0/0/300', 'B c1 n=2 rot=0/0/750 loc=0/0/450 obj=0/0/750',
    ])
  })

  it('shows the local rotation a new root gives after the same delay', async () => {
    // In-world: llCreateLink(B, FALSE) made B the root. The sitter kept its region rotation in
    // PRIM_ROT_LOCAL at once, but PRIM_ROTATION read the old local rotation times B's root until
    // the new one arrived; a set on its way when the link came arrived the same way. Before the
    // settled link the probe set PRIM_ROTATION 0 and got a local rotation of 50, so the local
    // rotation before it can't have been 0: over 0 it changed nothing in 17 later tries (see
    // attachment-root-rotation.test.ts). The test sets the local rotation of 50 directly.
    const settled = await turnedSeats()
    settled.world.sitAvatar(settled.avatar, settled.a.linkset.prims[0]!)
    settled.wait(2000)
    settled.command('A:perm')
    settled.a.scripts.probe!.grantPermissions()
    settled.command(`A:linkg ${settled.b.linkset.prims[0]!.key}`)
    expect(settled.heard().filter((l) => l.startsWith('A g'))).toEqual([
      'A g0 n=2 rot=0/0/1000 loc=0/0/500 obj=0/0/1000', 'A g1 n=3 rot=0/0/800 loc=0/0/700 obj=0/0/800',
      'A g2 n=3 rot=0/0/1000 loc=0/0/700 obj=0/0/1000',
    ])
    const pending = await turnedSeats()
    pending.world.sitAvatar(pending.avatar, pending.a.linkset.prims[0]!)
    pending.wait(2000)
    pending.command('A:perm')
    pending.a.scripts.probe!.grantPermissions()
    pending.command(`A:linkf ${pending.b.linkset.prims[0]!.key}`)
    expect(pending.heard().filter((l) => l.startsWith('A f'))).toEqual([
      'A f0 n=2 rot=0/0/500 loc=0/0/0 obj=0/0/500', 'A f1 n=3 rot=0/0/300 loc=0/0/1400 obj=0/0/300',
      'A f2 n=3 rot=0/0/1700 loc=0/0/1400 obj=0/0/1700',
    ])
  })
})
