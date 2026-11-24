import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, PERM_ALL, PERM_COPY } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGiveInventory
// https://wiki.secondlife.com/wiki/Changed
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-24) with a
// two-prim probe per language. A chat command made the root script call llGiveInventory and
// llMessageLinked; every handler said its event with llOwnerSay. The child's script did the same.

const LSL = `default {
    link_message(integer s, integer num, string m, key id) { if (num == 0) llOwnerSay("lm"); }
    changed(integer c) { llOwnerSay("changed " + (string)c); }
    touch_start(integer d) { BODY }
  }`

const SLUA = `LLEvents:on("link_message", function(s, num, m, id) if num == 0 then ll.OwnerSay("lm") end end)
  LLEvents:on("changed", function(c) ll.OwnerSay("changed " .. c) end)
  LLEvents:on("touch_start", function(d) BODY end)`

const CHILD = `default {
    link_message(integer s, integer num, string m, key id) { llOwnerSay("lm"); }
    changed(integer c) { llOwnerSay("changed " + (string)c); }
  }`

// A second script in the root that only reports its changed events.
const PEER = 'default { changed(integer c) { llOwnerSay("changed " + (string)c); } }'

const notecard = (name: string, owner = PERM_ALL) =>
  makeInventoryItem({ name, type: InventoryType.Notecard, notecardLines: ['x'], permMask: { base: owner, owner, next: PERM_ALL, group: 0, everyone: 0 } })

type Language = 'lsl' | 'slua'

const calls = {
  lsl: {
    give: 'llGiveInventory(llGetKey(), "nc");',
    giveSelf: 'llGiveInventory(llGetKey(), llGetScriptName());',
    giveChild: 'llGiveInventory(llGetLinkKey(2), "nc"); llMessageLinked(2, 0, "", "");',
    giveChildOnly: 'llGiveInventory(llGetLinkKey(2), "nc");',
    giveList: 'llGiveInventoryList(llGetKey(), "x", ["nc"]);',
    giveNoCopy: 'llGiveInventory(llGetKey(), "nocopy");',
    colour: 'llSetColor(<1.0, 0.0, 0.0>, ALL_SIDES);',
    colourChild: 'llSetLinkColor(2, <1.0, 0.0, 0.0>, ALL_SIDES);',
    message: 'llMessageLinked(LINK_THIS, 0, "", "");',
  },
  slua: {
    give: 'll.GiveInventory(ll.GetKey(), "nc");',
    giveSelf: 'll.GiveInventory(ll.GetKey(), ll.GetScriptName());',
    giveChild: 'll.GiveInventory(ll.GetLinkKey(2), "nc"); ll.MessageLinked(2, 0, "", "");',
    giveChildOnly: 'll.GiveInventory(ll.GetLinkKey(2), "nc");',
    giveList: 'll.GiveInventoryList(ll.GetKey(), "x", {"nc"});',
    giveNoCopy: 'll.GiveInventory(ll.GetKey(), "nocopy");',
    colour: 'll.SetColor(vector(1, 0, 0), ALL_SIDES);',
    colourChild: 'll.SetLinkColor(2, vector(1, 0, 0), ALL_SIDES);',
    message: 'll.MessageLinked(LINK_THIS, 0, "", "");',
  },
}

async function touched(language: Language, body: (c: typeof calls.lsl) => string) {
  const { linkset, prims, scripts } = await loadLinkset({
    prims: [
      {
        inventory: [notecard('nc'), notecard('nocopy', PERM_ALL & ~PERM_COPY)],
        scripts: [
          { name: 'probe', language, source: { source: (language === 'lsl' ? LSL : SLUA).replace('BODY', body(calls[language])) } },
          { name: 'peer', source: { source: PEER } },
        ],
      },
      { scripts: [{ name: 'child', source: { source: CHILD } }] },
    ],
  })
  linkset.startAll()
  linkset.advanceTime(1000)
  const items = () => prims.map((p) => p.inventory.map((i) => i.name).sort())
  const before = items()
  linkset.touch(1)
  for (let i = 0; i < 20; i++) linkset.advanceTime(100)
  const said = (name: string) => scripts[name]!.chat.map((c) => c.text)
  return { before, after: items(), root: said('probe'), peer: said('peer'), child: said('child') }
}

