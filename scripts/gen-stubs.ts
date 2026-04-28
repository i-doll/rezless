#!/usr/bin/env tsx
/**
 * Code generator: parses vendor/kwdb.xml and emits typed TS files for the VM.
 *
 * Outputs (all under packages/vm/src/generated/):
 *   - constants.ts — every <constant> exported as a typed TS value
 *   - functions.ts — BUILTIN_SPECS metadata array for every <function>
 *   - events.ts    — EVENT_SPECS + EventPayloads mapped type for every <event>
 *
 * Source of truth: Sei-Lisa/kwdb (LGPL-3, vendored at vendor/kwdb.xml).
 *
 * The generator filters by grid: anything that explicitly excludes "sl" is dropped
 * for the default SL output. Multi-grid duplicates (same name, different grids) are
 * resolved to the SL variant.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const KWDB_PATH = resolve(ROOT, 'vendor/kwdb.xml')
const OUT_DIR = resolve(ROOT, 'packages/vm/src/generated')

// ---- XML loading ----

interface RawParam {
  '@_name': string
  '@_type': string
}

interface RawFunction {
  '@_name': string
  '@_type'?: string // return type; absent = void
  '@_grid'?: string
  '@_delay'?: string
  '@_energy'?: string
  '@_status'?: string
  '@_version'?: string
  param?: RawParam | RawParam[]
}

interface RawEvent {
  '@_name': string
  '@_grid'?: string
  '@_status'?: string
  '@_version'?: string
  param?: RawParam | RawParam[]
}

interface RawConstant {
  '@_name': string
  '@_type': string
  '@_value'?: string
  '@_grid'?: string
  '@_status'?: string
  '@_version'?: string
}

interface RawDoc {
  keywords: {
    function?: RawFunction[]
    event?: RawEvent[]
    constant?: RawConstant[]
  }
}

function loadXml(): RawDoc {
  const xml = readFileSync(KWDB_PATH, 'utf8')
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => ['function', 'event', 'constant', 'param'].includes(name),
    // The kwdb XML uses numeric character references like &#xFDD2; for the
    // JSON_* type-tag constants. Without these flags fast-xml-parser only
    // decodes the five predefined XML entities; the numeric refs would be
    // delivered as literal `&#xFDD2;` text and the constants would be wrong.
    processEntities: true,
    htmlEntities: true,
  })
  return parser.parse(xml) as RawDoc
}

/**
 * Interpret LSL string-escape sequences (which the kwdb XML stores as
 * literal text — e.g. `\n` is the two characters backslash + 'n', not a
 * newline). Without this pass, constants like EOF (`"\n\n\n"`) end up
 * as the 6-char literal `\n\n\n` instead of the 3-char string of newlines.
 */
function interpretLslEscapes(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch !== '\\' || i + 1 >= s.length) {
      out += ch
      continue
    }
    const next = s[i + 1]!
    if (next === 'n') {
      out += '\n'
      i++
    } else if (next === 't') {
      out += '\t'
      i++
    } else if (next === 'r') {
      out += '\r'
      i++
    } else if (next === '\\') {
      out += '\\'
      i++
    } else if (next === '"') {
      out += '"'
      i++
    } else if (next === 'x' && i + 3 < s.length && /[0-9a-fA-F]{2}/.test(s.slice(i + 2, i + 4))) {
      out += String.fromCharCode(Number.parseInt(s.slice(i + 2, i + 4), 16))
      i += 3
    } else {
      // Unknown escape — preserve as-is (matches LSL's lenient behaviour).
      out += ch
    }
  }
  return out
}

// ---- Filtering ----

