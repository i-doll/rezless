import { expect, it } from 'vitest'
import { AGENT_FLYING, AGENT_IN_AIR, AGENT_SITTING, getRlvViewerState, loadRlvPair, NULL_KEY } from '../src/index.js'

// Firestorm RLVa 2.4.2: RlvActions::canJump/canFly, RlvUIEnabler::onToggleMovement,
// RlvForceHandler<RLV_BHVR_FLY>, RlvCommandOptionAdjustHeight, idle_afk_check.
// Kokua RLV 2.09.35.00: RRInterface::add/force, refreshCachedVariable, agent_handle_doubletap_run.
const source = `integer info; default {
  link_message(integer sender,integer num,string message,key id) {
    llOwnerSay(message); info=llGetAgentInfo(llGetOwner());
  }
}`
const issue = (script: import('@rezless/vm').Script, str: string) =>
  script.fire('link_message', { sender_num: 1, num: 0, str, id: NULL_KEY })

it('stops flight immediately, reports it through LSL, and does not restore it on clear', async () => {
  for (const { world, avatar, script } of Object.values(await loadRlvPair({ source }))) {
    script.start()
    expect(world.attemptAvatarMovement(avatar, 'fly').allowed).toBe(true)
    issue(script, '@fly=n')
    expect(script.global('info')).toBe(avatar.info)
    expect(avatar.info & AGENT_FLYING).toBe(0)
    expect(world.attemptAvatarMovement(avatar, 'fly').allowed).toBe(false)
    expect(world.attemptAvatarMovement(avatar, 'land').allowed).toBe(true)
    issue(script, '@clear')
    expect(avatar.info & AGENT_FLYING).toBe(0)
    expect(world.attemptAvatarMovement(avatar, 'fly').allowed).toBe(true)
  }
})

it('has named jump expectations and allows upward flight under a jump restriction', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { world, avatar, script } = pair[profile]
    script.start(); issue(script, '@jump=n')
    const result = world.attemptAvatarMovement(avatar, 'jump')
    expect(result.allowed).toBe(profile === 'rlv')
    expect(avatar.info & AGENT_IN_AIR).toBe(0) // Input does not invent simulator motion.
    expect(avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'unsupported' : 'applied')
    world.attemptAvatarMovement(avatar, 'fly')
    expect(world.attemptAvatarMovement(avatar, 'jump').allowed).toBe(true)
  }
})

it('clears run modes independently in RLVa and together in Kokua', async () => {
  for (const profile of ['rlv', 'rlva'] as const) {
    const { world, avatar, script } = (await loadRlvPair({ source }))[profile]
    script.start()
    world.attemptAvatarMovement(avatar, 'alwaysrun')
    world.attemptAvatarMovement(avatar, 'temprun')
    issue(script, '@temprun=n')
    expect(avatar.movement?.alwaysRun).toBe(profile === 'rlva')
    expect(avatar.movement?.tempRun).toBe(false)
    expect(world.attemptAvatarMovement(avatar, 'temprun').allowed).toBe(false)
    expect(world.attemptAvatarMovement(avatar, 'alwaysrun').allowed).toBe(true)
    issue(script, '@alwaysrun=n')
    expect(avatar.movement?.alwaysRun).toBe(false)
    expect(world.attemptAvatarMovement(avatar, 'alwaysrun').allowed).toBe(false)
    expect(world.attemptAvatarMovement(avatar, 'walk').allowed).toBe(true)
    issue(script, '@clear')
    expect(avatar.movement?.alwaysRun).toBe(false)
    expect(world.attemptAvatarMovement(avatar, 'temprun').allowed).toBe(true)
  }
})

it('supports RLVa force fly with issuer exemption, option validation and seated refusal', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    script.start(); issue(script, '@fly=n,fly=force')
    expect(!!(avatar.info & AGENT_FLYING)).toBe(profile === 'rlva')
    issue(script, '@fly:false=force')
    expect(avatar.info & AGENT_FLYING).toBe(0)
    issue(script, '@fly:bad=force')
    expect(avatar.info & AGENT_FLYING).toBe(0)
    if (profile === 'rlva') expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-option' })
    avatar.info |= AGENT_SITTING
    issue(script, '@fly:true=force')
    expect(avatar.info & AGENT_FLYING).toBe(0)
  }
})