describe.each(['lsl', 'slua'] as const)('a gift to the script\'s own linkset (%s)', (language) => {
  // In-world: llGiveInventory(llGetKey(), item) then llMessageLinked(LINK_THIS) -> link_message,
  // then changed(1) (36 of 38 runs over the two languages, with a notecard, another script and the
  // caller itself as the item; two early runs put changed first).
  it('raises changed a frame after the call, behind a link message sent after it', async () => {
    expect((await touched(language, (c) => c.give + c.message)).root).toEqual(['lm', 'changed 1'])
  })

  // In-world: the same gift of the calling script itself -> link_message, then changed(1).
  it('raises changed for a gift of the calling script, behind a link message sent after it', async () => {
    expect((await touched(language, (c) => c.giveSelf + c.message)).root).toEqual(['lm', 'changed 1'])
  })

  // In-world: the gift then llSetColor, or llSetColor then the gift, then llMessageLinked ->
  // link_message, then one changed(3) (2 runs of each order).
  it.each([['gift then colour', true], ['colour then gift', false]] as const)('merges with a colour change made in the same handler (%s)', async (_order, giftFirst) => {
    const log = await touched(language, (c) => (giftFirst ? c.give + c.colour : c.colour + c.give) + c.message)
    expect(log.root).toEqual(['lm', 'changed 3'])
  })

  // In-world: two gifts in a row, then llMessageLinked -> link_message, then one changed(1)
  // (4 runs).
  it('raises one changed for two gifts in one handler', async () => {
    expect((await touched(language, (c) => c.give + c.give + c.message)).root).toEqual(['lm', 'changed 1'])
  })

  // In-world: a prim holding one script and one notecard listed the same two items after 16
  // gifts of a script, a notecard and the caller itself to its own prim.
  it('adds no item to the prim', async () => {
    const log = await touched(language, (c) => c.give + c.giveSelf)
    expect(log.after).toEqual(log.before)
  })

  // In-world: llGiveInventory to the child prim, then llMessageLinked(2) -> the child's script
  // said link_message, then changed(1) (2 runs of each language).
  it('raises changed in a child prim a frame after the call, behind a link message sent after it', async () => {
    const log = await touched(language, (c) => c.giveChild)
    expect(log.child).toEqual(['lm', 'changed 1'])
    expect(log.after[1]).toEqual(['child', 'nc'])
  })

  // In-world: the gift, llSetColor, the gift again, then llMessageLinked -> the giving script said
  // link_message, then changed(3); a second, idle script in the prim said one changed(3) (2 runs).
  // llSetColor then the gift -> the same (1 run).
  it.each([['gift, colour, gift', (c: typeof calls.lsl) => c.give + c.colour + c.give], ['colour, gift', (c: typeof calls.lsl) => c.colour + c.give]] as const)(
    'gives an idle script in the prim one changed for %s', async (_order, body) => {
      const log = await touched(language, (c) => body(c) + c.message)
      expect(log.root).toEqual(['lm', 'changed 3'])
      expect(log.peer).toEqual(['changed 3'])
    })

  // In-world: llGiveInventory to the child, then llSetLinkColor on it, or the other way round ->
  // the child's idle script said one changed(3) (2 runs of each order).
  it.each([['gift then colour', true], ['colour then gift', false]] as const)('gives an idle child one changed for a gift and a colour change (%s)', async (_order, giftFirst) => {
    const log = await touched(language, (c) => giftFirst ? c.giveChildOnly + c.colourChild : c.colourChild + c.giveChildOnly)
    expect(log.child).toEqual(['changed 3'])
  })

  // In-world: llGiveInventoryList(llGetKey(), "x", [notecard]), then llMessageLinked -> the
  // inventory was the same, and changed(1) came up in the call's 3 s delay, ahead of
  // link_message (LSL 1 run, SLua 2).
  it('adds no item for a list given to the prim', async () => {
    const log = await touched(language, (c) => c.giveList + c.message)
    expect(log.after).toEqual(log.before)
    expect(log.root).toEqual(['changed 1', 'lm'])
  })

  // In-world: llGiveInventory(llGetKey(), notecard) of a notecard the owner could not copy -> the
  // notecard was gone from the prim at once, then changed(1) (9 runs). Against a link message
  // sent after the gift, the change came first in 5 runs and second in 4, so no order is pinned.
  // A no-copy script giving itself stopped before its next line and was gone from the prim.
  it('removes a no-copy item given to the prim', async () => {
    const log = await touched(language, (c) => c.giveNoCopy)
    expect(log.after[0]).toEqual(log.before[0]!.filter((name) => name !== 'nocopy'))
    expect(log.root).toEqual(['changed 1'])
  })
})

// In-world: a script its owner could not copy called llGiveInventory(llGetKey(), llGetScriptName()),
// then said its prim's llGetInventoryNumber -> it said nothing more, and was gone from the prim
// (1 run).
it('removes a no-copy script that gives itself to its own prim', async () => {
  const { linkset, prims, scripts } = await loadLinkset({
    prims: [{ scripts: [{ name: 'probe', source: { source: 'default { touch_start(integer d) { llGiveInventory(llGetKey(), llGetScriptName()); llOwnerSay("after " + (string)llGetInventoryNumber(INVENTORY_ALL)); } }' } }] }],
  })
  const item = prims[0]!.inventory.find((i) => i.name === 'probe')!
  item.permMask = { ...item.permMask, owner: item.permMask.owner & ~PERM_COPY }
  linkset.startAll()
  linkset.touch(1)
  linkset.advanceTime(1000)
  expect(scripts.probe!.chat.map((c) => c.text)).toEqual([])
  expect(prims[0]!.inventory.map((i) => i.name)).toEqual([])
})
