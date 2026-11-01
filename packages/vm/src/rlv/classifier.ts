import type { RlvCommandFields } from './parser.js'

export type RlvParameterKind = 'add' | 'remove' | 'force' | 'clear' | 'query' | 'unknown'
export interface RlvParsedCommand extends RlvCommandFields {
  readonly kind: RlvParameterKind
}

/** Decimal prefix conversion; out-of-range C conversions are outside the supported forms. */
export function rlvIntegerPrefix(parameter: string): number | undefined {
  const prefix = /^[\t\n\v\f\r ]*([+-]?[0-9]+)/.exec(parameter)
  if (!prefix) return undefined
  const value = Number(prefix[1])
  return value >= -2147483648 && value <= 2147483647 ? value : undefined
}

/** Parameter kinds do not imply that a behaviour or its effects are supported. */
export function classifyRlvCommand(fields: RlvCommandFields): RlvParsedCommand {
  const { behaviour, parameter } = fields
  const kind = parameter === 'n' || parameter === 'add' ? 'add'
    : parameter === 'y' || parameter === 'rem' ? 'remove'
    : behaviour === 'clear' ? 'clear'
    : parameter === 'force' ? 'force'
    : rlvIntegerPrefix(parameter) !== undefined ? 'query' : 'unknown'
  return { ...fields, kind }
}
