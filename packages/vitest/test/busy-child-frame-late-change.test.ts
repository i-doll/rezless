import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

// The in-world probe scripts. "ctl" sits in the root of a three-prim object with a "log"
// in every prim. On a command it sends link 2 "busy", which keeps that script busy for
// 3 s (a llGetTime spin in-world, here a call that keeps the script busy as long), sleeps
// 0.5 s, makes a change, then sends llMessageLinked(LINK_SET): "G" stands the avatar on
// the root's sit target, "K" recolours link 2 and "B" breaks off link 3. "KK" recolours
// link 2, sends link message "a", recolours it again and sends "b"; "KS" sleeps 0.1 s
// before the second recolour; "K4" recolours link 2 four times and sends "a".
const LSL = {
  ctl: `integer k;
    rep(string s) { llOwnerSay(s); }
    default {
      state_entry() { llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION); llListen(7720, "", NULL_KEY, ""); llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      listen(integer c, string n, key id, string m) {
        if (id != llGetOwner()) return;
        llMessageLinked(2, 9, "busy", "");
        llSleep(0.5);
        ++k;
        if (m == "G") llUnSit(llAvatarOnSitTarget());
        else if (m == "K") llSetLinkColor(2, <(k & 1), 0.5, ((k >> 1) & 1)>, ALL_SIDES);
        else if (m == "B") llBreakLink(3);
        else if (m == "KK" || m == "KS") {
          llSetLinkColor(2, <1, 0, 0>, ALL_SIDES); llMessageLinked(LINK_SET, 5, "a", "");
          if (m == "KS") llSleep(0.1);
          llSetLinkColor(2, <0, 1, 0>, ALL_SIDES); m = "b";
        } else if (m == "K4") {
          llSetLinkColor(2, <1, 0, 0>, ALL_SIDES); llSetLinkColor(2, <0, 1, 0>, ALL_SIDES);
          llSetLinkColor(2, <0, 0, 1>, ALL_SIDES); llSetLinkColor(2, <1, 1, 0>, ALL_SIDES); m = "a";
        }
        llMessageLinked(LINK_SET, 5, m, "");
        rep("end");
      }
      changed(integer c) { rep("changed " + (string)c); }
      link_message(integer s, integer num, string m, key id) { if (m != "busy") rep("lm " + m); }
    }`,
  log: `rep(string s) { llOwnerSay(s); }
    default {
      changed(integer c) { rep("changed " + (string)c); }
      link_message(integer s, integer num, string m, key id) {
        rep("lm " + m);
        if (m == "busy") { llSetText("", ZERO_VECTOR, 0.0); rep("done"); }
      }
    }`,
}

const SLUA = {
  ctl: `local k = 0
    local function rep(s) ll.OwnerSay(s) end
    ll.SitTarget(vector(0, 0, 0.5), rotation(0, 0, 0, 1))
    ll.Listen(7720, "", "", "")
    ll.RequestPermissions(ll.GetOwner(), PERMISSION_CHANGE_LINKS)
    LLEvents:on("listen", function(c, n, id, m)
      if tostring(id) ~= tostring(ll.GetOwner()) then return end
      ll.MessageLinked(2, 9, "busy", "")
      ll.Sleep(0.5)
      k += 1
      if m == "G" then ll.UnSit(ll.AvatarOnSitTarget())
      elseif m == "K" then ll.SetLinkColor(2, vector(k % 2, 0.5, (k // 2) % 2), ALL_SIDES)
      elseif m == "B" then ll.BreakLink(3)
      elseif m == "KK" or m == "KS" then
        ll.SetLinkColor(2, vector(1, 0, 0), ALL_SIDES); ll.MessageLinked(LINK_SET, 5, "a", "")
        if m == "KS" then ll.Sleep(0.1) end
        ll.SetLinkColor(2, vector(0, 1, 0), ALL_SIDES); m = "b"
      elseif m == "K4" then
        ll.SetLinkColor(2, vector(1, 0, 0), ALL_SIDES); ll.SetLinkColor(2, vector(0, 1, 0), ALL_SIDES)
        ll.SetLinkColor(2, vector(0, 0, 1), ALL_SIDES); ll.SetLinkColor(2, vector(1, 1, 0), ALL_SIDES); m = "a"
      end
      ll.MessageLinked(LINK_SET, 5, m, "")
      rep("end")
    end)
    LLEvents:on("changed", function(c) rep("changed " .. tostring(c)) end)
    LLEvents:on("link_message", function(s, num, m, id) if m ~= "busy" then rep("lm " .. m) end end)`,
  log: `local function rep(s) ll.OwnerSay(s) end
    LLEvents:on("changed", function(c) rep("changed " .. tostring(c)) end)
    LLEvents:on("link_message", function(s, num, m, id)
      rep("lm " .. m)
      if m == "busy" then ll.SetText("", vector(0, 0, 0), 0); rep("done") end
    end)`,
}

