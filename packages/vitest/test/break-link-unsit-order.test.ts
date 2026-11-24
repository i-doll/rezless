import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

// The in-world probe scripts, without their timestamps and the command that
// linked the broken-off prim back in between runs. "ctl" in the root runs a
// command heard on its channel: it finds the prim named "brk", breaks it off,
// and then calls llMessageLinked(LINK_SET). "Z" and "Y" sleep 0.5 s first;
// "K" and "Z" call llUnSit on the sitter between the two. "log" sits in each
// of the three prims and names its prim in what it says.
const LSL = {
  ctl: `string info() { return " n=" + (string)llGetNumberOfPrims() + " st=" + (string)llAvatarOnSitTarget(); }
    rep(string s) { llOwnerSay("ctl " + s); }
    integer findBrk() { integer i; for (i = 2; i <= llGetObjectPrimCount(llGetKey()); ++i) if (llGetLinkName(i) == "probe brk") return i; return 0; }
    default {
      state_entry() { llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION); llListen(7702, "", NULL_KEY, ""); llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      listen(integer c, string n, key id, string m) {
        if (llGetOwnerKey(id) != llGetOwner()) return;
        key a = llAvatarOnSitTarget();
        integer b = findBrk();
        rep("cmd " + m + " b=" + (string)b + info());
        if (m == "Z" || m == "Y") llSleep(0.5);
        llBreakLink(b);
        if (m == "K" || m == "Z") llUnSit(a);
        llMessageLinked(LINK_SET, 1, m, "");
        rep("end" + info());
      }
      changed(integer c) { rep("changed " + (string)c + info()); }
      link_message(integer s, integer num, string m, key id) { rep("lm " + m + info()); }
    }`,
  log: `string info() { return " n=" + (string)llGetNumberOfPrims() + " st=" + (string)llAvatarOnLinkSitTarget(1); }
    rep(string s) { llOwnerSay(llGetSubString(llGetObjectName(), 6, -1) + " " + s); }
    default {
      changed(integer c) { rep("changed " + (string)c + info()); }
      link_message(integer s, integer num, string m, key id) { rep("lm " + m + info()); }
    }`,
}

const SLUA = {
  ctl: `local function info() return " n=" .. tostring(ll.GetNumberOfPrims()) .. " st=" .. tostring(ll.AvatarOnSitTarget()) end
    local function rep(s) ll.OwnerSay("ctl " .. s) end
    local function findBrk() for i = 2, ll.GetObjectPrimCount(ll.GetKey()) do if ll.GetLinkName(i) == "probe brk" then return i end end return 0 end
    ll.SitTarget(vector(0, 0, 0.5), rotation(0, 0, 0, 1))
    ll.Listen(7702, "", "", "")
    ll.RequestPermissions(ll.GetOwner(), PERMISSION_CHANGE_LINKS)
    LLEvents:on("listen", function(c, n, id, m)
      if tostring(ll.GetOwnerKey(id)) ~= tostring(ll.GetOwner()) then return end
      local a = ll.AvatarOnSitTarget()
      local b = findBrk()
      rep("cmd " .. m .. " b=" .. tostring(b) .. info())
      if m == "Z" or m == "Y" then ll.Sleep(0.5) end
      ll.BreakLink(b)
      if m == "K" or m == "Z" then ll.UnSit(a) end
      ll.MessageLinked(LINK_SET, 1, m, "")
      rep("end" .. info())
    end)
    LLEvents:on("changed", function(c) rep("changed " .. tostring(c) .. info()) end)
    LLEvents:on("link_message", function(s, num, m, id) rep("lm " .. m .. info()) end)`,
  log: `local function info() return " n=" .. tostring(ll.GetNumberOfPrims()) .. " st=" .. tostring(ll.AvatarOnLinkSitTarget(1)) end
    local function rep(s) ll.OwnerSay(ll.GetSubString(ll.GetObjectName(), 7, -1) .. " " .. s) end
    LLEvents:on("changed", function(c) rep("changed " .. tostring(c) .. info()) end)
    LLEvents:on("link_message", function(s, num, m, id) rep("lm " .. m .. info()) end)`,
}

