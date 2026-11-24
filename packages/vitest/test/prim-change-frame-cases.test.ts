import { describe, expect, it } from 'vitest'
import { InventoryType, loadLinkset, makeInventoryItem } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const MATERIAL = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'

// The in-world probe scripts. "ctl" and "sib" share a freshly made box that also holds the
// material "pmat". A command is a kind and a number: "Y" turns the box into a cylinder and "X"
// back into a box, "R" recolours and resets, "H" sends sib a link message that puts it to sleep
// for 3 s, waits the number of seconds and recolours, "M" sets the material and "D" removes it.
// "T" is "H" with a click on the box about 1 s after the command. Except for "H", a nonzero
// number sleeps that long after the change. Then ctl sends a link message. The SLua sib has no
// timer.
const SOURCES = {
  lsl: {
    ctl: `
  integer k;
  string MAT = "pmat";
  say(string s) { llOwnerSay("L ctl " + s); }
  col() { ++k; llSetColor(<(k & 1), ((k >> 1) & 1), 0.5>, ALL_SIDES); }
  default {
    state_entry() { llListen(7707, "", llGetOwner(), ""); say("entry"); }
    listen(integer c, string n, key id, string m) {
      string kind = llGetSubString(m, 0, 0);
      float arg = (float)llGetSubString(m, 1, -1);
      if (kind == "Y") llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE, PRIM_TYPE_CYLINDER, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);
      else if (kind == "X") llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);
      else if (kind == "R") { col(); if (arg > 0) llSleep(arg); llResetScript(); }
      else if (kind == "H") { llMessageLinked(LINK_THIS, 1, "", ""); llSleep(arg); col(); llMessageLinked(LINK_THIS, 2, "", ""); }
      else if (kind == "M") llSetRenderMaterial(MAT, ALL_SIDES);
      else if (kind == "D") llRemoveInventory(MAT);
      else if (kind == "C") col();
      if (kind != "H" && arg > 0) llSleep(arg);
      llMessageLinked(LINK_THIS, 0, m, "");
    }
    changed(integer c) { say("changed " + (string)c); }
    link_message(integer s, integer n, string m, key id) { if (n == 0) say("lm " + m); }
  }`,
    sib: `
  say(string s) { llOwnerSay("L sib " + s); }
  default {
    state_entry() { say("entry"); }
    link_message(integer s, integer n, string m, key id) {
      if (n == 1) { llSetTimerEvent(0.5); llSleep(3.0); say("woke"); }
      else say("lm " + (string)n);
    }
    timer() { llSetTimerEvent(0); say("timer"); }
    touch_start(integer d) { say("touch_start"); }
    touch_end(integer d) { say("touch_end"); }
    changed(integer c) { say("changed " + (string)c); }
  }`,
  },
  slua: {
    ctl: `
  local k = 0
  local MAT = "pmat"
  local function say(s) ll.OwnerSay("S ctl " .. s) end
  local function col() k += 1; ll.SetColor(vector(k % 2, (k // 2) % 2, 0.5), ALL_SIDES) end
  ll.Listen(7708, "", ll.GetOwner(), "")
  say("entry")
  LLEvents:on("listen", function(c, n, id, m)
    local kind = string.sub(m, 1, 1)
    local arg = tonumber(string.sub(m, 2)) or 0
    if kind == "Y" then ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_TYPE, PRIM_TYPE_CYLINDER, PRIM_HOLE_DEFAULT, vector(0, 1, 0), 0.0, vector(0, 0, 0), vector(1, 1, 0), vector(0, 0, 0)})
    elseif kind == "X" then ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, vector(0, 1, 0), 0.0, vector(0, 0, 0), vector(1, 1, 0), vector(0, 0, 0)})
    elseif kind == "R" then col(); if arg > 0 then ll.Sleep(arg) end; ll.ResetScript()
    elseif kind == "H" then ll.MessageLinked(LINK_THIS, 1, "", ""); ll.Sleep(arg); col(); ll.MessageLinked(LINK_THIS, 2, "", "")
    elseif kind == "M" then ll.SetRenderMaterial(MAT, ALL_SIDES)
    elseif kind == "D" then ll.RemoveInventory(MAT)
    elseif kind == "C" then col()
    end
    if kind ~= "H" and arg > 0 then ll.Sleep(arg) end
    ll.MessageLinked(LINK_THIS, 0, m, "")
  end)
  LLEvents:on("changed", function(c) say("changed " .. c) end)
  LLEvents:on("link_message", function(s, n, m, id) if n == 0 then say("lm " .. m) end end)`,
    sib: `
  local function say(s) ll.OwnerSay("S sib " .. s) end
  say("entry")
  LLEvents:on("link_message", function(s, n, m, id)
    if n == 1 then ll.Sleep(3.0); say("woke") else say("lm " .. n) end
  end)
  LLEvents:on("touch_start", function(d) say("touch_start") end)
  LLEvents:on("touch_end", function(d) say("touch_end") end)
  LLEvents:on("changed", function(c) say("changed " .. c) end)`,
  },
}

type Language = 'lsl' | 'slua'

