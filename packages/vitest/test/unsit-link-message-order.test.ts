import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const NULL = '00000000-0000-0000-0000-000000000000'

// The in-world probe scripts, without their timestamps. "ctl" in the root runs
// a command heard on its channel; "log" sits in the root and in the child. For
// E to H, ctl first sends the child "sleep" (llSleep(3.0)) or "busy" (a 3 s
// llGetTime spin, here a call that keeps the script busy for 3 s) and sleeps
// 0.5 s, so the child is still in that handler when the two events arrive.
const LSL = {
  ctl: `string info() { return " n=" + (string)llGetNumberOfPrims() + " st=" + (string)llAvatarOnSitTarget() + " rt=" + (string)llAvatarOnLinkSitTarget(1); }
    rep(string s) { llOwnerSay("ctl " + s); }
    default {
      state_entry() { llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION); llListen(7686, "", NULL_KEY, ""); }
      listen(integer c, string n, key id, string m) {
        if (llGetOwnerKey(id) != llGetOwner()) return;
        key a = llAvatarOnSitTarget();
        rep("cmd " + m + info());
        if (m == "A") { llUnSit(a); rep("after-unsit" + info()); llMessageLinked(LINK_SET, 1, "A", ""); rep("end" + info()); }
        else if (m == "B") { llMessageLinked(LINK_SET, 2, "B", ""); rep("after-lm" + info()); llUnSit(a); rep("end" + info()); }
        else if (m == "C") { llUnSit(a); llSleep(1.0); rep("woke" + info()); llMessageLinked(LINK_SET, 3, "C", ""); rep("end" + info()); }
        else if (m == "D") { llMessageLinked(LINK_SET, 4, "D", ""); llSleep(1.0); rep("woke" + info()); llUnSit(a); rep("end" + info()); }
        else if (m == "I") { llSleep(0.5); llUnSit(a); llMessageLinked(LINK_SET, 7, "I", ""); rep("end" + info()); }
        else {
          string w = "sleep"; if (m == "G" || m == "H") w = "busy";
          llMessageLinked(LINK_ALL_CHILDREN, 9, w, ""); llSleep(0.5); rep("sent " + w + info());
          if (m == "E" || m == "G") { llUnSit(a); llMessageLinked(LINK_SET, 5, m, ""); }
          else { llMessageLinked(LINK_SET, 6, m, ""); llUnSit(a); }
          rep("end" + info());
        }
      }
      changed(integer c) { rep("changed " + (string)c + info()); }
      link_message(integer s, integer num, string m, key id) { rep("lm " + m + info()); }
    }`,
  log: `string info() { return " n=" + (string)llGetNumberOfPrims() + " st=" + (string)llAvatarOnSitTarget() + " rt=" + (string)llAvatarOnLinkSitTarget(1); }
    rep(string s) { llOwnerSay("log" + (string)llGetLinkNumber() + " " + s); }
    default {
      changed(integer c) { rep("changed " + (string)c + info()); }
      link_message(integer s, integer num, string m, key id) {
        rep("lm " + m + info());
        if (m == "sleep") { llSleep(3.0); rep("woke" + info()); }
        if (m == "busy") { llSetText("", ZERO_VECTOR, 0.0); rep("done" + info()); }
      }
    }`,
}