it('adjusts viewer hover height with profile-specific numeric conversion without moving the avatar', async () => {
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = (await loadRlvPair({ source }))[profile]
    const position = { ...avatar.position }
    script.start(); issue(script, '@adjustheight:12.5=force')
    expect(avatar.movement?.hoverOffset).toBeCloseTo(profile === 'rlv' ? 0.12 : 0.125)
    avatar.movement!.pelvisToFoot = 1
    issue(script, '@adjustheight:1.5;2;0.1=force')
    expect(avatar.movement?.hoverOffset).toBeCloseTo(1.1)
    issue(script, '@adjustheight:999=force')
    expect(avatar.movement?.hoverOffset).toBe(2)
    issue(script, '@adjustheight:-999=force')
    expect(avatar.movement?.hoverOffset).toBe(-2)
    expect(avatar.position).toEqual(position)
    const effect = getRlvViewerState(avatar).find(e => e.behaviour === 'adjustheight')
    expect(effect?.parameters?.hoverOffset).toBe(-2)
  }
})

it('exposes allowidle as RLVa viewer policy without forcing simulator away state', async () => {
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = (await loadRlvPair({ source }))[profile]
    script.start(); issue(script, '@allowidle=n')
    expect(avatar.info).toBe(0)
    expect(getRlvViewerState(avatar).find(e => e.behaviour === 'allowidle')).toMatchObject(profile === 'rlva'
      ? { support: 'enforced', restricted: true, parameters: { idleTimeoutSeconds: 1800, preserveAwayOnAnimationEnd: true } }
      : { support: 'unsupported', restricted: null })
  }
})

it('preserves other issuers and captures immutable movement denials', async () => {
  const { loadLinkset } = await import('../src/index.js')
  for (const f of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = f
    const second = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'second', source: { source } }] }] })
    const locker = second.scripts.second!
    script.start(); locker.start()
    expect(f.movementActions).toEqual([])
    issue(script, '@fly=n')
    issue(locker, '@fly=n')
    issue(script, '@fly=force')
    expect(avatar.info & AGENT_FLYING).toBe(0)
    if (avatar.viewer.profile === 'rlva') expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-lock' })
    issue(script, '@fly=y')
    const denial = f.move('fly')
    expect(denial).toMatchObject({ allowed: false, reason: 'restriction' })
    expect(denial.restrictions).toHaveLength(1)
    expect(Object.isFrozen(denial)).toBe(true)
    expect(Object.isFrozen(denial.restrictions)).toBe(true)
    issue(locker, '@clear')
    expect(f.move('fly').allowed).toBe(true)
    expect(denial.restrictions).toHaveLength(1)
    expect(f.movementActions).toHaveLength(2)
    avatar.info |= AGENT_SITTING
    f.move('land')
    expect(f.move('fly')).toMatchObject({ allowed: false, reason: 'seated' })
  }
})

it('keeps disabled viewers inert and refuses a foreign world movement input', async () => {
  const { World, loadLinkset, getAvatarMovementState } = await import('../src/index.js')
  const world = new World(); world.addRegion('off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'off' })
  const loaded = await loadLinkset({ world, region: 'off', owner: avatar.key,
    prims: [{ scripts: [{ name: 'off', source: { source } }] }] })
  const script = loaded.scripts.off!
  script.start(); issue(script, '@fly=n,jump=n,alwaysrun=n,temprun=n,adjustheight:10=force,allowidle=n')
  expect(avatar.viewer.commandLog).toEqual([])
  expect(world.attemptAvatarMovement(avatar, 'fly').allowed).toBe(true)
  expect(getAvatarMovementState(avatar).hoverOffset).toBe(0)
  const foreign = new World()
  expect(foreign.attemptAvatarMovement(avatar, 'land')).toMatchObject({ allowed: false, reason: 'avatar' })
  expect(avatar.info & AGENT_FLYING).toBe(AGENT_FLYING)
})

it('validates hover fields and preserves the previous offset on refusal', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    script.start(); issue(script, '@adjustheight:10=force')
    issue(script, '@adjustheight:1;2=force')
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'unsupported-form' })
    expect(avatar.movement?.hoverOffset).toBeCloseTo(0.1)
    issue(script, '@adjustheight:50;0;0.8=force')
    expect(avatar.movement?.hoverOffset).toBeCloseTo(profile === 'rlv' ? 0.5 : 0.8)
    issue(script, '@adjustheight:25garbage=force')
    expect(avatar.movement?.hoverOffset).toBeCloseTo(0.25)
    issue(script, '@adjustheight:garbage=force')
    expect(avatar.movement?.hoverOffset).toBeCloseTo(profile === 'rlv' ? 0 : 0.25)
    if (profile === 'rlva') {
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-option' })
      for (const option of ['1;2;3;4', '1;', '1e', '1e99']) {
        issue(script, '@adjustheight:' + option + '=force')
        expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-option' })
      }
      avatar.movement!.hoverEnabled = false
      issue(script, '@adjustheight:20=force')
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-disabled' })
      expect(avatar.movement?.hoverOffset).toBeCloseTo(0.25)
    }
  }
})

