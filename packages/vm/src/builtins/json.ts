import type { BuiltinImpl } from '../runtime.js'
import type { LslValue, Vector, Rotation } from '../values/types.js'
import { isVector, isRotation } from '../values/types.js'
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
// regardless of remaining specifiers.
type JNode =
  | { t: 'null' }
  | { t: 'true' }
  | { t: 'false' }
  | { t: 'num'; raw: string }
  | { t: 'str'; v: string }
  | { t: 'arr'; items: JNode[] }
  | { t: 'obj'; entries: Array<[string, JNode]> }
  | { t: 'empty' }

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

class Parser {
  private i = 0
  constructor(private readonly src: string) {}

  parseRoot(): JNode | null {
    this.ws()
    if (this.i >= this.src.length) return null
    const v = this.parseValue()
    if (v === null) return null
    this.ws()
    if (this.i !== this.src.length) return null
    return v
  }

  private ws(): void {
    while (this.i < this.src.length) {
      const c = this.src[this.i]!
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') this.i++
      else break
    }
  }

  private parseValue(): JNode | null {
    this.ws()
    if (this.i >= this.src.length) return null
    const c = this.src[this.i]!
    if (c === '{') return this.parseObject()
    if (c === '[') return this.parseArray()
    if (c === '"') return this.parseString()
    if (c === 't' && this.src.startsWith('true', this.i)) {
      this.i += 4
      return { t: 'true' }
    }
    if (c === 'f' && this.src.startsWith('false', this.i)) {
      this.i += 5
      return { t: 'false' }
    }
    if (c === 'n' && this.src.startsWith('null', this.i)) {
      this.i += 4
      return { t: 'null' }
    }
    if (c === '-' || (c >= '0' && c <= '9')) return this.parseNumber()
    return null
  }

  private parseObject(): JNode | null {
    this.i++
    const entries: Array<[string, JNode]> = []
    this.ws()
    if (this.src[this.i] === '}') {
      this.i++
      return { t: 'obj', entries }
    }
    while (true) {
      this.ws()
      if (this.src[this.i] !== '"') return null
      const k = this.parseString()
      if (k === null || k.t !== 'str') return null
      this.ws()
      if (this.src[this.i] !== ':') return null
      this.i++
      this.ws()
      const nc = this.src[this.i]
      let v: JNode
      if (nc === ',' || nc === '}') {
        v = { t: 'empty' }
      } else {
        const parsed = this.parseValue()
        if (parsed === null) return null
        v = parsed
      }
      entries.push([k.v, v])
      this.ws()
      if (this.src[this.i] === '}') {
        this.i++
        return { t: 'obj', entries }
      }
      if (this.src[this.i] === ',') {
        this.i++
        this.ws()
        if (this.src[this.i] === '}') {
          this.i++
          return { t: 'obj', entries }
        }
        continue
      }
      return null
    }
  }

  private parseArray(): JNode | null {
    this.i++
    const items: JNode[] = []
    this.ws()
    if (this.src[this.i] === ']') {
      this.i++
      return { t: 'arr', items }
    }
    while (true) {
      this.ws()
      const nc = this.src[this.i]
      let v: JNode
      if (nc === ',' || nc === ']') {
        v = { t: 'empty' }
      } else {
        const parsed = this.parseValue()
        if (parsed === null) return null
        v = parsed
      }
      items.push(v)
      this.ws()
      if (this.src[this.i] === ']') {
        this.i++
        return { t: 'arr', items }
      }
      if (this.src[this.i] === ',') {
        this.i++
        this.ws()
        if (this.src[this.i] === ']') {
          this.i++
          return { t: 'arr', items }
        }
        continue
      }
      return null
    }
  }

  private parseString(): JNode | null {
    if (this.src[this.i] !== '"') return null
    this.i++
    let out = ''
    while (this.i < this.src.length) {
      const c = this.src[this.i]!
      if (c === '"') {
        this.i++
        return { t: 'str', v: out }
      }
      if (c === '\\') {
        this.i++
        const e = this.src[this.i]
        if (e === undefined) return null
        this.i++
        if (e === '"') out += '"'
        else if (e === '\\') out += '\\'
        else if (e === '/') out += '/'
        else if (e === 'n') out += '\n'
        else if (e === 't') out += '\t'
        else if (e === 'r') out += '\r'
        else if (e === 'b') out += '\b'
        else if (e === 'f') out += '\f'
        else if (e === 'u') {
          const hex = this.src.slice(this.i, this.i + 4)
          if (hex.length !== 4 || !/^[0-9a-fA-F]+$/.test(hex)) return null
          this.i += 4
          out += String.fromCharCode(parseInt(hex, 16))
        } else {
          out += e
        }
      } else {
        out += c
        this.i++
      }
    }
    return null
  }

