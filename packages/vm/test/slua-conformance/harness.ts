/**
 * Runs the LSL conformance scripts from secondlife/slua
 * (tests/conformance/*.lsl) on rezless.
 *
 * SLua's harness (tests/LSL.test.cpp) makes LSL's `print(x)` expression
 * yield `x` back to the test, which checks the sequence of values. In
 * rezless (as in Second Life) `print` only evaluates its argument, so here
 * every `print(e)` is rewritten to a call `slua_print([e])` before type
 * checking: the list carries `e`'s LSL type along with its value, and a
 * mock records both.
 */
import { readFileSync } from 'node:fs'
import { parse } from '@rezless/parser'
import type { Expression, ListLiteral } from '@rezless/parser'
import { Script } from '../../src/script.js'
import { typecheck } from '../../src/typecheck.js'
import { listElementTypes } from '../../src/values/list-types.js'
import type { LslType, LslValue } from '../../src/values/types.js'

export interface Printed {
  readonly type: LslType | undefined
  readonly value: LslValue
}

export interface ConformanceRun {
  readonly script: Script
  /** Every value the script passed to `print`, in order. */
  readonly printed: ReadonlyArray<Printed>
  /** Everything the script said with llOwnerSay. */
  readonly ownerSays: ReadonlyArray<string>
  /** The run-time error that stopped the script, or null if it ran to completion. */
  readonly error: string | null
}

const FIXTURES = new URL('./fixtures/', import.meta.url)

export function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8')
}

const PRINT = 'slua_print'

/** Turn every `print(e)` into `slua_print([e])`. */
function wrapPrintArgs(node: unknown): void {
  if (Array.isArray(node)) {
    for (const child of node) wrapPrintArgs(child)
    return
  }
  if (node === null || typeof node !== 'object') return
  const n = node as Record<string, unknown>
  for (const key of Object.keys(n)) {
    if (key !== 'loc') wrapPrintArgs(n[key])
  }
  if (n.kind === 'PrintExpression') {
    const arg = n.argument as Expression
    const wrapped: ListLiteral = { kind: 'ListLiteral', elements: [arg], loc: arg.loc }
    n.kind = 'CallExpression'
    n.callee = PRINT
    n.args = [wrapped]
    delete n.argument
  }
}

/**
 * Load `name` from the fixtures, run its default `state_entry` (and any
 * state changes it makes) to completion, and report what it printed.
 */
export function runConformance(name: string): ConformanceRun {
  return runSource(fixture(name), name)
}

/** As `runConformance`, for LSL source given inline. */
export function runSource(source: string, name = '<inline>'): ConformanceRun {
  const { script: ast, diagnostics } = parse(source, name)
  const parseErrors = diagnostics.filter((d) => d.severity === 'error')
  if (parseErrors.length > 0) throw new Error(`${name}: ${JSON.stringify(parseErrors)}`)
  wrapPrintArgs(ast)
  const functions = { [PRINT]: { params: ['list' as const] } }
  const typeErrors = typecheck(ast, name, functions)
  if (typeErrors.length > 0) throw new Error(`${name}: ${typeErrors.map((d) => d.message).join('; ')}`)

  const script = new Script(ast, { source, filename: name, functions })
  const printed: Printed[] = []
  script.mock(PRINT, (_ctx, [list]) => {
    const values = list as ReadonlyArray<LslValue>
    printed.push({ type: listElementTypes(values)?.[0], value: values[0]! })
    return undefined
  })
  let error: string | null = null
  try {
    script.start()
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const debug = script.chat.filter((c) => c.channel === 0x7fffffff).map((c) => c.text)
  if (error === null && debug.includes('Script run-time error')) {
    error = debug[debug.indexOf('Script run-time error') + 1] ?? 'Script run-time error'
  }
  const ownerSays = script.callsOf('llOwnerSay').map((c) => String(c.args[0]))
  return { script, printed, ownerSays, error }
}
