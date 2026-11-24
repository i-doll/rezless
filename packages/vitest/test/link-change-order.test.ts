import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

// The in-world probe scripts, without their timestamps. A four-prim object:
// a logger in each prim, and a controller in the root ("R") and in the first
// child ("C"). The controller named by a command's first letter runs it: "J"
// breaks off the prim named "brk", "Y" sleeps 0.5 s first, and "L" links that
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

async function setup(seated: boolean) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 114, y: 46, z: 20 } })
  const script = (name: string, source: string) => ({ name, language: 'lsl' as const, source: { source } })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 114, y: 47, z: 20 },
    prims: [
      { name: 'probe root', scripts: [script('root', LOG), script('Rctl', CTL)] },
      { name: 'probe c2', scripts: [script('c2', LOG), script('Cctl', CTL)] },
      { name: 'probe c3', scripts: [script('c3', LOG)] },
      { name: 'probe brk', scripts: [script('brk', LOG)] },
    ],
  })
  linkset.prims[1]!.params.position = { x: 0, y: 0.6, z: 0 }
  linkset.prims[2]!.params.position = { x: 0, y: -0.6, z: 0 }
  linkset.prims[3]!.params.position = { x: 0, y: 1.2, z: 0 }
  linkset.startAll()
  linkset.advanceTime(500)
  scripts.Rctl!.grantPermissions()
  scripts.Cctl!.grantPermissions()
  linkset.advanceTime(500)
  if (seated) expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
  linkset.advanceTime(2000)
  const send = (command: string) => {
    const before = Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, s.chat.length]))
    linkset.deliverChat({ channel: 7711, name: 'Test Resident', key: AVATAR, message: command })
    for (let i = 0; i < 40; i++) linkset.advanceTime(100)
    return Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, s.chat.slice(before[name]).map((c) => c.text.replace(/^\w+ /, ''))]))
  }
  return { send }
}

const lmFirst = (command: string) => [`lm ${command} n=3`, 'changed 32 n=3']
const changedFirst = (command: string) => ['changed 32 n=3', `lm ${command} n=3`]

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

// In-world: "CJ" from the child's controller, no sleep. The caller's handler
// went on a frame after llBreakLink, and changed(32) came in that frame,
// before the link message, in the root's two scripts and the caller: 7 of 8
// runs. In the other scripts it depended on the avatar: changed(32) first in
// 3 of 3 runs with one, link_message first in 5 of 5 with the other. rezless
// doesn't model the frame the call took, and runs link_message first.
describe('LSL: llBreakLink from a child, then llMessageLinked', () => {
  it.fails('gives the root\'s scripts and the caller changed first', async () => {
    const out = (await setup(false)).send('CJ')
    expect(out.Cctl).toEqual(['cmd J n=4', 'end n=3', ...changedFirst('J')])
    expect(out.root).toEqual(changedFirst('J'))
    expect(out.Rctl).toEqual(changedFirst('J'))
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
