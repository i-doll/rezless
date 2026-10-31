import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { Script } from '../script.js'
import type { Vector } from '../values/types.js'
import { llGetRegionCorner, llGetRegionName } from './region.js'

/** Domain of an object's address: `<prim key>@lsl.secondlife.com`. */
export const OBJECT_EMAIL_DOMAIN = 'lsl.secondlife.com'

/** Mail a script sent with llEmail. */
export interface SentEmail {
  readonly address: string
  readonly subject: string
  readonly message: string
  /** Unix time, in seconds, of the call. */
  readonly time: number
}

/** Mail a script sent with llTargetedEmail. */
export interface SentTargetedEmail {
  /** TARGETED_EMAIL_OBJECT_OWNER, TARGETED_EMAIL_ROOT_CREATOR, or whatever else the script passed. */
  readonly target: number
  readonly subject: string
  readonly message: string
  /** Unix time, in seconds, of the call. */
  readonly time: number
}

/** Mail waiting in a prim's queue for llGetNextEmail. */
export interface IncomingEmail {
  /** Unix time, in seconds, the mail was sent. */
  readonly time: number
  readonly address: string
  readonly subject: string
  readonly message: string
}

/** What a test delivers to a prim with `script.deliverEmail`. */
export interface IncomingEmailInit {
  readonly from: string
  readonly subject?: string
  readonly message?: string
  /** Unix time, in seconds, the mail was sent. Default: now. */
  readonly time?: number
}

/** A prim's queue holds this many mails; later ones are dropped. */
export const MAX_QUEUED_EMAILS = 101

const queues = new WeakMap<Prim, IncomingEmail[]>()

/** The mail queued on `prim`, oldest first. */
export function emailQueue(prim: Prim): IncomingEmail[] {
  let queue = queues.get(prim)
  if (!queue) {
    queue = []
    queues.set(prim, queue)
  }
  return queue
}

function unixSeconds(ctx: CallContext): number {
  return Math.floor(ctx.state.clock.unixMicros() / 1e6)
}

/**
 * llEmail(string address, string subject, string message). Records the mail
 * on the script; mail to `<key>@lsl.secondlife.com` is queued on the prim
 * with that key, after a header naming the sending prim, unless that queue
 * is full. Other addresses, and keys no prim has, go nowhere. The 20 s sleep is the spec's delay.
 */
export const llEmail: BuiltinImpl = (ctx, args) => {
  const address = (args[0] as string | undefined) ?? ''
  const subject = (args[1] as string | undefined) ?? ''
  const message = (args[2] as string | undefined) ?? ''
  const time = unixSeconds(ctx)
  ctx.state.emails.push({ address, subject, message, time })
  const target = objectFor(ctx, address)
  if (target) {
    enqueue(target, {
      time,
      address: `${ctx.prim.key}@${OBJECT_EMAIL_DOMAIN}`,
      subject,
      message: header(ctx) + asciiOnly(message),
    })
  }
  return undefined
}

/** llTargetedEmail(integer target, string subject, string message). Records the mail on the script. */
export const llTargetedEmail: BuiltinImpl = (ctx, args) => {
  ctx.state.targetedEmails.push({
    target: (args[0] as number | undefined) ?? 0,
    subject: (args[1] as string | undefined) ?? '',
    message: (args[2] as string | undefined) ?? '',
    time: unixSeconds(ctx),
  })
  return undefined
}

/**
 * llGetNextEmail(string address, string subject). Takes the oldest queued
 * mail whose address and subject match, ignoring case, and fires `email` on
 * every script in the prim. An empty filter matches anything; with no
 * match nothing happens.
 */
export const llGetNextEmail: BuiltinImpl = (ctx, args) => {
  const address = ((args[0] as string | undefined) ?? '').toLowerCase()
  const subject = ((args[1] as string | undefined) ?? '').toLowerCase()
  const queue = emailQueue(ctx.prim)
  const at = queue.findIndex(
    (m) =>
      (address === '' || m.address.toLowerCase() === address) &&
      (subject === '' || m.subject.toLowerCase() === subject),
  )
  if (at < 0) return undefined
  const [mail] = queue.splice(at, 1)
  const payload = {
    time: String(mail!.time),
    address: mail!.address,
    subject: mail!.subject,
    msg: mail!.message,
    num_left: queue.length,
  }
  for (const s of ctx.prim.scripts) ctx.state.clock.scheduleOn(s, ctx.state.clock.now, 'email', payload)
  return undefined
}

function objectFor(ctx: CallContext, address: string): Prim | undefined {
  const at = address.lastIndexOf('@')
  if (at < 0 || address.slice(at + 1).toLowerCase() !== OBJECT_EMAIL_DOMAIN) return undefined
  const key = address.slice(0, at).toLowerCase()
  const linksets = ctx.linkset.world?.linksets ?? [ctx.linkset]
  for (const l of linksets) for (const p of l.prims) if (p.key.toLowerCase() === key) return p
  return undefined
}

/** The lines Second Life puts in front of mail from an object, whole metres and region corner. */
function header(ctx: CallContext): string {
  const name = llGetRegionName(ctx, []) as string
  const corner = llGetRegionCorner(ctx, []) as Vector
  const p = ctx.prim.regionPosition()
  return (
    `Object-Name: ${ctx.prim.name}\n` +
    `Region: ${name} (${corner.x}, ${corner.y})\n` +
    `Local-Position: (${Math.trunc(p.x)}, ${Math.trunc(p.y)}, ${Math.trunc(p.z)})\n\n`
  )
}

function asciiOnly(text: string): string {
  let out = ''
  for (const ch of text) out += ch.codePointAt(0)! > 127 ? '?' : ch
  return out
}

function enqueue(prim: Prim, mail: IncomingEmail): boolean {
  const queue = emailQueue(prim)
  if (queue.length >= MAX_QUEUED_EMAILS) return false
  queue.push(mail)
  return true
}

/** Queue a test's mail on the script's prim; false when the queue is full. */
export function deliverEmail(script: Script, init: IncomingEmailInit): boolean {
  return enqueue(script.host, {
    time: init.time ?? Math.floor(script.clockView.unixMicros() / 1e6),
    address: init.from,
    subject: init.subject ?? '',
    message: init.message ?? '',
  })
}
