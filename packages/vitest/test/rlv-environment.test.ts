import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, getRlvCommandCoverage } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::forceEnvironment/getEnvironment.
// Firestorm RLVa 2.4.2: RlvEnvironment, RlvActions::canChangeEnvironment.
const source = `string command; default { touch_start(integer n) { llOwnerSay(command); } }`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function send(f: Fixture, command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
function reply(f: Fixture, name: string) {
  send(f, `@getenv_${name}=29701`)
  const entry = f.avatar.viewer.commandLog.at(-1)!
  return entry.status === 'replied' ? entry.reply.text : undefined
}

it('reads defaults and applies scalar, vector and intensity changes with profile reply formats', async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    expect(reply(f, 'daytime')).toBe(profile === 'rlv' ? '-1' : '-1.000000')
    send(f, '@setenv_ambient:0.2/0.4/0.6=force,setenv_ambienti:0.3=force')
    expect(reply(f, 'ambient')).toBe(profile === 'rlv' ? '0.1;0.2;0.3' : '0.100000/0.200000/0.300000')
    send(f, '@setenv_hazedensity:0.25=force,setenv_cloudscroll:1/2=force')
    expect(reply(f, 'hazedensity')).toBe(profile === 'rlv' ? '0.25' : '0.250000')
    expect(reply(f, 'cloudscroll')).toBe(profile === 'rlv' ? '1;2' : '1.000000/2.000000')
    expect(f.avatar.viewer.environment.sky.hazedensity).toBe(profile === 'rlv' ? 1 : 0.25)
    expect(reply(f, 'cloudscrollx')).toBe(profile === 'rlv' ? '1' : '1.000000')
    expect(reply(f, 'daytime')).toBe(profile === 'rlv' ? '-1' : '2.000000')
  }
})

it('honors other issuers environment locks and lets the locking issuer force changes', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const other = { ...f, script: loaded.scripts.other! }; other.script.start()
    send(f, '@setenv=n,setenv_starbrightness:0.5=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(0.5)
    send(other, '@setenv_starbrightness:0.75=force')
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-lock' })
    expect(Number(reply(f, 'starbrightness'))).toBe(0.5)
    send(f, '@clear=setenv')
    send(other, '@setenv_starbrightness:0.75=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(0.75)
  }
})

it('preserves permissive Kokua numbers and delimiters, strict RLVa vectors and unsupported aliases', async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    send(f, '@setenv_cloudcolor:0.1;0.2;0.3=force')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'applied' : 'unsupported')
    send(f, '@setenv_starbrightness:bad=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(profile === 'rlv' ? 0 : 250)
    send(f, '@setenv_starbrightness:0.25suffix=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(0.25)
    send(f, '@setenv_sunimage:12345678-1234-1234-1234-123456789abc=force')
    expect(reply(f, 'suntexture')).toBe(profile === 'rlv' ? '12345678-1234-1234-1234-123456789abc' : '00000000-0000-0000-0000-000000000000')
    expect(getRlvCommandCoverage(profile as 'rlv' | 'rlva').find(e => e.behaviour === 'setenv_sunimage')?.support)
      .toBe(profile === 'rlv' ? 'enforced' : 'unsupported')
  }
})

it('handles daytime reset and profile-specific gamma range', async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    send(f, '@setenv_scenegamma:30=force')
    expect(Number(reply(f, 'scenegamma'))).toBe(profile === 'rlv' ? 20 : 30)
    send(f, '@setenv_daytime:2=force')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'applied' : 'unsupported')
    send(f, '@setenv_daytime:-1=force')
    expect(reply(f, 'daytime')).toBe(profile === 'rlv' ? '-1' : '-1.000000')
  }
})

it('round trips every scalar, texture and vector setting with the expected native transformations', async () => {
  const pair = await loadRlvPair({ source })
  const scalars = ['densitymultiplier', 'distancemultiplier', 'dropletradius', 'hazedensity', 'hazehorizon',
    'icelevel', 'maxaltitude', 'moisturelevel', 'scenegamma', 'cloudcoverage', 'cloudscale', 'cloudvariance',
    'moonbrightness', 'moonscale', 'sunglowsize', 'sunglowfocus', 'sunscale', 'starbrightness']
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    for (const name of scalars) {
      send(f, `@setenv_${name}:0.5=force`)
      expect(Number(reply(f, name)), `${profile} ${name}`).toBe(0.5)
    }
    for (const name of ['ambient', 'bluedensity', 'bluehorizon', 'cloudcolor', 'clouddensity', 'clouddetail', 'sunlightcolor', 'cloudscroll']) {
      const value = name === 'cloudscroll' ? '0.25/0.5' : '0.25/0.5/0.75'
      send(f, `@setenv_${name}:${value}=force`)
      expect(reply(f, name)).toBe(profile === 'rlv' ? value.replaceAll('/', ';') : value.split('/').map(n => Number(n).toFixed(6)).join('/'))
    }
    for (const name of ['suntexture', 'moontexture', 'cloudtexture']) {
      send(f, `@setenv_${name}:12345678-1234-1234-1234-123456789abc=force`)
      expect(reply(f, name)).toBe('12345678-1234-1234-1234-123456789abc')
      send(f, `@setenv_${name}:bad=force`)
      expect(reply(f, name)).toBe(profile === 'rlv' ? '00000000-0000-0000-0000-000000000000' : '12345678-1234-1234-1234-123456789abc')
    }
  }
})