const SLUA = {
  ctl: `local function info() return " n=" .. tostring(ll.GetNumberOfPrims()) .. " st=" .. tostring(ll.AvatarOnSitTarget()) .. " rt=" .. tostring(ll.AvatarOnLinkSitTarget(1)) end
    local function rep(s) ll.OwnerSay("ctl " .. s) end
    ll.SitTarget(vector(0, 0, 0.5), rotation(0, 0, 0, 1))
    ll.Listen(7686, "", "", "")
    LLEvents:on("listen", function(c, n, id, m)
      if tostring(ll.GetOwnerKey(id)) ~= tostring(ll.GetOwner()) then return end
      local a = ll.AvatarOnSitTarget()
      rep("cmd " .. m .. info())
      if m == "A" then ll.UnSit(a); rep("after-unsit" .. info()); ll.MessageLinked(LINK_SET, 1, "A", ""); rep("end" .. info())
      elseif m == "B" then ll.MessageLinked(LINK_SET, 2, "B", ""); rep("after-lm" .. info()); ll.UnSit(a); rep("end" .. info())
      elseif m == "C" then ll.UnSit(a); ll.Sleep(1.0); rep("woke" .. info()); ll.MessageLinked(LINK_SET, 3, "C", ""); rep("end" .. info())
      elseif m == "D" then ll.MessageLinked(LINK_SET, 4, "D", ""); ll.Sleep(1.0); rep("woke" .. info()); ll.UnSit(a); rep("end" .. info())
      elseif m == "I" then ll.Sleep(0.5); ll.UnSit(a); ll.MessageLinked(LINK_SET, 7, "I", ""); rep("end" .. info())
      else
        local w = (m == "G" or m == "H") and "busy" or "sleep"
        ll.MessageLinked(LINK_ALL_CHILDREN, 9, w, ""); ll.Sleep(0.5); rep("sent " .. w .. info())
        if m == "E" or m == "G" then ll.UnSit(a); ll.MessageLinked(LINK_SET, 5, m, "")
        else ll.MessageLinked(LINK_SET, 6, m, ""); ll.UnSit(a) end
        rep("end" .. info())
      end
    end)
    LLEvents:on("changed", function(c) rep("changed " .. tostring(c) .. info()) end)
    LLEvents:on("link_message", function(s, num, m, id) rep("lm " .. m .. info()) end)`,
  log: `local function info() return " n=" .. tostring(ll.GetNumberOfPrims()) .. " st=" .. tostring(ll.AvatarOnSitTarget()) .. " rt=" .. tostring(ll.AvatarOnLinkSitTarget(1)) end
    local function rep(s) ll.OwnerSay("log" .. tostring(ll.GetLinkNumber()) .. " " .. s) end
    LLEvents:on("changed", function(c) rep("changed " .. tostring(c) .. info()) end)
    LLEvents:on("link_message", function(s, num, m, id)
      rep("lm " .. m .. info())
      if m == "sleep" then ll.Sleep(3.0); rep("woke" .. info()) end
      if m == "busy" then ll.SetText("", vector(0, 0, 0), 0); rep("done" .. info()) end
    end)`,
}

type Language = 'lsl' | 'slua'

async function run(language: Language, command: string) {
  const sources = language === 'lsl' ? LSL : SLUA
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 114, y: 46, z: 20 } })
  const script = (name: string, source: string) => ({ name, language, source: { source } })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 114, y: 47, z: 20 },
    prims: [
      { scripts: [script('log1', sources.log), script('ctl', sources.ctl)] },
      { scripts: [script('log2', sources.log)] },
    ],
  })
  linkset.prims[1]!.params.position = { x: 0, y: 0.6, z: 0 }
  scripts.log2!.mock('llSetText', (ctx) => { ctx.busy(3000); return undefined })
  for (const s of Object.values(scripts)) s.start()
  linkset.advanceTime(1000)
  expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
  linkset.advanceTime(2000)
  const said = () => Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, s.chat.map((c) => c.text)]))
  const before = said()
  linkset.deliverChat({ channel: 7686, name: 'Test Resident', key: AVATAR, message: command })
  for (let i = 0; i < 60; i++) linkset.advanceTime(100)
  const after = said()
  const lines = (name: string) => after[name]!.slice(before[name]!.length)
  return { ctl: lines('ctl').map((line) => line.replace(/^ctl /, '')), log1: lines('log1'), log2: lines('log2') }
}

const seated = ` n=3 st=${AVATAR} rt=${AVATAR}`
const stood = ` n=2 st=${NULL} rt=${NULL}`
// The child reads its own sit target, which is empty, and the root's.
const childSeated = ` n=3 st=${NULL} rt=${AVATAR}`
const order = (first: string, second: string) => [`${first}${stood}`, `${second}${stood}`]
const logs = (out: Awaited<ReturnType<typeof run>>, first: string, second: string) => {
  expect(out.log1).toEqual(order(`log1 ${first}`, `log1 ${second}`))
  expect(out.log2).toEqual(order(`log2 ${first}`, `log2 ${second}`))
}

