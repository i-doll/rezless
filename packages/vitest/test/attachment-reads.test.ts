import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetPos
// https://wiki.secondlife.com/wiki/LlGetLocalPos
// https://wiki.secondlife.com/wiki/LlGetRootPosition
// https://wiki.secondlife.com/wiki/PRIM_POSITION
// https://wiki.secondlife.com/wiki/LlGetObjectDetails
// https://wiki.secondlife.com/wiki/LlSensor
// https://wiki.secondlife.com/wiki/LlTarget
// https://wiki.secondlife.com/wiki/LlRotTarget
// https://wiki.secondlife.com/wiki/LlRezObject
// https://wiki.secondlife.com/wiki/LlRezObjectWithParams
// https://wiki.secondlife.com/wiki/LlCastRay
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono, in two sessions. The probe
// avatar wore two two-prim objects, one on the chest and one on HUD center (point 35): a 0.3 m box
// root, offset <0.3, 0, 0.1> (HUD <0, 0.1, 0.05>) and turned <0, 0, -90> degrees on its point,
// with a 0.2 m box child at <0.3, 0, 0> turned <20, 0, 50> in the linkset. Each prim ran the
// script below, driven by the avatar's chat, as did a 0.3 m box "target" rezzed 3 m east of the
// avatar. The avatar stood, then sat on a 0.5 m box turned 40 degrees. Its readings are the
// numbers below.

