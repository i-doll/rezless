import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const MATERIAL = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'

// The in-world probe scripts, without their timestamps. "ctl" sits in the root of a
// two-prim object with "sib", which only logs, and "kid" logs in the child. A command
// is a kind and a mode: the mode "S" sleeps 0.5 s first and "V" spins for 0.5 s first;
// after the change, "W" spins for 0.1 s and "D" sleeps 0.1 s. A spin is a call that
// keeps the script busy as long. Then ctl sends llMessageLinked(LINK_SET).
const LSL = {
  ctl: `string MATERIAL = "${MATERIAL}"; integer k; key child;
    default {
      state_entry() { llListen(7701, "", NULL_KEY, ""); child = llGetLinkKey(2); llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      listen(integer c, string n, key id, string m) {
        string kind = llGetSubString(m, 0, 0);
        string mode = llGetSubString(m, 1, 1);
        if (mode == "S") llSleep(0.5);
        else if (mode == "V") llSetSitText("");
        ++k;
        if (kind == "C") llSetColor(<(k & 1), ((k >> 1) & 1), 0.5>, ALL_SIDES);
        else if (kind == "A") llSetAlpha(0.5 + 0.25 * (k & 1), ALL_SIDES);
        else if (kind == "Z") llSetScale(<0.5, 0.5, 0.5 + 0.1 * (k & 1)>);
        else if (kind == "T") { if (k & 1) llSetTexture(TEXTURE_BLANK, ALL_SIDES); else llSetTexture(TEXTURE_PLYWOOD, ALL_SIDES); }
        else if (kind == "P") llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_COLOR, ALL_SIDES, <0.5, (k & 1), 1>, 1.0]);
        else if (kind == "L") llSetLinkColor(2, <(k & 1), 0.5, ((k >> 1) & 1)>, ALL_SIDES);
        else if (kind == "R") { if (k & 1) llSetRenderMaterial(MATERIAL, ALL_SIDES); else llSetRenderMaterial(NULL_KEY, ALL_SIDES); }
        else if (kind == "M") llSetLinkMedia(LINK_THIS, 0, [PRIM_MEDIA_HOME_URL, "http://example.com/" + (string)k]);
        else if (kind == "B") llBreakLink(2);
        else if (kind == "X") llBreakAllLinks();
        else if (kind == "K") llCreateLink(child, TRUE);
        if (mode == "W") llSetText("", ZERO_VECTOR, 0.0);
        else if (mode == "D") llSleep(0.1);
        llMessageLinked(LINK_SET, 1, m, "");
      }
      changed(integer c) { llOwnerSay("changed " + (string)c); }
      link_message(integer s, integer num, string m, key id) { llOwnerSay("lm"); }
    }`,
  sib: `default {
      changed(integer c) { llOwnerSay("changed " + (string)c); }
      link_message(integer s, integer num, string m, key id) { llOwnerSay("lm"); }
    }`,
}

const SLUA = {
  ctl: `local k = 0
    local child = ll.GetLinkKey(2)
    ll.Listen(7701, "", "", "")
    ll.RequestPermissions(ll.GetOwner(), PERMISSION_CHANGE_LINKS)
    LLEvents:on("listen", function(c, n, id, m)
      local kind = string.sub(m, 1, 1)
      local mode = string.sub(m, 2, 2)
      if mode == "S" then ll.Sleep(0.5) elseif mode == "V" then ll.SetSitText("") end
      k += 1
      if kind == "C" then ll.SetColor(vector(k % 2, (k // 2) % 2, 0.5), ALL_SIDES)
      elseif kind == "A" then ll.SetAlpha(0.5 + 0.25 * (k % 2), ALL_SIDES)
      elseif kind == "Z" then ll.SetScale(vector(0.5, 0.5, 0.5 + 0.1 * (k % 2)))
      elseif kind == "T" then if k % 2 == 1 then ll.SetTexture(TEXTURE_BLANK, ALL_SIDES) else ll.SetTexture(TEXTURE_PLYWOOD, ALL_SIDES) end
      elseif kind == "P" then ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_COLOR, ALL_SIDES, vector(0.5, k % 2, 1), 1.0})
      elseif kind == "L" then ll.SetLinkColor(2, vector(k % 2, 0.5, (k // 2) % 2), ALL_SIDES)
      elseif kind == "R" then if k % 2 == 1 then ll.SetRenderMaterial("${MATERIAL}", ALL_SIDES) else ll.SetRenderMaterial(NULL_KEY, ALL_SIDES) end
      elseif kind == "M" then ll.SetLinkMedia(LINK_THIS, 0, {PRIM_MEDIA_HOME_URL, "http://example.com/" .. k})
      elseif kind == "B" then ll.BreakLink(2)
      elseif kind == "X" then ll.BreakAllLinks()
      elseif kind == "K" then ll.CreateLink(child, 1)
      end
      if mode == "W" then ll.SetText("", vector(0, 0, 0), 0)
      elseif mode == "D" then ll.Sleep(0.1) end
      ll.MessageLinked(LINK_SET, 1, m, "")
    end)
    LLEvents:on("changed", function(c) ll.OwnerSay("changed " .. c) end)
    LLEvents:on("link_message", function(s, num, m, id) ll.OwnerSay("lm") end)`,
  sib: `LLEvents:on("changed", function(c) ll.OwnerSay("changed " .. c) end)
    LLEvents:on("link_message", function(s, num, m, id) ll.OwnerSay("lm") end)`,
}