// https://wiki.secondlife.com/wiki/LlUnSit
// https://wiki.secondlife.com/wiki/LlMessageLinked
// https://wiki.secondlife.com/wiki/Changed
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm RLVa 2.4.2,
// 2026-11-24) with a two-prim seat: a controller and a logger in the root, a
// logger in the child, the avatar on the root's sit target. Each command ran
// llUnSit and llMessageLinked(LINK_SET) in one listen handler, in LSL (Mono)
// and in SLua. In both, llUnSit took effect at once: the rest of the handler
// and both events read 2 prims and no sitter.
describe.each(['lsl', 'slua'] as const)('llUnSit and llMessageLinked in one handler (%s)', (language) => {
  // In-world: "B" (llMessageLinked, then llUnSit) -> every script, the calling
  // one included, got link_message before changed(32). LSL also with a sleep
  // or a busy receiver between them ("F", "H", 1 run each), and with llSleep(0.5)
  // before the pair (2 runs).
  it('queues link_message before changed when llMessageLinked comes first', async () => {
    const out = await run(language, 'B')
    expect(out.ctl).toEqual([`cmd B${seated}`, `after-lm${seated}`, `end${stood}`, ...order('lm B', 'changed 32')])
    logs(out, 'lm B', 'changed 32')
  })

  // In-world: "C" (llUnSit, llSleep(1), llMessageLinked) -> the other scripts
  // ran changed(32) during the sleep and link_message after it; the calling
  // script got changed(32), then link_message, once its handler ended.
  it('queues changed first when the caller sleeps between llUnSit and llMessageLinked', async () => {
    const out = await run(language, 'C')
    expect(out.ctl).toEqual([`cmd C${seated}`, `woke${stood}`, `end${stood}`, ...order('changed 32', 'lm C')])
    logs(out, 'changed 32', 'lm C')
  })

  // In-world: "D" (llMessageLinked, llSleep(1), llUnSit) -> the other scripts
  // ran link_message during the sleep, still reading 3 prims and the sitter,
  // then changed(32).
  it('lets the other scripts read the sitter in a link_message that runs before llUnSit', async () => {
    const out = await run(language, 'D')
    expect(out.ctl).toEqual([`cmd D${seated}`, `woke${seated}`, `end${stood}`, ...order('lm D', 'changed 32')])
    expect(out.log1).toEqual([`log1 lm D${seated}`, `log1 changed 32${stood}`])
    expect(out.log2).toEqual([`log2 lm D${childSeated}`, `log2 changed 32${stood}`])
  })

  // In-world: "F" and "H" (llMessageLinked, then llUnSit) while the child was
  // asleep or busy in an earlier link_message -> the child ran link_message,
  // then changed(32), once that handler ended; so did the other scripts.
  it.each([['F', 'sleep', 'woke'], ['H', 'busy', 'done']])('queues link_message first for a child in a handler (%s: %s)', async (command, how, ended) => {
    const out = await run(language, command)
    expect(out.ctl).toEqual([`cmd ${command}${seated}`, `sent ${how}${seated}`, `end${stood}`, ...order(`lm ${command}`, 'changed 32')])
    expect(out.log1).toEqual(order(`log1 lm ${command}`, 'log1 changed 32'))
    expect(out.log2).toEqual([`log2 lm ${how}${childSeated}`, `log2 ${ended}${stood}`, ...order(`log2 lm ${command}`, 'log2 changed 32')])
  })
})