async function run(language: 'lsl' | 'slua', command: string) {
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
      { scripts: [script('log3', sources.log)] },
    ],
  })
  linkset.prims[1]!.params.position = { x: 0, y: 0.6, z: 0 }
  linkset.prims[2]!.params.position = { x: 0, y: 1.2, z: 0 }
  scripts.log2!.mock('llSetText', (ctx) => { ctx.busy(3000); return undefined })
  linkset.startAll()
  linkset.advanceTime(500)
  scripts.ctl!.grantPermissions()
  linkset.advanceTime(500)
  if (command === 'G') expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
  linkset.advanceTime(2000)
  const said = () => Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, s.chat.map((c) => c.text)]))
  const before = said()
  linkset.deliverChat({ channel: 7720, name: 'Test Resident', key: AVATAR, message: command })
  for (let i = 0; i < 60; i++) linkset.advanceTime(100)
  const after = said()
  const lines = (name: string) => after[name]!.slice(before[name]!.length)
  return { ctl: lines('ctl'), log1: lines('log1'), log2: lines('log2'), log3: lines('log3') }
}

// https://wiki.secondlife.com/wiki/LlMessageLinked
// https://wiki.secondlife.com/wiki/Changed
//
// A change from llUnSit after a sleep, llSetLinkColor or llBreakLink falls due a simulator
// frame after the call, behind a link message sent straight after it. A script busy in an
// earlier handler gets the two once that handler ends, in the order they fell due.
//
// In-world: Aditi beta grid, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-24, the second
// test avatar seated for "G". In LSL and SLua, 2 runs of each command each: the busy
// child ran done, then link_message, then changed, every run.
describe.each(['lsl', 'slua'] as const)('a child busy in an earlier handler (%s)', (language) => {
  // In-world: "G" -> the busy child got link_message, then changed(32); every other
  // script got link_message first too.
  it('gets the link message sent after llUnSit ahead of the stand\'s changed', async () => {
    const out = await run(language, 'G')
    expect(out.log2).toEqual(['lm busy', 'done', 'lm G', 'changed 32'])
    expect(out.ctl).toEqual(['end', 'lm G', 'changed 32'])
    expect(out.log1).toEqual(['lm G', 'changed 32'])
    expect(out.log3).toEqual(['lm G', 'changed 32'])
  })

  // In-world: "K" -> the busy child got link_message, then changed(2); the other
  // scripts got only the link message.
  it('gets the link message sent after llSetLinkColor on its prim ahead of changed', async () => {
    const out = await run(language, 'K')
    expect(out.log2).toEqual(['lm busy', 'done', 'lm K', 'changed 2'])
    expect(out.ctl).toEqual(['end', 'lm K'])
    expect(out.log1).toEqual(['lm K'])
    expect(out.log3).toEqual(['lm K'])
  })

  // In-world: "B" -> the busy child got link_message, then changed(32); the root's
  // scripts got link_message first, and the broken-off prim's logger only changed(32).
  it('gets the link message sent after llBreakLink of another child ahead of changed', async () => {
    const out = await run(language, 'B')
    expect(out.log2).toEqual(['lm busy', 'done', 'lm B', 'changed 32'])
    expect(out.ctl).toEqual(['end', 'lm B', 'changed 32'])
    expect(out.log1).toEqual(['lm B', 'changed 32'])
    expect(out.log3).toEqual(['changed 32'])
  })

  // In-world, 2 runs of each: "KK" and "K4" -> the busy child got its link messages, then
  // one changed(2); "KS" -> link message "a", changed(2), link message "b", changed(2).
  it('gets one changed for its prim recoloured several times in one frame', async () => {
    expect((await run(language, 'KK')).log2).toEqual(['lm busy', 'done', 'lm a', 'lm b', 'changed 2'])
    expect((await run(language, 'K4')).log2).toEqual(['lm busy', 'done', 'lm a', 'changed 2'])
  })

  it('gets a changed after each link message for recolours a frame apart', async () => {
    expect((await run(language, 'KS')).log2).toEqual(['lm busy', 'done', 'lm a', 'changed 2', 'lm b', 'changed 2'])
  })
})
