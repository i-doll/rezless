import { describe, expect, it } from 'vitest'
import { loadLinkset, World, type Linkset, type Script } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

// The in-world probe scripts, cut to the commands these tests use and without
// their timestamps. A four-prim object: a logger in each prim, and a
// controller in the root ("R") and in the first child ("C"). The controller
// named by a command's first letter runs it: "J"
// breaks off the prim named "brk", "Y" sleeps 0.5 s first, "A" calls
// llBreakAllLinks, "T" calls llBreakLink(LINK_THIS), and "L" links the "brk"
// prim back with llCreateLink. Then it calls llMessageLinked(LINK_SET).

const CTL = `key brk;
string me;
string info() { return " n=" + (string)llGetNumberOfPrims(); }
rep(string s) { llOwnerSay(me + "ctl " + s); }
integer findBrk() { integer i; for (i = 2; i <= llGetNumberOfPrims(); ++i) if (llGetLinkName(i) == "probe brk") return i; return 0; }
default {
  state_entry() {
    me = "R"; if (llGetLinkNumber() > 1) me = "C";
    if (me == "R") llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION);
    llListen(7711, "", NULL_KEY, "");
    integer b = findBrk(); if (b) brk = llGetLinkKey(b);
    llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);
  }
  listen(integer c, string n, key id, string m) {
    if (llGetOwnerKey(id) != llGetOwner()) return;
    if (llGetSubString(m, 0, 0) != me) return;
    m = llGetSubString(m, 1, -1);
    integer b = findBrk();
    if (b) brk = llGetLinkKey(b);
    rep("cmd " + m + info());
    if (m == "Y") llSleep(0.5);
    if (m == "J" || m == "Y") { if (b) llBreakLink(b); }
    else if (m == "A") llBreakAllLinks();
    else if (m == "T") llBreakLink(LINK_THIS);
    else if (m == "L") { if (!b) llCreateLink(brk, TRUE); }
    llMessageLinked(LINK_SET, 1, m, "");
    rep("end" + info());
  }
  changed(integer c) { rep("changed " + (string)c + info()); }
  link_message(integer s, integer num, string m, key id) { rep("lm " + m + info()); }
}`
const LOG = `string info() { return " n=" + (string)llGetNumberOfPrims(); }
rep(string s) { llOwnerSay(llGetSubString(llGetObjectName(), 6, -1) + " " + s); }
default {
  changed(integer c) { rep("changed " + (string)c + info()); }
  link_message(integer s, integer num, string m, key id) { rep("lm " + m + info()); }
}`

async function setup(seated: boolean, objects = 1) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 114, y: 46, z: 20 } })
  const script = (name: string, source: string) => ({ name, language: 'lsl' as const, source: { source } })
  const all: Record<string, Script> = {}
  const linksets: Linkset[] = []
  for (let o = 0; o < objects; o++) {
    const tag = objects > 1 ? 'XY'[o]! : ''
    const { linkset, scripts } = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 114, y: 47 + 8 * o, z: 20 },
      prims: [
        { name: 'probe root', scripts: [script(`${tag}root`, LOG), script(`${tag}Rctl`, CTL)] },
        { name: 'probe c2', scripts: [script(`${tag}c2`, LOG), script(`${tag}Cctl`, CTL)] },
        { name: 'probe c3', scripts: [script(`${tag}c3`, LOG)] },
        { name: 'probe brk', scripts: [script(`${tag}brk`, LOG)] },
      ],
    })
    linkset.prims[1]!.params.position = { x: 0, y: 0.6, z: 0 }
    linkset.prims[2]!.params.position = { x: 0, y: -0.6, z: 0 }
    linkset.prims[3]!.params.position = { x: 0, y: 1.2, z: 0 }
    linkset.startAll()
    linksets.push(linkset)
    Object.assign(all, scripts)
  }
  const tick = (ms: number) => linksets[0]!.advanceTime(ms)
  tick(500)
  for (const [name, s] of Object.entries(all)) if (name.endsWith('ctl')) s.grantPermissions()
  tick(500)
  if (seated) expect(world.sitAvatar(avatar, linksets[0]!.prims[0]!)).toBe(true)
  tick(2000)
  const send = (command: string) => {
    const before = Object.fromEntries(Object.entries(all).map(([name, s]) => [name, s.chat.length]))
    world.sendAvatarChat(avatar, 7711, command)
    for (let i = 0; i < 40; i++) tick(100)
    return Object.fromEntries(Object.entries(all).map(([name, s]) => [name, s.chat.slice(before[name]).map((c) => c.text.replace(/^\w+ /, ''))]))
  }
  return { send }
}