const PROBE = `
integer tnum;
integer rnum;
integer tcount;
integer rcount;
string tag() {
  integer pt = llGetAttached();
  string p = "T";
  if (pt == 35) p = "H"; else if (pt) p = "C";
  return p + (string)llGetLinkNumber();
}
say(string s) { llOwnerSay("653 " + tag() + " " + s); }
vector V(list a, integer i) { return <(float)llList2String(a, i), (float)llList2String(a, i + 1), (float)llList2String(a, i + 2)>; }
rotation E(list a, integer i) { return llEuler2Rot(V(a, i) * DEG_TO_RAD); }
vector av() { return llList2Vector(llGetObjectDetails(llGetOwner(), [OBJECT_POS]), 0); }
default {
  state_entry() { llListen(6530, "", "", ""); }
  listen(integer ch, string n, key id, string m) {
    if (llGetOwnerKey(id) != llGetOwner()) return;
    list a = llParseString2List(m, [" "], []);
    string who = llList2String(a, 0);
    string t = tag();
    if (who != "*" && who != t && who != llGetSubString(t, 0, 0)) return;
    string c = llList2String(a, 1);
    if (c == "pos") {
      list p = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_POSITION, PRIM_POS_LOCAL]);
      list r = llGetLinkPrimitiveParams(1, [PRIM_POSITION, PRIM_POS_LOCAL]);
      say("pos gp=" + (string)llGetPos() + " lp=" + (string)llGetLocalPos() + " rp=" + (string)llGetRootPosition()
        + " pp=" + llList2String(p, 0) + " pl=" + llList2String(p, 1) + " 1p=" + llList2String(r, 0) + " 1l=" + llList2String(r, 1)
        + " op=" + (string)llList2Vector(llGetObjectDetails(llGetKey(), [OBJECT_POS]), 0)
        + " orp=" + (string)llList2Vector(llGetObjectDetails(llGetLinkKey(1), [OBJECT_POS]), 0)
        + " av=" + (string)av()
        + " avr=" + (string)llList2Rot(llGetObjectDetails(llGetOwner(), [OBJECT_ROT]), 0)
        + " gr=" + (string)llGetRot() + " lr=" + (string)llGetLocalRot());
    } else if (c == "opk") {
      key k = (key)llList2String(a, 2);
      say("opk " + llList2CSV(llGetObjectDetails(k, [OBJECT_POS, OBJECT_ROT, OBJECT_ROOT, OBJECT_ATTACHED_POINT])));
    } else if (c == "sen") {
      string nm = "";
      if (llGetListLength(a) > 5) nm = llDumpList2String(llList2List(a, 5, -1), " ");
      llSensor(nm, (key)llList2String(a, 4), (integer)llList2String(a, 2), 20.0, (float)llList2String(a, 3));
    } else if (c == "tgt") {
      llTargetRemove(tnum);
      tcount = 0;
      tnum = llTarget(llGetPos() + V(a, 2), (float)llList2String(a, 5));
    } else if (c == "rtgt") {
      llRotTargetRemove(rnum);
      rcount = 0;
      rnum = llRotTarget(E(a, 2) * llGetRot(), (float)llList2String(a, 5));
    } else if (c == "rez") {
      llRezObject("probe issue-653 bullet", llGetPos() + V(a, 2), ZERO_VECTOR, E(a, 5), 1);
    } else if (c == "rezp") {
      llRezObjectWithParams("probe issue-653 bullet", [REZ_POS, V(a, 2), TRUE, FALSE, REZ_ROT, E(a, 5), TRUE, REZ_PARAM, 2]);
    } else if (c == "rezr") {
      llRezObjectWithParams("probe issue-653 bullet", [REZ_POS, V(a, 2), TRUE, FALSE, REZ_PARAM, 4]);
    } else if (c == "rezo") {
      llRezObjectWithParams("probe issue-653 bullet", [REZ_POS, llGetPos() + V(a, 2), FALSE, FALSE, REZ_ROT, E(a, 5), TRUE, REZ_PARAM, 5]);
    } else if (c == "ray") {
      vector o = av();
      list r = llCastRay(o + V(a, 3), o + V(a, 6), [RC_REJECT_TYPES, (integer)llList2String(a, 2), RC_DATA_FLAGS, RC_GET_LINK_NUM, RC_MAX_HITS, 10]);
      say("ray " + llList2String(a, 2) + " " + llList2CSV(r));
    }
  }
  sensor(integer n) {
    string s = "sen n=" + (string)n;
    integer i;
    for (i = 0; i < n && i < 8; ++i) s += " | " + llDetectedName(i);
    say(s);
  }
  no_sensor() { say("sen none"); }
  at_target(integer h, vector tp, vector op) {
    if (++tcount == 1) say("at_target tp=" + (string)tp + " op=" + (string)op);
    else if (tcount > 3) llTargetRemove(h);
  }
  not_at_target() {
    if (++tcount == 1) say("not_at_target");
    else if (tcount > 3) llTargetRemove(tnum);
  }
  at_rot_target(integer h, rotation tr, rotation r) {
    if (++rcount == 1) say("at_rot_target tr=" + (string)tr + " or=" + (string)r);
    else if (rcount > 3) llRotTargetRemove(h);
  }
  not_at_rot_target() {
    if (++rcount == 1) say("not_at_rot_target");
    else if (rcount > 3) llRotTargetRemove(rnum);
  }
  object_rez(key id) { say("rezzed"); }
}
`

const BULLET = `default { on_rez(integer p) { llOwnerSay("653 B p=" + (string)p + " gp=" + (string)llGetPos() + " gr=" + (string)llGetRot()); } }`

type V3 = { x: number, y: number, z: number }
type Rot = { x: number, y: number, z: number, s: number }
const v = (x: number, y: number, z: number): V3 => ({ x, y, z })
const q = (x: number, y: number, z: number, s: number): Rot => ({ x, y, z, s })
const yaw = (deg: number) => q(0, 0, Math.sin(deg * Math.PI / 360), Math.cos(deg * Math.PI / 360))
const CHILD = q(0.157379, -0.073387, 0.416198, 0.892539)
const OWNER = '00000000-0000-4000-8000-000000000653'

