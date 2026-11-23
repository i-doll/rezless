import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'
import { NAK, InventoryType, makeInventoryItem } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlGetNotecardLineSync: "If the notecard is not in the region's
// cache, NAK is returned". https://wiki.secondlife.com/wiki/LlFindNotecardTextSync returns [NAK] the same way.
// In-world probes for this file: Aditi, SLua Tideland, Mono and SLua, 2026-11-23. Each case read a
// notecard of fresh text that nothing had read before, and printed llGetNotecardLineSync(..., 0) and
// llFindNotecardTextSync(..., "apple", 0, 0, []) by key and by name. A control notecard that only the
// sync reads touched gave NAK and [NAK] all along.

const NC_KEY = 'b55a2053-c6bc-5e6d-0193-553cdf8ae12e'
const OWNER = '7d1f3a2b-9c4e-4f6a-8b2d-5e0c1a9f3b7d'
const DEBUG = 2147483647
const LINE = 'first line'
const FOUND = '1, 7, 5'

const notecard = () => makeInventoryItem({ name: 'nc', type: InventoryType.NOTECARD, key: NC_KEY, notecardLines: [LINE, 'second apple'] })

async function run(source: string, language: 'lsl' | 'slua' = 'lsl') {
  const filename = language === 'slua' ? 'p.luau' : 'p.lsl'
  const { scripts } = await loadLinkset({
    owner: OWNER,
    prims: [{ inventory: [notecard()], scripts: [{ source: { source, filename }, name: 'p', ...(language === 'slua' ? { language } : {}) }] }],
  })
  const p = scripts['p']!
  p.start()
  p.advanceTime(5000)
  return p
}

const said = (p: { chat: ReadonlyArray<{ channel: number; text: string }> }, channel = 1) =>
  p.chat.filter((c) => c.channel === channel).map((c) => c.text)

const LSL_SHOW = `string show(string k) { return llGetNotecardLineSync(k, 0) + " [" + llList2CSV(llFindNotecardTextSync(k, "apple", 0, 0, [])) + "]"; }`
const lsl = (body: string, more = '') => `${LSL_SHOW}
  default { state_entry() { ${body} } ${more} }`

describe('a sync read in the same event as the first read of a notecard', () => {
  it('gives the line after llGetNumberOfNotecardLines by key', async () => {
    // In-world, Mono: llGetNumberOfNotecardLines(key), then at once the sync reads by key and by
    // name -> "first ... [1, 7, 5]" both times; before the call they gave NAK and [NAK].
    const p = await run(lsl(`llSay(1, "before " + show("${NC_KEY}")); llGetNumberOfNotecardLines("${NC_KEY}"); llSay(1, show("${NC_KEY}") + " | " + show("nc"));`))
    expect(said(p)).toEqual([`before ${NAK} [${NAK}]`, `${LINE} [${FOUND}] | ${LINE} [${FOUND}]`])
  })

  it.each([
    ['by name', 'nc'],
    ['by key', NC_KEY],
  ])('gives NAK after llFindNotecardTextCount %s, which caches the notecard only once its answer is ready', async (_, name) => {
    // In-world, Mono: llFindNotecardTextCount by name, then at once the sync reads by name and by key
    // -> NAK and [NAK] both; the same by key. Four seconds later both read the line.
    const p = await run(lsl(
      `llFindNotecardTextCount("${name}", "apple", []); llSay(1, show("nc") + " | " + show("${NC_KEY}")); llSetTimerEvent(1);`,
      `timer() { llSetTimerEvent(0); llSay(1, "later " + show("nc")); }`,
    ))
    expect(said(p)).toEqual([`${NAK} [${NAK}] | ${NAK} [${NAK}]`, `later ${LINE} [${FOUND}]`])
    expect(said(p, DEBUG)).toEqual([])
  })

  it('gives the line in the dataserver event that answers llFindNotecardTextCount', async () => {
    // In-world, Mono: in the dataserver event with the count's answer ("1"), llGetNotecardLineSync gave the line.
    const p = await run(lsl(`llFindNotecardTextCount("nc", "apple", []);`, `dataserver(key q, string d) { llSay(1, d + " " + show("nc")); }`))
    expect(said(p)).toEqual([`1 ${LINE} [${FOUND}]`])
  })

  it('gives the line when the handler sleeps after llFindNotecardTextCount', async () => {
    // In-world, Mono: llFindNotecardTextCount, then llSleep(3.0) in the same event -> the line; a loop of
    // llSleep(0.02) polling llGetNotecardLineSync found it cached after one sleep, 0.07 s after the call.
    const p = await run(lsl(`llFindNotecardTextCount("nc", "apple", []); llSleep(3.0); llSay(1, show("nc"));`))
    expect(said(p)).toEqual([`${LINE} [${FOUND}]`])
  })

  it('gives the line when llGetNotecardLine follows llFindNotecardTextCount in the same event', async () => {
    // In-world, Mono: llFindNotecardTextCount then llGetNotecardLine on the same notecard, then the sync read -> the line.
    const p = await run(lsl(`llFindNotecardTextCount("nc", "apple", []); llGetNotecardLine("nc", 1); llSay(1, show("nc"));`))
    expect(said(p)).toEqual([`${LINE} [${FOUND}]`])
  })

  it.each([
    ['by name', 'nc'],
    ['by key', NC_KEY],
  ])('leaves the notecard uncached after llFindNotecardTextCount %s with an invalid pattern', async (_, name) => {
    // In-world, Mono: llFindNotecardTextCount with pattern "(" by name, and on another notecard by key ->
    // NULL_KEY, a regex error on DEBUG_CHANNEL and no dataserver event; after llSleep(3.0) and again
    // three seconds later the sync reads still gave NAK and [NAK].
    const p = await run(lsl(
      `llFindNotecardTextCount("${name}", "(", []); llSleep(3.0); llSay(1, show("nc")); llSetTimerEvent(3);`,
      `timer() { llSetTimerEvent(0); llSay(1, "later " + show("${NC_KEY}")); }`,
    ))
    expect(said(p)).toEqual([`${NAK} [${NAK}]`, `later ${NAK} [${NAK}]`])
  })

  it('behaves the same in SLua', async () => {
    // In-world, SLua: ll.GetNumberOfNotecardLines(key) then ll.GetNotecardLineSync(..., 1) by key and
    // by name -> the line; ll.FindNotecardTextCount by name, and on another notecard by key, then the
    // sync reads -> NAK and {NAK}; four seconds later all of them read the line.
    const p = await run(
      `local function show(k)
        return tostring(ll.GetNotecardLineSync(k, 1)) .. " [" .. table.concat(ll.FindNotecardTextSync(k, "apple", 0, 0, {}), ", ") .. "]"
      end
      ll.FindNotecardTextCount("nc", "apple", {})
      ll.Say(1, "count " .. show("nc") .. " | " .. show("${NC_KEY}"))
      ll.GetNumberOfNotecardLines("${NC_KEY}")
      ll.Say(1, "lines " .. show("${NC_KEY}") .. " | " .. show("nc"))`,
      'slua',
    )
    expect(said(p)).toEqual([`count ${NAK} [${NAK}] | ${NAK} [${NAK}]`, `lines ${LINE} [2, 8, 5] | ${LINE} [2, 8, 5]`])
  })
})
