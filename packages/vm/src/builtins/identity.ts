import type { BuiltinImpl } from '../runtime.js'
import { NULL_KEY } from '../values/types.js'

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** llGetOwner() — script's configured owner key. */
export const llGetOwner: BuiltinImpl = (ctx) => ctx.state.identity.owner
/** llGetCreator() — for our purposes the same as the owner. */
export const llGetCreator: BuiltinImpl = (ctx) => ctx.state.identity.owner
/** llGetKey() — the prim's key (= owner by default; configurable). */
export const llGetKey: BuiltinImpl = (ctx) => ctx.state.identity.objectKey
/** llGetObjectName() — the prim's name. */
export const llGetObjectName: BuiltinImpl = (ctx) => ctx.state.identity.objectName

/** llGetOwnerKey(key id) — owner of the prim with that key in the linkset, else `id`. */
export const llGetOwnerKey: BuiltinImpl = (ctx, args) => {
  const id = (args[0] as string | undefined) ?? ''
  if (id === NULL_KEY) return NULL_KEY
  if (!KEY_PATTERN.test(id)) return NULL_KEY
  const idLower = id.toLowerCase()
  if (ctx.linkset.prims.some((p) => p.key.toLowerCase() === idLower)) return ctx.linkset.owner
  return id
}

/** llSetObjectName(string name) — mutates the prim's name. */
export const llSetObjectName: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  ctx.state.identity.objectName = name
  return undefined
}

/** llGetScriptName() — the script's filename (e.g. "greeter.lsl"). */
export const llGetScriptName: BuiltinImpl = (ctx) => ctx.state.identity.scriptName