type Language = 'lsl' | 'slua'

async function probe(language: Language, commands: string[]) {
  const sources = language === 'lsl' ? LSL : SLUA
  const script = (name: string, source: string) => ({ name, language, source: { source } })
  const { linkset, scripts } = await loadLinkset({
    owner: AVATAR,
    prims: [{ scripts: [script('sib', sources.sib), script('ctl', sources.ctl)] }, { scripts: [script('kid', sources.sib)] }],
  })
  linkset.prims[1]!.params.position = { x: 0, y: 0.8, z: 0 }
  scripts.ctl!.mock('llSetText', (ctx) => { ctx.busy(100); return undefined })
  scripts.ctl!.mock('llSetSitText', (ctx) => { ctx.busy(500); return undefined })
  for (const s of Object.values(scripts)) s.start()
  scripts.ctl!.grantPermissions()
  linkset.advanceTime(1000)
  const out: Array<{ ctl: string[]; sib: string[]; kid: string[] }> = []
  for (const command of commands) {
    const seen = { ctl: scripts.ctl!.chat.length, sib: scripts.sib!.chat.length, kid: scripts.kid!.chat.length }
    linkset.deliverChat({ channel: 7701, name: 'Test Resident', key: AVATAR, message: command })
    for (let i = 0; i < 30; i++) linkset.advanceTime(100)
    out.push({
      ctl: scripts.ctl!.chat.slice(seen.ctl).map((c) => c.text),
      sib: scripts.sib!.chat.slice(seen.sib).map((c) => c.text),
      kid: scripts.kid!.chat.slice(seen.kid).map((c) => c.text),
    })
  }
  return out
}

/** What the root's two scripts logged, and the child's. */
const both = (lines: string[], kid = ['lm']) => ({ ctl: lines, sib: lines, kid })

// In-world: Aditi, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-24. A script's own
// llSetColor, llSetAlpha, llSetScale, PRIM_COLOR through llSetLinkPrimitiveParamsFast
// and llBreakLink raised changed one simulator frame (about 22 ms) after the call, in
// the caller and in the other script in its prim. A link message sent straight after
// the call, with or without a sleep before it, ran first in both scripts: for colour
// without a sleep 3 of 3 in SLua and 2 of 3 in LSL, and 1 of 1 for each other case, in
// both languages; llBreakLink 2 of 2 with and without a sleep. In the LSL run that gave
// changed first, the caller's handler had taken 44 ms, past the frame.
describe("a script's own prim change, then llMessageLinked", () => {
  it.each(['lsl', 'slua'] as const)('runs link_message first, with or without a sleep before (%s)', async (language) => {
    const out = await probe(language, ['CN', 'CS', 'AN', 'AS', 'ZN', 'ZS', 'PN', 'PS', 'BN'])
    expect(out).toEqual([
      both(['lm', 'changed 2']), both(['lm', 'changed 2']),
      both(['lm', 'changed 2']), both(['lm', 'changed 2']),
      both(['lm', 'changed 8']), both(['lm', 'changed 8']),
      both(['lm', 'changed 2']), both(['lm', 'changed 2']),
      both(['lm', 'changed 32'], ['changed 32']),
    ])
  })

  it.each(['lsl', 'slua'] as const)('runs link_message first after llBreakLink behind a sleep (%s)', async (language) => {
    expect(await probe(language, ['BS'])).toEqual([both(['lm', 'changed 32'], ['changed 32'])])
  })

  // In-world: llSetTexture raised no changed at all, so only the link message ran.
  it.each(['lsl', 'slua'] as const)('raises nothing for llSetTexture (%s)', async (language) => {
    expect(await probe(language, ['TN', 'TS'])).toEqual([both(['lm']), both(['lm'])])
  })

  // In-world: with a 0.1 s spin or llSleep(0.1) between the change and the link
  // message, both scripts got changed first, 3 of 3 for each in both languages.
  it.each(['lsl', 'slua'] as const)('runs changed first when the handler spins or sleeps past the frame (%s)', async (language) => {
    expect(await probe(language, ['CW', 'CD', 'ZD'])).toEqual([
      both(['changed 2', 'lm']), both(['changed 2', 'lm']), both(['changed 8', 'lm']),
    ])
  })

  // In-world: llCreateLink's own delay let changed(32) come first in both scripts,
  // with or without a sleep before it, 2 of 2 in both languages.
  it.each(['lsl', 'slua'] as const)('runs changed first after llCreateLink (%s)', async (language) => {
    const out = await probe(language, ['BN', 'KN', 'BN', 'KS'])
    expect(out[1]).toEqual(both(['changed 32', 'lm'], ['changed 32', 'lm']))
    expect(out[3]).toEqual(both(['changed 32', 'lm'], ['changed 32', 'lm']))
  })

  // In-world, 2 of 2 in both languages: a 0.5 s spin before the recolour left the
  // order as without it; llSetLinkColor on the child, llSetLinkMedia and
  // llBreakAllLinks gave the link message first; llSetRenderMaterial's own 0.2 s
  // delay let changed(4096) come first in the root, as llCreateLink's does. The
  // child, unlinked by llBreakAllLinks, got only its changed.
  it.each(['lsl', 'slua'] as const)('times the other prim changes the same way (%s)', async (language) => {
    expect(await probe(language, ['CV', 'LN', 'RN', 'RN', 'MN', 'XN'])).toEqual([
      both(['lm', 'changed 2']),
      both(['lm'], ['lm', 'changed 2']),
      both(['changed 4096', 'lm']), both(['changed 4096', 'lm']),
      both(['lm', 'changed 2048']),
      both(['lm', 'changed 32'], ['changed 32']),
    ])
  })
})

