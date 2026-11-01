import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World } from '../src/index.js'

const CONTROLS = 4, ANIMATION = 16, ATTACH = 32, DEBIT = 2
const source = (bits: number, commands = '@acceptpermission=n', target = 'llGetOwner()') => `
  integer events; integer granted; key recipient;
  default {
    state_entry() {
      llOwnerSay("${commands}");
      llRequestPermissions(${target}, ${bits});
    }
    run_time_permissions(integer p) { ++events; granted = llGetPermissions(); recipient = llGetPermissionsKey(); }
    touch_start(integer n) { llRequestPermissions(${target}, ${bits}); }
  }`

// Profiles: Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2.
describe('acceptpermission automatic permission replies', () => {
  for (const [name, bits, sitting, worn, owned, expected] of [
    ['controls from the issuer', CONTROLS, false, false, true, { rlv: true, rlva: true }],
    ['controls from another owner', CONTROLS, false, false, false, { rlv: true, rlva: true }],
    ['owned attach', ATTACH, false, false, true, { rlv: true, rlva: true }],
    ['foreign attach', ATTACH, false, false, false, { rlv: false, rlva: false }],
    ['standing animation', ANIMATION, false, false, true, { rlv: false, rlva: false }],
    ['sitting animation', ANIMATION, true, false, true, { rlv: true, rlva: false }],
    ['sitting animation from another owner', ANIMATION, true, false, false, { rlv: true, rlva: false }],
    ['sitting combined permissions', CONTROLS | ANIMATION | ATTACH, true, false, true, { rlv: true, rlva: false }],
    ['standing combined animation', CONTROLS | ANIMATION, false, false, true, { rlv: false, rlva: false }],
    ['owned combined attach and controls', CONTROLS | ATTACH, false, false, true, { rlv: true, rlva: true }],
    ['worn owned attach', ATTACH, false, true, true, { rlv: true, rlva: false }],
    ['worn controls', CONTROLS, false, true, true, { rlv: true, rlva: true }],
    ['worn standing animation', ANIMATION, false, true, true, { rlv: false, rlva: false }],
    ['debit', DEBIT, true, false, true, { rlv: false, rlva: false }],
    ['controls mixed with debit', CONTROLS | DEBIT, true, false, true, { rlv: false, rlva: false }],
    ['controls mixed with unknown bits', CONTROLS | 0x40000000, true, false, true, { rlv: false, rlva: false }],
  ] as const) {
    it(name, async () => {
      const pair = await loadRlvPair({ source: source(bits) })
      for (const profile of ['rlv', 'rlva'] as const) {
        const f = pair[profile]
        let script = f.script
        // A separate controller enables the rule before a foreign-owned object requests it.
        if (!owned) {
          f.script.start()
          const loaded = await loadLinkset({ world: f.world, region: f.avatar.region,
            owner: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            prims: [{ scripts: [{ name: 'requester', source: { source: source(bits, '', `"${f.avatar.key}"`) } }] }] })
          script = loaded.scripts.requester!
        }
        if (sitting) {
          const seat = await loadLinkset({ world: f.world, region: f.avatar.region, prims: [{}] })
          expect(f.world.sitAvatar(f.avatar, seat.linkset.prims[0]!)).toBe(true)
        }
        if (worn) script.linkset.attachToAvatar(f.avatar.key, 1)
        script.start()
        expect(script.permissionRequests).toEqual([{ agent: f.avatar.key, permissions: bits, answered: expected[profile] }])
        expect(script.global('events')).toBe(expected[profile] ? 1 : 0)
        if (!expected[profile]) script.grantPermissions()
        expect(script.global('events')).toBe(1)
        expect(script.global('granted')).toBe(bits)
        expect(script.global('recipient')).toBe(f.avatar.key)
        expect(() => script.grantPermissions()).toThrow('no pending permission request')
      }
    })
  }

  for (const commands of ['', '@acceptpermission=y', '@acceptpermission=n,acceptpermission=y', '@acceptpermission=add,acceptpermission=rem',
    '@acceptpermission=n,clear', '@acceptpermission:nobody=n', '@acceptpermission_sec=n']) {
    it(`leaves the request pending for ${commands || 'no command'}`, async () => {
      const pair = await loadRlvPair({ source: source(CONTROLS, commands) })
      for (const { script } of Object.values(pair)) {
        script.start()
        expect(script.permissionRequests[0]?.answered).toBe(false)
        expect(script.global('events')).toBe(0)
        script.denyPermissions()
        expect(script.global('events')).toBe(1)
        expect(script.global('granted')).toBe(0)
      }
    })
  }

  it('keeps no-option activation in force when an option rule is added', async () => {
    const pair = await loadRlvPair({ source: source(CONTROLS, '@acceptpermission=n,acceptpermission:nobody=n') })
    for (const { script, avatar } of Object.values(pair)) {
      script.start()
      expect(script.global('events')).toBe(1)
      expect(avatar.viewer.commandLog[0]?.status).toBe('applied')
      expect(avatar.viewer.commandLog[1]?.status).toBe('unsupported')
    }
  })

  it('covers animation while ground sitting only in Kokua', async () => {
    const pair = await loadRlvPair({ source: source(ANIMATION) })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      avatar.info |= 0x10 // AGENT_SITTING without a seat object.
      script.start()
      expect(script.permissionRequests[0]?.answered).toBe(profile === 'rlv')
      expect(script.global('events')).toBe(profile === 'rlv' ? 1 : 0)
    }
  })

  it('keeps another issuer active when one issuer clears its own rule', async () => {
    const pair = await loadRlvPair({ source: source(CONTROLS, '@acceptpermission=n,clear=acceptpermission') })
    for (const f of Object.values(pair)) {
      const controller = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
        prims: [{ scripts: [{ name: 'controller', source: { source: `default {
          state_entry() { llOwnerSay("@acceptpermission=n"); }
        }` } }] }] })
      controller.scripts.controller!.start()
      f.script.start()
      expect(f.script.global('events')).toBe(1)
      expect(f.avatar.viewer.restrictions.snapshot()).toMatchObject([{ sourcePrim: controller.linkset.prims[0]!.key }])
    }
  })

  it('does not answer old pending requests when activated later', async () => {
    const pair = await loadRlvPair({ source: `integer events; default {
      state_entry() { llRequestPermissions(llGetOwner(), 4); llOwnerSay("@acceptpermission=add"); }
      run_time_permissions(integer p) { ++events; }
      touch_start(integer n) { llRequestPermissions(llGetOwner(), 4); }
    }` })
    for (const { script } of Object.values(pair)) {
      script.start()
      script.linkset.touch(0)
      expect(script.permissionRequests.map(r => r.answered)).toEqual([false, true])
      expect(script.global('events')).toBe(1)
      script.denyPermissions()
      expect(script.global('events')).toBe(2)
    }
  })

  it('uses the requested avatar viewer rather than the object owner viewer', async () => {
    const pair = await loadRlvPair({ source: source(CONTROLS) })
    for (const f of Object.values(pair)) {
      f.script.start()
      const other = f.world.addAvatar({ username: 'other', region: f.avatar.region })
      const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
        prims: [{ scripts: [{ name: 'requester', source: { source: source(CONTROLS, '', `"${other.key}"`) } }] }] })
      const script = loaded.scripts.requester!
      script.start()
      expect(script.permissionRequests[0]?.answered).toBe(false)
    }
  })

  it('leaves disabled viewers inert and zero requests silent', async () => {
    const world = new World(); world.addRegion('test', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'off', region: 'test' })
    const loaded = await loadLinkset({ world, region: 'test', owner: avatar.key,
      prims: [{ scripts: [{ name: 'off', source: { source: source(CONTROLS) } }] }] })
    loaded.scripts.off!.start()
    expect(loaded.scripts.off!.permissionRequests[0]?.answered).toBe(false)
    const pair = await loadRlvPair({ source: source(0) })
    for (const { script } of Object.values(pair)) {
      script.start()
      expect(script.permissionRequests).toEqual([])
      expect(script.global('events')).toBe(0)
    }
  })
})
