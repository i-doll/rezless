import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType } from '../src/index.js'
import { changedScene, events } from './helpers/changed-events.js'

// https://wiki.secondlife.com/wiki/CHANGED_MEDIA
// https://wiki.secondlife.com/wiki/LlRemoveInventory
// In-world: issue-362 expanded setter series, Aditi, SLua Tideland, 2026-11-01,
// Firestorm 7.3.0.83011, Mono. Media writes, including repeats, emit 2048 in
// the target prim; clearing absent media emits nothing. Inventory removals
// and allowed-drop toggles do not emit changed, including script self-removal.
const MEDIA = '[PRIM_MEDIA_HOME_URL,"https://example.com/",PRIM_MEDIA_AUTO_PLAY,FALSE]'

describe('changed media events', () => {
  it.each([
    `llSetPrimMediaParams(0,${MEDIA});`,
    `llSetLinkMedia(LINK_THIS,0,${MEDIA});`,
  ])('notifies scripts in the media prim, including for repeated writes: %s', async body => {
    for (const setup of ['', body]) {
      const s = await changedScene(body, setup)
      expect(s.driver).toEqual([2048])
      expect(s.root).toEqual([2048])
      expect(s.child).toEqual([])
    }
  })

  it.each(['llClearPrimMedia(0);', 'llClearLinkMedia(LINK_THIS,0);'])('reports only removal of existing media: %s', async body => {
    expect((await changedScene(body, `llSetPrimMediaParams(0,${MEDIA});`)).driver).toEqual([2048])
    expect((await changedScene(body)).driver).toEqual([])
  })

  it('routes linked media set and clear events to child scripts', async () => {
    const set = await changedScene(`llSetLinkMedia(2,0,${MEDIA});`)
    expect(set.child).toEqual([2048])
    expect(set.root).toEqual([])
    const clear = await changedScene('llClearLinkMedia(2,0);', `llSetLinkMedia(2,0,${MEDIA});`)
    expect(clear.child).toEqual([2048])
    expect(clear.root).toEqual([])
  })
})

describe('inventory changes that do not raise changed', () => {
  it.each(['note', 'other', 'remover'])('does not emit changed when removing %s', async name => {
    const { scripts, prims } = await loadLinkset({ prims: [{
      inventory: [makeInventoryItem({ name: 'note', type: InventoryType.NOTECARD })],
      scripts: [
        { name: 'watcher', source: { source: 'list seen;default{changed(integer c){seen+=c;}}' } },
        { name: 'other', source: { source: 'default{state_entry(){}}' } },
        { name: 'remover', source: { source: `default{state_entry(){llRemoveInventory("${name}");}}` } },
      ],
    }] })
    scripts.watcher!.start()
    scripts.other!.start()
    scripts.remover!.start()
    expect(events(scripts.watcher!)).toEqual([])
    expect(prims[0]!.inventory.some(item => item.name === name)).toBe(false)
  })

  it('does not emit changed for allowed-drop toggles', async () => {
    const s = await changedScene('llAllowInventoryDrop(TRUE);llAllowInventoryDrop(FALSE);')
    expect(s.driver).toEqual([])
    expect(s.root).toEqual([])
    expect(s.child).toEqual([])
  })
})
