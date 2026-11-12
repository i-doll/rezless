import { readFile } from 'node:fs/promises'
import { parse, LslParseError } from '@rezless/parser'
import { Script, typecheck } from '@rezless/vm'
import type { ScriptOptions } from '@rezless/vm'
import { isCoverageEnabled } from './coverage-config.js'
import { registerScript } from './coverage-registry.js'

export interface InlineScriptInput extends ScriptOptions {
  /** Script source code as a string. */
  readonly source: string
  /** Optional virtual filename for diagnostics; defaults to "<inline>". */
  readonly filename?: string
  /**
   * 'slua' runs the source as SLua (Luau, in SLua's own VM); default 'lsl',
   * or 'slua' when the filename ends in .lua or .luau.
   */
  readonly language?: 'lsl' | 'slua'
}

export type LoadScriptInput = string | InlineScriptInput

/**
 * Parse and instantiate an LSL script ready for testing.
 *
 * Pass a file path to load from disk, or `{ source, ...options }` for an
 * inline string. Options propagate to the Script (random seed, owner key,
 * object/script name).
 *
 * Coverage activates when any of: `coverage: true` in options, the Vitest
 * coverage reporter has been installed, or `LSL_COVERAGE=1` in the env.
 *
 * A `.lua` / `.luau` file, or `language: 'slua'`, loads an SLua script,
 * run in SLua's own VM; a compile error throws `SluaCompileError`.
 *
 * LSL parse and type errors throw `LslParseError`, which Vitest renders with the
 * offending `file:line:col`.
 */
export async function loadScript(input: LoadScriptInput): Promise<Script> {
  let source: string
  let filename: string
  let baseOptions: ScriptOptions
  if (typeof input === 'string') {
    source = await readFile(input, 'utf8')
    filename = input
    baseOptions = { filename }
  } else {
    source = input.source
    filename = input.filename ?? '<inline>'
    baseOptions = { ...input, filename }
  }
  const language = typeof input === 'string' ? undefined : input.language
  if (language === 'slua' || (language === undefined && /\.luau?$/i.test(filename))) {
    const coverage = baseOptions.coverage ?? isCoverageEnabled()
    const script = Script.fromSlua(source, { ...baseOptions, source, coverage })
    if (coverage) registerScript(script)
    return script
  }
  const { script: ast, diagnostics } = parse(source, filename)
  const errors = diagnostics.filter((d) => d.severity === 'error')
  if (errors.length === 0) errors.push(...typecheck(ast, filename, baseOptions.functions))
  if (errors.length > 0) {
    throw new LslParseError(errors)
  }
  const coverage = baseOptions.coverage ?? isCoverageEnabled()
  const options: ScriptOptions = { ...baseOptions, source, coverage }
  const script = new Script(ast, options)
  if (coverage) registerScript(script)
  return script
}
