import type { BuiltinImpl } from '../runtime.js'
import type { LslType, LslValue, Vector, Rotation } from '../values/types.js'
import { isVector, isRotation, toFloat32 } from '../values/types.js'
import { listElementType, typedList } from '../values/list-types.js'
import { formatFloatExact, formatRotation, formatVector } from '../values/format.js'
import {
  JSON_INVALID,
  JSON_OBJECT,
  JSON_ARRAY,
  JSON_NUMBER,
  JSON_STRING,
  JSON_NULL,
  JSON_TRUE,
  JSON_FALSE,
  JSON_APPEND,
  JSON_DELETE,
} from '../generated/constants.js'

// Internal AST. `empty` represents the implicit-null slots LSL JSON allows
// in `{"k":,}` and `[,,]`; on Get/Type these short-circuit to JSON_NULL
// regardless of remaining specifiers. A `missing` value, as in `{"k":}` or
// the extra "" member a trailing comma adds to an object, reads as
// JSON_INVALID instead. A `raw` value is text printed exactly as stored: text read that is not
// JSON, or a value llJsonSetValue writes. A `bad`
// container is one whose first and last characters make it an object or array but whose
// members could not be read.
type JNode =
  | { t: 'null' }
  | { t: 'true' }
  | { t: 'false' }
  | { t: 'num'; raw: string }
  | { t: 'str'; v: string; raw: string }
  | { t: 'arr'; items: JNode[]; raw?: string }
  | { t: 'obj'; entries: Array<[string, JNode]>; raw?: string }
  | { t: 'empty'; missing?: true }
  | { t: 'raw'; v: string }
  | { t: 'bad'; kind: 'arr' | 'obj'; raw: string }

const SENTINEL_STRINGS: ReadonlySet<string> = new Set([
  JSON_INVALID,
  JSON_OBJECT,
  JSON_ARRAY,
  JSON_NUMBER,
  JSON_STRING,
  JSON_NULL,
  JSON_TRUE,
  JSON_FALSE,
  JSON_DELETE,
])

// The reader behind llJson2List, llJsonGetValue, llJsonValueType and llJsonSetValue's input,
// modelled on how Second Life reads malformed JSON. A text is an object or array when its first
// and last characters say so. Inside it, strings are skipped whole, but nested brackets are
// matched by type without regard to strings. A closer only ends the container as the last
// character. When the final closer's own opener sits after the start and not after a comma,
// the container stops just before that opener.
const CLOSER: Record<string, string> = { '[': ']', '{': '}' }
const isWs = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r'

function trimWs(s: string): string {
  let a = 0
  let b = s.length
  while (a < b && isWs(s[a])) a++
  while (b > a && isWs(s[b - 1])) b--
  return s.slice(a, b)
}

/** Index just past the string starting at `i`, or -1 if it never closes. */
function skipString(t: string, i: number): number {
  for (let j = i + 1; j < t.length; j++) {
    if (t[j] === '\\') j++
    else if (t[j] === '"') return j + 1
  }
  return -1
}

/** The closer matching the opener at `i`, counting only that bracket type and ignoring strings. */
function matchForward(t: string, i: number): number {
  const open = t[i]!
  const close = CLOSER[open]!
  let depth = 0
  for (let j = i; j < t.length; j++) {
    if (t[j] === open) depth++
    else if (t[j] === close && --depth === 0) return j
  }
  return -1
}

/** The opener matching the final closer, counting only that bracket type and skipping strings. */
function matchBackward(t: string): number {
  const close = t[t.length - 1]!
  const open = close === ']' ? '[' : '{'
  let depth = 0
  let inString = false
  for (let j = t.length - 1; j >= 0; j--) {
    const c = t[j]
    if (c === '"') {
      let slashes = 0
      while (j - slashes - 1 >= 0 && t[j - slashes - 1] === '\\') slashes++
      if (slashes % 2 === 0) inString = !inString
    } else if (inString) continue
    else if (c === close) depth++
    else if (c === open && --depth === 0) return j
  }
  return -1
}

function unescapeJson(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c !== '\\' || i + 1 >= s.length) {
      out += c
      continue
    }
    const e = s[++i]!
    out += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === 'b' ? '\b' : e === 'f' ? '\f' : e
  }
  return out
}

// A number as Second Life reads one: JSON's shape with every part optional, but an exponent
// needs a digit before it.
function isLooseNumber(s: string): boolean {
  const m = /^-?(0|[1-9][0-9]*)?(\.[0-9]*)?([eE][+-]?[0-9]*)?$/.exec(s)
  return s !== '' && m !== null && (m[3] === undefined || /[0-9]/.test(s.slice(0, s.length - m[3].length)))
}

