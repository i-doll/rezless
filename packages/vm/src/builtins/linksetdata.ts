import type { BuiltinImpl, CallContext } from '../runtime.js'
import {
  LINKSETDATA_OK,
  LINKSETDATA_EMEMORY,
  LINKSETDATA_ENOKEY,
  LINKSETDATA_EPROTECTED,
  LINKSETDATA_NOTFOUND,
  LINKSETDATA_NOUPDATE,
  LINKSETDATA_RESET,
  LINKSETDATA_UPDATE,
  LINKSETDATA_DELETE,
  LINKSETDATA_MULTIDELETE,
} from '../generated/constants.js'
import { uniformList } from '../values/list-types.js'

export interface LinksetDataEntry {
  value: string
  /** Empty string = unprotected. */
  password: string
}

const LSD_AVAILABLE_BYTES = 131072

function fireEvent(ctx: CallContext, action: number, keyname: string, value: string): void {
  ctx.linkset.broadcastLinksetData(action, keyname, value)
}

const PROTECTED_OVERHEAD = 32

function entryCost(name: string, entry: LinksetDataEntry): number {
  return (
    Buffer.byteLength(name, 'utf8') +
    Buffer.byteLength(entry.value, 'utf8') +
    (entry.password === '' ? 0 : PROTECTED_OVERHEAD)
  )
}

function bytesUsed(store: ReadonlyMap<string, LinksetDataEntry>): number {
  let used = 0
  for (const [name, entry] of store) used += entryCost(name, entry)
  return used
}

function fits(ctx: CallContext, name: string, entry: LinksetDataEntry): boolean {
  const store = ctx.state.linksetData
  const existing = store.get(name)
  const before = bytesUsed(store) - (existing ? entryCost(name, existing) : 0)
  return before + entryCost(name, entry) <= LSD_AVAILABLE_BYTES
}

function sortedKeys(ctx: CallContext): string[] {
  return [...ctx.state.linksetData.keys()].sort()
}

const POSIX_CLASSES: Record<string, string> = {
  alpha: 'A-Za-z',
  digit: '0-9',
  alnum: 'A-Za-z0-9',
  upper: 'A-Z',
  lower: 'a-z',
  space: '\\t\\n\\v\\f\\r ',
  blank: '\\t ',
  punct: '!-\\/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
  cntrl: '\\x00-\\x1f\\x7f',
  print: '\\x20-\\x7e',
  graph: '\\x21-\\x7e',
  word: 'A-Za-z0-9_',
}

const UNICODE_CLASSES: Record<string, string> = {
  L: 'a-z',
  Lu: 'A-Z',
  Ll: 'a-z',
  N: '0-9',
  Nd: '0-9',
}

const ESCAPE_CLASSES: Record<string, string> = {
  h: '[\\t ]',
  H: '[^\\t ]',
  s: '[\\t\\n\\v\\f\\r ]',
  S: '[^\\t\\n\\v\\f\\r ]',
  l: '[a-z]',
  L: '[^a-z]',
  u: '[A-Z]',
  U: '[^A-Z]',
  A: '^',
  z: '$',
}

/** Escapes that stay a character class inside brackets; any other backslash is a literal. */
const BRACKET_ESCAPES = new Set(['d', 'D', 'w', 'W', 's', 'S'])

function escapeLiteral(ch: string): string {
  return /[\\^$.*+?()[\]{}|/-]/.test(ch) ? '\\' + ch : ch
}

function translateBracket(p: string, i: number): [string, number] | null {
  let out = '['
  let j = i + 1
  if (p[j] === '^') {
    out += '^'
    j += 1
  }
  if (p[j] === ']') {
    out += '\\]'
    j += 1
  }
  while (j < p.length && p[j] !== ']') {
    const ch = p[j]!
    if (ch === '[' && p[j + 1] === ':') {
      const close = p.indexOf(':]', j + 2)
      if (close < 0) return null
      const cls = POSIX_CLASSES[p.slice(j + 2, close)]
      if (cls === undefined) return null
      out += cls
      j = close + 2
    } else if (ch === '[' && (p[j + 1] === '=' || p[j + 1] === '.')) {
      const kind = p[j + 1]!
      const close = p.indexOf(kind + ']', j + 2)
      const name = close < 0 ? '' : p.slice(j + 2, close)
      if ([...name].length !== 1) return null
      const chars = kind === '=' ? new Set([name.toLowerCase(), name.toUpperCase()]) : new Set([name])
      out += [...chars].map(escapeLiteral).join('')
      j = close + 2
    } else if (ch === '\\' && BRACKET_ESCAPES.has(p[j + 1] ?? '')) {
      out += p.slice(j, j + 2)
      j += 2
    } else if (ch === '\\') {
      out += '\\\\'
      j += 1
    } else {
      out += ch === '[' ? '\\[' : ch
      j += 1
    }
  }
  if (j >= p.length) return null
  return [out + ']', j + 1]
}

/**
 * Translates SL's linkset data regex dialect (Boost POSIX-extended with Boost
 * escapes and a leading `(?i)`) into a JS RegExp. Empty alternatives are
 * dropped. Anything SL rejects or does not support returns null so it matches
 * no key.
 */
