import { describe, it, expect } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetRootRotation
// https://wiki.secondlife.com/wiki/LlGetRot
// https://wiki.secondlife.com/wiki/PRIM_ROTATION
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono. The probe avatar wore a 0.2 m
// box C on the chest, turned 30 degrees on its attachment point, and sat on a 0.5 m box A with a
// sit target 0.6 m up and unturned. Rotations are Euler angles in tenths of a degree.

const SEAT = `
integer av;
string F(float f) { return (string)llRound(f * 10.0); }
string D(rotation r) { vector e = llRot2Euler(r) * RAD_TO_DEG; return F(e.x) + "/" + F(e.y) + "/" + F(e.z); }
rotation Z(float d) { return llEuler2Rot(<0, 0, d * DEG_TO_RAD>); }
R(string label) {
  list p = llGetLinkPrimitiveParams(av, [PRIM_ROTATION, PRIM_ROT_LOCAL]);
  llSay(0, "A " + label + " rot=" + D(llList2Rot(p, 0)) + " loc=" + D(llList2Rot(p, 1)));
}
SR(float d) { llSetLinkPrimitiveParamsFast(av, [PRIM_ROTATION, Z(d)]); }
SL(float d) { llSetLinkPrimitiveParamsFast(av, [PRIM_ROT_LOCAL, Z(d)]); }
default {
  listen(integer ch, string n, key id, string m) {
    av = llGetNumberOfPrims();
    list a = llParseString2List(m, [" "], []);
    string c = llList2String(a, 0);
    float d = llList2Float(a, 1);
    integer i;
    if (c == "root") { llSetRot(Z(d)); return; }
    if (c == "loc") { SL(d); llSleep(1.0); R("l"); return; }
    if (c == "pr") { R("p0"); SR(d); R("p1"); llSleep(1.0); R("p2"); return; }
    if (c == "seq") {
      for (i = 0; i < 6; ++i) { SL(0); llSleep(1.0); R("s" + (string)i + "a"); SR(0); R("s" + (string)i + "b"); llSleep(1.0); R("s" + (string)i + "c"); }
      return;
    }
    if (c == "seqf") {
      for (i = 0; i < 4; ++i) { SL(20); llSleep(1.0); SL(0); SR(0); R("f" + (string)i + "a"); llSleep(1.0); R("f" + (string)i + "b"); }
      return;
    }
    if (c == "twice") { SL(0); llSleep(1.0); SR(0); llSleep(1.0); R("w0"); SR(0); llSleep(1.0); R("w1"); return; }
    if (c == "att") { SL(d); llRegionSay(6371, "go"); R("t0"); llSleep(1.0); R("t1"); }
  }
}
`

const WORN = `
string F(float f) { return (string)llRound(f * 10.0); }
string D(rotation r) { vector e = llRot2Euler(r) * RAD_TO_DEG; return F(e.x) + "/" + F(e.y) + "/" + F(e.z); }
S(string l) { llSay(0, "C " + l + " rot=" + D(llGetRot()) + " root=" + D(llGetRootRotation()) + " loc=" + D(llGetLocalRot())); }
default {
  state_entry() { llListen(6371, "", "", ""); }
  listen(integer ch, string n, key id, string m) {
    if (m == "rd") { S("rd"); return; }
    S("g0");
    llSleep(1.0);
    S("g1");
  }
}
`

const z = (deg: number) => ({ x: 0, y: 0, z: Math.sin(deg * Math.PI / 360), s: Math.cos(deg * Math.PI / 360) })

async function fixture(point = 1) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const key = '00000000-0000-4000-8000-000000000637'
  const avatar = world.addAvatar({
    region: 'home', key, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 116, y: 48, z: 20 }, rotation: z(90),
  })
  const load = (name: string, x: number, source: string) => loadLinkset({
    world, region: 'home', owner: key, position: { x, y: 46.5, z: 20 },
    prims: [{ name, scripts: [{ name: 'probe', source: { source } }] }],
  })
  const a = await load('probe A', 117, SEAT)
  const c = await load('probe C', 115, WORN)
  for (const l of [a, c]) l.scripts.probe!.start()
  a.linkset.prims[0]!.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: z(0) }
  c.linkset.attachToAvatar(key, point)
  c.linkset.prims[0]!.params.rotation = z(30)
  const seen = [0, 0]
  // A's new lines, then C's.
  const heard = () => [a, c].flatMap((l, i) => {
    const said = l.scripts.probe!.chat.filter((m) => m.channel === 0).map((m) => m.text)
    const fresh = said.slice(seen[i])
    seen[i] = said.length
    return fresh
  })
  const wait = (ms: number) => a.linkset.advanceTime(ms)
  const command = (text: string, ms = 5000) => {
    a.scripts.probe!.fire('listen', { channel: 6370, name: 'av', id: key, msg: text })
    wait(ms)
    return heard()
  }
  const read = () => {
    c.scripts.probe!.fire('listen', { channel: 6371, name: 'av', id: key, msg: 'rd' })
    wait(100)
    return heard()
  }
  const sit = () => {
    expect(world.sitAvatar(avatar, a.linkset.prims[0]!)).toBe(true)
    wait(2000)
  }
  return { world, avatar, a, read, command, sit, wait }
}