async function fixture(position: V3, rotation: Rot) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: OWNER, name: 'probe', username: 'probe', size: { x: 0.45, y: 0.6, z: 1.65 }, position, rotation,
  })
  const bullet = { prims: [{ name: 'probe issue-653 bullet', scripts: [{ name: 'bullet', source: { source: BULLET } }] }] }
  const worn = async (name: string, point: number, onPoint: V3) => {
    const { linkset, scripts } = await loadLinkset({
      world, region: 'home', owner: OWNER, position: { x: 118, y: 50, z: 1997.4 },
      prims: [
        { name, scripts: [{ name: 'root', source: { source: PROBE } }], objects: { 'probe issue-653 bullet': bullet } },
        { name: `${name} child`, scripts: [{ name: 'child', source: { source: PROBE } }], objects: { 'probe issue-653 bullet': bullet } },
      ],
    })
    const [root, child] = linkset.prims
    root!.params.size = v(0.3, 0.3, 0.3)
    child!.params.size = v(0.2, 0.2, 0.2)
    child!.params.position = v(0.3, 0, 0)
    child!.params.rotation = CHILD
    for (const s of Object.values(scripts)) s!.start()
    linkset.attachToAvatar(OWNER, point)
    root!.params.position = onPoint
    root!.params.rotation = yaw(-90)
    return linkset
  }
  const chest = await worn('probe issue-653 chest', 1, v(0.3, 0, 0.1))
  const hud = await worn('probe issue-653 hud', 35, v(0, 0.1, 0.05))
  const target = await loadLinkset({
    world, region: 'home', owner: OWNER, position: { x: 121, y: 48, z: 1997.44 },
    prims: [{ name: 'probe issue-653 target', scripts: [{ name: 'target', source: { source: PROBE } }] }],
  })
  target.prims[0]!.params.size = v(0.3, 0.3, 0.3)
  target.scripts.target!.start()
  const seat = await loadLinkset({
    world, region: 'home', owner: OWNER, position: { x: 118, y: 45.5, z: 1996.75 }, prims: [{ name: 'probe issue-653 seat' }],
  })
  seat.prims[0]!.params.rotation = yaw(40)
  const seen = new Map<unknown, number>()
  const heard = () => world.linksets.flatMap((l: Linkset) => l.allScripts()).flatMap((s) => {
    const said = s.chat.filter((c) => c.type === 'ownerSay').map((c) => c.text)
    const fresh = said.slice(seen.get(s) ?? 0)
    seen.set(s, said.length)
    return fresh
  })
  const say = (msg: string, ms = 3000) => {
    heard()
    for (const s of world.linksets.flatMap((l: Linkset) => l.allScripts())) {
      if (s.running) s.fire('listen', { channel: 6530, name: 'probe', id: OWNER, msg })
    }
    world.linksets[0]!.advanceTime(ms)
    return heard()
  }
  const one = (msg: string) => {
    const lines = say(msg)
    expect(lines, msg).toHaveLength(1)
    return lines[0]!
  }
  const sit = () => expect(world.sitAvatar(avatar, seat.prims[0]!, { position: SEATED_ON, rotation: yaw(90) })).toBe(true)
  return { world, avatar, chest, hud, target: target.linkset, say, one, sit }
}

/** The vectors and rotations of a probe line, by label, or its numbers in order. */
function numbers(line: string): number[][] {
  return [...line.matchAll(/<([^>]*)>/g)].map((m) => m[1]!.split(',').map(Number))
}
function labelled(line: string): Record<string, number[]> {
  return Object.fromEntries([...line.matchAll(/(\w+)=<([^>]*)>/g)].map((m) => [m[1]!, m[2]!.split(',').map(Number)]))
}
function expectClose(actual: number[], expected: number[], label: string, digits = 4) {
  expect(actual, label).toHaveLength(expected.length)
  actual.forEach((n, i) => expect(n, `${label}[${i}]`).toBeCloseTo(expected[i]!, digits))
}
function expectLine(line: string, expected: Record<string, number[]>, digits = 4) {
  const got = labelled(line)
  for (const [key, value] of Object.entries(expected)) expectClose(got[key] ?? [], value, key, digits)
}

