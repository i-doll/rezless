import type { BuiltinImpl } from '../runtime.js'
import { NULL_KEY } from '../values/types.js'

/**
 * A registered listen filter. Tests inspect these via Script.listens
 * and can deliver chat through Script.deliverChat to trigger handlers.
 *
 * LSL filtering semantics: an empty `name` / `key` / `message` is a
 * wildcard for that field. A specific value must match exactly.
 */
export interface ListenEntry {
  /** Handle returned by llListen; passed to llListenRemove / llListenControl. */
  readonly handle: number
  readonly channel: number
  /** Empty string = match any speaker name. */
  readonly name: string
  /** All-zero UUID = match any speaker key (LSL convention). */
  readonly key: string
  /** Empty string = match any message. */
  readonly message: string
  /** Toggled by llListenControl; off entries don't deliver. */
  active: boolean
}

function nextListenHandle(state: { listenHandleCounter: number }): number {
  state.listenHandleCounter += 1
  return state.listenHandleCounter
}

/**
 * llListen(integer channel, string name, key id, string msg) → integer handle
 *
 * Empty name / NULL_KEY id / empty msg act as wildcards. The handle is
 * a positive integer used by llListenRemove / llListenControl.
 */
export const llListen: BuiltinImpl = (ctx, args) => {
  const channel = (args[0] as number | undefined) ?? 0
  const name = (args[1] as string | undefined) ?? ''
  const id = (args[2] as string | undefined) ?? NULL_KEY
  const msg = (args[3] as string | undefined) ?? ''
  const handle = nextListenHandle(ctx.state)
  ctx.state.listens.push({
    handle,
    channel,
    name,
    key: id,
    message: msg,
    active: true,
  })
  return handle
}

/** llListenRemove(integer handle) — drops the listen entirely. */
export const llListenRemove: BuiltinImpl = (ctx, args) => {
  const handle = (args[0] as number | undefined) ?? 0
  const i = ctx.state.listens.findIndex((l) => l.handle === handle)
  if (i >= 0) ctx.state.listens.splice(i, 1)
  return undefined
}

/** llListenControl(integer handle, integer active) — turns a listen on or off. */
export const llListenControl: BuiltinImpl = (ctx, args) => {
  const handle = (args[0] as number | undefined) ?? 0
  const active = ((args[1] as number | undefined) ?? 0) !== 0
  const entry = ctx.state.listens.find((l) => l.handle === handle)
  if (entry) entry.active = active
  return undefined
}