function readScalar(s: string): JNode | null {
  if (s === 'true') return { t: 'true' }
  if (s === 'false') return { t: 'false' }
  if (s === 'null') return { t: 'null' }
  if (isLooseNumber(s)) return { t: 'num', raw: s }
  return null
}

function readValue(s: string): JNode {
  if (s[0] === '"') return skipString(s, 0) === s.length ? { t: 'str', v: unescapeJson(s.slice(1, -1)), raw: s } : { t: 'raw', v: s }
  if (s.length >= 2 && CLOSER[s[0]!] === s[s.length - 1]) return readContainer(s)
  return readScalar(s) ?? { t: 'raw', v: s }
}

type Segment = { colons: number; keyText: string; value: JNode | null; comma: boolean }

function readContainer(t: string): JNode {
  const isObj = t[0] === '{'
  if (t.length === 2) return isObj ? { t: 'obj', entries: [], raw: t } : { t: 'arr', items: [], raw: t }
  const opener = matchBackward(t)
  const end = opener > 0 && t[opener - 1] !== ',' ? opener : t.length
  const segs: Segment[] = []
  let valStart = 1
  let colons = 0
  let keyText = ''
  const finish = (value: JNode | null, comma: boolean) => segs.push({ colons, keyText, value, comma })
  const valueTo = (to: number): JNode | null => {
    const v = trimWs(t.slice(valStart, to))
    return v === '' ? null : readValue(v)
  }
  let i = 1
  while (true) {
    if (i >= end) {
      finish(valueTo(end), false)
      break
    }
    const c = t[i]!
    if (c === '"') {
      valStart = i
      const j = skipString(t, i)
      if (j < 0) {
        finish({ t: 'raw', v: t.slice(valStart) }, false)
        break
      }
      i = j
    } else if (c === '[' || c === '{') {
      const j = matchForward(t, i)
      if (j < 0) {
        finish(t[i - 1] === ',' ? { t: 'raw', v: t.slice(i) } : { t: 'empty', missing: true }, false)
        break
      }
      if (j >= end - 1) {
        finish(valueTo(j + 1), false)
        break
      }
      i = j + 1
    } else if ((c === ']' || c === '}') && i === end - 1) {
      finish(valueTo(i), false)
      break
    } else if (c === ',') {
      finish(valueTo(i), true)
      valStart = ++i
      colons = 0
    } else if (c === ':') {
      colons++
      keyText = trimWs(t.slice(valStart, i))
      valStart = ++i
    } else i++
  }
  const bad: JNode = { t: 'bad', kind: isObj ? 'obj' : 'arr', raw: t }
  if (!isObj) {
    if (segs.some((s) => s.colons > 0)) return bad
    return { t: 'arr', items: segs.map((s) => s.value ?? { t: 'empty' }), raw: t }
  }
  const entries: Array<[string, JNode]> = []
  for (const s of segs) {
    if (s.colons > 1) return bad
    let key = ''
    if (s.colons === 1) {
      if (s.keyText[0] !== '"' || skipString(s.keyText, 0) !== s.keyText.length) return bad
      key = unescapeJson(s.keyText.slice(1, -1))
    }
    if (key === '' && s.comma) return bad
    entries.push([key, s.value ?? (s.colons === 1 && s.comma ? { t: 'empty' } : { t: 'empty', missing: true })])
  }
  return { t: 'obj', entries, raw: t }
}

function readJson(src: string): JNode | null {
  const t = trimWs(src)
  if (t.length >= 2 && CLOSER[t[0]!] === t[t.length - 1]) return readContainer(t)
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') return { t: 'str', v: unescapeJson(t.slice(1, -1)), raw: t }
  return readScalar(t)
}

function escapeJsonString(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    const code = c.charCodeAt(0)
    if (c === '"') out += '\\"'
    else if (c === '\\') out += '\\\\'
    else if (c === '\n') out += '\\n'
    else if (c === '\r') out += '\\r'
    else if (c === '\t') out += '\\t'
    else if (c === '\b') out += '\\b'
    else if (c === '\f') out += '\\f'
    else if (code < 0x20) out += '\\u' + code.toString(16).padStart(4, '0')
    else out += c
  }
  return out
}

function sortByKeyBytes(entries: ReadonlyArray<[string, JNode]>): Array<[string, JNode]> {
  return entries
    .map((e) => ({ e, key: Buffer.from(e[0], 'utf8') }))
    .sort((a, b) => Buffer.compare(a.key, b.key))
    .map(({ e }) => e)
}