// The avatar's place on the seat, worked out from where it read itself seated: region position
// <117.74730, 45.73176, 1997.63000>, turned 130 degrees, on a seat at <118, 45.5, 1996.75> turned 40.
const SEATED_ON = v(-0.044607, 0.339971, 0.88)
const STANDING = { at: v(117.94350, 48.00387, 1997.44600), turn: q(0, 0, -0.03859, 0.99926) }
const TURNED = { at: v(117.92880, 48.05030, 1997.44700), turn: q(0, 0, -0.43380, 0.90101) }

describe('position reads in an attachment', () => {
  // In-world: the root read the wearer's position for llGetPos, llGetRootPosition, PRIM_POSITION
  // and OBJECT_POS, and its offset on the point for llGetLocalPos and PRIM_POS_LOCAL. The child read
  // the wearer's position plus its offset in the linkset turned by the wearer, ignoring the root's
  // offset and turn on the point, for llGetPos, PRIM_POSITION and OBJECT_POS; llGetRootPosition and
  // link 1's PRIM_POSITION gave the wearer's position. A HUD read the same as the chest.
  const av = [117.94350, 48.00387, 1997.44600]
  const child = [118.24260, 47.98074, 1997.44600]
  for (const [label, who, local, onPoint] of [
    ['the chest root', 'C1', [0.3, 0, 0.1], [0.3, 0, 0.1]],
    ['a HUD root', 'H1', [0, 0.1, 0.05], [0, 0.1, 0.05]],
    ['a chest child', 'C2', [0.3, 0, 0], [0.3, 0, 0.1]],
    ['a HUD child', 'H2', [0.3, 0, 0], [0, 0.1, 0.05]],
  ] as const) it(`reads ${label} at the wearer`, async () => {
    const f = await fixture(STANDING.at, STANDING.turn)
    const own = who.endsWith('1') ? av : child
    expectLine(f.one(`${who} pos`), {
      gp: own, lp: [...local], rp: av, pp: own, pl: [...local], '1p': av, '1l': [...onPoint], op: own, orp: av, av,
    })
  })

  it('reads the same from another object', async () => {
    // In-world: the target's llGetObjectDetails of the chest child gave its llGetPos and llGetRot,
    // of the chest root the wearer's position and rotation, and of the HUD child the chest child's.
    const f = await fixture(STANDING.at, STANDING.turn)
    const [root, kid] = f.chest.prims
    const read = (key: string) => numbers(f.one(`T opk ${key}`))
    expectClose(read(kid!.key).flat(), [118.242561, 47.980736, 1997.446411, 0.154429, -0.079406, 0.381444, 0.907935], 'child', 3)
    expectClose(read(root!.key).flat(), [117.943459, 48.003872, 1997.446411, 0, 0, -0.038591, 0.999255], 'root', 3)
    expectClose(read(f.hud.prims[1]!.key).flat(), read(kid!.key).flat(), 'hud child')
  })

  it("follows a seated wearer's place", async () => {
    // In-world, seated: the root read <117.74730, 45.73176, 1997.63000> and the child
    // <117.55440, 45.96157, 1997.63000> in both objects.
    const f = await fixture(STANDING.at, STANDING.turn)
    f.sit()
    f.world.linksets[0]!.advanceTime(1000)
    for (const who of ['C1', 'H1']) expectLine(f.one(`${who} pos`), { gp: [117.74730, 45.73176, 1997.63], pp: [117.74730, 45.73176, 1997.63] })
    for (const who of ['C2', 'H2']) expectLine(f.one(`${who} pos`), { gp: [117.55440, 45.96157, 1997.63], op: [117.55440, 45.96157, 1997.63] }, 3)
  })
})