const lmFirst = (command: string) => [`lm ${command} n=3`, 'changed 32 n=3']

// https://wiki.secondlife.com/wiki/LlBreakLink
// https://wiki.secondlife.com/wiki/LlCreateLink
// https://wiki.secondlife.com/wiki/LlMessageLinked
// https://wiki.secondlife.com/wiki/Changed
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm RLVa 2.4.2,
// 2026-11-24) in LSL (Mono), with each test avatar in turn, no other probe
// running on the object. Seated runs had the avatar on the root's sit target;
// the break stood it, and each script got one changed(32). Timestamps showed
// changed(32) raised a frame after llBreakLink, and the link message sent in
// the frame of the call running first.
describe.each([false, true])('LSL: llBreakLink from the root, then llMessageLinked (seated %s)', (seated) => {
  // In-world: "RJ", 3 runs with each avatar, seated and not -> link_message,
  // then changed(32), in every script.
  it('gives every script link_message first', async () => {
    const out = (await setup(seated)).send('RJ')
    expect(out.Rctl).toEqual([`cmd J n=${seated ? 5 : 4}`, 'end n=3', ...lmFirst('J')])
    for (const name of ['root', 'c2', 'Cctl', 'c3']) expect(out[name]).toEqual(lmFirst('J'))
    expect(out.brk).toEqual(['changed 32 n=1'])
  })

  // In-world: "RY" and "CY", 1 run with each avatar not seated and 1 seated
  // ("CY" seated with one avatar) -> link_message, then changed(32), in every
  // script.
  it.each(['R', 'C'])('gives every script link_message first after the caller slept (%s)', async (caller) => {
    const out = (await setup(seated)).send(`${caller}Y`)
    const ctl = `${caller}ctl`
    expect(out[ctl]).toEqual([`cmd Y n=${seated ? 5 : 4}`, 'end n=3', ...lmFirst('Y')])
    for (const name of ['root', 'Rctl', 'c2', 'Cctl', 'c3'].filter((n) => n !== ctl)) expect(out[name]).toEqual(lmFirst('Y'))
  })
})

// In-world: "CJ" from the child's controller, no sleep, all with one avatar
// (Aditi, SLua Tideland, 2026-11-24). changed(32) comes at the end of the
// frame of the call. When the caller sent its link message in that frame,
// every script got link_message first. When the caller went on a frame or
// two later, the scripts got changed(32) first, and the order a script ran in
// decided the rest. With the object alone and the plain controller, "CJ"
// went on later before llMessageLinked in 5 of 10 runs: changed(32) first in
// the root's two scripts, the caller and the logger in its prim, but
// link_message first in the logger of the other child. The other 5 got
// link_message first everywhere. llBreakLink and llBreakAllLinks from the
// root never went on later (6 runs), and neither did
// llSetLinkPrimitiveParamsFast or no call at all from either prim (12 runs).
// Three of the 10 "CJ" runs had "brk" as link 2 after a relink and split the
// same way.
//
// A second session read llGetTime and llGetTimestamp just before and after
// the call. That little extra work changed the result: llBreakLink held the
// caller into the next frame in 5 of 8 "CJ" runs and 3 of 3 "RJ" runs, and
// in the other 3 "CJ" runs the handler went on later right after the call.
// So every run got changed(32) first: in every script in all 3 "RJ" runs and
// 1 "CJ" run, and in every script but the other child's logger in 7 "CJ"
// runs.
//
// #719 found the same frame boundary for llUnSit and llBreakLink with a
// sitter: the more work the stand takes, or the script did earlier in the
// frame, the likelier the caller waits for the next frame. #711's runs with
// one avatar gave changed(32) first in every script, 3 of 3. rezless doesn't
// hold the caller (#721 takes up the heavy case), and gives the order of
// the runs without a wait.
describe('LSL: llBreakLink from a child, then llMessageLinked', () => {
  it('gives every script link_message first, as when the caller does not pause', async () => {
    const out = (await setup(false)).send('CJ')
    expect(out.Cctl).toEqual(['cmd J n=4', 'end n=3', ...lmFirst('J')])
    for (const name of ['root', 'Rctl', 'c2', 'c3']) expect(out[name]).toEqual(lmFirst('J'))
    expect(out.brk).toEqual(['changed 32 n=1'])
  })
})

