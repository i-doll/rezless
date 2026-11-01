import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, NULL_KEY, World, getRlvCommands } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::forceDebugSetting/getDebugSetting/force/add.
// Firestorm RLVa 2.4.2: RlvExtGetSet and RlvBehaviourToggleHandler<RLV_BHVR_SETDEBUG>.
const source = `list replies; default {
  state_entry() { llListen(296,"",llGetOwner(),""); }
  link_message(integer s,integer n,string m,key id) { llOwnerSay(m); }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const issue = (script: import('@rezless/vm').Script, str: string) =>
  script.fire('link_message', { sender_num: 1, num: 0, str, id: NULL_KEY })

it('queries default settings with named AspectRatio expectations', async () => {
  for (const [profile, { script, avatar }] of Object.entries(await loadRlvPair({ source }))) {
    script.start()
    issue(script, '@getdebug_avatarsex=296,getdebug_renderresolutiondivisor=296,getdebug_restrainedloveforbidgivetorlv=296,getdebug_restrainedlovenosetenv=296,getdebug_windlightuseatmosshaders=296,getdebug_aspectratio=296,getdebug_unknown=296')
    expect(script.global('replies')).toEqual(['0', '1', '0', '0', '1', profile === 'rlva' ? '1.778' : '', ''])
    expect(avatar.viewer.diagnostics).toEqual([])
  }
})

it('keeps configured settings per avatar and reads existing viewer options', async () => {
  const pair = await loadRlvPair({ source, viewer: { rlvaNoSetEnv: true,
    inventory: { sharedRootId: null, entries: [], forbidGiveToRlv: true }, debugSettings: { avatarSex: 1, renderResolutionDivisor: 4, aspectRatio: 1.25, windLightUseAtmosShaders: false, noSetEnv: true } } })
  for (const [profile, { script }] of Object.entries(pair)) {
    script.start()
    issue(script, '@getdebug_avatarsex=296,getdebug_renderresolutiondivisor=296,getdebug_aspectratio=296,getdebug_restrainedloveforbidgivetorlv=296,getdebug_restrainedlovenosetenv=296,getdebug_windlightuseatmosshaders=296')
    expect(script.global('replies')).toEqual(['1', '4', profile === 'rlva' ? '1.250' : '', '1', '1', '0'])
  }
  issue(pair.rlv.script, '@setdebug_renderresolutiondivisor:8=force')
  expect(pair.rlv.avatar.viewer.debugSettings.renderResolutionDivisor).toBe(8)
  expect(pair.rlva.avatar.viewer.debugSettings.renderResolutionDivisor).toBe(4)
})

it('converts writable values with profile-specific validation and unsigned formatting', async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, { script, avatar }] of Object.entries(pair)) {
    script.start()
    for (const value of ['3tail', '-1', 'bad', '', '12']) {
      issue(script, `@setdebug_renderresolutiondivisor:${value}=force,getdebug_renderresolutiondivisor=296`)
    }
    expect(script.global('replies')).toEqual(profile === 'rlv'
      ? ['3', '4294967295', '0', '0', '12']
      : ['3', '4294967295', '4294967295', '4294967295', '12'])
    issue(script, '@setdebug_avatarsex:true=force,getdebug_avatarsex=296,setdebug_avatarsex:2=force,getdebug_avatarsex=296,setdebug_avatarsex: 1 =force,getdebug_avatarsex=296')
    expect((script.global('replies') as string[]).slice(-3)).toEqual(profile === 'rlv' ? ['0', '2', '1'] : ['true', 'true', ' 1 '])
    expect(avatar.viewer.debugSettings.renderResolutionDivisor).toBe(12)
  }
})

it('enforces other issuers locks, permits own forces, and leaves values on removal and clear', async () => {
  for (const { script, avatar, world } of Object.values(await loadRlvPair({ source }))) {
    script.start()
    issue(script, '@setdebug=n,setdebug_renderresolutiondivisor:3=force')
    expect(avatar.viewer.debugSettings.renderResolutionDivisor).toBe(3)
    expect(avatar.viewer.restrictions.snapshot()[0]).toMatchObject({ behaviour: 'setdebug', support: 'enforced' })
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    other.scripts.other!.start()
    issue(other.scripts.other!, '@setdebug=n,setdebug_renderresolutiondivisor:5=force,getdebug_renderresolutiondivisor=296')
    expect(other.scripts.other!.global('replies')).toEqual(['3'])
    expect(avatar.viewer.debugSettings.renderResolutionDivisor).toBe(3)
    issue(script, '@setdebug_renderresolutiondivisor:6=force')
    expect(avatar.viewer.debugSettings.renderResolutionDivisor).toBe(3)
    issue(other.scripts.other!, '@clear')
    issue(script, '@setdebug_renderresolutiondivisor:6=force,setdebug=y,getdebug_renderresolutiondivisor=296,clear')
    expect(script.global('replies')).toEqual(['3', '6'])
    expect(avatar.viewer.debugSettings.renderResolutionDivisor).toBe(6)
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  }
})

it('rejects read-only writes, validates options and channels, and discovers concrete forms', async () => {
  for (const [profile, { script, avatar }] of Object.entries(await loadRlvPair({ source }))) {
    script.start()
    issue(script, '@setdebug_aspectratio:2=force,setdebug_windlightuseatmosshaders:0=force,setdebug_unknown:1=force,getdebug_windlightuseatmosshaders:ignored=296,getdebug_avatarsex=0')
    expect(script.global('replies')).toEqual(['1'])
    expect(avatar.viewer.debugSettings.windLightUseAtmosShaders).toBe(true)
    expect(avatar.viewer.commandLog.slice(0, 3).every(e => e.status === 'unsupported')).toBe(true)
    issue(script, '@setdebug:bad=n')
    expect(avatar.viewer.restrictions.snapshot().filter(r => r.support === 'enforced')).toEqual([])
    if (profile === 'rlva') {
      expect(getRlvCommands('rlva', 'debug;force')).toBe('setdebug_avatarsex;setdebug_renderresolutiondivisor')
      expect(getRlvCommands('rlva', 'debug;reply')).toContain('getdebug_aspectratio')
    }
  }
})

it('applies Kokua shader activation on adding its lock unless noSetEnv is configured', async () => {
  for (const noSetEnv of [false, true]) {
    const pair = await loadRlvPair({ source, viewer: { debugSettings: { noSetEnv, windLightUseAtmosShaders: false } } })
    for (const [profile, { script, avatar }] of Object.entries(pair)) {
      script.start(); issue(script, '@setdebug=n,getdebug_windlightuseatmosshaders=296')
      expect(script.global('replies')).toEqual([profile === 'rlv' && !noSetEnv ? '1' : '0'])
      expect(avatar.viewer.debugSettings.windLightUseAtmosShaders).toBe(profile === 'rlv' && !noSetEnv)
    }
  }
})

it('leaves disabled viewers inert', async () => {
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'test' })
  const loaded = await loadLinkset({ world, owner: avatar.key, region: 'test', prims: [{ scripts: [{ name: 'off', source: { source } }] }] })
  const script = loaded.scripts.off!; script.start()
  issue(script, '@setdebug_renderresolutiondivisor:5=force,getdebug_renderresolutiondivisor=296')
  expect(script.global('replies')).toEqual([])
  expect(avatar.viewer.debugSettings.renderResolutionDivisor).toBe(1)
  expect(avatar.viewer.commandLog).toEqual([])
})

it('notifies Kokua own-lock removal and restoration while RLVa keeps its lock in place', async () => {
  for (const [profile, { script, avatar }] of Object.entries(await loadRlvPair({ source }))) {
    script.start()
    issue(script, '@notify:296;setdebug=n,setdebug=n,fly=n,setdebug_renderresolutiondivisor:3=force')
    expect(script.global('replies')).toEqual(profile === 'rlv'
      ? ['/setdebug=n', '/setdebug=y', '/setdebug=n']
      : ['/notify:296;setdebug=n', '/setdebug=n'])
    expect(avatar.viewer.restrictions.snapshot().map(r => r.behaviour)).toEqual(profile === 'rlv'
      ? ['notify', 'fly', 'setdebug'] : ['notify', 'setdebug', 'fly'])
    expect(avatar.viewer.debugSettings.renderResolutionDivisor).toBe(3)
  }
})
