import { expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, getRlvCommands, World, Prim, rlvExpectationFor, type RlvExpectations } from '../src/index.js'

// Money event contract: https://wiki.secondlife.com/wiki/Money
// Pay-price configuration: https://wiki.secondlife.com/wiki/LlSetPayPrice
const paymentStatus: RlvExpectations<string> = {
  rlv: { kind: 'expected', value: 'paid' },
  rlva: { kind: 'expected', value: 'blocked' },
}
const source = `string command; default { touch_start(integer n) { llOwnerSay(command); } }`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function command(f: Fixture, value: string) {
  f.script.setGlobal('command', value)
  f.script.fire('touch_start', { num_detected: 1 })
}
async function vendor(f: Fixture) {
  const t = await loadLinkset({ world: f.world, region: f.avatar.region, prims: [{ scripts: [{ name: 'vendor', source: { source: `
    integer total; integer count; key payer;
    default { state_entry() { llSetPayPrice(10, [1,5,10,20]); }
      money(key id, integer amount) { total += amount; ++count; payer = id; }
    }` } }] }] })
  t.scripts.vendor!.start()
  return t
}

it('separates avatar pay from object pay and records profile-specific deciding locks', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await vendor(f), prim = t.linkset.prims[0]!
    const recipient = f.world.addAvatar({ username: 'recipient', region: f.avatar.region })
    expect(f.pay(prim, 7).status).toBe('paid')
    expect(t.scripts.vendor!.global('payer')).toBe(f.avatar.key)
    command(f, '@pay=n')
    expect(f.avatar.viewer.commandLog.at(-1)?.status, profile).toBe(profile === 'rlva' ? 'applied' : 'unsupported')
    const expected = rlvExpectationFor(paymentStatus, profile)
    if (expected.kind !== 'expected') throw new Error(expected.reason)
    expect(f.pay(recipient, 9).status, profile).toBe(expected.value)
    expect(f.pay(prim, 11).status).toBe('paid')
    command(f, '@buy=add')
    const before = t.scripts.vendor!.global('total')
    const action = f.pay(prim, 13)
    expect(action.status, profile).toBe(profile === 'rlva' ? 'blocked' : 'paid')
    expect(action.restrictions.map(r => r.behaviour), profile).toEqual(profile === 'rlva' ? ['buy'] : [])
    expect(t.scripts.vendor!.global('total')).toBe(profile === 'rlva' ? before : 31)
    command(f, '@pay=y,buy=rem')
    expect(f.pay(recipient, 1).status).toBe('paid')
    expect(f.pay(prim, 2).status).toBe('paid')
    expect(f.payActions).toHaveLength(6)
    expect(Object.isFrozen(f.payActions)).toBe(true)
    expect(Object.isFrozen(action.restrictions)).toBe(true)
  }
})

it('applies buy to original, copy and contents requests, including free purchases, without money events', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await vendor(f), root = t.linkset.prims[0]!
    expect(f.buy(root)).toMatchObject({ status: 'unsupported', reason: 'not-for-sale' })
    for (const type of ['original', 'copy', 'contents'] as const) {
      const sale = { type, price: type === 'contents' ? 0 : 10 }
      f.world.setObjectSale(root, sale)
      command(f, '@pay=n')
      expect(f.buy(root)).toMatchObject({ status: 'requested', sale })
      command(f, '@buy=n')
      expect(f.buy(root).status, profile).toBe(profile === 'rlva' ? 'blocked' : 'requested')
      command(f, '@clear')
    }
    expect(t.scripts.vendor!.global('count')).toBe(0)
    expect(f.buyActions).toHaveLength(7)
    expect(Object.isFrozen(f.buyActions.at(-1)?.sale)).toBe(true)
    f.world.setObjectSale(root, null)
    expect(f.buy(root).reason).toBe('not-for-sale')
  }
})

it('pays an attachment wearer as an avatar and never delivers money to the attachment', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const wearer = f.world.addAvatar({ username: 'wearer', region: f.avatar.region })
    const t = await vendor(f), root = t.linkset.prims[0]!
    t.linkset.attachToAvatar(wearer.key, 5)
    command(f, '@buy=n')
    expect(f.pay(root, 1)).toMatchObject({ status: 'paid', recipient: wearer.key, kind: 'avatar' })
    command(f, '@pay=n')
    expect(f.pay(root, 1).status, profile).toBe(profile === 'rlva' ? 'blocked' : 'paid')
    expect(t.scripts.vendor!.global('count')).toBe(0)
    f.world.setObjectSale(root, { type: 'copy', price: 10 })
    expect(f.buy(root).status).toBe('unsupported')
  }
})

it('keeps option, secure and force forms unsupported and advertises only RLVa no-option switches', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    command(f, `@pay:${f.avatar.key}=n,buy:${f.avatar.key}=n,pay_sec=n,buy_sec=n,pay=force,buy=force`)
    expect(f.avatar.viewer.commandLog.every(r => r.status === 'unsupported')).toBe(true)
  }
  expect(getRlvCommands('rlva', 'pay;add')).toBe('pay')
  expect(getRlvCommands('rlva', 'buy;add')).toBe('buy')
  expect(getRlvCommands('rlv', 'pay;add')).toBeUndefined()
})

