import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, DEBUG_CHANNEL, PERMISSION_TRIGGER_ANIMATION, PERMISSION_OVERRIDE_ANIMATIONS } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Changed
// https://wiki.secondlife.com/wiki/LlStopAnimation
// https://wiki.secondlife.com/wiki/LlGetAnimationOverride
// In-world: one box rezzed by its owner holding a looping animation uploaded for the test
// ("anim"), a logging script with PERMISSION_TRIGGER_ANIMATION and
// PERMISSION_OVERRIDE_ANIMATIONS from the owner, a second running script that logs changed and a
// stopped copy of it. The owner deleted "anim" through the object's contents and added it back
// between cases. The log read llGetInventoryType, llGetInventoryKey, whether
// llGetAnimationList(owner) held the animation and llGetAnimationOverride("Standing").
// Aditi beta grid, SLua Tideland, Mono, Firestorm RLVa 2.4.2, 2026-11-23.

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const ANIM = 'b152cd8a-4b07-db68-72bf-1a4958f023db'

const LOG = `
  report(string why) {
    llSay(0, why + " type=" + (string)llGetInventoryType("anim") + " key=" + (string)llGetInventoryKey("anim")
      + " play=" + (string)(llListFindList(llGetAnimationList(llGetOwner()), [(key)"${ANIM}"]) != -1)
      + " ov=" + llGetAnimationOverride("Standing"));
  }
  default {
    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRIGGER_ANIMATION | PERMISSION_OVERRIDE_ANIMATIONS); }
    changed(integer c) { report("changed " + (string)c); }
    link_message(integer s, integer n, string m, key k) {
      if (m == "start") llStartAnimation("anim");
      else if (m == "stop") llStopAnimation("anim");
      else if (m == "stopkey") llStopAnimation("${ANIM}");
      else if (m == "rm") llRemoveInventory("anim");
      else if (m == "ov") llSetAnimationOverride("Standing", "anim");
      report(m);
    }
  }`
const QUIET = `default { changed(integer c) { llSay(0, llGetScriptName() + " changed " + (string)c); } }`

async function load() {
  const { linkset, prims, scripts } = await loadLinkset({
    owner: OWNER,
    prims: [{
      inventory: [makeInventoryItem({ name: 'anim', type: InventoryType.ANIMATION, key: ANIM })],
      scripts: [
        { name: 'log', source: { source: LOG, filename: 'log.lsl' } },
        { name: 'quiet', source: { source: QUIET, filename: 'quiet.lsl' } },
        { name: 'quiet off', source: { source: QUIET, filename: 'quiet-off.lsl' } },
      ],
    }],
  })
  const log = scripts['log']!
  const quiet = scripts['quiet']!
  log.start()
  quiet.start()
  log.grantPermissions(PERMISSION_TRIGGER_ANIMATION | PERMISSION_OVERRIDE_ANIMATIONS)
  linkset.advanceTime(1_000)
  const seen = new Map<object, number>()
  const said = () => [log, quiet, scripts['quiet off']!].flatMap((script) => {
    const lines = script.chat.slice(seen.get(script) ?? 0)
    seen.set(script, script.chat.length)
    return lines.map((c) => (c.channel === DEBUG_CHANNEL ? `error: ${c.text}` : c.text))
  })
  const send = (str: string) => {
    linkset.clock.schedule(log, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str, id: '' })
    linkset.advanceTime(1_000)
  }
  const ownerDelete = () => {
    prims[0]!.removeInventory('anim')
    linkset.advanceTime(1_000)
  }
  return { linkset, said, send, ownerDelete }
}

const HELD = `type=20 key=${ANIM}`
const GONE = 'type=-1 key=00000000-0000-0000-0000-000000000000'

describe('the owner deletes an animation item', () => {
  it('sends CHANGED_INVENTORY to each running script, none to a stopped one', async () => {
    const { said, ownerDelete } = await load()
    ownerDelete()
    // In-world: the log and the running copy each got changed(1); the stopped copy said nothing.
    expect(said()).toEqual([`changed 1 ${GONE} play=0 ov=stand`, 'quiet changed 1'])
  })

  it('leaves the animation playing, stopped only by its key once the item is gone', async () => {
    const { linkset, said, send, ownerDelete } = await load()
    send('start')
    expect(said()).toEqual([`start ${HELD} play=1 ov=stand`])
    ownerDelete()
    // In-world: after the delete llGetAnimationList still held the animation, also 10 s later.
    expect(said()).toEqual([`changed 1 ${GONE} play=1 ov=stand`, 'quiet changed 1'])
    linkset.advanceTime(10_000)
    send('dump')
    expect(said()).toEqual([`dump ${GONE} play=1 ov=stand`])
    send('stop')
    // In-world: llStopAnimation by the item's name said "Could not find animation 'anim'." and
    // the animation played on; by its key it stopped.
    expect(said()).toEqual(["error: Could not find animation 'anim'.", `stop ${GONE} play=1 ov=stand`])
    send('stopkey')
    expect(said()).toEqual([`stopkey ${GONE} play=0 ov=stand`])
  })

  it('leaves the animation playing after llRemoveInventory, with no changed event', async () => {
    const { said, send } = await load()
    send('start')
    said()
    send('rm')
    // In-world: llRemoveInventory of the playing animation left it in llGetAnimationList, and no
    // script got a changed event.
    expect(said()).toEqual([`rm ${GONE} play=1 ov=stand`])
  })

  it('keeps an override playing, though llGetAnimationOverride reads empty', async () => {
    const { said, send, ownerDelete } = await load()
    send('ov')
    expect(said()).toEqual([`ov ${HELD} play=1 ov=anim`])
    ownerDelete()
    // In-world: with "anim" set as the Standing override, the delete left it playing and
    // llGetAnimationOverride("Standing") returned "".
    expect(said()).toEqual([`changed 1 ${GONE} play=1 ov=`, 'quiet changed 1'])
  })
})