// In-world (SLua), Aditi beta grid, 2026-11-24: changed(32) from llUnSit came
// at the end of the simulator frame of the call. If llUnSit held the caller
// past that frame end, every script that was not asleep in a handler got
// changed(32) first; if the caller went on in the same frame, the link message
// came first. Timestamps showed llUnSit straight after a sleep returning in
// about 0.1 ms with a sitter wearing under 80 attached prims, and only in the
// next frame with one wearing 514 or 557. Who owned the seat, who gave the
// command, whether a listen or a timer ran the handler, and whether the seat
// was new made no difference. After a sleep:
// - The first test avatar, wearing 557 attached prims: changed(32) first in
//   13 of 13 runs, and in "I", "G" and "E" below. #702 saw 3 of 6 with it.
// - The second test avatar wearing 514 attached prims: changed(32) first,
//   2 of 2. Wearing 257: link_message first, 2 of 2.
// - The second test avatar wearing under 80 attached prims: link_message first
//   in every script, 11 of 11 runs with llUnSit straight after the sleep, 11
//   of 11 with a say and some reads between, and in "I", "G" and "E" below.
//   One run with a 20,000-step loop before llUnSit gave changed(32) first, and
//   one with a 100,000-step loop link_message first.
// Avatars in rezless wear nothing, so rezless gives the order of a sitter
// wearing few attached prims: after a sleep it raises changed(32) a frame
// late, as in LSL.
describe('SLua: llUnSit, then llMessageLinked', () => {
  // In-world: "A" -> changed(32), then link_message, in every script, 4 of 4
  // runs with the first test avatar; with the second, wearing one attached
  // prim, link_message first in 3 of 4.
  it('queues changed before link_message, one of the orders Second Life gives', async () => {
    const out = await run('slua', 'A')
    expect(out.ctl).toEqual([`cmd A${seated}`, `after-unsit${stood}`, `end${stood}`, ...order('changed 32', 'lm A')])
    logs(out, 'changed 32', 'lm A')
  })

  // In-world: "I" (llSleep(0.5), llUnSit, llMessageLinked) with the second
  // test avatar, wearing one attached prim (3 runs) -> link_message, then
  // changed(32), in every script.
  it('queues link_message first in every script after the caller slept', async () => {
    const out = await run('slua', 'I')
    expect(out.ctl).toEqual([`cmd I${seated}`, `end${stood}`, ...order('lm I', 'changed 32')])
    logs(out, 'lm I', 'changed 32')
  })

  // In-world: "I" with the first test avatar (2 runs, and 2 more with a 0.5 s
  // spin in place of the sleep) -> changed(32), then link_message, in every
  // script, the caller included.
  it.fails('queues changed first in every script after the caller slept, as for a sitter wearing many attached prims', async () => {
    const out = await run('slua', 'I')
    expect(out.ctl).toEqual([`cmd I${seated}`, `end${stood}`, ...order('changed 32', 'lm I')])
    logs(out, 'changed 32', 'lm I')
  })

  // In-world: "G", the child busy in an earlier link_message, with the second
  // test avatar wearing one attached prim (2 runs) -> the root's scripts got
  // link_message, then changed(32); the child got them in that order once its
  // handler ended.
  it('queues link_message first in the root for a caller that slept and a child busy in an earlier handler', async () => {
    const out = await run('slua', 'G')
    expect(out.ctl).toEqual([`cmd G${seated}`, `sent busy${seated}`, `end${stood}`, ...order('lm G', 'changed 32')])
    expect(out.log1).toEqual(order('log1 lm G', 'log1 changed 32'))
  })

  // In-world: the busy child ran done, link_message, changed(32), 2 of 2.
  // The change falls due a frame after llUnSit, behind the link message.
  it('gives the busy child link_message first too', async () => {
    const out = await run('slua', 'G')
    expect(out.log2).toEqual([`log2 lm busy${childSeated}`, `log2 done${stood}`, ...order('log2 lm G', 'log2 changed 32')])
  })

  // In-world: "G" with the first test avatar (4 runs) -> every script, the
  // busy child included, got changed(32), then link_message.
  it.fails('queues changed first for a caller that slept and a child busy in an earlier handler, as for a sitter wearing many attached prims', async () => {
    const out = await run('slua', 'G')
    expect(out.ctl).toEqual([`cmd G${seated}`, `sent busy${seated}`, `end${stood}`, ...order('changed 32', 'lm G')])
    expect(out.log1).toEqual(order('log1 changed 32', 'log1 lm G'))
    expect(out.log2).toEqual([`log2 lm busy${childSeated}`, `log2 done${stood}`, ...order('log2 changed 32', 'log2 lm G')])
  })

  // In-world: "E", the child asleep in an earlier link_message -> the child
  // ran link_message, then changed(32), once it woke, with either test avatar
  // (1 run with the second, 3 with the first). With the second, wearing one
  // attached prim, the root's scripts got link_message first too.
  it('gives a child asleep in an earlier handler link_message first', async () => {
    const out = await run('slua', 'E')
    expect(out.ctl).toEqual([`cmd E${seated}`, `sent sleep${seated}`, `end${stood}`, ...order('lm E', 'changed 32')])
    expect(out.log1).toEqual(order('log1 lm E', 'log1 changed 32'))
    expect(out.log2).toEqual([`log2 lm sleep${childSeated}`, `log2 woke${stood}`, ...order('log2 lm E', 'log2 changed 32')])
  })

  // In-world: with the first test avatar, the root's scripts, the caller that
  // had slept included, got changed(32) first.
  it.fails('gives the root\'s scripts changed first while the child sleeps, as for a sitter wearing many attached prims', async () => {
    const out = await run('slua', 'E')
    expect(out.ctl).toEqual([`cmd E${seated}`, `sent sleep${seated}`, `end${stood}`, ...order('changed 32', 'lm E')])
    expect(out.log1).toEqual(order('log1 changed 32', 'log1 lm E'))
  })
})