it('validates actor, target and integer amounts and leaves rejected attempts without events', async () => {
  const f = (await loadRlvPair({ source })).rlva
  const t = await vendor(f), root = t.linkset.prims[0]!
  const foreign = new World()
  foreign.addRegion('Foreign', { x: 0, y: 0 })
  const outsider = foreign.addAvatar({ username: 'outsider', region: 'Foreign' })
  expect(f.world.attemptAvatarPay(outsider, root, 1).reason).toBe('avatar')
  expect(f.world.attemptAvatarBuy(outsider, root).reason).toBe('avatar')
  expect(f.pay(outsider, 1).reason).toBe('target')
  expect(f.pay(new Prim(), 1).reason).toBe('target')
  expect(f.buy(new Prim()).reason).toBe('target')
  for (const amount of [-1, 1.5, NaN, Infinity, 2147483648]) expect(f.pay(root, amount).reason).toBe('amount')
  expect(f.pay(root, 0).status).toBe('paid')
  expect(t.scripts.vendor!.global('count')).toBe(1)
  t.linkset.remove()
  expect(f.pay(root, 1).reason).toBe('target')
  expect(f.buy(root).reason).toBe('target')
})

it('supports disabled viewers without restrictions and retains immutable sale snapshots', async () => {
  const world = new World()
  world.addRegion('Test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'payer', region: 'Test' })
  const t = await loadLinkset({ world, region: 'Test', prims: [{}] })
  const root = t.linkset.prims[0]!
  const sale = { type: 'copy' as const, price: 4 }
  world.setObjectSale(root, sale)
  sale.price = 8
  expect(world.attemptAvatarBuy(avatar, root)).toMatchObject({ status: 'requested', sale: { price: 4 } })
  expect(world.attemptAvatarPay(avatar, root, 1).reason).toBe('not-payable')
  const recipient = world.addAvatar({ username: 'recipient', region: 'Test' })
  expect(world.attemptAvatarPay(avatar, recipient, 2).status).toBe('paid')
  expect(() => world.setObjectSale(root, { type: 'copy', price: -1 })).toThrow()
})

it('keeps other issuers locked after remove and clear, with immutable earlier outcomes', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await vendor(f), root = t.linkset.prims[0]!
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const issuer = other.scripts.other!
    issuer.start()
    issuer.setGlobal('command', '@buy=n')
    issuer.fire('touch_start', { num_detected: 1 })
    command(f, '@buy=n')
    const locked = f.pay(root, 1)
    expect(locked.restrictions).toHaveLength(profile === 'rlva' ? 2 : 0)
    command(f, '@clear=buy')
    expect(f.pay(root, 1).status, profile).toBe(profile === 'rlva' ? 'blocked' : 'paid')
    issuer.setGlobal('command', '@buy=y')
    issuer.fire('touch_start', { num_detected: 1 })
    expect(f.pay(root, 1).status).toBe('paid')
    expect(locked.restrictions).toHaveLength(profile === 'rlva' ? 2 : 0)
    expect(Object.isFrozen(locked)).toBe(true)
  }
})

it('queues money to every running handler on the paid prim and resolves child sales through the root', async () => {
  const f = (await loadRlvPair({ source })).rlva
  const receiver = 'integer total; default { money(key id, integer amount) { total += amount; llSleep(1); } }'
  const t = await loadLinkset({ world: f.world, region: f.avatar.region, prims: [
    { scripts: [{ name: 'root', source: { source: receiver } }] },
    { scripts: [{ name: 'child1', source: { source: receiver } }, { name: 'child2', source: { source: receiver } }] },
  ] })
  for (const script of Object.values(t.scripts)) script.start()
  const child = t.linkset.prims[1]!
  expect(f.pay(child, 3).status).toBe('paid')
  expect(t.scripts.root!.global('total')).toBe(0)
  expect(t.scripts.child1!.global('total')).toBe(3)
  expect(t.scripts.child2!.global('total')).toBe(3)
  t.scripts.child2!.running = false
  expect(f.pay(child, 4).status).toBe('paid')
  expect(t.scripts.child1!.global('total')).toBe(7)
  expect(t.scripts.child2!.global('total')).toBe(3)
  f.world.setObjectSale(child, { type: 'contents', price: 0 })
  expect(f.buy(t.linkset.prims[0]!)).toMatchObject({ status: 'requested', sale: { type: 'contents', price: 0 } })
  f.world.setObjectSale(child, null)
  expect(f.buy(child).reason).toBe('not-for-sale')
})

it('rejects stale sale targets and attachments without a live wearer, and accepts root pay eligibility', async () => {
  const f = (await loadRlvPair({ source })).rlva
  expect(() => f.world.setObjectSale(new Prim(), { type: 'copy', price: 1 })).toThrow()
  const t = await loadLinkset({ world: f.world, region: f.avatar.region, prims: [
    { scripts: [{ name: 'root', source: { source: 'integer count; default { money(key id, integer n) { ++count; } }' } }] }, {},
  ] })
  t.scripts.root!.start()
  expect(f.pay(t.linkset.prims[1]!, 1).status).toBe('paid')
  expect(t.scripts.root!.global('count')).toBe(0)
  t.linkset.attachToAvatar('00000000-0000-0000-0000-000000000099', 5)
  expect(f.pay(t.linkset.prims[0]!, 1).reason).toBe('target')
})