type Language = 'lsl' | 'slua'

async function run(language: Language, command: string, seated = true) {
  const sources = language === 'lsl' ? LSL : SLUA
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 114, y: 46, z: 20 } })
  const script = (name: string, source: string) => ({ name, language, source: { source } })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 114, y: 47, z: 20 },
    prims: [
      { name: 'probe seat', scripts: [script('seat', sources.log), script('ctl', sources.ctl)] },
      { name: 'probe kid', scripts: [script('kid', sources.log)] },
      { name: 'probe brk', scripts: [script('brk', sources.log)] },
    ],
  })
  linkset.prims[1]!.params.position = { x: 0, y: 0.6, z: 0 }
  linkset.prims[2]!.params.position = { x: 0, y: -0.6, z: 0 }
  linkset.startAll()
  linkset.advanceTime(500)
  scripts.ctl!.grantPermissions()
  linkset.advanceTime(500)
  if (seated) expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
  linkset.advanceTime(2000)
  const said = () => Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, s.chat.map((c) => c.text)]))
  const before = said()
  linkset.deliverChat({ channel: 7702, name: 'Test Resident', key: AVATAR, message: command })
  for (let i = 0; i < 60; i++) linkset.advanceTime(100)
  const after = said()
  const lines = (name: string) => after[name]!.slice(before[name]!.length).map((line) => line.replace(/^\w+ /, ''))
  return { ctl: lines('ctl'), seat: lines('seat'), kid: lines('kid'), brk: lines('brk') }
}

const NULL = '00000000-0000-0000-0000-000000000000'
// After the break: two prims and no sitter.
const split = ` n=2 st=${NULL}`
const alone = ` n=1 st=${NULL}`
const start = (command: string, seated = true) =>
  [seated ? `cmd ${command} b=3 n=4 st=${AVATAR}` : `cmd ${command} b=3 n=3 st=${NULL}`, `end${split}`]
const order = (first: string, second: string) => [`${first}${split}`, `${second}${split}`]
const changedFirst = (command: string) => order('changed 32', `lm ${command}`)
const linkFirst = (command: string) => order(`lm ${command}`, 'changed 32')

// https://wiki.secondlife.com/wiki/LlBreakLink
// https://wiki.secondlife.com/wiki/LlUnSit
// https://wiki.secondlife.com/wiki/LlMessageLinked
// https://wiki.secondlife.com/wiki/Changed
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm RLVa 2.4.2,
// 2026-11-24) with a three-prim seat in each language: the controller and a
// logger in the root, a logger in each child, the avatar on the root's sit
// target. Breaking a child off stood the avatar at once, so the llUnSit after
// it did nothing: "K" gave what "J" gave and "Z" what "Y" gave. In every run
// each script got one changed(32), and the prim broken off got nothing else.
describe.each(['lsl', 'slua'] as const)('llBreakLink with a sitter, then llMessageLinked (%s)', (language) => {
  // In-world: "K" (LSL 3 runs, SLua 2) and "J" (1 run each) -> changed(32),
  // then link_message, in every script.
  it.each(['K', 'J'])('queues changed before link_message (%s)', async (command) => {
    const out = await run(language, command)
    expect(out.ctl).toEqual([...start(command), ...changedFirst(command)])
    expect(out.seat).toEqual(changedFirst(command))
    expect(out.kid).toEqual(changedFirst(command))
    expect(out.brk).toEqual([`changed 32${alone}`])
  })
})