it('updates components and rescales zero and nonzero color intensity', async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    for (const base of ['ambient', 'bluedensity', 'bluehorizon', 'cloudcolor', 'sunmooncolor']) {
      for (const suffix of ['r', 'g', 'b']) {
        send(f, `@setenv_${base}${suffix}:0.25=force`)
        expect(Number(reply(f, base + suffix))).toBe(0.25)
      }
      send(f, `@setenv_${base}i:0=force,setenv_${base}i:0.5=force`)
      expect(Number(reply(f, base + 'i'))).toBe(0.5)
    }
    for (const base of ['cloud', 'clouddetail', 'cloudscroll']) {
      for (const suffix of base === 'cloudscroll' ? ['x', 'y'] : ['x', 'y', 'd']) {
        send(f, `@setenv_${base}${suffix}:0.25=force`)
        expect(Number(reply(f, base + suffix))).toBe(0.25)
      }
    }
    if (profile === 'rlva') {
      send(f, '@setenv_ambientx:0.75=force,setenv_ambienty:0.5=force,setenv_ambientd:0.25=force')
      expect(reply(f, 'ambient')).toBe('0.750000/0.500000/0.250000')
    }
  }
})

it('selects fixtures from the profile environment folder and restores shared values', async () => {
  const asset = '12345678-1234-1234-1234-123456789abc'
  const pair = await loadRlvPair({ source, viewer: { environment: {
    sharedSky: { starbrightness: 3 }, daytimeSkies: { '0.5': { starbrightness: 7 } },
    presets: [
      { name: 'same', asset, type: 'sky', location: 'inventory', sky: { starbrightness: 1 } },
      { name: 'same', asset: '22345678-1234-1234-1234-123456789abc', type: 'sky', location: 'library', sky: { starbrightness: 2 } },
      { name: 'cycle', asset: '32345678-1234-1234-1234-123456789abc', type: 'daycycle', location: 'library', sky: { starbrightness: 4 } },
    ],
  } } })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    send(f, '@setenv_preset:same=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(profile === 'rlv' ? 1 : 2)
    expect(reply(f, 'preset')).toBe(profile === 'rlv' ? 'same' : undefined)
    send(f, '@setenv_preset:missing=force')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'applied' : 'unsupported')
    send(f, `@setenv_asset:${asset}=force`)
    expect(Number(reply(f, 'starbrightness'))).toBe(1)
    send(f, '@setenv_daycycle:cycle=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(profile === 'rlv' ? 1 : 4)
    send(f, '@setenv_daytime:0.5=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(profile === 'rlv' ? 1 : 7)
    send(f, '@setenv_daytime:-1=force')
    expect(Number(reply(f, 'starbrightness'))).toBe(3)
  }
})

it('formats sun angles and clamps elevation while preserving legacy paired setter inputs', async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    send(f, '@setenv_sunazimuth:-1=force,setenv_sunelevation:-0.5=force')
    expect(Number(reply(f, 'sunazimuth'))).toBeCloseTo(profile === 'rlv' ? -1 : 2 * Math.PI - 1, 5)
    expect(Number(reply(f, 'sunelevation'))).toBeCloseTo(profile === 'rlv' ? -0.5 : 2 * Math.PI - 0.5, 5)
    send(f, '@setenv_moonazimuth:1=force,setenv_moonelevation:9=force')
    expect(Number(reply(f, 'moonelevation'))).toBeCloseTo(Math.PI / 2, 5)
    send(f, '@setenv_eastangle:0.125=force,setenv_sunmoonposition:0.125=force')
    expect(reply(f, 'eastangle')).toBe(profile === 'rlv' ? '0.125;0.125' : '0.125000')
    expect(reply(f, 'sunmoonposition')).toBe(profile === 'rlv' ? '0.125;0.125' : '0.125000')
  }
})

it('delivers wire replies after yield and rejects invalid channels, kinds and unsupported names', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(29701,"",llGetOwner(),"");
      llOwnerSay("@setenv_starbrightness:0.5=force,getenv_starbrightness=29701,getenv_unknown=29701"); }
    listen(integer c,string n,key id,string message) { replies += [message]; }
  }` })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    expect(f.script.global('replies')).toEqual(profile === 'rlv' ? ['0.5', ''] : ['0.500000'])
  }
  const commands = await loadRlvPair({ source })
  for (const f of Object.values(commands)) {
    f.script.start()
    send(f, '@getenv_starbrightness=0,getenv_starbrightness=n,setenv_starbrightness=n,setenv:nonsense=n')
    expect(f.avatar.viewer.commandLog.every(e => e.status === 'unsupported')).toBe(true)
  }
})

it('formats small and large numbers, keeps snapshots immutable and separates avatar state', async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    send(f, '@setenv_starbrightness:0.00001=force')
    expect(reply(f, 'starbrightness')).toBe(profile === 'rlv' ? '1e-05' : '0.000010')
    send(f, '@setenv_starbrightness:1000000=force')
    expect(reply(f, 'starbrightness')).toBe(profile === 'rlv' ? '1e+06' : '1000000.000000')
    const snapshot = f.avatar.viewer.environment.sky
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.ambient)).toBe(true)
    send(f, '@setenv_starbrightness:0.5=force')
    expect(snapshot.starbrightness).toBe(1000000)
    const other = f.world.addAvatar({ username: 'other', region: f.avatar.region, viewer: { profile: profile as 'rlv' | 'rlva' } })
    expect(other.viewer.environment.sky.starbrightness).toBe(250)
  }
})