describe('sensors and attachments', () => {
  const NONE = '00000000-0000-0000-0000-000000000000'
  it("points a sensor in an attachment along the prim's llGetRot", async () => {
    // In-world, a 0.3 radian cone toward the target 3 m east: with the avatar facing east, the roots
    // found it whatever their turn on the point, and the children, turned 50 degrees in the
    // linkset, did not. With the avatar turned 51 degrees right, only the children found it.
    const f = await fixture(STANDING.at, STANDING.turn)
    const scan = (who: string) => f.one(`${who} sen 6 0.3 ${NONE} probe issue-653 target`)
    expect(['C1', 'C2', 'H1', 'H2'].map(scan)).toEqual([
      '653 C1 sen n=1 | probe issue-653 target', '653 C2 sen none', '653 H1 sen n=1 | probe issue-653 target', '653 H2 sen none',
    ])
    f.avatar.rotation = TURNED.turn
    f.avatar.position = TURNED.at
    expect(['C1', 'C2', 'H1', 'H2'].map(scan)).toEqual([
      '653 C1 sen none', '653 C2 sen n=1 | probe issue-653 target', '653 H1 sen none', '653 H2 sen n=1 | probe issue-653 target',
    ])
  })

  it("keeps to the wearer's turn, not the seat's, when the wearer sits", async () => {
    // In-world, seated facing 130 degrees on a seat turned 40, toward the target 35 degrees away:
    // the chest root's 0.3 radian sensor found nothing.
    const f = await fixture(STANDING.at, STANDING.turn)
    f.sit()
    f.world.linksets[0]!.advanceTime(1000)
    expect(f.one(`C1 sen 6 0.3 ${NONE} probe issue-653 target`)).toBe('653 C1 sen none')
  })

  it('finds no attachment, and no wearer from an attachment', async () => {
    // In-world, in a full sphere: the target found the seat but not the chest object by name or
    // by key, nor the HUD; the chest root did not find the HUD. The target found the wearer, and
    // neither worn root did.
    const f = await fixture(STANDING.at, STANDING.turn)
    const chest = f.chest.prims[0]!.key
    expect(f.one(`T sen 6 3.14 ${NONE} probe issue-653 seat`)).toBe('653 T0 sen n=1 | probe issue-653 seat')
    expect(f.one(`T sen 6 3.14 ${NONE} probe issue-653 chest`)).toBe('653 T0 sen none')
    expect(f.one(`T sen 6 3.14 ${chest}`)).toBe('653 T0 sen none')
    expect(f.one(`T sen 6 3.14 ${NONE} probe issue-653 hud`)).toBe('653 T0 sen none')
    expect(f.one(`C1 sen 6 3.14 ${NONE} probe issue-653 hud`)).toBe('653 C1 sen none')
    expect(f.one(`T sen 1 3.14 ${NONE}`)).toBe('653 T0 sen n=1 | probe')
    expect(f.one(`C1 sen 1 3.14 ${NONE}`)).toBe('653 C1 sen none')
    expect(f.one(`H1 sen 1 3.14 ${NONE}`)).toBe('653 H1 sen none')
  })
})

