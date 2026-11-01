import type { Prim } from '../prim.js'
import type { World, WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'

export function paySupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (behaviour !== 'pay' && behaviour !== 'buy') return undefined
  return profile === 'rlva' && !option ? 'enforced' : 'unsupported'
}

export interface ObjectSale {
  readonly type: 'original' | 'copy' | 'contents'
  readonly price: number
}
export interface AvatarPayAction {
  readonly action: 'pay'
  readonly target: string
  readonly recipient?: string
  readonly kind?: 'avatar' | 'object'
  readonly amount: number
  readonly status: 'paid' | 'blocked' | 'unsupported'
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}
export interface AvatarBuyAction {
  readonly action: 'buy'
  readonly target: string
  readonly sale?: ObjectSale
  readonly status: 'requested' | 'blocked' | 'unsupported'
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}
const payments = new WeakMap<WorldAvatar, readonly AvatarPayAction[]>()
const purchases = new WeakMap<WorldAvatar, readonly AvatarBuyAction[]>()
const sales = new WeakMap<Prim, ObjectSale>()
export const avatarPayLog = (avatar: WorldAvatar): readonly AvatarPayAction[] => payments.get(avatar) ?? Object.freeze([])
export const avatarBuyLog = (avatar: WorldAvatar): readonly AvatarBuyAction[] => purchases.get(avatar) ?? Object.freeze([])

function livePrim(world: World, prim: Prim): boolean {
  const object = prim.linkset
  return !!object && !object.dead && object.world === world && world.linksets.includes(object) && object.prims.includes(prim)
}
const validAmount = (amount: number) => Number.isInteger(amount) && amount >= 0 && amount <= 2147483647

/** Set explicit simulator sale information for a live object's root. */
export function setObjectSale(world: World, prim: Prim, sale: ObjectSale | null): void {
  if (!livePrim(world, prim)) throw new Error('Sale target must be a live object in this World')
  const root = prim.linkset!.prims[0]!
  if (sale === null) { sales.delete(root); return }
  if (!['original', 'copy', 'contents'].includes(sale.type) || !validAmount(sale.price)) throw new Error('Invalid object sale')
  sales.set(root, Object.freeze({ type: sale.type, price: sale.price }))
}
function denials(avatar: WorldAvatar, behaviour: 'pay' | 'buy'): readonly RlvRestriction[] {
  return avatar.viewer.profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot()
    .filter(rule => rule.support === 'enforced' && rule.behaviour === behaviour && !rule.option)
}

/** Inject a completed avatar payment after checking the viewer's payment permission. */
export function attemptAvatarPay(world: World, avatar: WorldAvatar, target: Prim | WorldAvatar, amount: number): AvatarPayAction {
  let recipient: string | undefined
  let kind: AvatarPayAction['kind']
  const record = (status: AvatarPayAction['status'], reason?: string, restrictions: readonly RlvRestriction[] = []): AvatarPayAction => {
    const result: AvatarPayAction = Object.freeze({ action: 'pay', target: target.key, amount, status,
      ...(recipient ? { recipient } : {}), ...(kind ? { kind } : {}), ...(reason ? { reason } : {}),
      restrictions: Object.freeze([...restrictions]) })
    payments.set(avatar, Object.freeze([...avatarPayLog(avatar), result]))
    return result
  }
  if (!world.avatars.includes(avatar)) return record('unsupported', 'avatar')
  if (!validAmount(amount)) return record('unsupported', 'amount')
  let prim: Prim | undefined
  if ('viewer' in target) {
    if (!world.avatars.includes(target)) return record('unsupported', 'target')
    recipient = target.key
    kind = 'avatar'
  } else {
    if (!livePrim(world, target)) return record('unsupported', 'target')
    const object = target.linkset!
    if (object.attachment) {
      const wearer = world.avatars.find(a => a.key.toLowerCase() === object.attachment!.avatar.toLowerCase())
      if (!wearer) return record('unsupported', 'target')
      recipient = wearer.key
      kind = 'avatar'
    } else {
      prim = target
      recipient = object.owner
      kind = 'object'
    }
  }
  const blocks = denials(avatar, kind === 'avatar' ? 'pay' : 'buy')
  if (blocks.length) return record('blocked', blocks[0]!.behaviour, blocks)
  if (prim) {
    const root = prim.linkset!.prims[0]!
    const payable = (p: Prim) => p.payPrice !== null || p.scripts.some(s => s.running && s.handles('money'))
    if (!payable(prim) && !payable(root)) return record('unsupported', 'not-payable')
  }
  const result = record('paid')
  if (prim) {
    // Queue every recipient before settling so a sleeping handler cannot reorder delivery.
    const scripts = prim.scripts.filter(s => s.running && s.handles('money'))
    for (const script of scripts) script.clockView.schedule(script.now, 'money', { id: avatar.key, amount })
    prim.linkset!.settle(scripts)
  }
  return result
}

/** Capture a viewer purchase request. Settlement and inventory delivery are external. */
export function attemptAvatarBuy(world: World, avatar: WorldAvatar, prim: Prim): AvatarBuyAction {
  let sale: ObjectSale | undefined
  const record = (status: AvatarBuyAction['status'], reason?: string, restrictions: readonly RlvRestriction[] = []): AvatarBuyAction => {
    const result: AvatarBuyAction = Object.freeze({ action: 'buy', target: prim.key, status,
      ...(sale ? { sale } : {}), ...(reason ? { reason } : {}), restrictions: Object.freeze([...restrictions]) })
    purchases.set(avatar, Object.freeze([...avatarBuyLog(avatar), result]))
    return result
  }
  if (!world.avatars.includes(avatar)) return record('unsupported', 'avatar')
  if (!livePrim(world, prim)) return record('unsupported', 'target')
  if (prim.linkset!.attachment) return record('unsupported', 'attachment')
  sale = sales.get(prim.linkset!.prims[0]!)
  if (!sale) return record('unsupported', 'not-for-sale')
  const blocks = denials(avatar, 'buy')
  return blocks.length ? record('blocked', 'buy', blocks) : record('requested')
}
