#!/usr/bin/env tsx
/**
 * Code generator: parses vendor/lsl_definitions.yaml and emits typed TS files for the VM.
 *
 * Outputs under packages/vm/src/generated/:
 *   - constants.ts — every constant exported as a typed TS value
 *   - functions.ts — BUILTIN_SPECS metadata array for every function
 *   - events.ts    — EVENT_SPECS + EventPayloads mapped type for every event
 *
 * And under packages/parser/src/generated/:
 *   - event-names.ts — EVENT_NAMES set; event names are reserved words in LSL
 *
 * Source of truth: secondlife/lsl-definitions (MIT, vendored at vendor/lsl_definitions.yaml).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DEFS_PATH = resolve(ROOT, 'vendor/lsl_definitions.yaml')
const OUT_DIR = resolve(ROOT, 'packages/vm/src/generated')
const PARSER_OUT_DIR = resolve(ROOT, 'packages/parser/src/generated')

// ---- YAML loading ----

type RawArguments = Array<Record<string, { type: string }>>

interface RawFunction {
  arguments?: RawArguments
  return?: string
  sleep?: number
  'mono-sleep'?: number
  deprecated?: unknown
  'god-mode'?: boolean
}

interface RawEvent {
  arguments?: RawArguments
}

interface RawConstant {
  type: string
  value?: string | number
  deprecated?: unknown
}

interface RawDefs {
  functions: Record<string, RawFunction>
  events: Record<string, RawEvent>
  constants: Record<string, RawConstant>
}

function loadDefs(): RawDefs {
  return parse(readFileSync(DEFS_PATH, 'utf8')) as RawDefs
}

function params(args: RawArguments | undefined): { name: string; type: string }[] {
  return (args ?? []).flatMap((a) =>
    Object.entries(a).map(([name, p]) => ({ name, type: normType(p.type) })),
  )
}

/**
 * Interpret LSL string-escape sequences (which the definitions file stores as
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
    } else if (next === 'u' && /^\{[0-9a-fA-F]+\}/.test(s.slice(i + 2))) {
      const close = s.indexOf('}', i)
      out += String.fromCodePoint(Number.parseInt(s.slice(i + 3, close), 16))
      i = close
    } else {
      // Unknown escape — preserve as-is (matches LSL's lenient behaviour).
      out += ch
    }
  }
  return out
}

// ---- Type mapping ----

const KNOWN_TYPES = new Set(['integer', 'float', 'string', 'key', 'vector', 'rotation', 'list'])

function normType(t: string | undefined): string {
  if (!t || t === 'void') return 'void'
  if (KNOWN_TYPES.has(t)) return t
  throw new Error(`gen-stubs: unknown LSL type "${t}"`)
}

/** TS literal for a LslType value used in generated `as const` arrays. */
function tsTypeLiteral(t: string): string {
  return JSON.stringify(t)
}

// ---- Constant value parsing ----

function parseConstantValue(type: string, value: string | number | undefined): string | null {
  if (value === undefined) return null
  const v = String(value).trim()
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
// Source: vendor/lsl_definitions.yaml (secondlife/lsl-definitions, MIT).
// Run \`pnpm gen\` to regenerate.

`

// Names that are hand-written in packages/vm/src/values/types.ts. We keep
// them in CONSTANT_TABLE (so script.ts runtime resolution still finds them)
// but skip them in constants.ts to avoid an export-name collision when the
// public barrel re-exports both files.
const CORE_TYPE_CONSTANTS = new Set(['ZERO_VECTOR', 'ZERO_ROTATION', 'NULL_KEY'])

function emitConstants(defs: RawDefs): {
  constantsTs: string
  tableTs: string
} {
  const seen = new Map<string, { line: string | null; tableEntry: string }>()
  for (const [name, c] of Object.entries(defs.constants)) {
    const type = normType(c.type)
    const val = parseConstantValue(type, c.value)
    if (val === null) continue
    const tsType = tsConstantType(type)
    if (tsType === 'never') continue
    const status = c.deprecated ? '/** @deprecated */ ' : ''
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
 * Every LSL constant exported by name with its type tag, so the
 * VM can pre-load them into a base environment scope visible to all scripts.
 */
export const CONSTANT_TABLE: Record<string, ConstantEntry> = {
${tableBody}
}
`,
  }
}

function emitFunctions(defs: RawDefs): string {
  const lines: string[] = []
  for (const [name, f] of Object.entries(defs.functions)) {
    const ret = normType(f.return)
    // Mirrors LL's Mono bindings, which sleep for mono-sleep and fall back to sleep.
    const delay = f['mono-sleep'] ?? f.sleep ?? 0
    const status = f['god-mode'] ? 'godmode' : f.deprecated ? 'deprecated' : 'normal'
    const paramsLit = params(f.arguments)
      .map((p) => `{ name: ${JSON.stringify(p.name)}, type: ${tsTypeLiteral(p.type)} }`)
      .join(', ')
    lines.push(
      `  ${JSON.stringify(name)}: { name: ${JSON.stringify(name)}, returnType: ${tsTypeLiteral(ret)}, delay: ${delay}, status: ${JSON.stringify(status)}, params: [${paramsLit}] },`,
    )
  }
  const body = lines.sort().join('\n')
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
  readonly status: 'normal' | 'deprecated' | 'godmode'
  readonly params: ReadonlyArray<ParamSpec>
}

export const BUILTIN_SPECS = {
${body}
} as const satisfies Record<string, BuiltinSpec>

export type BuiltinName = keyof typeof BUILTIN_SPECS
`
  )
}

function emitEvents(defs: RawDefs): string {
  const entries = Object.entries(defs.events).map(([name, e]) => ({
    name,
    params: params(e.arguments),
  }))
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

function emitEventNames(defs: RawDefs): string {
  const names = Object.keys(defs.events).sort((a, b) => a.localeCompare(b))

  return `${HEADER}export const EVENT_NAMES: ReadonlySet<string> = new Set([
${names.map((n) => `  ${JSON.stringify(n)},`).join('\n')}
])
`
}

// ---- Main ----

function main(): void {
  const defs = loadDefs()
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(PARSER_OUT_DIR, { recursive: true })

  const { constantsTs, tableTs } = emitConstants(defs)
  const functionsTs = emitFunctions(defs)
  const eventsTs = emitEvents(defs)

  writeFileSync(resolve(OUT_DIR, 'constants.ts'), constantsTs)
  writeFileSync(resolve(OUT_DIR, 'constants_table.ts'), tableTs)
  writeFileSync(resolve(OUT_DIR, 'functions.ts'), functionsTs)
  writeFileSync(resolve(OUT_DIR, 'events.ts'), eventsTs)
  writeFileSync(resolve(PARSER_OUT_DIR, 'event-names.ts'), emitEventNames(defs))

  const constants = (constantsTs.match(/^(\/\*\* @deprecated \*\/ )?export const /gm) ?? []).length
  const functions = Object.keys(defs.functions).length
  const events = Object.keys(defs.events).length
  console.log(`gen-stubs: wrote ${constants} constants, ${functions} functions, ${events} events`)
}

main()