  private parseNumber(): JNode | null {
    const start = this.i
    if (this.src[this.i] === '-') this.i++
    const digitStart = this.i
    while (
      this.i < this.src.length &&
      this.src[this.i]! >= '0' &&
      this.src[this.i]! <= '9'
    ) {
      this.i++
    }
    if (this.i === digitStart) return null
    if (this.src[this.i] === '.') {
      this.i++
      while (
        this.i < this.src.length &&
        this.src[this.i]! >= '0' &&
        this.src[this.i]! <= '9'
      ) {
        this.i++
      }
    }
    if (this.src[this.i] === 'e' || this.src[this.i] === 'E') {
      this.i++
      if (this.src[this.i] === '+' || this.src[this.i] === '-') this.i++
      const expStart = this.i
      while (
        this.i < this.src.length &&
        this.src[this.i]! >= '0' &&
        this.src[this.i]! <= '9'
      ) {
        this.i++
      }
      if (this.i === expStart) return null
    }
    return { t: 'num', raw: this.src.slice(start, this.i) }
  }
}

function parseJson(src: string): JNode | null {
  return new Parser(src).parseRoot()
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
      return '"' + escapeJsonString(n.v) + '"'
    case 'arr':
      return '[' + n.items.map(printJson).join(',') + ']'
    case 'obj':
      return (
        '{' +
        n.entries
          .map(([k, v]) => '"' + escapeJsonString(k) + '":' + printJson(v))
          .join(',') +
        '}'
      )
    case 'empty':
      return 'null'
  }
}

type WalkResult =
  | { kind: 'node'; node: JNode }
  | { kind: 'invalid' }
  | { kind: 'null' }

function walk(root: JNode, specs: ReadonlyArray<LslValue>): WalkResult {
  let cur: JNode = root
  for (const spec of specs) {
    if (cur.t === 'empty') return { kind: 'null' }
    if (typeof spec === 'string') {
      if (cur.t !== 'obj') return { kind: 'invalid' }
      let found: JNode | null = null
      for (const [k, v] of cur.entries) if (k === spec) found = v
      if (found === null) return { kind: 'invalid' }
      cur = found
    } else if (typeof spec === 'number') {
      if (cur.t !== 'arr') return { kind: 'invalid' }
      const idx = Math.trunc(spec)
      if (idx < 0 || idx >= cur.items.length) return { kind: 'invalid' }
      cur = cur.items[idx]!
    } else {
      return { kind: 'invalid' }
    }
  }
  if (cur.t === 'empty') return { kind: 'null' }
  return { kind: 'node', node: cur }
}

function nodeToGetString(n: JNode): string {
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
      return printJson(n)
    case 'empty':
      return JSON_NULL
  }
}

function nodeType(n: JNode): string {
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
    case 'empty':
      return JSON_NULL
  }
}

// Convert an LSL string `value` argument into a JNode (or the 'delete'
// sentinel). Mirrors the documented LSL coercion rules from the wiki:
// FDDx sentinels become bare-word JSON; bare "true"/"false"/"null"
// become bare-word JSON; literally double-quoted strings, JSON numbers,
// and JSON object/array literals are parsed and embedded; everything
// else becomes a JSON string.
function valueToNode(value: string): JNode | 'delete' {
  if (value === JSON_DELETE) return 'delete'
  if (value === JSON_NULL) return { t: 'null' }
  if (value === JSON_TRUE) return { t: 'true' }
  if (value === JSON_FALSE) return { t: 'false' }
  const trimmed = value.trim()
  if (trimmed === 'true') return { t: 'true' }
  if (trimmed === 'false') return { t: 'false' }
  if (trimmed === 'null') return { t: 'null' }
  if (trimmed.length > 0) {
    const ch = trimmed[0]!
    if (
      ch === '{' ||
      ch === '[' ||
      ch === '"' ||
      ch === '-' ||
      (ch >= '0' && ch <= '9')
    ) {
      const parsed = parseJson(trimmed)
      if (parsed !== null) return parsed
    }
  }
  return { t: 'str', v: value }
}