describe('targets in an attachment', () => {
  it("tracks the wearer's position and the inverse of its rotation", async () => {
    // In-world, with the avatar at <117.92880, 48.05030, 1997.44700> turned -51.4 degrees: a 0.05 m
    // target at llGetPos was reached in the roots with ourpos the wearer's position; in the
    // children it was not, and a 1 m one was, with the same ourpos. A rotation target at llGetRot
    // was reached in the roots, with ourrot the inverse of the wearer's rotation, and not in the
    // children; one 90 degrees off was not reached.
    const f = await fixture(TURNED.at, TURNED.turn)
    const av = [117.92880, 48.05030, 1997.44700]
    expectLine(f.one('C1 tgt 0 0 0 0.05'), { tp: av, op: av })
    expect(f.one('C2 tgt 0 0 0 0.05')).toBe('653 C2 not_at_target')
    expectLine(f.one('C2 tgt 0 0 0 1.0'), { tp: [118.11590, 47.81578, 1997.44700], op: av })
    expectLine(f.one('H1 tgt 0 0 0 0.05'), { tp: av, op: av })
    expectLine(f.one('H2 tgt 0 0 0 1.0'), { tp: [118.11590, 47.81578, 1997.44700], op: av })
    expectLine(f.one('C1 rtgt 0 0 0 0.05'), { tr: [0, 0, -0.43380, 0.90101], or: [0, 0, 0.43380, 0.90101] })
    expect(f.one('C2 rtgt 0 0 0 0.05')).toBe('653 C2 not_at_rot_target')
    expect(f.one('C1 rtgt 0 0 -90 0.05')).toBe('653 C1 not_at_rot_target')
    expectLine(f.one('H1 rtgt 0 0 0 0.05'), { tr: [0, 0, -0.43380, 0.90101], or: [0, 0, 0.43380, 0.90101] })
    expect(f.one('H2 rtgt 0 0 0 0.05')).toBe('653 H2 not_at_rot_target')
  })

  it('tracks the root of the seat when the wearer sits', async () => {
    // In-world, seated: a 0.05 m target and a rotation target at llGetRot were not reached; 1 m,
    // 3 m and 200 m targets were, with ourpos the seat's position, and a 3.2 radian rotation target
    // with ourrot the inverse of the seat's rotation.
    const f = await fixture(STANDING.at, STANDING.turn)
    f.sit()
    f.world.linksets[0]!.advanceTime(1000)
    expect(f.one('C1 tgt 0 0 0 0.05')).toBe('653 C1 not_at_target')
    expect(f.one('C1 rtgt 0 0 0 0.05')).toBe('653 C1 not_at_rot_target')
    expectLine(f.one('C1 tgt 0 0 0 1'), { tp: [117.74730, 45.73176, 1997.63], op: [118, 45.5, 1996.75] })
    expectLine(f.one('C1 rtgt 0 0 0 3.2'), { tr: [0, 0, 0.90631, 0.42262], or: [0, 0, -0.34202, 0.93969] })
  })

  it('gives the inverse of the rotation as ourrot outside attachments too', async () => {
    // In-world: the target, turned 30 degrees, reached a rotation target at llGetRot with ourrot
    // <-0.00000, -0.00000, -0.25882, 0.96593>.
    const f = await fixture(STANDING.at, STANDING.turn)
    f.target.prims[0]!.params.rotation = yaw(30)
    expect(f.one('T rtgt 0 0 0 0.05')).toBe('653 T0 at_rot_target tr=<0.00000, 0.00000, 0.25882, 0.96593> or=<-0.00000, -0.00000, -0.25882, 0.96593>')
  })
})

