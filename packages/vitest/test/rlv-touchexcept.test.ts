import { expect, it } from 'vitest'
import { checkAvatarTouch, getRlvCommandCoverage, getRlvCommands, loadLinkset, loadRlvPair } from '../src/index.js'

const controller = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
const receiver = 'integer touches; default { touch_start(integer n) { ++touches; } }'
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function command(f: Fixture, text: string) {
  f.script.setGlobal('command', text)
  f.script.fire('touch_start', { num_detected: 1 })
}
async function target(f: Fixture, kind: 'world' | 'self' | 'other' | 'hud' = 'world') {
  const owner = kind === 'other' ? f.world.addAvatar({ username: 'other', region: f.avatar.region }).key : f.avatar.key
  const t = await loadLinkset({ world: f.world, owner, region: f.avatar.region, prims: [
    { scripts: [{ name: 'root', source: { source: controller } }] },
    { scripts: [{ name: 'child', source: { source: controller } }, { name: 'receiver', source: { source: receiver } }] },
  ] })
  t.linkset.prims[0]!.params.position = { x: 3, y: 0, z: 0 }
  if (kind !== 'world') t.linkset.attachToAvatar(owner, kind === 'hud' ? 31 : 5)
  for (const script of Object.values(t.scripts)) script.start()
  const issue = (issuer: 'root' | 'child', text: string) => {
    // Issue while owned by the viewer avatar, then transfer ownership back.
    t.linkset.owner = f.avatar.key
    t.scripts[issuer]!.setGlobal('command', text)
    t.scripts[issuer]!.fire('touch_start', { num_detected: 1 })
    t.linkset.owner = owner
  }
  return { ...t, root: t.linkset.prims[0]!, child: t.linkset.prims[1]!, issue }
}

for (const kind of ['world', 'self', 'other', 'hud'] as const) it(`touchthis denies the root linkset on ${kind} and removal restores events`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await target(f, kind)
    command(f, `@touchthis:${t.root.key}=add`)
    const denied = f.touch(t.child)
    expect(denied).toMatchObject({ status: 'blocked', reason: 'touchthis' })
    expect(denied.restrictions.map(rule => rule.rule)).toEqual([`touchthis:${t.root.key}`])
    expect(t.scripts.receiver!.global('touches')).toBe(0)
    command(f, `@touchthis:${t.root.key}=rem`)
    expect(f.touch(t.child).status).toBe('touched')
    expect(t.scripts.receiver!.global('touches')).toBe(1)
    command(f, `@touchthis:${t.child.key}=n`)
    expect(f.touch(t.child).status).toBe('touched')
    expect(f.touch(t.root).status).toBe('touched')
  }
})

for (const kind of ['world', 'self', 'other', 'hud'] as const) for (const issuer of ['root', 'child'] as const)
it(`touchme from ${issuer} overrides all locks on ${kind} with profile issuer scope`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f, kind)
    command(f, `@touchall=n,touchworld_sec=n,touchworld=n,touchhud=n,touchhud_sec=n,touchattach=n,touchattachself=n,touchattachother=n,touchattachother:${t.linkset.owner}=n,fartouch=n,touchthis:${t.root.key}=n,permissive=n`)
    t.issue(issuer, '@touchme=add')
    const allowed = issuer === 'root' || profile === 'rlva'
    expect(checkAvatarTouch(f.world, f.avatar, t.child).status, profile).toBe(allowed ? 'allowed' : 'blocked')
    expect(t.scripts.receiver!.global('touches')).toBe(0)
    expect(f.touch(t.child).status, profile).toBe(allowed ? 'touched' : 'blocked')
    expect(f.touch(t.root).status, profile).toBe(allowed ? 'touched' : 'blocked')
    expect(t.scripts.receiver!.global('touches')).toBe(allowed ? 1 : 0)
    t.issue(issuer, '@touchme=rem')
    expect(f.touch(t.child).status).toBe('blocked')
    t.issue(issuer, '@touchme=n,clear=touchme')
    expect(f.touch(t.child).status).toBe('blocked')
  }
})

it('touchme grants only its issuer and leaves unrelated targets locked', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const a = await target(f), b = await target(f)
    command(f, '@touchall=n,touchme=n')
    expect(f.touch(a.child).status).toBe('blocked')
    a.issue('root', '@touchme=n')
    expect(f.touch(a.child).status).toBe('touched')
    expect(f.touch(b.child).status).toBe('blocked')
  }
})

it('touchthis ignores permissive grants and stays locked until every targeting issuer releases', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await target(f)
    command(f, `@touchthis:${t.root.key}=n,touchworld:${t.root.key}=n,touchattach:${t.root.key}=n`)
    t.issue('child', `@touchthis:${t.root.key}=n`)
    command(f, '@clear=touchthis')
    expect(f.touch(t.child)).toMatchObject({ status: 'blocked', reason: 'touchthis' })
    t.issue('child', '@clear=touchthis')
    expect(f.touch(t.child).status).toBe('touched')
  }
})

it('keeps unsupported forms inspectable and advertises the implemented forms', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f)
    command(f, `@touchthis=n,touchthis:invalid=n,touchme:${t.root.key}=n,touchthis_sec:${t.root.key}=n,touchme_sec=n`)
    expect(f.avatar.viewer.commandLog.map(entry => entry.status)).toEqual([
      'unsupported', 'unsupported', 'unsupported', 'unsupported', 'unsupported',
    ])
    expect(f.touch(t.child).status).toBe('touched')
    expect(f.avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'unsupported').length).toBe(profile === 'rlv' ? 5 : 0)
    expect(getRlvCommandCoverage(profile)).toEqual(expect.arrayContaining([
      { behaviour: 'touchme', type: 'add', support: 'enforced', option: 'none' },
      { behaviour: 'touchthis', type: 'add', support: 'enforced', option: 'any' },
    ]))
  }
  expect(getRlvCommands('rlva', 'touch;add')).toBe('fartouch;setoverlay_touch;touchall;touchattach;touchattachother;touchattachself;touchfar;touchhud;touchme;touchthis;touchworld')
})