async function probe(language: Language, commands: string[]) {
  const sources = SOURCES[language]
  const script = (name: string, source: string) => ({ name, language, source: { source } })
  const { linkset, scripts } = await loadLinkset({
    owner: AVATAR,
    prims: [{
      inventory: [makeInventoryItem({ name: 'pmat', type: InventoryType.MATERIAL, key: MATERIAL })],
      scripts: [script('sib', sources.sib), script('ctl', sources.ctl)],
    }],
  })
  for (const s of Object.values(scripts)) s.start()
  linkset.advanceTime(1000)
  const said = (s: 'sib' | 'ctl', from: number) => scripts[s]!.chat.slice(from).map((c) => c.text.replace(/^[LS] (ctl|sib) /, ''))
  const out: Array<{ ctl: string[]; sib: string[] }> = []
  for (const command of commands) {
    const seen = { ctl: scripts.ctl!.chat.length, sib: scripts.sib!.chat.length }
    const touch = command.startsWith('T')
    linkset.deliverChat({ channel: language === 'lsl' ? 7707 : 7708, name: 'Test Resident', key: AVATAR, message: touch ? 'H' + command.slice(1) : command })
    // In-world the click came about 1 s after the command, while ctl's listen handler slept. A
    // handler's sleep here runs through the test's advance, so the click is queued for then.
    const detected = [{ key: AVATAR, name: 'Test Resident', touchFace: 0 }]
    if (touch) for (const event of ['touch_start', 'touch', 'touch_end']) linkset.clock.schedule(scripts.sib!, linkset.clock.now + 1000, event, { num_detected: 1, detected })
    for (let i = 0; i < 50; i++) linkset.advanceTime(100)
    out.push({ ctl: said('ctl', seen.ctl), sib: said('sib', seen.sib) })
  }
  return out
}

/** What ctl and sib logged for one command. */
const pair = (ctl: string[], sib: string[]) => ({ ctl, sib })

// In-world: Aditi, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-24, in LSL (Mono) and SLua.
describe("a script's own shape change", () => {
  // In-world: llSetLinkPrimitiveParamsFast turning the box into a cylinder and back gave
  // the link message first and changed(4) a frame later in both scripts: 6 of 6 in SLua and
  // 5 of 6 in LSL, where the first change after the script started gave changed first. With
  // llSleep(0.1) between the change and the link message, changed came first, 2 of 2 in both.
  it.each(['lsl', 'slua'] as const)('runs a link message sent straight after it first (%s)', async (language) => {
    expect(await probe(language, ['Y', 'X', 'Y', 'X', 'Y0.1', 'X0.1'])).toEqual([
      pair(['lm Y', 'changed 4'], ['lm 0', 'changed 4']),
      pair(['lm X', 'changed 4'], ['lm 0', 'changed 4']),
      pair(['lm Y', 'changed 4'], ['lm 0', 'changed 4']),
      pair(['lm X', 'changed 4'], ['lm 0', 'changed 4']),
      pair(['changed 4', 'lm Y0.1'], ['changed 4', 'lm 0']),
      pair(['changed 4', 'lm X0.1'], ['changed 4', 'lm 0']),
    ])
  })
})

describe('a recolour and then llResetScript in one handler', () => {
  // In-world, 2 of 2 in both languages, with and without llSleep(0.1) before the reset: the
  // resetting script ran state_entry and never got the change; the other script got it.
  it.each(['lsl', 'slua'] as const)('loses the change in the script that reset (%s)', async (language) => {
    expect(await probe(language, ['R', 'R0.1'])).toEqual([
      pair(['entry'], ['changed 2']),
      pair(['entry'], ['changed 2']),
    ])
  })
})

describe('a change made while another script in the prim sleeps', () => {
  // In-world, 2 of 2 for each case in LSL and 1 of 1 in SLua: sib slept 3 s in its
  // link_message handler, with a 0.5 s timer started first in LSL. ctl recoloured 0.2 s or
  // 2 s into that sleep, and the prim was clicked about 1 s into it. When sib woke, the link
  // messages ran first, then the timer, the click and the change, whether the change came up
  // before or after the click: the order Second Life gives events held back in a sleep.
  it.each(['lsl', 'slua'] as const)('is held with the other events of that sleep, in their usual order (%s)', async (language) => {
    const timer = language === 'lsl' ? ['timer'] : []
    expect(await probe(language, ['H0.2', 'T0.2', 'T2'])).toEqual([
      pair(['lm H0.2', 'changed 2'], ['woke', 'lm 2', 'lm 0', ...timer, 'changed 2']),
      pair(['lm H0.2', 'changed 2'], ['woke', 'lm 2', 'lm 0', ...timer, 'touch_start', 'touch_end', 'changed 2']),
      pair(['lm H2', 'changed 2'], ['woke', 'lm 2', 'lm 0', ...timer, 'touch_start', 'touch_end', 'changed 2']),
    ])
  })
})

describe('removing the material item a face uses', () => {
  // In-world, 2 of 2 in both languages: llSetRenderMaterial's own 0.2 s delay let
  // changed(4096) run first, and llRemoveInventory of the material then gave the link message
  // first and changed(4096) a frame later, in both scripts.
  it.each(['lsl', 'slua'] as const)('raises changed a frame after llRemoveInventory (%s)', async (language) => {
    expect(await probe(language, ['M', 'D'])).toEqual([
      pair(['changed 4096', 'lm M'], ['changed 4096', 'lm 0']),
      pair(['lm D', 'changed 4096'], ['lm 0', 'changed 4096']),
    ])
  })
})