// In SLua the order after a sleep depended on which test avatar sat. With one,
// the caller of llBreakLink or llBreakAllLinks got changed(32) before its
// link_message in 15 of 15 runs over four sessions. With the other, it got
// link_message first in 7 of 7 runs over two sessions, one of them shared
// with the first avatar, runs taking turns, on the same kind of seat. A
// script that depends on either order can break in Second Life. llUnSit gave
// the same two orders, less steadily with the first avatar (3 of 6 runs
// changed first). rezless gives the first avatar's order, which is the order
// it gives for llUnSit in SLua.
describe('SLua: llSleep, then llBreakLink with a sitter, then llMessageLinked', () => {
  // In-world, with the first avatar: "Z" (3 runs) and "Y" (2 runs) ->
  // changed(32), then link_message, in every script, the caller that slept
  // included.
  it.each(['Z', 'Y'])('queues changed before link_message in every script, one of the orders Second Life gives (%s)', async (command) => {
    const out = await run('slua', command)
    expect(out.ctl).toEqual([...start(command), ...changedFirst(command)])
    expect(out.seat).toEqual(changedFirst(command))
    expect(out.kid).toEqual(changedFirst(command))
    expect(out.brk).toEqual([`changed 32${alone}`])
  })
})

describe('LSL: llSleep, then llBreakLink with a sitter, then llMessageLinked', () => {
  // In-world: "Z" (3 runs) and "Y" (2 runs) -> link_message, then
  // changed(32), in every script.
  it.each(['Z', 'Y'])('gives the caller link_message first (%s)', async (command) => {
    const out = await run('lsl', command)
    expect(out.ctl).toEqual([...start(command), ...linkFirst(command)])
    expect(out.brk).toEqual([`changed 32${alone}`])
  })

  // rezless holds back only the caller's change after its handler slept, so
  // the scripts that were not in a handler run changed(32) first.
  it.fails.each(['Z', 'Y'])('gives the other scripts link_message first (%s)', async (command) => {
    const out = await run('lsl', command)
    expect(out.seat).toEqual(linkFirst(command))
    expect(out.kid).toEqual(linkFirst(command))
  })
})

// In-world the avatar sat on the other seat, so nothing stood; here it doesn't sit.
describe.each(['lsl', 'slua'] as const)('llSleep, then llBreakLink with no sitter, then llMessageLinked (%s)', (language) => {
  // In-world: "Z" (3 runs) and "Y" (2 runs) in each language -> link_message,
  // then changed(32), in every script.
  it.each(['Z', 'Y'])('gives the caller link_message first (%s)', async (command) => {
    const out = await run(language, command, false)
    expect(out.ctl).toEqual([...start(command, false), ...linkFirst(command)])
  })

  // rezless runs changed(32) first in the scripts that were not in a handler.
  it.fails.each(['Z', 'Y'])('gives the other scripts link_message first (%s)', async (command) => {
    const out = await run(language, command, false)
    expect(out.seat).toEqual(linkFirst(command))
    expect(out.kid).toEqual(linkFirst(command))
  })
})

// In-world, with no sleep and no sitter, LSL gave changed(32) first in the
// root's two scripts and link_message first in the child's, 4 of 4 runs ("K"
// 3, "J" 1). SLua varied: that order in 2 runs, link_message first in every
// script in the other 2. rezless runs changed(32) first in every script.
describe('LSL: llBreakLink with no sitter, then llMessageLinked', () => {
  it('gives the root\'s scripts changed first', async () => {
    const out = await run('lsl', 'J', false)
    expect(out.ctl).toEqual([...start('J', false), ...changedFirst('J')])
    expect(out.seat).toEqual(changedFirst('J'))
    expect(out.brk).toEqual([`changed 32${alone}`])
  })

  it.fails('gives the child link_message first', async () => {
    const out = await run('lsl', 'J', false)
    expect(out.kid).toEqual(linkFirst('J'))
  })
})

