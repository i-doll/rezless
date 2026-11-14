/**
 * Differential cases against SLua, Second Life's LSL-on-Luau runtime.
 *
 * Each case in ./slua-parity/cases.json was run through SLua's CLI
 * (secondlife/slua at af1379e, `slua --lsl`), and `output` is what it
 * printed with llOwnerSay. "ERROR" marks a run-time error and
 * "COMPILE ERROR" a script SLua refuses to compile; their messages differ
 * between the two implementations, so only the kind is compared.
 *
 * Cases where rezless deliberately differs (in-world measurements beat
 * SLua) are left out; quirks.test.ts covers those.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { parse } from '@rezless/parser'
import { Script } from '../src/script.js'
import { typecheck } from '../src/typecheck.js'

interface ParityCase {
  readonly name: string
  readonly source: string
  readonly output: ReadonlyArray<string>
}

const cases: ParityCase[] = JSON.parse(readFileSync(new URL('./slua-parity/cases.json', import.meta.url), 'utf8'))

/** What rezless prints for `source`, in the same form as the recorded SLua output. */
function run(source: string): string[] {
  const { script: ast, diagnostics } = parse(source, 'case.lsl')
  const errors = diagnostics.filter((d) => d.severity === 'error')
  if (errors.length === 0) errors.push(...typecheck(ast, 'case.lsl'))
  if (errors.length > 0) return ['COMPILE ERROR']
  const script = new Script(ast, { source })
  let failed = false
  try {
    script.start()
  } catch {
    failed = true
  }
  const lines = script.chat.filter((c) => c.type === 'ownerSay').map((c) => c.text)
  if (failed || script.chat.some((c) => c.channel === 0x7fffffff && c.text.endsWith('Script run-time error'))) {
    lines.push('ERROR')
  }
  return lines
}

describe('SLua parity', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    // SLua's output was recorded line by line, so compare the joined text:
    // an llOwnerSay containing a newline spans two recorded lines.
    expect(run(c.source).join('\n')).toBe(c.output.join('\n'))
  })
})