// In-world: "RA" (3 runs) -> the root's scripts got link_message, then
// changed(32); the others only changed(32). "CA" (3 runs) -> the same for the
// child's scripts. "CT" (3 runs) -> llBreakLink(LINK_THIS) in a child broke
// the root off: the root's scripts got only changed(32), and the three prims
// left together got link_message, then changed(32), in every script.
describe('LSL: llBreakAllLinks or llBreakLink(LINK_THIS), then llMessageLinked', () => {
  const apart = ['changed 32 n=1']
  it('runs link_message first in the root after llBreakAllLinks from the root', async () => {
    const out = (await setup(false)).send('RA')
    expect(out.Rctl).toEqual(['cmd A n=4', 'end n=1', 'lm A n=1', 'changed 32 n=1'])
    expect(out.root).toEqual(['lm A n=1', 'changed 32 n=1'])
    for (const name of ['c2', 'Cctl', 'c3', 'brk']) expect(out[name]).toEqual(apart)
  })

  it('runs link_message first in the child after llBreakAllLinks from the child', async () => {
    const out = (await setup(false)).send('CA')
    expect(out.Cctl).toEqual(['cmd A n=4', 'end n=1', 'lm A n=1', 'changed 32 n=1'])
    expect(out.c2).toEqual(['lm A n=1', 'changed 32 n=1'])
    for (const name of ['root', 'Rctl', 'c3', 'brk']) expect(out[name]).toEqual(apart)
  })

  it('breaks the root off for llBreakLink(LINK_THIS) in a child', async () => {
    const out = (await setup(false)).send('CT')
    expect(out.Cctl).toEqual(['cmd T n=4', 'end n=3', ...lmFirst('T')])
    for (const name of ['c2', 'c3', 'brk']) expect(out[name]).toEqual(lmFirst('T'))
    for (const name of ['root', 'Rctl']) expect(out[name]).toEqual(apart)
  })
})

// Two copies of the object, "X" and "Y", heard the same "RJ" and broke in the
// same frame (Aditi, SLua Tideland, 2026-11-24, one avatar). #702 measured
// changed(32) first in every script while a second seat ran its command in
// the same frame. Here link_message came first in every script of both copies
// in 4 of 6 runs: 3 with nobody seated and 1 with the avatar on X's sit
// target. In the other 2, both seated on X, Y's root caller went on a frame
// later before llMessageLinked and Y's root scripts got changed(32) first.
//
// With an SLua copy, "Z", in Y's place, as #702 had, X got link_message first
// everywhere in 5 of 6 runs and changed(32) first everywhere in 1, seated on
// X. Z got link_message first everywhere with nobody on it (3 of 3) and
// changed(32) first everywhere with the avatar on it (3 of 3), its caller
// held two frames: the SLua order #719 measured with this avatar seated.
//
// The LSL root callers went on a frame or more later in 10 of 18 runs, against
// none with the object alone, but only 3 of those pauses came before the link
// message. A second object breaking in the same frame doesn't put changed(32)
// first on its own; #702's SLua results match the seated avatar. rezless
// doesn't hold the caller.
describe('LSL: two objects break a link in the same frame', () => {
  it.each([false, true])('gives every script link_message first (seated %s)', async (seated) => {
    const out = (await setup(seated, 2)).send('RJ')
    for (const tag of ['X', 'Y']) {
      expect(out[`${tag}Rctl`]).toEqual([`cmd J n=${seated && tag === 'X' ? 5 : 4}`, 'end n=3', ...lmFirst('J')])
      for (const name of ['root', 'c2', 'Cctl', 'c3']) expect(out[`${tag}${name}`]).toEqual(lmFirst('J'))
      expect(out[`${tag}brk`]).toEqual(['changed 32 n=1'])
    }
  })
})

// In-world: "RL" after each break, 27 runs over both avatars -> changed(32),
// then link_message, in every script. llCreateLink's 0.1 s delay came between
// the change and the link message.
describe('LSL: llCreateLink, then llMessageLinked', () => {
  it('gives every script changed first', async () => {
    const { send } = await setup(false)
    send('RJ')
    const out = send('RL')
    const linked = ['changed 32 n=4', 'lm L n=4']
    expect(out.Rctl).toEqual(['cmd L n=3', 'end n=4', ...linked])
    for (const name of ['root', 'c2', 'Cctl', 'c3', 'brk']) expect(out[name]).toEqual(linked)
  })
})