/** Default-grid filter: keep entries with no grid attr OR grid containing "sl". */
function isSL(grid: string | undefined): boolean {
  if (!grid) return true
  return grid.split(/\s+/).includes('sl')
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

// ---- Type mapping ----

const KNOWN_TYPES = new Set([
  'integer',
  'float',
  'string',
  'key',
  'vector',
  'rotation',
  'quaternion',
  'list',
])

/** Normalize XML type names to our LslType union. */
function normType(t: string | undefined): string {
  if (!t) return 'void'
  if (t === 'quaternion') return 'rotation'
  if (KNOWN_TYPES.has(t)) return t
  // OpenSim/AuroraSim-only types we ignore for SL output.
  return 'integer'
}

/** TS literal for a LslType value used in generated `as const` arrays. */
function tsTypeLiteral(t: string): string {
  return JSON.stringify(t)
}

// ---- Constant value parsing ----

function parseConstantValue(type: string, value: string | undefined): string | null {
  if (value === undefined) return null
  const v = value.trim()
  switch (type) {
    case 'integer': {
      // hex like 0x10 or signed decimals
      if (/^-?0x[0-9a-fA-F]+$/.test(v)) return v
      if (/^-?\d+$/.test(v)) return v
      return null
    }
    case 'float': {
      // strip trailing 'f' if present (e.g. "3.14f")
      const cleaned = v.replace(/f$/i, '')
      if (Number.isFinite(Number(cleaned))) return cleaned
      return null
    }
    case 'string':
    case 'key': {
      // Interpret LSL escapes (`\n`, `\t`, `\xHH`, ...) before stringifying.
      return JSON.stringify(interpretLslEscapes(v))
    }
    case 'vector':
    case 'rotation': {
      // Format: <x, y, z> or <x, y, z, s>
      const m = v.match(/^<\s*([^>]+)\s*>$/)
      if (!m || !m[1]) return null
      const parts = m[1].split(',').map((p) => p.trim().replace(/f$/i, ''))
      if (type === 'vector' && parts.length === 3) {
        const [x, y, z] = parts
        return `Object.freeze({ x: ${x}, y: ${y}, z: ${z} })`
      }
      if (type === 'rotation' && parts.length === 4) {
        const [x, y, z, s] = parts
        return `Object.freeze({ x: ${x}, y: ${y}, z: ${z}, s: ${s} })`
      }
      return null
    }
    case 'list':
      return null // rare; skip
    default:
      return null
  }
}

function tsConstantType(type: string): string {
  switch (type) {
    case 'integer':
    case 'float':
      return 'number'
    case 'string':
    case 'key':
      return 'string'
    case 'vector':
      return 'Vector'
    case 'rotation':
      return 'Rotation'
    default:
      return 'never'
  }
}

// ---- Code emitters ----

const HEADER = `// AUTO-GENERATED by scripts/gen-stubs.ts — do not edit by hand.
// Source: vendor/kwdb.xml (Sei-Lisa/kwdb, LGPL-3.0).
// Run \`pnpm gen\` to regenerate.

`

// Names that are hand-written in packages/vm/src/values/types.ts. We keep
// them in CONSTANT_TABLE (so script.ts runtime resolution still finds them)
// but skip them in constants.ts to avoid an export-name collision when the
// public barrel re-exports both files.
const CORE_TYPE_CONSTANTS = new Set(['ZERO_VECTOR', 'ZERO_ROTATION', 'NULL_KEY'])

function emitConstants(doc: RawDoc): {
  constantsTs: string
  tableTs: string
} {
  const seen = new Map<string, { line: string | null; tableEntry: string }>()
  for (const c of doc.keywords.constant ?? []) {
    if (!isSL(c['@_grid'])) continue
    const name = c['@_name']
    if (seen.has(name)) continue
    const type = normType(c['@_type'])
    const val = parseConstantValue(type, c['@_value'])
    if (val === null) continue
    const tsType = tsConstantType(type)
    if (tsType === 'never') continue
    const status = c['@_status'] === 'deprecated' ? '/** @deprecated */ ' : ''
    seen.set(name, {
      line: CORE_TYPE_CONSTANTS.has(name)
        ? null
        : `${status}export const ${name}: ${tsType} = ${val}`,
      tableEntry: `  ${JSON.stringify(name)}: { type: ${JSON.stringify(type)}, value: ${val} },`,
    })
  }
  const constantsBody = [...seen.values()]
    .map((s) => s.line)
    .filter((l): l is string => l !== null)
    .sort()
    .join('\n')
  const tableBody = [...seen.values()]
    .map((s) => s.tableEntry)
    .sort()
    .join('\n')
  return {
    constantsTs:
      HEADER +
      `import type { Vector, Rotation } from '../values/types.js'\n\n` +
      constantsBody +
      '\n',
    tableTs:
      HEADER +
      `import type { LslType, Vector, Rotation } from '../values/types.js'

export interface ConstantEntry {
  readonly type: LslType
  readonly value: number | string | Vector | Rotation
}

/**
 * Every kwdb-derived constant exported by name with its type tag, so the
 * VM can pre-load them into a base environment scope visible to all scripts.
 */
export const CONSTANT_TABLE: Record<string, ConstantEntry> = {
${tableBody}
}
`,
  }
}

function emitFunctions(doc: RawDoc): string {
  const seen = new Map<string, string>()
  for (const f of doc.keywords.function ?? []) {
    if (!isSL(f['@_grid'])) continue
    const name = f['@_name']
    if (seen.has(name)) continue
    const ret = normType(f['@_type'])
    const delay = Number.parseFloat(f['@_delay'] ?? '0') || 0
    const status = f['@_status'] ?? 'normal'
    const params = asArray(f.param).map((p) => ({
      name: p['@_name'],
      type: normType(p['@_type']),
    }))
    const paramsLit = params
      .map((p) => `{ name: ${JSON.stringify(p.name)}, type: ${tsTypeLiteral(p.type)} }`)
      .join(', ')
    seen.set(
      name,
      `  ${JSON.stringify(name)}: { name: ${JSON.stringify(name)}, returnType: ${tsTypeLiteral(ret)}, delay: ${delay}, status: ${JSON.stringify(status)}, params: [${paramsLit}] },`,
    )
  }
  const body = [...seen.values()].sort().join('\n')
  return (
    HEADER +
    `import type { LslType } from '../values/types.js'

export interface ParamSpec {
  readonly name: string
  readonly type: LslType
}

export interface BuiltinSpec {
  readonly name: string
  readonly returnType: LslType
  /** Documented per-call delay in seconds (LSL throttles). */
  readonly delay: number
  readonly status: 'normal' | 'deprecated' | 'godmode' | 'unimplemented'
  readonly params: ReadonlyArray<ParamSpec>
}

export const BUILTIN_SPECS = {
${body}
} as const satisfies Record<string, BuiltinSpec>

export type BuiltinName = keyof typeof BUILTIN_SPECS
`
  )
}

/**
 * kwdb renames a few event params from their wiki-documented form to avoid
 * clashing with reserved words ("key" → "keyname"). The wiki names are what
 * users see in the LSL docs and in their own handler signatures, so we
 * remap back here to keep our spec aligned with the wiki.
 */
const EVENT_PARAM_OVERRIDES: Record<string, Record<string, string>> = {
  linkset_data: { keyname: 'name' },
}

function emitEvents(doc: RawDoc): string {
  const entries: Array<{ name: string; params: { name: string; type: string }[] }> = []
  const seen = new Set<string>()
  for (const e of doc.keywords.event ?? []) {
    if (!isSL(e['@_grid'])) continue
    const name = e['@_name']
    if (seen.has(name)) continue
    seen.add(name)
    const overrides = EVENT_PARAM_OVERRIDES[name] ?? {}
    entries.push({
      name,
      params: asArray(e.param).map((p) => ({
        name: overrides[p['@_name']] ?? p['@_name'],
        type: normType(p['@_type']),
      })),
    })
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))

  const specs = entries
    .map((e) => {
      const paramsLit = e.params
        .map((p) => `{ name: ${JSON.stringify(p.name)}, type: ${tsTypeLiteral(p.type)} }`)
        .join(', ')
      return `  ${JSON.stringify(e.name)}: { name: ${JSON.stringify(e.name)}, params: [${paramsLit}] },`
    })
    .join('\n')

  // Map LslType to a TS payload type for the event payload interface.
  function tsPayloadType(t: string): string {
    switch (t) {
      case 'integer':
      case 'float':
        return 'number'
      case 'string':
      case 'key':
        return 'string'
      case 'vector':
        return 'Vector'
      case 'rotation':
        return 'Rotation'
      case 'list':
        return 'ReadonlyArray<unknown>'
      default:
        return 'unknown'
    }
  }

  const payloads = entries
    .map((e) => {
      const fields = e.params
        .map((p) => `    readonly ${p.name}: ${tsPayloadType(p.type)}`)
        .join('\n')
      return `  ${e.name}: {
${fields}
  }`
    })
    .join('\n')

  return (
    HEADER +
    `import type { LslType, Vector, Rotation } from '../values/types.js'

export interface EventParamSpec {
  readonly name: string
  readonly type: LslType
}

export interface EventSpec {
  readonly name: string
  readonly params: ReadonlyArray<EventParamSpec>
}

export const EVENT_SPECS = {
${specs}
} as const satisfies Record<string, EventSpec>

export type EventName = keyof typeof EVENT_SPECS

/** Typed payload for each event. Used by Script.fire() so callers get IDE help. */
export interface EventPayloads {
${payloads}
}
`
  )
}

// ---- Main ----

function main(): void {
  const doc = loadXml()
  mkdirSync(OUT_DIR, { recursive: true })

  const { constantsTs, tableTs } = emitConstants(doc)
  const functionsTs = emitFunctions(doc)
  const eventsTs = emitEvents(doc)

  writeFileSync(resolve(OUT_DIR, 'constants.ts'), constantsTs)
  writeFileSync(resolve(OUT_DIR, 'constants_table.ts'), tableTs)
  writeFileSync(resolve(OUT_DIR, 'functions.ts'), functionsTs)
  writeFileSync(resolve(OUT_DIR, 'events.ts'), eventsTs)

  const counts = {
    constants: (constantsTs.match(/^export const /gm) ?? []).length,
    functions: (functionsTs.match(/^  "/gm) ?? []).length,
    events: (eventsTs.match(/^  [a-z]/gm) ?? []).length / 2, // appears in both specs and payloads
  }
  console.log(
    `gen-stubs: wrote ${counts.constants} constants, ${counts.functions} functions, ${counts.events} events`,
  )
}

main()
