import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Money
// Measured on the Aditi beta grid, SLua Tideland, 2026-11-24: fivebot paid L$1 to objects
// i doll owned. Every payment moved L$1 from fivebot to i doll.
const handler = 'list log; default { money(key id, integer n) { log += [llGetLinkNumber(), id, n]; } }'
const plain = 'default { touch_start(integer n) { } }'
const payPrice = 'default { state_entry() { llSetPayPrice(5, [1, 2, 3, 4]); } }'

async function setup(prims: { scripts?: { name: string; source: string; running?: boolean }[] }[]) {
  const world = new World()
  world.addRegion('Pay', { x: 0, y: 0 })
  const owner = world.addAvatar({ username: 'owner', region: 'Pay' })
  const payer = world.addAvatar({ username: 'payer', region: 'Pay' })
  const loaded = await loadLinkset({ world, region: 'Pay', owner: owner.key, prims: prims.map(p => ({
    scripts: (p.scripts ?? []).map(s => ({ name: s.name, source: { source: s.source } })),
  })) })
  for (const p of prims) for (const s of p.scripts ?? []) {
    loaded.scripts[s.name]!.start()
    if (s.running === false) loaded.scripts[s.name]!.running = false
  }
  const pay = (link: number, menu?: boolean) => world.attemptAvatarPay(payer, loaded.linkset.prims[link - 1]!, 1, menu ? { menu } : undefined)
  const log = (name: string) => loaded.scripts[name]!.global('log')
  return { owner, payer, pay, log }
}

describe('paying an object directly', () => {
  // In-world: L$1 to a prim with no script, a prim whose script has no money handler, a prim
  // whose script only called llSetPayPrice, and a prim whose money handler was not running
  // -> each accepted, L$1 to the owner, no money event.
  it('accepts a payment to a prim with no running money handler and pays the owner', async () => {
    for (const scripts of [[], [{ name: 's', source: plain }], [{ name: 's', source: payPrice }], [{ name: 's', source: handler, running: false }]]) {
      const { owner, pay } = await setup([{ scripts }])
      expect(pay(1)).toMatchObject({ status: 'paid', recipient: owner.key, kind: 'object' })
    }
  })

  // In-world: a child with no script, a child whose script has no money handler, and a child
  // whose money handler was stopped, each linked to a root with a money handler; paying the
  // child -> the root's money event (link 1, the payer, 1).
  it('sends a payment to a child without a running handler to the root', async () => {
    for (const child of [[], [{ name: 'c', source: plain }], [{ name: 'c', source: handler, running: false }]]) {
      const { payer, pay, log } = await setup([{ scripts: [{ name: 'root', source: handler }] }, { scripts: child }])
      expect(pay(2).status).toBe('paid')
      expect(log('root')).toEqual([1, payer.key, 1])
    }
  })

  // In-world: root and child both with money handlers. Paying the child -> only the child's
  // money event (link 2). Paying the root -> only the root's (link 1).
  it('sends a payment to the paid prim alone when it has its own handler', async () => {
    const { payer, pay, log } = await setup([{ scripts: [{ name: 'root', source: handler }] }, { scripts: [{ name: 'child', source: handler }] }])
    pay(2)
    expect(log('root')).toEqual([])
    expect(log('child')).toEqual([2, payer.key, 1])
    pay(1)
    expect(log('root')).toEqual([1, payer.key, 1])
    expect(log('child')).toEqual([2, payer.key, 1])
  })

  // In-world: a root with no script linked to a child with a money handler. Paying the root
  // -> accepted, no money event anywhere.
  it('does not pass a payment to the root on to a child handler', async () => {
    const { pay, log } = await setup([{}, { scripts: [{ name: 'child', source: handler }] }])
    expect(pay(1).status).toBe('paid')
    expect(log('child')).toEqual([])
  })
})

describe('paying through the Pay menu', () => {
  // In-world (object details, the region's takes-money flag the viewer's Pay menu follows):
  // set on a prim with a running money handler and on every child of a root that has one;
  // clear on a prim with no script, a script without a money handler, a script that only
  // called llSetPayPrice, a stopped money handler, and a root whose only handler is in a child.
  it('is not offered where the prim and its root have no running money handler', async () => {
    for (const scripts of [[], [{ name: 's', source: plain }], [{ name: 's', source: payPrice }], [{ name: 's', source: handler, running: false }]]) {
      const { pay } = await setup([{ scripts }])
      expect(pay(1, true)).toMatchObject({ status: 'unsupported', reason: 'not-payable' })
    }
    const rootless = await setup([{}, { scripts: [{ name: 'child', source: handler }] }])
    expect(rootless.pay(1, true).reason).toBe('not-payable')
    expect(rootless.pay(2, true).status).toBe('paid')
    const rooted = await setup([{ scripts: [{ name: 'root', source: handler }] }, {}])
    expect(rooted.pay(2, true).status).toBe('paid')
    expect(rooted.log('root')).toEqual([1, rooted.payer.key, 1])
  })
})
