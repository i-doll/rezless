import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

async function fixture(expression = 'llKey2Name(llGetOwner())') {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('away', { x: 1024, y: 0 })
  const avatar = world.addAvatar({ key: AVATAR, region: 'home', name: 'Test Resident',
    username: 'test', displayName: 'Another Name' })
  const { scripts, linkset } = await loadLinkset({ world, region: 'home', owner: AVATAR,
    prims: [{ name: 'Named prim', scripts: [{ name: 'test', source: { source: `
      string result;
      default { touch_start(integer n) { result = ${expression}; } }
    ` } }] }] })
  const script = scripts.test!
  script.start()
  const read = () => { script.fire('touch_start', { num_detected: 1 }); return script.global('result') }
  return { world, avatar, linkset, read }
}

// https://wiki.secondlife.com/wiki/LlKey2Name
// In-world: owner standing and seated -> legacy name, distinct from username
// and display name (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
describe('llKey2Name avatars', () => {
  it('returns the local avatar legacy name while standing and seated', async () => {
    const f = await fixture()
    expect(f.read()).toBe('Test Resident')
    f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)
    expect(f.read()).toBe('Test Resident')
    f.world.standAvatar(f.avatar)
    f.avatar.name = 'Other Legacy'
    expect(f.read()).toBe('Other Legacy')
  })

  it('matches avatar keys without regard to case', async () => {
    const f = await fixture('llKey2Name(llToUpper(llGetOwner()))')
    expect(f.read()).toBe('Test Resident')
  })

  // In-world: a known avatar in Morris queried from SLua Tideland -> "".
  it('returns empty for avatars outside the caller region or removed from the world', async () => {
    const f = await fixture()
    f.avatar.region = 'away'
    expect(f.read()).toBe('')
    f.avatar.region = 'home'
    expect(f.read()).toBe('Test Resident')
    f.world.avatars.length = 0
    expect(f.read()).toBe('')
  })

  // In-world: random key -> ""; local prim and attachment keys -> prim names.
  it.each(['NULL_KEY', '"bad"', '"12345678-1234-1234-1234-123456789abc"'])('returns empty for %s', async key => {
    const f = await fixture(`llKey2Name(${key})`)
    expect(f.read()).toBe('')
  })

  it('keeps prim names for rezzed objects and attachments', async () => {
    const f = await fixture('llKey2Name(llGetKey())')
    expect(f.read()).toBe('Named prim')
    f.linkset.attachToAvatar(f.avatar.key, 5)
    expect(f.read()).toBe('Named prim')
    f.linkset.prims[0]!.name = ''
    expect(f.read()).toBe('')
  })

  it('returns empty without a world avatar registry', async () => {
    const { scripts } = await loadLinkset({ owner: AVATAR, prims: [{ scripts: [{ name: 'test',
      source: { source: 'string result; default { state_entry() { result=llKey2Name(llGetOwner()); } }' } }] }] })
    scripts.test!.start()
    expect(scripts.test!.global('result')).toBe('')
  })
})
