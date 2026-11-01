import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ATTACH_NECK, PSYS_SRC_TARGET_KEY, World, loadLinkset } from '@rezless/vitest'

const source = readFileSync(new URL('./leash.lsl', import.meta.url), 'utf8')
const position = (x: number, y = 70) => ({ x, y, z: 25 })

async function scene() {
  const world = new World()
  world.addRegion('Garden', { x: 0, y: 0 })
  world.addRegion('Harbor', { x: 256, y: 0 })
  const wearer = world.addAvatar({ username: 'wearer', region: 'Garden', position: position(40) })
  const holder = world.addAvatar({ username: 'holder', region: 'Garden', position: position(42) })
  const collar = await loadLinkset({ world, region: 'Garden', owner: wearer.key, position: wearer.position,
    prims: [{ name: 'Example collar', scripts: [{ name: 'leash', source: { source } }] }] })
  const post = await loadLinkset({ world, region: 'Garden', owner: wearer.key, position: position(46),
    prims: [{ name: 'Garden rail' }] })
  collar.linkset.attachToAvatar(wearer.key, ATTACH_NECK)
  const script = collar.scripts.leash!
  script.start()
  const open = (avatar = holder) => collar.linkset.touch(0, { avatar: { key: avatar.key, name: avatar.username } })
  const grab = () => { open(); script.answerDialog('Grab') }
  const lastParticles = () => script.callsOf('llParticleSystem').at(-1)!.args[0] as unknown[]
  const particleTarget = () => {
    const rules = lastParticles()
    return rules[rules.indexOf(PSYS_SRC_TARGET_KEY) + 1]
  }
  return { world, wearer, holder, collar, post, script, open, grab, lastParticles, particleTarget }
}

describe('collar leash', () => {
  it('lets the second avatar grab through a dialog and aims particles at them', async () => {
    const f = await scene()
    f.grab()
    expect(f.collar.linkset.attachment).toMatchObject({ avatar: f.wearer.key, point: ATTACH_NECK })
    expect(f.script.dialogs.at(-1)).toMatchObject({ agent: f.holder.key, buttons: ['Grab'] })
    expect(f.particleTarget()).toBe(f.holder.key)
    expect(f.collar.prims[0]!.particles?.rules).toEqual(f.lastParticles())
    expect(f.script).toHaveCalledFunction('llTarget', f.holder.position, 4)
  })

  it('refuses Grab from the wearer', async () => {
    const f = await scene()
    f.open(f.wearer)
    f.script.answerDialog('Grab')
    expect(f.script).toHaveSaid(0, 'The wearer cannot grab this leash.')
    expect(f.lastParticles()).toEqual([])
    expect(f.script.callsOf('llTarget')).toHaveLength(0)
  })

  it('updates the target as the holder walks and stops pulling at the target', async () => {
    const f = await scene()
    f.grab()
    f.holder.position = position(51)
    f.script.advanceTime(500)
    expect(f.script).toHaveCalledFunction('llTarget', f.holder.position, 4)
    f.script.fire('not_at_target')
    expect(f.script).toHaveCalledFunction('llMoveToTarget', f.holder.position, 0.75)
    const stops = f.script.callsOf('llStopMoveToTarget').length
    const handle = f.script.global('targetHandle')
    f.script.fire('at_target', { tnum: handle, targetpos: f.holder.position, ourpos: position(48) })
    expect(f.script.callsOf('llStopMoveToTarget')).toHaveLength(stops + 1)
  })

  it.each(['region', 'range'] as const)('goes slack beyond the %s boundary and resumes on return', async boundary => {
    const f = await scene()
    f.grab()
    f.holder.position = position(51)
    f.script.advanceTime(500)
    f.script.fire('not_at_target')
    expect(f.script.callsOf('llMoveToTarget').length).toBeGreaterThan(0)
    if (boundary === 'region') f.holder.region = 'Harbor'
    else f.holder.position = position(100)
    f.script.advanceTime(500)
    expect(f.lastParticles()).toEqual([])
    expect(f.collar.prims[0]!.targetMotion.move).toBeNull()
    const pulls = f.script.callsOf('llMoveToTarget').length
    f.script.fire('not_at_target')
    f.script.advanceTime(1000)
    expect(f.script.callsOf('llMoveToTarget')).toHaveLength(pulls)
    f.holder.region = 'Garden'
    f.holder.position = position(50)
    f.script.advanceTime(500)
    expect(f.particleTarget()).toBe(f.holder.key)
    f.script.fire('not_at_target')
    expect(f.script).toHaveCalledFunction('llMoveToTarget', f.holder.position, 0.75)
  })

  it('selects a sensor-found post, follows it, and goes slack after its removal', async () => {
    const f = await scene()
    f.grab()
    f.open()
    f.script.answerDialog('Post')
    expect(f.script.callsOf('llSensor')).toHaveLength(1)
    expect(f.script.dialogs.at(-1)).toMatchObject({ buttons: ['1'], message: 'Pick a nearby post:\n1: Garden rail\n' })
    f.script.answerDialog('1')
    expect(f.particleTarget()).toBe(f.post.prims[0]!.key)
    expect(f.script).toHaveCalledFunction('llTarget', position(46), 4)
    f.script.fire('not_at_target')
    expect(f.script).toHaveCalledFunction('llMoveToTarget', position(46), 0.75)
    f.post.linkset.remove()
    f.script.advanceTime(500)
    expect(f.lastParticles()).toEqual([])
    expect(f.collar.prims[0]!.targetMotion.move).toBeNull()
    const pulls = f.script.callsOf('llMoveToTarget').length
    f.script.fire('not_at_target')
    expect(f.script.callsOf('llMoveToTarget')).toHaveLength(pulls)
  })

  it('reports an empty post scan without losing the holder', async () => {
    const f = await scene()
    f.grab()
    f.post.linkset.remove()
    f.open()
    f.script.answerDialog('Post')
    expect(f.script).toHaveSaid(0, 'No nearby objects to use as a post.')
    expect(f.particleTarget()).toBe(f.holder.key)
  })

  it('lets the wearer Unleash and clears particles, movement and future tracking', async () => {
    const f = await scene()
    f.grab()
    f.holder.position = position(51)
    f.script.advanceTime(500)
    const handle = f.script.global('targetHandle')
    f.open(f.wearer)
    f.script.answerDialog('Unleash')
    expect(f.script).toHaveCalledFunction('llTargetRemove', handle)
    expect(f.script).toHaveCalledFunction('llSetTimerEvent', 0)
    expect(f.lastParticles()).toEqual([])
    expect(f.collar.prims[0]!.targetMotion.move).toBeNull()
    const targets = f.script.callsOf('llTarget').length
    const pulls = f.script.callsOf('llMoveToTarget').length
    f.holder.position = position(54)
    f.script.advanceTime(2000)
    f.script.fire('not_at_target')
    expect(f.script.callsOf('llTarget')).toHaveLength(targets)
    expect(f.script.callsOf('llMoveToTarget')).toHaveLength(pulls)
    f.open()
    expect(f.script.dialogs.at(-1)?.buttons).toEqual(['Grab'])
  })
})
