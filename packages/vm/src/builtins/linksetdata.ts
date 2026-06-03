import type { BuiltinImpl, CallContext } from '../runtime.js'
import {
  LINKSETDATA_OK,
  LINKSETDATA_ENOKEY,
  LINKSETDATA_EPROTECTED,
  LINKSETDATA_NOTFOUND,
  LINKSETDATA_NOUPDATE,
  LINKSETDATA_RESET,
  LINKSETDATA_UPDATE,
  LINKSETDATA_DELETE,
  LINKSETDATA_MULTIDELETE,
} from '../generated/constants.js'

export interface LinksetDataEntry {
  value: string
  /** Empty string = unprotected. */
  password: string
}

const LSD_AVAILABLE_BYTES = 131072

function fireEvent(ctx: CallContext, action: number, keyname: string, value: string): void {
  ctx.linkset.broadcastLinksetData(action, keyname, value)
}

function compilePattern(pattern: string): RegExp | null {
  // LSL uses POSIX ERE; we use JS RegExp. The dialect gap is small in practice
  // (anchors, character classes, alternation all match). Invalid patterns
  // return no matches in LSL — emulate by returning null.
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/**
 * Slice helper matching LSL list-style start/count semantics for ListKeys /
 * FindKeys: negative `start` counts from the end; `count = -1` means "to the
 * end".
 */
function slice<T>(arr: ReadonlyArray<T>, start: number, count: number): T[] {
  if (arr.length === 0) return []
  let s = start < 0 ? arr.length + start : start
  if (s < 0) s = 0
  if (s >= arr.length) return []
  const end = count < 0 ? arr.length : Math.min(arr.length, s + count)
  return arr.slice(s, end)
}

export const llLinksetDataWrite: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const value = (args[1] as string | undefined) ?? ''
  if (name === '') return LINKSETDATA_ENOKEY
  const store = ctx.state.linksetData
  const existing = store.get(name)
  if (existing && existing.password !== '') return LINKSETDATA_EPROTECTED
  if (value === '') {
    if (!existing) return LINKSETDATA_NOTFOUND
    store.delete(name)
    fireEvent(ctx, LINKSETDATA_DELETE, name, '')
    return LINKSETDATA_OK
  }
  if (existing && existing.value === value) return LINKSETDATA_NOUPDATE
  store.set(name, { value, password: '' })
  fireEvent(ctx, LINKSETDATA_UPDATE, name, value)
  return LINKSETDATA_OK
}

export const llLinksetDataWriteProtected: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const value = (args[1] as string | undefined) ?? ''
  const password = (args[2] as string | undefined) ?? ''
  if (name === '') return LINKSETDATA_ENOKEY
  const store = ctx.state.linksetData
  const existing = store.get(name)
  if (existing && existing.password !== password) {
    return LINKSETDATA_EPROTECTED
  }
  if (value === '') {
    if (!existing) return LINKSETDATA_NOTFOUND
    store.delete(name)
    fireEvent(ctx, LINKSETDATA_DELETE, name, '')
    return LINKSETDATA_OK
  }
  if (existing && existing.value === value && existing.password === password) {
    return LINKSETDATA_NOUPDATE
  }
  store.set(name, { value, password })
  // The resulting entry's protection state — not the function name — decides
  // whether the UPDATE event blanks the value. WriteProtected with an empty
  // password creates an unprotected entry and so must carry the value, same
  // as llLinksetDataWrite.
  fireEvent(ctx, LINKSETDATA_UPDATE, name, password === '' ? value : '')
  return LINKSETDATA_OK
}

export const llLinksetDataRead: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const entry = ctx.state.linksetData.get(name)
  if (!entry) return ''
  if (entry.password !== '') return ''
  return entry.value
}

export const llLinksetDataReadProtected: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const password = (args[1] as string | undefined) ?? ''
  const entry = ctx.state.linksetData.get(name)
  if (!entry) return ''
  if (entry.password !== password) return ''
  return entry.value
}

export const llLinksetDataDelete: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  if (name === '') return LINKSETDATA_ENOKEY
  const store = ctx.state.linksetData
  const entry = store.get(name)
  if (!entry) return LINKSETDATA_NOTFOUND
  if (entry.password !== '') return LINKSETDATA_EPROTECTED
  store.delete(name)
  fireEvent(ctx, LINKSETDATA_DELETE, name, '')
  return LINKSETDATA_OK
}

export const llLinksetDataDeleteProtected: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const password = (args[1] as string | undefined) ?? ''
  if (name === '') return LINKSETDATA_ENOKEY
  const store = ctx.state.linksetData
  const entry = store.get(name)
  if (!entry) return LINKSETDATA_NOTFOUND
  if (entry.password !== password) return LINKSETDATA_EPROTECTED
  store.delete(name)
  fireEvent(ctx, LINKSETDATA_DELETE, name, '')
  return LINKSETDATA_OK
}

export const llLinksetDataDeleteFound: BuiltinImpl = (ctx, args) => {
  const pattern = (args[0] as string | undefined) ?? ''
  const password = (args[1] as string | undefined) ?? ''
  const re = compilePattern(pattern)
  if (!re) return [0, 0]
  const store = ctx.state.linksetData
  const deletedKeys: string[] = []
  let notDeleted = 0
  for (const [name, entry] of [...store.entries()]) {
    if (!re.test(name)) continue
    if (entry.password !== password) {
      notDeleted += 1
      continue
    }
    store.delete(name)
    deletedKeys.push(name)
  }
  if (deletedKeys.length > 0) {
    // SL emits MULTIDELETE.name in ASCII-lex order, not insertion order.
    deletedKeys.sort()
    fireEvent(ctx, LINKSETDATA_MULTIDELETE, deletedKeys.join(','), '')
  }
  return [deletedKeys.length, notDeleted]
}

export const llLinksetDataReset: BuiltinImpl = (ctx) => {
  ctx.state.linksetData.clear()
  fireEvent(ctx, LINKSETDATA_RESET, '', '')
  return undefined
}

export const llLinksetDataAvailable: BuiltinImpl = (ctx) => {
  // TODO: track real bytes used (UTF-8 size of keys + values + overhead) once
  // memory accounting lands. For now return the full quota minus a rough
  // per-entry estimate so tests can still observe the value going down.
  let used = 0
  for (const [k, e] of ctx.state.linksetData) {
    used += k.length + e.value.length + e.password.length
  }
  return Math.max(0, LSD_AVAILABLE_BYTES - used)
}

export const llLinksetDataCountKeys: BuiltinImpl = (ctx) => {
  return ctx.state.linksetData.size
}

export const llLinksetDataListKeys: BuiltinImpl = (ctx, args) => {
  const start = (args[0] as number | undefined) ?? 0
  const count = (args[1] as number | undefined) ?? -1
  return slice([...ctx.state.linksetData.keys()], start, count)
}

export const llLinksetDataFindKeys: BuiltinImpl = (ctx, args) => {
  const pattern = (args[0] as string | undefined) ?? ''
  const start = (args[1] as number | undefined) ?? 0
  const count = (args[2] as number | undefined) ?? -1
  const re = compilePattern(pattern)
  if (!re) return []
  const matches = [...ctx.state.linksetData.keys()].filter((k) => re.test(k))
  return slice(matches, start, count)
}

export const llLinksetDataCountFound: BuiltinImpl = (ctx, args) => {
  const pattern = (args[0] as string | undefined) ?? ''
  const re = compilePattern(pattern)
  if (!re) return 0
  let n = 0
  for (const k of ctx.state.linksetData.keys()) if (re.test(k)) n += 1
  return n
}