// The in-world probe for a change before a state change, and for three of the
// script's own recolours with a 0.5 s spin ("B") or llSleep(0.5) ("Q") between
// them, without the timestamps. "sib" logs in the same prim.
const STATES = {
  lsl: `integer k;
    spin() { llSetText("", ZERO_VECTOR, 0.0); }
    col() { ++k; llSetColor(<(k & 1), ((k >> 1) & 1), 0.5>, ALL_SIDES); }
    default {
      state_entry() { llListen(7701, "", NULL_KEY, ""); llOwnerSay("default entry"); }
      listen(integer c, string n, key id, string m) {
        if (m == "T") { col(); state two; }
        else if (m == "U") { col(); state three; }
        else if (m == "B") { col(); spin(); col(); spin(); col(); llOwnerSay("end"); }
        else if (m == "Q") { col(); llSleep(0.5); col(); llSleep(0.5); col(); llOwnerSay("end"); }
      }
      changed(integer c) { llOwnerSay("default changed " + (string)c); }
    }
    state two {
      state_entry() { llOwnerSay("two entry"); llSetTimerEvent(1.0); }
      timer() { llSetTimerEvent(0); state default; }
      changed(integer c) { llOwnerSay("two changed " + (string)c); }
    }
    state three {
      state_entry() { llOwnerSay("three entry"); llSetTimerEvent(1.0); }
      timer() { llSetTimerEvent(0); state default; }
    }`,
  slua: `local k = 0
    local function spin() ll.SetText("", vector(0, 0, 0), 0) end
    local function col() k += 1; ll.SetColor(vector(k % 2, (k // 2) % 2, 0.5), ALL_SIDES) end
    ll.Listen(7701, "", "", "")
    LLEvents:on("listen", function(c, n, id, m)
      if m == "B" then col(); spin(); col(); spin(); col(); ll.OwnerSay("end")
      elseif m == "Q" then col(); ll.Sleep(0.5); col(); ll.Sleep(0.5); col(); ll.OwnerSay("end") end
    end)
    LLEvents:on("changed", function(c) ll.OwnerSay("default changed " .. c) end)`,
}

async function own(language: Language, command: string) {
  const script = (name: string, source: string) => ({ name, language, source: { source } })
  const sib = language === 'lsl' ? LSL.sib : SLUA.sib
  const { linkset, scripts } = await loadLinkset({ owner: AVATAR, prims: [{ scripts: [script('sib', sib), script('ctl', STATES[language])] }] })
  scripts.ctl!.mock('llSetText', (ctx) => { ctx.busy(500); return undefined })
  for (const s of Object.values(scripts)) s.start()
  linkset.advanceTime(1000)
  const seen = { ctl: scripts.ctl!.chat.length, sib: scripts.sib!.chat.length }
  linkset.deliverChat({ channel: 7701, name: 'Test Resident', key: AVATAR, message: command })
  for (let i = 0; i < 30; i++) linkset.advanceTime(100)
  return { ctl: scripts.ctl!.chat.slice(seen.ctl).map((c) => c.text), sib: scripts.sib!.chat.slice(seen.sib).map((c) => c.text) }
}

describe("a script's own prim change in a handler that goes on", () => {
  // In-world, 2 of 2: llSetColor and then `state two;` gave "two entry" and then
  // "two changed 2"; with `state three;`, whose state has no changed handler, the
  // change was lost, and default got none when the script came back to it.
  it('runs the change in the state the handler changed to', async () => {
    expect((await own('lsl', 'T')).ctl).toEqual(['two entry', 'two changed 2', 'default entry'])
    expect((await own('lsl', 'U')).ctl).toEqual(['three entry', 'default entry'])
  })

  // In-world, 2 of 2 in both languages: three recolours with a 0.5 s spin or
  // llSleep(0.5) between them gave the caller two changed events after the
  // handler, and the idle script in the prim one for each recolour.
  it.each(['lsl', 'slua'] as const)('gives the caller two changed events for three recolours across spins or sleeps (%s)', async (language) => {
    for (const command of ['B', 'Q']) {
      expect(await own(language, command)).toEqual({
        ctl: ['end', 'default changed 2', 'default changed 2'],
        sib: ['changed 2', 'changed 2', 'changed 2'],
      })
    }
  })
})
