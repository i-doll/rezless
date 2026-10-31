import type { BuiltinImpl, CallContext, ScriptState } from '../runtime.js'
import { typedList } from '../values/list-types.js'
import { NULL_KEY } from '../values/types.js'
import { entrySize } from '../experience.js'
import { nextDataserverKey } from './dataserver.js'
import {
  XP_ERROR_INVALID_PARAMETERS,
  XP_ERROR_KEY_NOT_FOUND,
  XP_ERROR_NO_EXPERIENCE,
  XP_ERROR_NONE,
  XP_ERROR_NOT_PERMITTED_LAND,
  XP_ERROR_QUOTA_EXCEEDED,
  XP_ERROR_RETRY_UPDATE,
  XP_ERROR_STORAGE_EXCEPTION,
  PERMISSION_ATTACH,
  PERMISSION_CONTROL_CAMERA,
  PERMISSION_TAKE_CONTROLS,
  PERMISSION_TELEPORT,
  PERMISSION_TRACK_CAMERA,
  PERMISSION_TRIGGER_ANIMATION,
} from '../generated/constants.js'

/** A llRequestExperiencePermissions call waiting for the test to answer it. */
export interface ExperienceRequestEntry {
  readonly agent: string
  answered: boolean
}

const ERROR_MESSAGES: ReadonlyArray<string> = [
  'no error',
  'exceeded throttle',
  'experiences are disabled',
  'invalid parameters',
  'operation not permitted',
  'script not associated with an experience',
  'not found',
  'invalid experience',
  'experience is disabled',
  'experience is suspended',
  'unknown error',
  'experience data quota exceeded',
  'key-value store is disabled',
  'key-value store communication failed',
  "key doesn't exist",
  'retry update',
  'experience content rating too high',
  'not allowed to run in current location',
  'experience permissions request timed out',
]

export function experienceErrorMessage(error: number): string {
  return ERROR_MESSAGES[error] ?? 'unknown error id'
}

const MAX_KEY_BYTES = 1011
const MAX_VALUE_BYTES = 4095

const bytes = (s: string): number => Buffer.byteLength(s, 'utf8')

/** llGetExperienceErrorMessage(integer error) — the text for an XP_ERROR_* code. */
export const llGetExperienceErrorMessage: BuiltinImpl = (_ctx, args) =>
  experienceErrorMessage((args[0] as number | undefined) ?? 0)

/**
 * llGetExperienceDetails(key experience_id) — [name, owner, id, state,
 * state message, group] for the script's own experience (NULL_KEY or its
 * key); an empty list for any other key or a script without one.
 */
export const llGetExperienceDetails: BuiltinImpl = (ctx, args) => {
  const xp = ctx.state.experience
  const id = (args[0] as string | undefined) ?? NULL_KEY
  if (!xp || (id !== NULL_KEY && id !== '' && id !== xp.id)) return []
  const state = xp.allowedHere ? XP_ERROR_NONE : XP_ERROR_NOT_PERMITTED_LAND
  return typedList(
    [xp.name, xp.owner, xp.id, state, experienceErrorMessage(state), xp.group],
    ['string', 'key', 'key', 'integer', 'string', 'key'],
  )
}

/** llAgentInExperience(key agent) — TRUE once the agent accepted the experience, where the land allows it. */
export const llAgentInExperience: BuiltinImpl = (ctx, args) => {
  const xp = ctx.state.experience
  const agent = (args[0] as string | undefined) ?? NULL_KEY
  return xp && xp.allowedHere && xp.agents.has(agent) ? 1 : 0
}

const EXPERIENCE_PERMISSIONS =
  PERMISSION_TAKE_CONTROLS |
  PERMISSION_TRIGGER_ANIMATION |
  PERMISSION_ATTACH |
  PERMISSION_TRACK_CAMERA |
  PERMISSION_CONTROL_CAMERA |
  PERMISSION_TELEPORT

/** Grant the experience permissions for `agent` and schedule `experience_permissions`. */
export function grantExperience(state: ScriptState, agent: string): void {
  state.experience!.agents.add(agent)
  state.permissions.granted = EXPERIENCE_PERMISSIONS
  state.permissions.agent = agent
  state.clock.schedule(state.clock.now, 'experience_permissions', { agent_id: agent })
}

/**
 * llRequestExperiencePermissions(key agent, string name) — an agent who
 * already accepted is granted at once; otherwise the request waits for
 * Script.grantExperiencePermissions or Script.denyExperiencePermissions.
 * Without an experience, or where the land doesn't allow it, the request
 * is denied with XP_ERROR_NO_EXPERIENCE or XP_ERROR_NOT_PERMITTED_LAND.
 */
export const llRequestExperiencePermissions: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string | undefined) ?? NULL_KEY
  const xp = ctx.state.experience
  const now = ctx.state.clock.now
  if (!xp || !xp.allowedHere) {
    const reason = xp ? XP_ERROR_NOT_PERMITTED_LAND : XP_ERROR_NO_EXPERIENCE
    ctx.state.clock.schedule(now, 'experience_permissions_denied', { agent_id: agent, reason })
  } else if (xp.agents.has(agent)) {
    grantExperience(ctx.state, agent)
  } else {
    ctx.state.experienceRequests.push({ agent, answered: false })
  }
  return undefined
}