describe('llGetRootRotation in an attachment', () => {
  it("gives the standing wearer's rotation, as llGetRot does, whatever the attachment's own turn", async () => {
    // In-world: C, turned 30 degrees on the chest, read llGetRot and llGetRootRotation 15.3 degrees
    // with the avatar facing 15.3 degrees; before the turn, at local 0, it read 90 and 154.4 with the
    // avatar facing that way. OBJECT_ROT of the avatar read the same each time.
    const f = await fixture()
    expect(f.read()).toEqual(['C rd rot=0/0/900 root=0/0/900 loc=0/0/300'])
    f.avatar.rotation = z(15.3)
    expect(f.read()).toEqual(['C rd rot=0/0/153 root=0/0/153 loc=0/0/300'])
  })

  it("gives the wearer's rotation in a HUD too", async () => {
    // In-world: a 0.1 m box worn on HUD center (point 35) and turned 30 degrees on it read
    // llGetRot, llGetRootRotation and PRIM_ROTATION 90 with the avatar facing 90 degrees, and 165.5
    // after the avatar turned to 165.5.
    const f = await fixture(35)
    expect(f.read()).toEqual(['C rd rot=0/0/900 root=0/0/900 loc=0/0/300'])
    f.avatar.rotation = z(165.5)
    expect(f.read()).toEqual(['C rd rot=0/0/1655 root=0/0/1655 loc=0/0/300'])
  })

  it("follows a seated wearer's rotation after the same delay as llGetRot", async () => {
    // In-world: seated on A with its root unturned, A set PRIM_ROT_LOCAL 130 and said so on a region
    // channel. C read 0 for both at once, and both changed in the same loop pass 0.244 s after C
    // heard A, to 130. With A's root turned 50 degrees and PRIM_ROT_LOCAL 30, C read 50 at once and
    // 80 later, both changing 0.267 s after C heard A.
    const f = await fixture()
    f.sit()
    expect(f.read()).toEqual(['C rd rot=0/0/0 root=0/0/0 loc=0/0/300'])
    expect(f.command('att 130')).toEqual([
      'A t0 rot=0/0/0 loc=0/0/1300',
      'A t1 rot=0/0/1300 loc=0/0/1300',
      'C g0 rot=0/0/0 root=0/0/0 loc=0/0/300',
      'C g1 rot=0/0/1300 root=0/0/1300 loc=0/0/300',
    ])
    f.command('loc 0')
    f.command('root 50')
    expect(f.read()).toEqual(['C rd rot=0/0/500 root=0/0/500 loc=0/0/300'])
    expect(f.command('att 30')).toEqual([
      'A t0 rot=0/0/500 loc=0/0/300',
      'A t1 rot=0/0/800 loc=0/0/300',
      'C g0 rot=0/0/500 root=0/0/500 loc=0/0/300',
      'C g1 rot=0/0/800 root=0/0/800 loc=0/0/300',
    ])
  })
})

describe('PRIM_ROTATION 0 on a seated avatar over a local rotation of 0 under a turned root', () => {
  // In-world, A's root turned 50 degrees: PRIM_ROTATION 0 left the local rotation at 0 in all 17
  // tries: after PRIM_ROT_LOCAL 0 (once, then six times in a loop), in the same event as
  // PRIM_ROT_LOCAL 0 from a local rotation of 20, before the 0 showed (four times), twice in a row, straight
  // after three fresh sits, and after the root was turned while the avatar sat. From a local
  // rotation of 20 it gave 50, the set rotation times the root's. A single run under #620 that gave
  // 50 must have started from another local rotation.
  it('changes nothing, however often it is repeated', async () => {
    const f = await (async () => {
      const g = await fixture()
      g.command('root 50')
      g.sit()
      return g
    })()
    expect(f.command('pr 0')).toEqual(['A p0 rot=0/0/500 loc=0/0/0', 'A p1 rot=0/0/500 loc=0/0/0', 'A p2 rot=0/0/500 loc=0/0/0'])
    const seq = f.command('seq', 15000)
    expect(seq).toHaveLength(18)
    expect(seq.every((l) => l.endsWith(' rot=0/0/500 loc=0/0/0'))).toBe(true)
    // The read in the same event shows the earlier 20 times the root, until the 0 arrives.
    const fast = f.command('seqf', 10000)
    expect(fast).toEqual([0, 1, 2, 3].flatMap((i) => [`A f${i}a rot=0/0/700 loc=0/0/0`, `A f${i}b rot=0/0/500 loc=0/0/0`]))
    expect(f.command('twice')).toEqual(['A w0 rot=0/0/500 loc=0/0/0', 'A w1 rot=0/0/500 loc=0/0/0'])
  })

  it('changes nothing after the root turns under the seated avatar', async () => {
    const f = await fixture()
    f.sit()
    f.command('root 50')
    expect(f.command('pr 0')).toEqual(['A p0 rot=0/0/500 loc=0/0/0', 'A p1 rot=0/0/500 loc=0/0/0', 'A p2 rot=0/0/500 loc=0/0/0'])
  })

  it('takes it times the root from any other local rotation', async () => {
    const f = await fixture()
    f.command('root 50')
    f.sit()
    expect(f.command('loc 20')).toEqual(['A l rot=0/0/700 loc=0/0/200'])
    expect(f.command('pr 0')).toEqual(['A p0 rot=0/0/700 loc=0/0/200', 'A p1 rot=0/0/700 loc=0/0/500', 'A p2 rot=0/0/1000 loc=0/0/500'])
  })
})