// A follow-up probe on the same day: a controller and a logger in the root of
// a lone seat ("A": llSleep(0.5), llBreakLink(LINK_THIS)) and of a two-prim
// seat with a logger in the child ("B": llSleep(0.5), llBreakAllLinks()), the
// avatar on the root's sit target, then llMessageLinked(LINK_SET).
const BREAKS = {
  lsl: `string info() { return " n=" + (string)llGetNumberOfPrims(); }
    rep(string s) { llOwnerSay(s); }
    default {
      state_entry() { llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION); llListen(7712, "", NULL_KEY, ""); llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      listen(integer c, string n, key id, string m) {
        rep("cmd " + m + info());
        llSleep(0.5);
        if (m == "A") llBreakLink(LINK_THIS); else llBreakAllLinks();
        llMessageLinked(LINK_SET, 1, m, "");
        rep("end" + info());
      }
      changed(integer c) { rep("changed " + (string)c + info()); }
      link_message(integer s, integer num, string m, key id) { rep("lm " + m + info()); }
    }`,
  slua: `local function info() return " n=" .. tostring(ll.GetNumberOfPrims()) end
    local rep = ll.OwnerSay
    ll.SitTarget(vector(0, 0, 0.5), rotation(0, 0, 0, 1))
    ll.Listen(7712, "", "", "")
    ll.RequestPermissions(ll.GetOwner(), PERMISSION_CHANGE_LINKS)
    LLEvents:on("listen", function(c, n, id, m)
      rep("cmd " .. m .. info())
      ll.Sleep(0.5)
      if m == "A" then ll.BreakLink(LINK_THIS) else ll.BreakAllLinks() end
      ll.MessageLinked(LINK_SET, 1, m, "")
      rep("end" .. info())
    end)
    LLEvents:on("changed", function(c) rep("changed " .. tostring(c) .. info()) end)
    LLEvents:on("link_message", function(s, num, m, id) rep("lm " .. m .. info()) end)`,
}

async function runBreak(language: Language, command: 'A' | 'B') {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 114, y: 46, z: 20 } })
  const script = (name: string, source: string) => ({ name, language, source: { source } })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 114, y: 47, z: 20 },
    prims: [
      { name: 'probe seat', scripts: [script('seat', (language === 'lsl' ? LSL : SLUA).log), script('ctl', BREAKS[language])] },
      ...command === 'B' ? [{ name: 'probe kid', scripts: [script('kid', (language === 'lsl' ? LSL : SLUA).log)] }] : [],
    ],
  })
  if (command === 'B') linkset.prims[1]!.params.position = { x: 0, y: 0.6, z: 0 }
  linkset.startAll()
  linkset.advanceTime(500)
  scripts.ctl!.grantPermissions()
  linkset.advanceTime(500)
  expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
  linkset.advanceTime(2000)
  const before = Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, s.chat.length]))
  linkset.deliverChat({ channel: 7712, name: 'Test Resident', key: AVATAR, message: command })
  for (let i = 0; i < 60; i++) linkset.advanceTime(100)
  const lines = (name: string) => scripts[name]?.chat.slice(before[name]).map((c) => c.text.replace(/^seat |^kid /, '').replace(/ st=\S+$/, ''))
  return { ctl: lines('ctl'), seat: lines('seat'), kid: lines('kid') }
}

describe('llSleep, then llBreakLink(LINK_THIS) on a seated lone prim or llBreakAllLinks, then llMessageLinked', () => {
  const first = (a: string, b: string) => [`${a} n=1`, `${b} n=1`]

  // In-world, with the first avatar: "A" and "B", 2 runs each ->
  // changed(32), then link_message, in the root's scripts, the caller that
  // slept included. The child broken off by "B" got changed(32) alone.
  it.each(['A', 'B'] as const)('SLua queues changed first in the root, one of the orders Second Life gives (%s)', async (command) => {
    const out = await runBreak('slua', command)
    const seated = command === 'A' ? ' n=2' : ' n=3'
    expect(out.ctl).toEqual([`cmd ${command}${seated}`, 'end n=1', ...first('changed 32', `lm ${command}`)])
    expect(out.seat).toEqual(first('changed 32', `lm ${command}`))
    if (command === 'B') expect(out.kid).toEqual(['changed 32 n=1'])
  })

  // In-world: "A" and "B", 2 runs each -> link_message, then changed(32), in
  // the root's scripts.
  it.each(['A', 'B'] as const)('LSL gives the caller link_message first (%s)', async (command) => {
    const out = await runBreak('lsl', command)
    const seated = command === 'A' ? ' n=2' : ' n=3'
    expect(out.ctl).toEqual([`cmd ${command}${seated}`, 'end n=1', ...first(`lm ${command}`, 'changed 32')])
    if (command === 'B') expect(out.kid).toEqual(['changed 32 n=1'])
  })

  // rezless holds back only the caller's change after its handler slept.
  it.fails.each(['A', 'B'] as const)('LSL gives the logger in the root link_message first (%s)', async (command) => {
    const out = await runBreak('lsl', command)
    expect(out.seat).toEqual(first(`lm ${command}`, 'changed 32'))
  })
})

