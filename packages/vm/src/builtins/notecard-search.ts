import type { BuiltinImpl, CallContext } from '../runtime.js'
import { nextDataserverKey } from './dataserver.js'
import { sayError } from './debug.js'
import { InventoryType } from '../inventory.js'
import { NULL_KEY } from '../values/types.js'
import { EOF, NAK } from '../generated/constants.js'
import { own } from '../own.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DEFAULT_MATCHES = 64

type Notecard = { lines: ReadonlyArray<string> } | 'missing' | 'unknown-key'

/**
 * Find a notecard by name or asset key. A name that isn't a notecard says an error; a key that
 * matches no notecard here is silent, as an uncached notecard is in-world.
 */
function findNotecard(ctx: CallContext, name: string): Notecard {
  const inventory = ctx.prim.inventory
  const byName = inventory.find((it) => it.name === name)
  const item =
    byName ?? (UUID.test(name) ? inventory.find((it) => it.type === InventoryType.NOTECARD && it.key === name) : undefined)
  if (item && item.type === InventoryType.NOTECARD && item.notecardLines) return { lines: item.notecardLines }
  if (!byName && UUID.test(name)) return 'unknown-key'
  sayError(ctx, `Could not find notecard '${name}'.`)
  return 'missing'
}

class PatternError extends Error {
  constructor(
    readonly reason: string,
    readonly position: number,
  ) {
    super(reason)
  }
}

const utf8 = new TextEncoder()
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

/** A byte as one UTF-16 unit: ASCII as itself, anything higher in the private use area so no JS class or case fold touches it. */
const byteChar = (b: number) => (b < 0x80 ? String.fromCharCode(b) : String.fromCharCode(0xe000 + b))
const byteSource = (b: number) => (b < 0x80 ? escapeAscii(b) : `\\u${(0xe000 + b).toString(16)}`)

function escapeAscii(b: number): string {
  const c = String.fromCharCode(b)
  if (/[A-Za-z0-9 ]/.test(c)) return c
  return `\\x${b.toString(16).padStart(2, '0')}`
}

const POSIX_CLASSES: Record<string, string> = {
  alpha: 'A-Za-z',
  digit: '0-9',
  alnum: 'A-Za-z0-9',
  upper: 'A-Z',
  lower: 'a-z',
  space: '\\t\\n\\v\\f\\r ',
  blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
  word: '\\w',
  cntrl: '\\x00-\\x1f\\x7f',
  print: '\\x20-\\x7e',
  graph: '\\x21-\\x7e',
}

const CLASS_ESCAPES = new Set(['d', 'D', 'w', 'W', 's', 'S'])
const CONTROL_ESCAPES: Record<string, string> = { n: '\\n', t: '\\t', r: '\\r', f: '\\f', v: '\\v' }
const ANCHOR_ESCAPES: Record<string, string> = {
  A: '(?<![\\s\\S])',
  G: '(?<![\\s\\S])',
  z: '(?![\\s\\S])',
  Z: '(?=\\n?(?![\\s\\S]))',
  b: '\\b',
  B: '\\B',
}

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'

/**
 * Translate a Second Life notecard pattern (a byte-oriented POSIX-extended dialect with Perl escapes,
 * as measured in-world) into the source of a JS RegExp over byteChar text. Throws PatternError with
 * the simulator's message and byte position.
 */