describe('rezzing from an attachment', () => {
  const bullet = (lines: string[]) => lines.filter((l) => l.startsWith('653 B'))

  it('places llRezObject where asked, within 10 m of the prim', async () => {
    // In-world: the chest root rezzed at llGetPos + <1, 0, 0.5> turned 30 degrees as asked, and at
    // llGetPos + 9.9 m, but not at + 10.4 m. The child rezzed at its own llGetPos + 10 m, and not
    // at - 10.2 m, 9.9 m from the wearer.
    const f = await fixture(TURNED.at, TURNED.turn)
    expectLine(bullet(f.say('C1 rez 1 0 0.5 0 0 30'))[0]!, { gp: [118.92880, 48.05030, 1997.94700], gr: [0, 0, 0.25882, 0.96593] })
    expect(f.say('C1 rez 10.4 0 0 0 0 0')).toEqual([])
    expectLine(bullet(f.say('C1 rez 9.9 0 0 0 0 0'))[0]!, { gp: [127.82880, 48.05030, 1997.44700] })
    f.avatar.rotation = yaw(0)
    expect(bullet(f.say('C2 rez 10.0 0 0 0 0 0'))).toHaveLength(1)
    expect(f.say('C2 rez -10.2 0 0 0 0 0')).toEqual([])
  })

  it("counts a relative REZ_POS from the prim's place one level up", async () => {
    // In-world, standing turned -51.4 degrees: the chest root's <1, 0, 0.5> with REZ_ROT 30 degrees,
    // both relative, landed at the wearer's position plus the root's offset on the point turned by
    // the wearer, plus the offset unturned, turned -21.4 degrees; the HUD root's likewise. The
    // child's landed at its offset in the attachment, from the root's offset and turn on the point:
    // <116, 48, 1997.4> gave <116.3, 47.7, 1997.5>, so <1, 0, 0.5> was out of reach and nothing
    // rezzed.
    const f = await fixture(TURNED.at, TURNED.turn)
    expectLine(bullet(f.say('C1 rezp 1 0 0.5 0 0 30'))[0]!, { gp: [119.11590, 47.81579, 1998.04700], gr: [0, 0, -0.18582, 0.98258] })
    expectLine(bullet(f.say('H1 rezp 1 0 0.5 0 0 30'))[0]!, { gp: [119.00700, 48.11266, 1997.99700], gr: [0, 0, -0.18582, 0.98258] })
    expect(f.say('C2 rezp 1 0 0.5 0 0 30')).toEqual([])
    expectLine(bullet(f.say('C2 rezr 116 48 1997.4'))[0]!, { gp: [116.3, 47.7, 1997.5] })
  })

  it("turns a relative REZ_ROT by the prim's llGetRot", async () => {
    // In-world, facing -3.06 degrees: the child's absolute position with 30 degrees relative gave
    // <0.12999, -0.11513, 0.61264, 0.77105>; seated facing 130 degrees, <0.15738, 0.07339, 0.95125, -0.25489>.
    const f = await fixture(v(115.94260, 48.00465, 1997.421), q(0, 0, -0.02672, 0.99964))
    expectLine(bullet(f.say('C2 rezo 1 0 0.5 0 0 30'))[0]!, { gr: [0.12999, -0.11513, 0.61264, 0.77105] })
    f.sit()
    f.world.linksets[0]!.advanceTime(1000)
    expectLine(bullet(f.say('C2 rezo 1 0 0.5 0 0 30'))[0]!, { gr: [0.15738, 0.07339, 0.95125, -0.25489] })
  })

  it("counts a seated wearer's root from the avatar's place on its seat", async () => {
    // In-world, seated: the chest root's relative <1, 0, 0.5> rezzed nothing, with no error, and
    // <118, 45.5, 1997> landed at <117.95540, 46.14000, 1997.98000>: from the avatar's place on the
    // seat plus the root's offset on the point turned by the avatar's turn on the seat. Its
    // absolute position with 30 degrees relative was turned 160 degrees. The child's origin stayed
    // its offset in the attachment.
    const f = await fixture(STANDING.at, STANDING.turn)
    f.sit()
    f.world.linksets[0]!.advanceTime(1000)
    expect(f.say('C1 rezp 1 0 0.5 0 0 30')).toEqual([])
    expectLine(bullet(f.say('C1 rezr 118 45.5 1997'))[0]!, { gp: [117.95540, 46.14, 1997.98] })
    expectLine(bullet(f.say('C1 rezo 1 0 0.5 0 0 30'))[0]!, { gp: [118.74730, 45.73176, 1998.13], gr: [0, 0, 0.98481, 0.17365] })
    expectLine(bullet(f.say('C2 rezr 116 45.5 1997'))[0]!, { gp: [116.3, 45.2, 1997.1] })
  })
})

describe('llCastRay and attachments', () => {
  it('passes through attachments', async () => {
    // In-world: rays from the target through the wearer at heights from -0.4 to +0.6 m hit the
    // avatar and never the chest object sticking out in front of it; with RC_REJECT_AGENTS they hit
    // nothing, and the same ray cast from the chest root hit only the avatar.
    const f = await fixture(v(117.94780, 48.00034, 1997.448), q(0, 0, 0.02965, 0.99956))
    f.chest.prims[0]!.params.size = v(1, 1, 1)
    for (const who of ['T', 'C1']) {
      const line = f.one(`${who} ray 0 2.5 0 0.4 -3 0 0.4`)
      expect(line.split(', ')[0]!.endsWith(OWNER), line).toBe(true)
      expect(line.endsWith(', 1'), line).toBe(true)
    }
    expect(f.one('T ray 1 2.5 0 0.4 -3 0 0.4')).toBe('653 T0 ray 1 0')
  })
})