// In-world (LSL, Mono): with llUnSit first, the order changed from run to run
// and from session to session, with nothing in the script to tell which.
// llUnSit then llMessageLinked with no call between gave link_message first in
// 17 of 20 runs; with one call or a 300-step loop between them, changed first
// in 14 of 14; with an llOwnerSay of four reads between them, changed first in
// 5 of 5 in one session and link_message first in 3 of 3 in another; after
// llSleep(0.5) or a 0.5 s spin, link_message first in 16 of 17. Where
// link_message came first, changed(32) was raised a frame after llUnSit;
// where changed came first, it was raised in the same frame and the caller
// went on a frame later, and every script, the caller that had slept
// included, got changed(32) first. rezless raises changed(32) with llUnSit,
// as SLua does, so with no sleep before it, it gives the second of those
// orders.
describe('LSL: llUnSit, then llMessageLinked', () => {
  it('queues changed before link_message, one of the orders Second Life gives', async () => {
    const out = await run('lsl', 'A')
    expect(out.ctl).toEqual([`cmd A${seated}`, `after-unsit${stood}`, `end${stood}`, ...order('changed 32', 'lm A')])
    logs(out, 'changed 32', 'lm A')
  })

  // In-world: "I" (llSleep(0.5), llUnSit, llMessageLinked) -> link_message,
  // then changed(32), in every script, 3 of 3 runs.
  it('queues link_message first in every script after the caller slept', async () => {
    const out = await run('lsl', 'I')
    expect(out.ctl).toEqual([`cmd I${seated}`, `end${stood}`, ...order('lm I', 'changed 32')])
    logs(out, 'lm I', 'changed 32')
  })
})

// The same probe with llSetColor in place of llUnSit, in a lone prim:
// recolour, then llMessageLinked(LINK_THIS), straight away ("N") or after
// llSleep(0.5) ("S"). In-world, CHANGED_COLOR came a frame after the link
// message in both languages: 3 of 3 SLua and 2 of 3 LSL runs for "N", 3 of 3
// in each for "S". The prim change comes a simulator frame after the call.
describe('a recolour, then llMessageLinked', () => {
  const colour = {
    lsl: `integer k; default { state_entry() { llListen(7686, "", NULL_KEY, ""); }
      listen(integer c, string n, key id, string m) {
        if (m == "S") llSleep(0.5);
        ++k; llSetColor(<(k & 1), ((k >> 1) & 1), 0.5>, ALL_SIDES); llMessageLinked(LINK_THIS, 1, m, "");
      }
      changed(integer c) { llOwnerSay("changed " + (string)c); }
      link_message(integer s, integer num, string m, key id) { llOwnerSay("lm"); } }`,
    slua: `local k = 0
      ll.Listen(7686, "", "", "")
      LLEvents:on("listen", function(c, n, id, m)
        if m == "S" then ll.Sleep(0.5) end
        k += 1; ll.SetColor(vector(k % 2, (k // 2) % 2, 0.5), ALL_SIDES); ll.MessageLinked(LINK_THIS, 1, m, "")
      end)
      LLEvents:on("changed", function(c) ll.OwnerSay("changed " .. c) end)
      LLEvents:on("link_message", function(s, num, m, id) ll.OwnerSay("lm") end)`,
  }
  const recolour = async (language: Language, command: string) => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'col', language, source: { source: colour[language] } }] }] })
    scripts.col!.start()
    linkset.advanceTime(100)
    linkset.deliverChat({ channel: 7686, name: 'Test Resident', key: AVATAR, message: command })
    for (let i = 0; i < 30; i++) linkset.advanceTime(100)
    return scripts.col!.chat.map((c) => c.text)
  }
  it.each(['lsl', 'slua'] as const)('runs link_message before CHANGED_COLOR after a sleep (%s)', async (language) => {
    expect(await recolour(language, 'S')).toEqual(['lm', 'changed 2'])
  })
  it.each(['lsl', 'slua'] as const)('runs link_message before CHANGED_COLOR without a sleep (%s)', async (language) => {
    expect(await recolour(language, 'N')).toEqual(['lm', 'changed 2'])
  })
})