// A third probe: a two-prim seat holding only a controller, which slept 4 s,
// broke off the child with llBreakLink(2), then called
// llMessageLinked(LINK_THIS). The owner touched the seat during the sleep.
// In-world the touch ran first in every run: then link_message and
// changed(32) in LSL (2 of 2), and in SLua changed(32) and link_message with
// the first avatar (2 of 2), link_message and changed(32) with the other
// (2 of 2). rezless runs the touch after both.
describe('a touch during the sleep before llBreakLink with a sitter', () => {
  const SOURCES = {
    lsl: `rep(string s) { llOwnerSay(s); }
      default {
        state_entry() { llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION); llListen(7723, "", NULL_KEY, ""); llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
        listen(integer c, string n, key id, string m) { llSleep(4.0); llBreakLink(2); llMessageLinked(LINK_THIS, 1, m, ""); }
        touch_start(integer n) { rep("touch"); }
        changed(integer c) { rep("changed " + (string)c); }
        link_message(integer s, integer num, string m, key id) { rep("lm"); }
      }`,
    slua: `ll.SitTarget(vector(0, 0, 0.5), rotation(0, 0, 0, 1))
      ll.Listen(7723, "", "", "")
      ll.RequestPermissions(ll.GetOwner(), PERMISSION_CHANGE_LINKS)
      LLEvents:on("listen", function(c, n, id, m) ll.Sleep(4); ll.BreakLink(2); ll.MessageLinked(LINK_THIS, 1, m, "") end)
      LLEvents:on("touch_start", function(n) ll.OwnerSay("touch") end)
      LLEvents:on("changed", function(c) ll.OwnerSay("changed " .. tostring(c)) end)
      LLEvents:on("link_message", function(s, num, m, id) ll.OwnerSay("lm") end)`,
  }
  const touched = async (language: Language) => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 114, y: 46, z: 20 } })
    const { linkset, scripts } = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 114, y: 47, z: 20 },
      prims: [{ scripts: [{ name: 'ctl', language, source: { source: SOURCES[language] } }] }, {}],
    })
    linkset.prims[1]!.params.position = { x: 0, y: 0.6, z: 0 }
    linkset.startAll()
    linkset.advanceTime(500)
    scripts.ctl!.grantPermissions()
    linkset.advanceTime(500)
    expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
    linkset.advanceTime(2000)
    const before = scripts.ctl!.chat.length
    linkset.deliverChat({ channel: 7723, name: 'Test Resident', key: AVATAR, message: 'T' })
    linkset.advanceTime(1500)
    linkset.touch(1, { avatar: { key: AVATAR, name: 'Test Resident' } })
    for (let i = 0; i < 60; i++) linkset.advanceTime(100)
    return scripts.ctl!.chat.slice(before).map((c) => c.text)
  }

  it.fails('LSL runs the touch, then link_message, then changed', async () => {
    expect(await touched('lsl')).toEqual(['touch', 'lm', 'changed 32'])
  })

  it.fails('SLua runs the touch first, then changed and link_message as without it', async () => {
    expect(await touched('slua')).toEqual(['touch', 'changed 32', 'lm'])
  })
})