function compilePattern(pattern: string): RegExp | null {
  let p = pattern
  let flags = ''
  if (p.startsWith('(?i)')) {
    flags = 'i'
    p = p.slice(4)
  }
  let out = ''
  const groupStarts: number[] = []
  let altEmpty = true
  let pendingBar = false
  let quantifiable = false
  let i = 0
  const emit = (s: string) => {
    if (pendingBar) out += '|'
    pendingBar = false
    out += s
  }
  const atom = (s: string, canRepeat = true) => {
    emit(s)
    altEmpty = false
    quantifiable = canRepeat
  }
  while (i < p.length) {
    const ch = p[i]!
    if (ch === '\\') {
      const next = p[i + 1]
      if (next === undefined) return null
      if (next === 'Q') {
        const close = p.indexOf('\\E', i + 2)
        const literal = p.slice(i + 2, close < 0 ? p.length : close)
        if (literal !== '') atom([...literal].map(escapeLiteral).join(''))
        i = close < 0 ? p.length : close + 2
        continue
      }
      if (next === 'x' && p[i + 2] === '{') {
        const close = p.indexOf('}', i + 3)
        const hex = close < 0 ? '' : p.slice(i + 3, close)
        if (!/^[0-9A-Fa-f]{1,6}$/.test(hex)) return null
        const code = parseInt(hex, 16)
        if (code > 0x10ffff) return null
        atom(escapeLiteral(String.fromCodePoint(code)))
        i = close + 1
        continue
      }
      if (next === 'p' || next === 'P') {
        let name: string
        let after: number
        if (p[i + 2] === '{') {
          const close = p.indexOf('}', i + 3)
          if (close < 0) return null
          name = p.slice(i + 3, close)
          after = close + 1
        } else {
          name = p[i + 2] ?? ''
          after = i + 3
        }
        const cls = UNICODE_CLASSES[name] ?? POSIX_CLASSES[name]
        if (cls === undefined) return null
        atom(`[${next === 'P' ? '^' : ''}${cls}]`)
        i = after
        continue
      }
      if (/[1-9kgcEeG]/.test(next)) return null
      const cls = ESCAPE_CLASSES[next]
      if (cls !== undefined) atom(cls, next !== 'A' && next !== 'z')
      else atom('\\' + next)
      i += 2
      continue
    }
    if (ch === '[') {
      const bracket = translateBracket(p, i)
      if (!bracket) return null
      atom(bracket[0])
      i = bracket[1]
      continue
    }
    if (ch === '(') {
      if (p[i + 1] === '?') return null
      emit('(')
      groupStarts.push(out.length)
      altEmpty = true
      quantifiable = false
      i += 1
      continue
    }
    if (ch === ')') {
      pendingBar = false
      const start = groupStarts.pop()
      if (start === undefined || start === out.length) return null
      atom(')')
      i += 1
      continue
    }
    if (ch === '|') {
      if (!altEmpty) pendingBar = true
      altEmpty = true
      quantifiable = false
      i += 1
      continue
    }
    if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
      if (!quantifiable) return null
      let end = i + 1
      if (ch === '{') {
        const bound = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i))
        if (!bound) return null
        const min = Number(bound[1])
        if (bound[3] !== undefined && bound[3] !== '' && Number(bound[3]) < min) return null
        end = i + bound[0].length
      }
      out += p.slice(i, end)
      quantifiable = false
      i = end
      continue
    }
    const anchor = ch === '^' || ch === '$'
    atom(anchor || ch === '.' ? ch : escapeLiteral(ch), !anchor)
    i += 1
  }
  if (groupStarts.length !== 0 || out === '') return null
  try {
    return new RegExp(out, flags)
  } catch {
    return null
  }
}

/**
 * Slice helper matching LSL list-style start/count semantics for ListKeys /
 * FindKeys: negative `start` counts from the end; `count < 1` means "to the
 * end".
 */
function slice<T>(arr: ReadonlyArray<T>, start: number, count: number): T[] {
  if (arr.length === 0) return []
  let s = start < 0 ? arr.length + start : start
  if (s < 0) s = 0
  if (s >= arr.length) return []
  const end = count < 1 ? arr.length : Math.min(arr.length, s + count)
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
  const entry = { value, password: '' }
  if (!fits(ctx, name, entry)) return LINKSETDATA_EMEMORY
  store.set(name, entry)
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
  const entry = { value, password }
  if (!fits(ctx, name, entry)) return LINKSETDATA_EMEMORY
  store.set(name, entry)
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
  if (!re) return uniformList([0, 0], 'integer')
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
  return uniformList([deletedKeys.length, notDeleted], 'integer')
}

export const llLinksetDataReset: BuiltinImpl = (ctx) => {
  ctx.state.linksetData.clear()
  fireEvent(ctx, LINKSETDATA_RESET, '', '')
  return undefined
}

export const llLinksetDataAvailable: BuiltinImpl = (ctx) =>
  Math.max(0, LSD_AVAILABLE_BYTES - bytesUsed(ctx.state.linksetData))

export const llLinksetDataCountKeys: BuiltinImpl = (ctx) => {
  return ctx.state.linksetData.size
}

export const llLinksetDataListKeys: BuiltinImpl = (ctx, args) => {
  const start = (args[0] as number | undefined) ?? 0
  const count = (args[1] as number | undefined) ?? -1
  return uniformList(slice(sortedKeys(ctx), start, count), 'string')
}

export const llLinksetDataFindKeys: BuiltinImpl = (ctx, args) => {
  const pattern = (args[0] as string | undefined) ?? ''
  const start = (args[1] as number | undefined) ?? 0
  const count = (args[2] as number | undefined) ?? -1
  const re = compilePattern(pattern)
  if (!re) return []
  const matches = sortedKeys(ctx).filter((k) => re.test(k))
  return uniformList(slice(matches, start, count), 'string')
}

export const llLinksetDataCountFound: BuiltinImpl = (ctx, args) => {
  const pattern = (args[0] as string | undefined) ?? ''
  const re = compilePattern(pattern)
  if (!re) return 0
  let n = 0
  for (const k of ctx.state.linksetData.keys()) if (re.test(k)) n += 1
  return n
}
