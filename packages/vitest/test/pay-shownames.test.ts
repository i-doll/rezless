import { expect, it } from 'vitest'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Money
// Firestorm RLVa 2.4.2: enable_pay_avatar (llviewermenu.cpp) enables the Pay item on another avatar
// and on that avatar's attachments only when RlvActions::canShowName(SNC_DEFAULT, avatar) and
// RlvActions::canPayAvatar(avatar) both hold. Other ways to pay an avatar check only @pay.
// The Pay menu itself wasn't opened in-world, so its result comes from that source. Measured on the
// Aditi beta grid, SLua Tideland, 2026-11-24, Firestorm RLVa 2.4.2, with i doll paying fivebot: the
// same canShowName check, read from whether i doll's viewer hid fivebot's name, under each
// restriction form below, and the direct payments.
const source = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
const handler = 'integer count; default { money(key id, integer n) { ++count; } }'
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlva']
function send(f: Fixture, command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}

async function setup() {
  const pair = await loadRlvPair({ source })
  const fixtures = []
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    other.scripts.other!.start()
    const wearer = f.world.addAvatar({ username: 'wearer', region: f.avatar.region })
    const worn = await loadLinkset({ world: f.world, region: f.avatar.region, owner: wearer.key,
      prims: [{ scripts: [{ name: 'payee', source: { source: handler } }] }] })
    worn.scripts.payee!.start()
    worn.linkset.attachToAvatar(wearer.key, 5)
    fixtures.push({ profile, f, other: { ...f, script: other.scripts.other! }, wearer,
      attachment: worn.linkset.prims[0]!, count: () => worn.scripts.payee!.global('count') })
  }
  return fixtures
}

// In-world: @shownames=n -> fivebot's name hidden. Direct payments still went through: L$1 to
// fivebot as an avatar and L$2 to fivebot's worn prim as an object (its money event ran), and
// fivebot's balance rose by L$3.
it('blocks the Pay menu on an avatar and its attachments under RLVa @shownames', async () => {
  for (const { profile, f, wearer, attachment, count } of await setup()) {
    send(f, '@shownames=n')
    for (const target of [wearer, attachment]) {
      const action = f.pay(target, 1, { menu: true })
      if (profile === 'rlva') {
        expect(action).toMatchObject({ status: 'blocked', reason: 'shownames', recipient: wearer.key, kind: 'avatar' })
        expect(action.restrictions.map(r => r.behaviour)).toEqual(['shownames'])
      } else {
        expect(action.status, profile).toBe('paid')
      }
    }
    expect(f.pay(wearer, 1)).toMatchObject({ status: 'paid', kind: 'avatar' })
    expect(f.pay(attachment, 1)).toMatchObject({ status: 'paid', kind: 'object' })
    expect(count()).toBe(1)
    send(f, '@shownames=y')
    expect(f.pay(wearer, 1, { menu: true }).status).toBe('paid')
  }
})

// In-world, with two worn objects r1 and r2: @shownames:<fivebot>=add alone -> name shown;
// r1 exception + r2 @shownames=n -> shown; r1 exception + r2 @shownames_sec=n -> hidden;
// adding r2's own exception -> shown; r2 @shownames_sec=n with only r2's exception -> shown;
// r1 @shownames=n,permissive=n with r2's exception -> hidden, until r1 adds its own -> shown.
it('lets an exception for the avatar reopen the Pay menu, from any issuer unless the restriction is secure', async () => {
  for (const { profile, f, other, wearer, attachment } of await setup()) {
    if (profile !== 'rlva') continue
    const menu = () => [f.pay(wearer, 1, { menu: true }).status, f.pay(attachment, 1, { menu: true }).status]
    send(f, `@shownames:${wearer.key}=add`)
    expect(menu()).toEqual(['paid', 'paid'])
    send(other, '@shownames=n')
    expect(menu()).toEqual(['paid', 'paid'])
    send(other, '@shownames=y,shownames_sec=n')
    expect(menu()).toEqual(['blocked', 'blocked'])
    expect(f.pay(wearer, 1, { menu: true })).toMatchObject({ reason: 'shownames_sec', restrictions: [{ behaviour: 'shownames_sec' }] })
    send(other, `@shownames:${wearer.key}=add`)
    expect(menu()).toEqual(['paid', 'paid'])
    send(f, '@clear')
    expect(menu()).toEqual(['paid', 'paid'])
    send(other, '@clear')
    send(f, '@shownames=n,permissive=n')
    send(other, `@shownames:${wearer.key}=add`)
    expect(menu()).toEqual(['blocked', 'blocked'])
    send(f, `@shownames:${wearer.key}=add`)
    expect(menu()).toEqual(['paid', 'paid'])
  }
})

it('reports @pay before @shownames when both block the menu', async () => {
  for (const { profile, f, wearer } of await setup()) {
    if (profile !== 'rlva') continue
    send(f, '@pay=n,shownames=n')
    const action = f.pay(wearer, 1, { menu: true })
    expect(action).toMatchObject({ status: 'blocked', reason: 'pay' })
    expect(action.restrictions.map(r => r.behaviour)).toEqual(['pay', 'shownames'])
  }
})
