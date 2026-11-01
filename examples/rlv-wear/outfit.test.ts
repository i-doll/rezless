import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, seedRlvInventory } from '@rezless/vitest'

const source = readFileSync(new URL('./outfit.lsl', import.meta.url), 'utf8')
const folderQuery = (command: string) => command.startsWith('@getinv=')

async function fixtures() {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    const outfit = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ name: 'Outfit cuff' }] })
    outfit.linkset.attachToAvatar(f.avatar.key, 5)
    seedRlvInventory(f.avatar, inventory(outfit.prims[0]!.key))
    outfit.linkset.detachFromAvatar()
    f.script.start()
  }
  return pair
}

function inventory(rootKey: string) {
  return {
    sharedRootId: 'root',
    entries: [
      { id: 'root', parentId: null, kind: 'folder' as const, name: '#RLV' },
      { id: 'outfit', parentId: 'root', kind: 'folder' as const, name: 'Outfit' },
      { id: 'cuff', parentId: 'outfit', kind: 'item' as const, name: 'Cuff', assetType: 'object' as const },
    ],
    wornAttachments: [{ itemId: 'cuff', rootKey }],
  }
}

type Fixture = Awaited<ReturnType<typeof fixtures>>['rlv']
const touch = (f: Fixture) => f.script.fire('touch_start', { num_detected: 1 })
const queries = (f: Fixture) => f.avatar.viewer.commandLog.filter(entry => folderQuery(entry.command))
function expectWorn(f: Fixture) {
  expect(f.script).toHaveSaid(0, 'Requested Outfit.')
  expect(f.avatar.viewer.inventory.attachmentObject('cuff')?.attachment?.avatar).toBe(f.avatar.key)
  expect(f.avatar.viewer.commandLog.filter(entry => entry.command === '@attachover:Outfit=force'))
    .toMatchObject([{ wearResults: [{ itemId: 'cuff', outcome: 'attached' }] }])
}

describe.each(['rlv', 'rlva'] as const)('outfit wearer with %s', profile => {
  it('discovers #RLV folders and force-wears Outfit', async () => {
    const f = (await fixtures())[profile]
    touch(f)
    expect(queries(f)).toHaveLength(1)
    expectWorn(f)
  })

  it('retries once after a dropped reply', async () => {
    const f = (await fixtures())[profile]
    f.avatar.viewer.dropNext(folderQuery)
    touch(f)
    expect(f.script).not.toHaveSaid(0, 'Requested Outfit.')
    f.script.advanceTime(1000)
    expect(f.script).toHaveSaid(0, 'Viewer reply timed out; retrying.')
    expect(queries(f)).toHaveLength(2)
    expectWorn(f)
  })

  it('asks the owner to wear manually after two dropped replies', async () => {
    const f = (await fixtures())[profile]
    f.avatar.viewer.dropNext(folderQuery)
    f.avatar.viewer.dropNext(folderQuery)
    touch(f)
    f.script.advanceTime(2000)
    expect(f.script).toHaveSaid(0, 'Viewer did not reply. Please wear Outfit manually.')
    f.script.advanceTime(5000)
    expect(queries(f)).toHaveLength(2)
    expect(f.avatar.viewer.commandLog.some(entry => entry.command.startsWith('@attachover'))).toBe(false)
  })

  it('handles a crafted inventory reply that omits Outfit', async () => {
    const f = (await fixtures())[profile]
    f.avatar.viewer.answerNext('Travel,Evening', folderQuery)
    touch(f)
    expect(f.script).toHaveSaid(0, 'Outfit was not found in #RLV. Please wear Outfit manually.')
    expect(f.avatar.viewer.commandLog.some(entry => entry.command.startsWith('@attachover'))).toBe(false)
  })

  it('ignores the late first reply and accepts the retry reply', async () => {
    const f = (await fixtures())[profile]
    f.avatar.viewer.hold()
    touch(f)
    f.script.advanceTime(1000)
    expect(queries(f)).toHaveLength(2)
    f.avatar.viewer.release(1)
    f.script.advanceTime(0)
    expect(f.script).not.toHaveSaid(0, 'Requested Outfit.')
    f.avatar.viewer.release()
    f.script.advanceTime(0)
    expectWorn(f)
    f.script.advanceTime(2000)
    expect(f.script).not.toHaveSaid(0, 'Viewer did not reply. Please wear Outfit manually.')
  })

  it('re-seeds while the mapped item is detached, then wears the same object', async () => {
    const f = (await fixtures())[profile]
    const cuff = f.avatar.viewer.inventory.attachmentObject('cuff')!
    expect(cuff.attachment).toBeNull()
    seedRlvInventory(f.avatar, inventory(cuff.prims[0]!.key))
    touch(f)
    expectWorn(f)
    expect(f.avatar.viewer.inventory.attachmentObject('cuff')).toBe(cuff)
  })
})
