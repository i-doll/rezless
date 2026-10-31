import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue } from '../values/types.js'
import { listElementType } from '../values/list-types.js'
import { sayError } from './debug.js'

/** A llDialog or llTextBox the script showed, waiting for the test to answer it. */
export interface DialogEntry {
  readonly kind: 'dialog' | 'textBox'
  /** The avatar it was shown to. */
  readonly agent: string
  readonly message: string
  /** The buttons the avatar sees: `['OK']` for an empty llDialog list, none for a text box. */
  readonly buttons: ReadonlyArray<string>
  readonly channel: number
  /** Key of the prim that showed it; the answer is heard within 20 m of that prim. */
  readonly objectKey: string
  answered: boolean
}

const MAX_MESSAGE_BYTES = 511
const MAX_BUTTONS = 12
const MAX_LABEL_BYTES = 24

function messageError(message: string): string | undefined {
  if (message === '') return 'must supply a message'
  if (Buffer.byteLength(message, 'utf8') > MAX_MESSAGE_BYTES) return 'message too long, must be less than 512 characters'
  return undefined
}

function buttonError(buttons: ReadonlyArray<LslValue>): string | undefined {
  if (buttons.length > MAX_BUTTONS) return 'button list too long, must be 12 or fewer entries'
  for (let i = 0; i < buttons.length; i++) {
    const label = buttons[i]
    const type = listElementType(buttons, i)
    if (typeof label !== 'string' || (type !== undefined && type !== 'string'))
      return 'button list must contain only strings'
    if (label === '') return 'all buttons must have label strings'
    if (Buffer.byteLength(label, 'utf8') > MAX_LABEL_BYTES) return 'button labels must be 24 or fewer characters long'
  }
  return undefined
}

function show(ctx: CallContext, entry: Omit<DialogEntry, 'objectKey' | 'answered'>): undefined {
  ctx.state.dialogs.push({ ...entry, objectKey: ctx.prim.key, answered: false })
  return undefined
}

/**
 * llDialog(key agent, string msg, list buttons, integer channel) — records the
 * menu for the test to answer with Script.answerDialog. Bad arguments print
 * the simulator's DEBUG_CHANNEL error and show nothing.
 */
export const llDialog: BuiltinImpl = (ctx, args) => {
  const message = (args[1] as string | undefined) ?? ''
  const buttons = (args[2] as ReadonlyArray<LslValue> | undefined) ?? []
  const error = messageError(message) ?? buttonError(buttons)
  if (error) {
    sayError(ctx, `llDialog: ${error}`)
    return undefined
  }
  return show(ctx, {
    kind: 'dialog',
    agent: (args[0] as string | undefined) ?? '',
    message,
    buttons: buttons.length === 0 ? ['OK'] : ([...buttons] as string[]),
    channel: (args[3] as number | undefined) ?? 0,
  })
}

/** llTextBox(key agent, string msg, integer channel) — like llDialog, answered with any text. */
export const llTextBox: BuiltinImpl = (ctx, args) => {
  const message = (args[1] as string | undefined) ?? ''
  const error = messageError(message)
  if (error) {
    sayError(ctx, `llTextBox: ${error}`)
    return undefined
  }
  return show(ctx, {
    kind: 'textBox',
    agent: (args[0] as string | undefined) ?? '',
    message,
    buttons: [],
    channel: (args[2] as number | undefined) ?? 0,
  })
}