function printJson(n: JNode): string {
  switch (n.t) {
    case 'null':
      return 'null'
    case 'true':
      return 'true'
    case 'false':
      return 'false'
    case 'num':
      return n.raw
    case 'str':
      return n.raw
    case 'arr':
      return n.raw ?? '[' + n.items.map((i) => (i.t === 'empty' ? '' : printJson(i))).join(',') + ']'
    case 'obj':
      return n.raw ?? (
        '{' +
        sortByKeyBytes(n.entries)
          .map(([k, v]) => '"' + escapeJsonString(k) + '":' + printJson(v))
          .join(',') +
        '}'
      )
    case 'empty':
      return ''
    case 'raw':
      return n.v
    case 'bad':
      return n.raw
  }
}

type ReadNode = Exclude<JNode, { t: 'raw' }>

type WalkResult =
  | { kind: 'node'; node: ReadNode }
  | { kind: 'invalid' }
  | { kind: 'null' }

function walk(root: JNode, specs: ReadonlyArray<LslValue>): WalkResult {
  let cur: JNode = root
  for (const [i, spec] of specs.entries()) {
    if (cur.t === 'empty') return cur.missing ? { kind: 'invalid' } : { kind: 'null' }
    if (typeof spec === 'string' && cur.t === 'arr') {
      const digits = /^[ \t\n\v\f\r]*\+?([0-9]+)/.exec(spec)
      if (digits === null) return { kind: 'invalid' }
      const item = cur.items[Number(digits[1])]
      if (item === undefined || item.t === 'empty') return { kind: 'invalid' }
      cur = item
    } else if (typeof spec === 'string') {
      if (cur.t !== 'obj') return { kind: 'invalid' }
      let found: JNode | null = null
      for (const [k, v] of cur.entries) if (k === spec) found = v
      if (found === null) return { kind: 'invalid' }
      cur = found
    } else if (typeof spec === 'number') {
      if (cur.t !== 'arr' || listElementType(specs, i) === 'float') return { kind: 'invalid' }
      const idx = Math.trunc(spec)
      if (idx < 0 || idx >= cur.items.length) return { kind: 'invalid' }
      const item = cur.items[idx]!
      if (item.t === 'empty') return { kind: 'invalid' }
      cur = item
    } else {
      return { kind: 'invalid' }
    }
  }
  if (cur.t === 'empty') return cur.missing ? { kind: 'invalid' } : { kind: 'null' }
  if (cur.t === 'raw') return { kind: 'invalid' }
  return { kind: 'node', node: cur }
}

function nodeToGetString(n: ReadNode): string {
  switch (n.t) {
    case 'null':
      return JSON_NULL
    case 'true':
      return JSON_TRUE
    case 'false':
      return JSON_FALSE
    case 'num':
      return n.raw
    case 'str':
      return n.v
    case 'arr':
    case 'obj':
    case 'bad':
      return printJson(n)
    case 'empty':
      return JSON_NULL
  }
}

function nodeType(n: ReadNode): string {
  switch (n.t) {
    case 'null':
      return JSON_NULL
    case 'true':
      return JSON_TRUE
    case 'false':
      return JSON_FALSE
    case 'num':
      return JSON_NUMBER
    case 'str':
      return JSON_STRING
    case 'arr':
      return JSON_ARRAY
    case 'obj':
      return JSON_OBJECT
    case 'bad':
      return n.kind === 'obj' ? JSON_OBJECT : JSON_ARRAY
    case 'empty':
      return JSON_NULL
  }
}

// How llJsonSetValue's value and llList2Json's string elements are written, as measured in
// Second Life. The text is trimmed of space, tab, newline, CR, VT and FF. JSON_TRUE, JSON_FALSE
// and JSON_NULL become bare words and JSON_INVALID becomes nothing. Text whose first and last
// characters are a matching bracket pair or both a double quote is written as it is, however
// malformed inside. llJsonSetValue also writes a number as Second Life reads one as it is;
// llList2Json quotes it. Anything else is written as a JSON string.
const trimValue = (s: string) => s.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, '')

function embedValue(value: string, numbers: boolean): string {
  const t = trimValue(value)
  if (t === 'true' || t === JSON_TRUE) return 'true'
  if (t === 'false' || t === JSON_FALSE) return 'false'
  if (t === 'null' || t === JSON_NULL) return 'null'
  if (t === JSON_INVALID) return ''
  if (t.length >= 2 && (CLOSER[t[0]!] === t[t.length - 1] || (t[0] === '"' && t[t.length - 1] === '"'))) return t
  if (numbers && isLooseNumber(t)) return t
  return '"' + escapeJsonString(t) + '"'
}

