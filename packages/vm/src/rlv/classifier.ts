import type { RlvCommandFields } from './parser.js'
import type { RlvProfile } from './profiles.js'
import { getRlvCommandCoverage } from './getcommand.js'

export type RlvCommandOutcome = 'unknown-behaviour' | 'wrong-parameter-kind' | 'unsupported-form' | 'state-only' | 'invalid-channel' | 'invalid-option'

/** Diagnose a command that did not produce an implemented reply or action. */
export function classifyRlvUnsupported(profile: RlvProfile, command: RlvParsedCommand): RlvCommandOutcome {
  if (command.kind === 'clear') return 'state-only'
  const forms = getRlvCommandCoverage(profile).filter(form => form.behaviour === command.behaviour)
  if (!forms.length) return 'unknown-behaviour'
  const type = command.kind === 'query' ? 'reply' : command.kind === 'remove' ? 'add' : command.kind
  const form = forms.find(form => form.type === type)
  if (!form) return 'wrong-parameter-kind'
  if (form.option === 'none' && command.option) return 'unsupported-form'
  if (form.support === 'state-only') return 'state-only'
  if (form.support === 'enforced' && type === 'reply') return 'invalid-channel'
  return 'unsupported-form'
}

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
