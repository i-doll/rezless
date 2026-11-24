import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Money
// Measured on the Aditi beta grid, SLua Tideland, 2026-11-24, Firestorm with RLVa: i doll wore
// three scripted linksets and fivebot paid each prim L$1 as an object payment. Every payment
// moved L$1 from fivebot to i doll, the wearer.
const handler = 'list log; default { money(key id, integer n) { log += [llGetLinkNumber(), id, n]; } }'
const plain = 'default { touch_start(integer n) { } }'

async function setup(prims: { scripts?: { name: string; source: string }[] }[]) {
  const world = new World()
  world.addRegion('Pay', { x: 0, y: 0 })
  const wearer = world.addAvatar({ username: 'wearer', region: 'Pay' })
  const payer = world.addAvatar({ username: 'payer', region: 'Pay' })
  const loaded = await loadLinkset({ world, region: 'Pay', owner: wearer.key, prims: prims.map(p => ({
    scripts: (p.scripts ?? []).map(s => ({ name: s.name, source: { source: s.source } })),
  })) })
  for (const p of prims) for (const s of p.scripts ?? []) loaded.scripts[s.name]!.start()
  loaded.linkset.attachToAvatar(wearer.key, 5)
  const pay = (link: number, menu?: boolean) => world.attemptAvatarPay(payer, loaded.linkset.prims[link - 1]!, 1, menu ? { menu } : undefined)
  const log = (name: string) => loaded.scripts[name]!.global('log')
  return { wearer, payer, pay, log }
}

describe('paying another avatar\'s attachment as an object', () => {
  // In-world: root and child with money handlers, a second child with no script. Paying the
  // root -> the root's money event (link 1); the child -> only its own (link 2); the bare
  // child -> the root's (link 1). L$1 to the wearer each time.
  it('runs the paid prim\'s handler, or the root\'s, as on a rezzed object', async () => {
    const { wearer, payer, pay, log } = await setup([
      { scripts: [{ name: 'root', source: handler }] }, { scripts: [{ name: 'child', source: handler }] }, {},
    ])
    expect(pay(1)).toMatchObject({ status: 'paid', recipient: wearer.key, kind: 'object' })
    expect(log('root')).toEqual([1, payer.key, 1])
    pay(2)
    expect(log('child')).toEqual([2, payer.key, 1])
    expect(log('root')).toEqual([1, payer.key, 1])
    pay(3)
    expect(log('root')).toEqual([1, payer.key, 1, 1, payer.key, 1])
  })

  // In-world: a root with no money handler linked to a child with one. Paying the root ->
  // accepted, no money event; paying the child -> the child's (link 2). A single prim whose
  // script has no money handler -> accepted, L$1 to the wearer, no money event.
  it('accepts payments where no handler runs and never passes one down to a child', async () => {
    const rootless = await setup([{ scripts: [{ name: 'root', source: plain }] }, { scripts: [{ name: 'child', source: handler }] }])
    expect(rootless.pay(1)).toMatchObject({ status: 'paid', recipient: rootless.wearer.key, kind: 'object' })
    expect(rootless.log('child')).toEqual([])
    rootless.pay(2)
    expect(rootless.log('child')).toEqual([2, rootless.payer.key, 1])
    const single = await setup([{ scripts: [{ name: 's', source: plain }] }])
    expect(single.pay(1)).toMatchObject({ status: 'paid', recipient: single.wearer.key, kind: 'object' })
  })
})

describe('paying another avatar\'s attachment through the Pay menu', () => {
  // Firestorm's Pay item on another avatar's attachment is enabled by EnablePayAvatar and pays
  // the wearer directly (complete_give_money walks up to the avatar), whatever scripts the
  // attachment holds. In-world: fivebot paid i doll L$1 as an avatar while i doll wore money
  // handlers -> L$1 to i doll, no money event in any attachment.
  it('pays the wearer as an avatar and runs no money handler', async () => {
    for (const prims of [[{ scripts: [{ name: 'root', source: handler }] }], [{}]]) {
      const { wearer, pay, log } = await setup(prims)
      expect(pay(1, true)).toMatchObject({ status: 'paid', recipient: wearer.key, kind: 'avatar' })
      if (prims[0]!.scripts) expect(log('root')).toEqual([])
    }
  })
})

// RLVa gates a direct object payment with @buy and the Pay menu's avatar payment with @pay.
it('checks @buy for an object payment and @pay for the menu', async () => {
  const f = (await loadRlvPair({ source: 'string command; default { touch_start(integer n) { llOwnerSay(command); } }' })).rlva
  f.script.start()
  const restrict = (cmd: string) => { f.script.setGlobal('command', cmd); f.script.fire('touch_start', { num_detected: 1 }) }
  const wearer = f.world.addAvatar({ username: 'wearer', region: f.avatar.region })
  const t = await loadLinkset({ world: f.world, region: f.avatar.region, owner: wearer.key, prims: [{ scripts: [{ name: 'payee', source: { source: handler } }] }] })
  t.scripts.payee!.start()
  t.linkset.attachToAvatar(wearer.key, 5)
  const root = t.linkset.prims[0]!
  restrict('@pay=n')
  expect(f.pay(root, 1).status).toBe('paid')
  expect(f.pay(root, 1, { menu: true })).toMatchObject({ status: 'blocked', reason: 'pay' })
  restrict('@pay=y,buy=n')
  expect(f.pay(root, 1)).toMatchObject({ status: 'blocked', reason: 'buy' })
  expect(f.pay(root, 1, { menu: true }).status).toBe('paid')
  expect(t.scripts.payee!.global('log')).toEqual([0, f.avatar.key, 1])
})