function translate(p: Uint8Array): string {
  const s = Array.from(p, (b) => String.fromCharCode(b)).join('')
  let out = ''
  let i = 0
  let depth = 0
  let last: 'atom' | 'quantifier' | 'anchor' | 'none' = 'none'

  const quantifier = (at: number, text: string) => {
    if (last === 'quantifier' || last === 'anchor') throw new PatternError('Invalid repetition', at + 1)
    if (last === 'none') throw new PatternError('Invalid repetition', at)
    out += text
    last = 'quantifier'
  }
  const emit = (source: string, kind: typeof last) => {
    out += source
    last = kind
  }

  while (i < s.length) {
    const c = s[i]!
    if (c === '\\') {
      const e = s[i + 1]
      if (e === undefined) throw new PatternError('Invalid or trailing escape', s.length)
      if (isDigit(e) && e !== '0') throw new PatternError('Invalid or trailing escape', i)
      if (e === 'Q') {
        const close = s.indexOf('\\E', i + 2)
        const end = close === -1 ? s.length : close
        for (let k = i + 2; k < end; k++) out += byteSource(p[k]!)
        if (end > i + 2) last = 'atom'
        else if (last === 'none') last = 'anchor'
        i = close === -1 ? end : end + 2
        continue
      }
      if (e === 'x') {
        if (s[i + 2] === '{') throw new PatternError('Invalid contents of a {...} block', i)
        const hex = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 2))?.[0]
        if (!hex) throw new PatternError('Invalid or trailing escape', i)
        emit(byteSource(parseInt(hex, 16)), 'atom')
        i += 2 + hex.length
        continue
      }
      if (e in ANCHOR_ESCAPES) emit(ANCHOR_ESCAPES[e]!, 'anchor')
      else if (CLASS_ESCAPES.has(e)) emit(`\\${e}`, 'atom')
      else emit(CONTROL_ESCAPES[e] ?? byteSource(p[i + 1]!), 'atom')
      i += 2
      continue
    }
    if (c === '[') {
      const [source, end] = translateSet(p, s, i)
      emit(source, 'atom')
      i = end
      continue
    }
    if (c === '{') {
      const [text, end] = brace(s, i)
      quantifier(i, text)
      i = end
      continue
    }
    if (c === '(') {
      if (s[i + 1] === '?') throw new PatternError('Invalid repetition', i + 2)
      depth++
      emit('(', 'none')
    } else if (c === ')') {
      if (depth === 0) throw new PatternError("Mismatched '(' and ')'", i)
      depth--
      emit(')', 'atom')
    } else if (c === '|') emit('|', 'none')
    else if (c === '^' || c === '$') emit(c, 'anchor')
    else if (c === '.') emit('[\\s\\S]', 'atom')
    else if (c === '*' || c === '+' || c === '?') quantifier(i, c)
    else emit(byteSource(p[i]!), 'atom')
    i++
  }
  if (depth > 0) throw new PatternError("Mismatched '(' and ')'", s.length)
  return out
}