it('accepts RLVa boolean numeric prefixes and rejects invalid options', async () => {
  const f = (await loadRlvPair({ source })).rlva
  f.script.start()
  for (const option of ['1', '1tail', 'true', 'true-tail']) {
    issue(f.script, '@fly:' + option + '=force')
    expect(f.avatar.info & AGENT_FLYING).toBe(AGENT_FLYING)
  }
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'unchanged' })
  for (const option of ['0', 'false', '0tail']) {
    issue(f.script, '@fly:' + option + '=force')
    expect(f.avatar.info & AGENT_FLYING).toBe(0)
  }
  for (const option of ['2', '-1', '2147483648']) {
    issue(f.script, '@fly:' + option + '=force')
    if (profile === 'rlv') expect(f.avatar.movement?.hoverOffset).toBe(2)
    else expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-option' })
  }
})

it('does not apply optioned locks and discovers the movement forms', async () => {
  const { getRlvCommandCoverage, getRlvCommands } = await import('../src/index.js')
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = (await loadRlvPair({ source }))[profile]
    f.script.start()
    issue(f.script, '@fly:bad=n,jump:bad=n,alwaysrun:bad=n,temprun:bad=n,allowidle:bad=n')
    expect(f.avatar.viewer.commandLog.every(e => e.status === 'unsupported')).toBe(true)
    expect(f.move('fly').allowed).toBe(true)
    expect(f.move('alwaysrun').allowed).toBe(true)
    expect(getRlvCommandCoverage(profile)).toContainEqual({ behaviour: 'adjustheight', type: 'force', support: 'enforced', option: 'any' })
    issue(f.script, '@allowidle=n,clear')
    const idle = getRlvViewerState(f.avatar).find(e => e.behaviour === 'allowidle')
    expect(idle?.restricted).toBe(profile === 'rlva' ? false : null)
  }
  expect(getRlvCommands('rlva', 'fly')).toBe('fly;fly')
  expect(getRlvCommands('rlva', 'adjustheight;force')).toBe('adjustheight')
})

it('rechecks RLVa flight when another movement behaviour toggles, including during clear', async () => {
  const f = (await loadRlvPair({ source })).rlva
  f.script.start()
  issue(f.script, '@alwaysrun=n,fly=n,fly=force')
  expect(f.avatar.info & AGENT_FLYING).toBe(AGENT_FLYING)
  issue(f.script, '@clear')
  expect(f.avatar.info & AGENT_FLYING).toBe(0)
  issue(f.script, '@fly=n,fly=force,temprun=n')
  expect(f.avatar.info & AGENT_FLYING).toBe(0)
})

it('keeps temporary running under an RLVa alwaysrun lock and clears it under Kokua', async () => {
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = (await loadRlvPair({ source }))[profile]
    f.script.start(); f.move('alwaysrun'); f.move('temprun')
    issue(f.script, '@alwaysrun=n')
    expect(f.avatar.movement?.tempRun).toBe(profile === 'rlva')
    expect(f.avatar.movement?.alwaysRun).toBe(false)
    issue(f.script, '@clear,adjustheight:1;1e999=force')
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: profile === 'rlv' ? 'unsupported-form' : 'failed-option' })
    f.avatar.movement!.pelvisToFoot = 0.5
    issue(f.script, '@adjustheight:1;1e999=force')
    if (profile === 'rlv') expect(f.avatar.movement?.hoverOffset).toBe(2)
    else expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-option' })
  }
})