function valueToNode(value: string): JNode | 'delete' {
  return trimValue(value) === JSON_DELETE ? 'delete' : { t: 'raw', v: embedValue(value, true) }
}

function collapseDuplicateKeys(
  entries: ReadonlyArray<readonly [string, JNode]>,
): Array<[string, JNode]> {
  // Any modification to an object collapses duplicate keys, keeping only the
  // LAST occurrence; the printed object is then sorted by key.
  const seen = new Set<string>()
  const reversed: Array<[string, JNode]> = []
  for (let i = entries.length - 1; i >= 0; i--) {
    const [k, v] = entries[i]!
    if (!seen.has(k)) {
      seen.add(k)
      reversed.push([k, v])
    }
  }
  return reversed.reverse()
}

type SetResult = { ok: true; node: JNode } | { ok: false }

function setIn(
  root: JNode | null,
  specs: ReadonlyArray<LslValue>,
  value: JNode | 'delete',
): SetResult {
  if (specs.length === 0) {
    if (value === 'delete') return { ok: false }
    return { ok: true, node: value }
  }
  const head = specs[0]!
  const rest = specs.slice(1)
  if (typeof head === 'number') {
    const idx = Math.trunc(head)
    // An array whose only element is empty, as in `[ ]`, is written to as an empty one.
    const lone = root?.t === 'arr' && root.items.length === 1 && root.items[0]!.t === 'empty'
    const arr: { t: 'arr'; items: JNode[] } =
      root && root.t === 'arr' && !lone
        ? { t: 'arr', items: [...root.items] }
        : { t: 'arr', items: [] }
    if (idx === JSON_APPEND) {
      if (rest.length === 0) {
        if (value === 'delete') return { ok: false }
        arr.items.push(value)
        return { ok: true, node: arr }
      }
      const sub = setIn(null, rest, value)
      if (!sub.ok) return { ok: false }
      arr.items.push(sub.node)
      return { ok: true, node: arr }
    }
    if (idx < 0) return { ok: false }
    if (idx > arr.items.length) return { ok: false }
    if (idx === arr.items.length) {
      if (rest.length === 0) {
        if (value === 'delete') return { ok: false }
        arr.items.push(value)
        return { ok: true, node: arr }
      }
      const sub = setIn(null, rest, value)
      if (!sub.ok) return { ok: false }
      arr.items.push(sub.node)
      return { ok: true, node: arr }
    }
    if (rest.length === 0) {
      if (value === 'delete') arr.items.splice(idx, 1)
      else arr.items[idx] = value
      return { ok: true, node: arr }
    }
    const sub = setIn(arr.items[idx]!, rest, value)
    if (!sub.ok) return { ok: false }
    arr.items[idx] = sub.node
    return { ok: true, node: arr }
  }
  if (typeof head === 'string') {
    // An object whose only member has no value is written to as an empty one.
    const lone = root?.t === 'obj' && root.entries.length === 1 && root.entries[0]![1].t === 'empty' && root.entries[0]![1].missing
    const obj: { t: 'obj'; entries: Array<[string, JNode]> } =
      root && root.t === 'obj' && !lone
        ? { t: 'obj', entries: collapseDuplicateKeys(root.entries) }
        : { t: 'obj', entries: [] }
    const existingIdx = obj.entries.findIndex(([k]) => k === head)
    if (rest.length === 0) {
      if (value === 'delete') {
        if (existingIdx < 0) return { ok: false }
        obj.entries.splice(existingIdx, 1)
        return { ok: true, node: obj }
      }
      if (existingIdx >= 0) obj.entries[existingIdx] = [head, value]
      else obj.entries.push([head, value])
      return { ok: true, node: obj }
    }
    const existing = existingIdx >= 0 ? obj.entries[existingIdx]![1] : null
    const sub = setIn(existing, rest, value)
    if (!sub.ok) return { ok: false }
    if (existingIdx >= 0) obj.entries[existingIdx] = [head, sub.node]
    else obj.entries.push([head, sub.node])
    return { ok: true, node: obj }
  }
  return { ok: false }
}

function jsonNodeToLslListItem(n: JNode): LslValue {
  if (n.t === 'arr' || n.t === 'obj' || n.t === 'bad' || n.t === 'raw') return printJson(n)
  switch (n.t) {
    case 'null':
      return JSON_NULL
    case 'true':
      return JSON_TRUE
    case 'false':
      return JSON_FALSE
    case 'num':
      // `+ 0` turns -0 into 0
      return isJsonInteger(n.raw) ? Math.max(-2147483648, Math.min(2147483647, Number(n.raw) || 0)) + 0 : toFloat32(Number.isNaN(parseFloat(n.raw)) ? 0 : parseFloat(n.raw))
    case 'str':
      return n.v
    case 'empty':
      return ''
  }
}