/** Read the {n}, {n,} or {n,m} repeat at `start`; returns its text and the index after it. */
function brace(s: string, start: number): [string, number] {
  const m = /^\{(\d+)(?:,(\d*))?/.exec(s.slice(start))
  if (!m) throw new PatternError("Mismatched '{' and '}'", start + 1)
  const end = start + m[0].length
  if (s[end] !== '}') throw new PatternError("Mismatched '{' and '}'", end)
  if (m[2] && Number(m[2]) < Number(m[1])) {
    throw new PatternError('Invalid contents of a {...} block', start + 2 + m[1]!.length)
  }
  return [m[0] + '}', end + 1]
}

const BAD_CLASS = 'Invalid character class name was specified in a [[:name:]] block'

/**
 * Translate the bracket expression at `start`; returns its JS source and the index after it. A
 * backslash in a set is literal unless it starts a class escape such as \\d.
 */
function translateSet(p: Uint8Array, s: string, start: number): [string, number] {
  let i = start + 1
  let out = '['
  if (s[i] === '^') {
    out += '^'
    i++
  }
  const setStart = i
  let posix = false
  while (i < s.length) {
    const c = s[i]!
    if (c === ']' && i > setStart) return [out + ']', i + 1]
    const close = c === '[' && s[i + 1] === ':' ? s.indexOf(':]', i + 2) : -1
    if (close !== -1) {
      const name = s.slice(i + 2, close)
      const members = own(POSIX_CLASSES, name)
      if (members === undefined) throw new PatternError(BAD_CLASS, i + 2)
      out += members
      posix = true
      i = close + 2
      continue
    }
    if (c === '\\' && CLASS_ESCAPES.has(s[i + 1] ?? '')) {
      out += `\\${s[i + 1]}`
      i += 2
      continue
    }
    if (s[i + 1] === '-' && i + 2 < s.length && s[i + 2] !== ']') {
      const close = s.indexOf(']', i + 3)
      if (p[i + 2]! < p[i]!) throw new PatternError(BAD_CLASS, close === -1 ? s.length : close + 1)
      out += `${byteSource(p[i]!)}-${byteSource(p[i + 2]!)}`
      i += 3
      continue
    }
    out += byteSource(p[i]!)
    i++
  }
  throw new PatternError(posix ? "Mismatched '(' and ')'" : 'Invalid character set [...]', s.length)
}

interface Search {
  text: string
  bytes: Uint8Array
  regex: RegExp
}

/** Compile `pattern` against the notecard, or say the regex error and return undefined. */
function compile(ctx: CallContext, lines: ReadonlyArray<string>, pattern: string): Search | undefined {
  const caseless = pattern.startsWith('(?i)')
  const body = utf8.encode(caseless ? pattern.slice(4) : pattern)
  let source: string
  try {
    source = translate(body)
  } catch (err) {
    if (!(err instanceof PatternError)) throw err
    const shown = Array.from(body, (b) => (b < 0x80 ? String.fromCharCode(b) : '?')).join('')
    sayError(ctx, `Regex error: ${err.reason} in "${shown}" at position ${err.position}`)
    return undefined
  }
  const bytes = utf8.encode(lines.join('\n'))
  const text = Array.from(bytes, byteChar).join('')
  return { text, bytes, regex: new RegExp(source, caseless ? 'gmi' : 'gm') }
}

const characters = (bytes: Uint8Array) => [...decoder.decode(bytes)].length

/** [line, column, length] of a match, counting columns and length in characters as the simulator does. */
function locate(search: Search, index: number, length: number): number[] {
  const lineStart = search.text.lastIndexOf('\n', index - 1) + 1
  let line = 0
  for (let k = search.text.indexOf('\n'); k !== -1 && k < index; k = search.text.indexOf('\n', k + 1)) line++
  return [
    line,
    characters(search.bytes.subarray(lineStart, index)),
    characters(search.bytes.subarray(index, index + length)),
  ]
}

/**
 * llFindNotecardTextSync(string name, string pattern, integer start, integer count, list options) —
 * [line, column, length] for each match after the first `start`. A count of 0 returns up to 64
 * matches, a negative count one. Returns [NAK] for a notecard that isn't here, and [] for an invalid
 * pattern. Notecards are always cached here. Options are ignored.
 */
export const llFindNotecardTextSync: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const pattern = (args[1] as string | undefined) ?? ''
  const start = Math.max(0, (args[2] as number | undefined) ?? 0)
  const count = (args[3] as number | undefined) ?? 0
  const notecard = findNotecard(ctx, name)
  if (typeof notecard === 'string') return [NAK]
  const search = compile(ctx, notecard.lines, pattern)
  if (!search) return []
  const limit = count === 0 ? MAX_DEFAULT_MATCHES : count < 0 ? 1 : count
  const out: number[] = []
  let seen = 0
  for (const m of search.text.matchAll(search.regex)) {
    if (seen++ < start) continue
    out.push(...locate(search, m.index, m[0].length))
    if (out.length / 3 >= limit) break
  }
  return out
}

/**
 * llFindNotecardTextCount(string name, string pattern, list options) — raise dataserver with the
 * number of matches. Returns NULL_KEY with no event for a missing notecard or an invalid pattern; a key
 * that matches no notecard here delivers EOF.
 */
export const llFindNotecardTextCount: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const pattern = (args[1] as string | undefined) ?? ''
  const notecard = findNotecard(ctx, name)
  if (notecard === 'missing') return NULL_KEY
  let data = EOF
  if (notecard !== 'unknown-key') {
    const search = compile(ctx, notecard.lines, pattern)
    if (!search) return NULL_KEY
    data = String(Array.from(search.text.matchAll(search.regex)).length)
  }
  const key = nextDataserverKey(ctx)
  ctx.state.dataserverRequests.push({ key, source: 'notecard_text_count', args: [name, pattern], fulfilled: true })
  const at = ctx.state.clock.now + (ctx.spec?.delay ?? 0) * 1000
  for (const s of ctx.prim.scripts) ctx.state.clock.scheduleOn(s, at, 'dataserver', { queryid: key, data })
  return key
}