/**
 * Record a key-value request and schedule its dataserver answer, "1,…" on
 * success or "0,<XP_ERROR_*>" on failure, for every script in the prim.
 */
function keyValueRequest(
  ctx: CallContext,
  source: string,
  args: ReadonlyArray<unknown>,
  answer: (store: Map<string, string>, quota: number) => string | number,
): string {
  const key = nextDataserverKey(ctx)
  ctx.state.dataserverRequests.push({ key, source, args, fulfilled: true })
  const xp = ctx.state.experience
  const result = xp ? answer(xp.store, xp.quota) : XP_ERROR_NO_EXPERIENCE
  const data = typeof result === 'number' ? `0,${result}` : `1,${result}`
  const payload = { queryid: key, data }
  for (const s of ctx.prim.scripts) ctx.state.clock.scheduleOn(s, ctx.state.clock.now, 'dataserver', payload)
  return key
}

function used(store: Map<string, string>): number {
  let total = 0
  for (const [k, v] of store) total += entrySize(k, v)
  return total
}

function write(store: Map<string, string>, quota: number, k: string, v: string): string | number {
  const old = store.get(k)
  const grow = entrySize(k, v) - (old === undefined ? 0 : entrySize(k, old))
  if (used(store) + grow > quota) return XP_ERROR_QUOTA_EXCEEDED
  store.set(k, v)
  return v
}

/** llCreateKeyValue(string k, string v) — adds a key that doesn't exist yet. */
export const llCreateKeyValue: BuiltinImpl = (ctx, args) => {
  const k = (args[0] as string | undefined) ?? ''
  const v = (args[1] as string | undefined) ?? ''
  return keyValueRequest(ctx, 'create_key_value', [k, v], (store, quota) => {
    if (k === '' || bytes(v) > MAX_VALUE_BYTES) return XP_ERROR_INVALID_PARAMETERS
    if (bytes(k) > MAX_KEY_BYTES || store.has(k)) return XP_ERROR_STORAGE_EXCEPTION
    return write(store, quota, k, v)
  })
}

/** llReadKeyValue(string k) — the stored value. */
export const llReadKeyValue: BuiltinImpl = (ctx, args) => {
  const k = (args[0] as string | undefined) ?? ''
  return keyValueRequest(ctx, 'read_key_value', [k], (store) => {
    if (k === '') return XP_ERROR_INVALID_PARAMETERS
    return store.get(k) ?? XP_ERROR_KEY_NOT_FOUND
  })
}

/**
 * llUpdateKeyValue(string k, string v, integer checked, string original_value)
 * — sets the key, creating it unless `checked`; a checked update needs the
 * key to hold `original_value`.
 */
export const llUpdateKeyValue: BuiltinImpl = (ctx, args) => {
  const k = (args[0] as string | undefined) ?? ''
  const v = (args[1] as string | undefined) ?? ''
  const checked = ((args[2] as number | undefined) ?? 0) !== 0
  const original = (args[3] as string | undefined) ?? ''
  return keyValueRequest(ctx, 'update_key_value', [k, v, checked ? 1 : 0, original], (store, quota) => {
    if (k === '' || bytes(v) > MAX_VALUE_BYTES) return XP_ERROR_INVALID_PARAMETERS
    if (checked && store.get(k) !== original) return XP_ERROR_RETRY_UPDATE
    if (bytes(k) > MAX_KEY_BYTES) return XP_ERROR_STORAGE_EXCEPTION
    return write(store, quota, k, v)
  })
}

/** llDeleteKeyValue(string k) — removes the key; answers "1,delete". */
export const llDeleteKeyValue: BuiltinImpl = (ctx, args) => {
  const k = (args[0] as string | undefined) ?? ''
  return keyValueRequest(ctx, 'delete_key_value', [k], (store) => {
    if (k === '') return XP_ERROR_INVALID_PARAMETERS
    return store.delete(k) ? 'delete' : XP_ERROR_STORAGE_EXCEPTION
  })
}

/** llKeyCountKeyValue() — the number of keys in the store. */
export const llKeyCountKeyValue: BuiltinImpl = (ctx) =>
  keyValueRequest(ctx, 'key_count_key_value', [], (store) => String(store.size))

/**
 * llKeysKeyValue(integer first, integer count) — `count` keys from index
 * `first` in the order they were added, comma-separated; a count of 0
 * lists every key from `first`.
 */
export const llKeysKeyValue: BuiltinImpl = (ctx, args) => {
  const first = (args[0] as number | undefined) ?? 0
  const count = (args[1] as number | undefined) ?? 0
  return keyValueRequest(ctx, 'keys_key_value', [first, count], (store) => {
    if (count < 0) return XP_ERROR_KEY_NOT_FOUND
    if (first < 0) return ''
    const keys = [...store.keys()]
    if (first >= keys.length) return XP_ERROR_KEY_NOT_FOUND
    return keys.slice(first, count === 0 ? undefined : first + count).join(',')
  })
}

/** llDataSizeKeyValue() — "used,quota" in bytes. */
export const llDataSizeKeyValue: BuiltinImpl = (ctx) =>
  keyValueRequest(ctx, 'data_size_key_value', [], (store, quota) => `${used(store)},${quota}`)