function collapseDuplicateKeys(
  entries: ReadonlyArray<readonly [string, JNode]>,
): Array<[string, JNode]> {
  // Wiki: any modification to an object collapses duplicate keys, keeping
  // only the LAST occurrence (in its position).
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
    const arr: { t: 'arr'; items: JNode[] } =
      root && root.t === 'arr'
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
        if (value === 'delete') return { ok: true, node: arr }
        arr.items.push(value)
        return { ok: true, node: arr }
      }
      const sub = setIn(null, rest, value)
      if (!sub.ok) return { ok: false }
      arr.items.push(sub.node)
      return { ok: true, node: arr }
    }
    if (rest.length === 0) {
      if (value === 'delete') {
        // Cannot delete from arrays per wiki — return invalid.
        return { ok: false }
      }
      arr.items[idx] = value
      return { ok: true, node: arr }
    }
    const sub = setIn(arr.items[idx]!, rest, value)
    if (!sub.ok) return { ok: false }
    arr.items[idx] = sub.node
    return { ok: true, node: arr }
  }
  if (typeof head === 'string') {
    const obj: { t: 'obj'; entries: Array<[string, JNode]> } =
      root && root.t === 'obj'
        ? { t: 'obj', entries: collapseDuplicateKeys(root.entries) }
        : { t: 'obj', entries: [] }
    const existingIdx = obj.entries.findIndex(([k]) => k === head)
    if (rest.length === 0) {
      if (value === 'delete') {
        if (existingIdx >= 0) obj.entries.splice(existingIdx, 1)
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
  if (n.t === 'arr' || n.t === 'obj') return printJson(n)
  switch (n.t) {
    case 'null':
      return JSON_NULL
    case 'true':
      return JSON_TRUE
    case 'false':
      return JSON_FALSE
    case 'num':
      // Integer literal → LSL integer; otherwise → LSL float (which the
      // LSL list type will canonicalize to 6 decimals when stringified).
      if (/^-?\d+$/.test(n.raw)) {
        const x = Number(n.raw)
        if (Number.isFinite(x)) return x | 0
      }
      return Number(n.raw)
    case 'str':
      return n.v
    case 'empty':
      return JSON_NULL
  }
}

export const llJson2List: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  if (src === '') return []
  const root = parseJson(src)
  if (root === null) return [src]
  if (root.t === 'arr') return root.items.map(jsonNodeToLslListItem)
  if (root.t === 'obj') {
    const out: LslValue[] = []
    for (const [k, v] of root.entries) {
      out.push(k, jsonNodeToLslListItem(v))
    }
    return out
  }
  return [jsonNodeToLslListItem(root)]
}

export const llJsonGetValue: BuiltinImpl = (_ctx, args) => {
  const json = (args[0] as string | undefined) ?? ''
  const specs = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  if (json === '') return JSON_INVALID
  if (SENTINEL_STRINGS.has(json)) return JSON_INVALID
  const root = parseJson(json)
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
  const root = parseJson(json)
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
  const root = json === '' || SENTINEL_STRINGS.has(json) ? null : parseJson(json)
  const valueNode = valueToNode(value)
  const r = setIn(root, specs, valueNode)
  if (!r.ok) return JSON_INVALID
  return printJson(r.node)
}

function lslStringToJsonElement(raw: string): string {
  // Wiki-documented coercion: trim whitespace, then check (in order):
  //   FDDx sentinels  → bare word
  //   already-quoted  → emit verbatim
  //   bare-word names → bare word
  //   valid JSON object/array → emit verbatim (kept-as-is, allows nesting)
  //   else → JSON-quoted string
  const trimmed = raw.trim()
  if (trimmed === JSON_TRUE) return 'true'
  if (trimmed === JSON_FALSE) return 'false'
  if (trimmed === JSON_NULL) return 'null'
  if (
    trimmed.length >= 2 &&
    trimmed.startsWith('"') &&
    trimmed.endsWith('"')
  ) {
    return trimmed
  }
  if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
    return trimmed
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = parseJson(trimmed)
    if (parsed !== null) return trimmed
  }
  return '"' + escapeJsonString(trimmed) + '"'
}

function lslValueToJsonElement(v: LslValue): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    if (Number.isInteger(v)) return String(v | 0)
    return v.toFixed(6)
  }
  if (typeof v === 'string') return lslStringToJsonElement(v)
  if (Array.isArray(v)) {
    const parts: Array<string | null> = v.map(lslValueToJsonElement)
    if (parts.some((p) => p === null)) return null
    return '[' + parts.join(',') + ']'
  }
  if (isVector(v as Vector)) {
    const u = v as Vector
    return (
      '"<' +
      u.x.toFixed(5) +
      ', ' +
      u.y.toFixed(5) +
      ', ' +
      u.z.toFixed(5) +
      '>"'
    )
  }
  if (isRotation(v as Rotation)) {
    const r = v as Rotation
    return (
      '"<' +
      r.x.toFixed(5) +
      ', ' +
      r.y.toFixed(5) +
      ', ' +
      r.z.toFixed(5) +
      ', ' +
      r.s.toFixed(5) +
      '>"'
    )
  }
  return null
}

export const llList2Json: BuiltinImpl = (_ctx, args) => {
  const type = (args[0] as string | undefined) ?? ''
  const values = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  if (type === JSON_ARRAY) {
    const parts: Array<string | null> = values.map(lslValueToJsonElement)
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
      const ve = lslValueToJsonElement(v)
      if (ve === null) return JSON_INVALID
      parts.push('"' + escapeJsonString(k) + '":' + ve)
    }
    return '{' + parts.join(',') + '}'
  }
  return JSON_INVALID
}