/** A number with no fraction or exponent becomes an LSL integer; any other becomes a float. */
function isJsonInteger(raw: string): boolean {
  return !/[.eE]/.test(raw)
}

function jsonNodeListType(n: JNode): LslType {
  if (n.t !== 'num') return 'string'
  return isJsonInteger(n.raw) ? 'integer' : 'float'
}

export const llJson2List: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  if (src === '') return []
  const trimmed = trimWs(src)
  if (trimmed === '[' || trimmed === '{') return typedList([JSON_INVALID], ['string'])
  const root = readJson(src)
  if (root === null) return typedList([src], ['string'])
  if (root.t === 'bad') return typedList([JSON_INVALID], ['string'])
  const values: LslValue[] = []
  const types: LslType[] = []
  const add = (n: JNode) => {
    values.push(jsonNodeToLslListItem(n))
    types.push(jsonNodeListType(n))
  }
  if (root.t === 'arr') root.items.forEach(add)
  else if (root.t === 'obj') {
    for (const [k, v] of root.entries) {
      values.push(k)
      types.push('string')
      add(v)
    }
  } else add(root)
  return typedList(values, types)
}

export const llJsonGetValue: BuiltinImpl = (_ctx, args) => {
  const json = (args[0] as string | undefined) ?? ''
  const specs = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  if (json === '') return JSON_INVALID
  if (SENTINEL_STRINGS.has(json)) return specs.length === 0 ? json : JSON_INVALID
  const root = readJson(json)
  if (root === null) return JSON_INVALID
  const r = walk(root, specs)
  if (r.kind === 'invalid') return JSON_INVALID
  if (r.kind === 'null') return JSON_NULL
  return nodeToGetString(r.node)
}

export const llJsonValueType: BuiltinImpl = (_ctx, args) => {
  const json = (args[0] as string | undefined) ?? ''
  const specs = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  if (json === '') return JSON_INVALID
  if (SENTINEL_STRINGS.has(json)) return JSON_INVALID
  const root = readJson(json)
  if (root === null) return JSON_INVALID
  const r = walk(root, specs)
  if (r.kind === 'invalid') return JSON_INVALID
  if (r.kind === 'null') return JSON_NULL
  return nodeType(r.node)
}

export const llJsonSetValue: BuiltinImpl = (_ctx, args) => {
  const json = (args[0] as string | undefined) ?? ''
  const specs = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const value = (args[2] as string | undefined) ?? ''
  if (specs.some((_, i) => listElementType(specs, i) === 'float')) return json
  const root = json === '' || SENTINEL_STRINGS.has(json) ? null : readJson(json)
  const valueNode = valueToNode(value)
  const r = setIn(root, specs, valueNode)
  if (!r.ok) return JSON_INVALID
  return printJson(r.node)
}

function lslValueToJsonElement(v: LslValue, type?: LslType): string | null {
  if (typeof v === 'number') {
    if (type !== 'float' && Number.isInteger(v)) return String(v | 0)
    return formatFloatExact(v)
  }
  if (typeof v === 'string') return embedValue(v, false)
  if (isVector(v as Vector)) return `"${formatVector(v as Vector, 6, formatFloatExact)}"`
  if (isRotation(v as Rotation)) return `"${formatRotation(v as Rotation, 6, formatFloatExact)}"`
  return null
}

export const llList2Json: BuiltinImpl = (_ctx, args) => {
  const type = (args[0] as string | undefined) ?? ''
  const values = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  if (type === JSON_ARRAY) {
    const parts = values.map((v, i) => lslValueToJsonElement(v, listElementType(values, i)))
    if (parts.some((p) => p === null)) return JSON_INVALID
    return '[' + parts.join(',') + ']'
  }
  if (type === JSON_OBJECT) {
    if (values.length % 2 !== 0) return JSON_INVALID
    const parts: string[] = []
    for (let i = 0; i < values.length; i += 2) {
      const k = values[i]
      const v = values[i + 1]!
      if (typeof k !== 'string') return JSON_INVALID
      const ve = lslValueToJsonElement(v, listElementType(values, i + 1))
      if (ve === null) return JSON_INVALID
      parts.push('"' + escapeJsonString(k) + '":' + ve)
    }
    return '{' + parts.join(',') + '}'
  }
  return JSON_INVALID
}
