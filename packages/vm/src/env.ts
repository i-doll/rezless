import type { EvalResult, LslType, LslValue } from './values/types.js'
import { defaultEvalFor } from './values/types.js'
import { coerce } from './values/coerce.js'
import type { Memory } from './memory.js'
import { globalBytes, listBytes, stringBytes } from './memory.js'

interface Slot {
  type: LslType
  value: EvalResult
  bytes: number
}

/**
 * Lexical environment with a single parent pointer. The interpreter pushes
 * a new env when entering a block / handler and discards on exit. Globals
 * live at the bottom of the chain and persist for the lifetime of the script.
 */
export class Env {
  private readonly slots = new Map<string, Slot>()

  /**
   * `memory` (inherited by child scopes) is charged for the variables this
   * scope holds: every global, and the strings and lists among locals. Call
   * frames pay for the rest of a local's stack space.
   */
  constructor(
    private readonly parent: Env | null = null,
    private readonly memory: Memory | null = null,
    private readonly global = memory !== null,
  ) {}

  /** Declare a new variable in the current scope. Coerces init to declared type. */
  declare(name: string, type: LslType, init?: EvalResult): void {
    if (this.slots.has(name)) {
      throw new Error(`variable '${name}' already declared in this scope`)
    }
    const value = init ? coerce(init, type) : defaultEvalFor(type)
    const bytes = this.bytesFor(value)
    this.charge(bytes)
    this.slots.set(name, { type, value, bytes })
  }

  /**
   * Declare-or-reset: like `declare`, but if `name` already exists in this
   * scope, overwrite its value (and type) instead of throwing. Used by the
   * interpreter when a backward `jump` re-executes a VariableDeclaration —
   * the slot already exists from the first pass and the declaration is
   * effectively a re-initialization. The execBlock pre-scan still catches
   * real source-level duplicate declarations.
   */
  declareOrReset(name: string, type: LslType, init?: EvalResult): void {
    const slot = this.slots.get(name)
    if (slot) {
      slot.type = type
      this.store(slot, init ? coerce(init, type) : defaultEvalFor(type))
      return
    }
    this.declare(name, type, init)
  }

  /** Get a variable's current value. Walks up the parent chain. */
  get(name: string): EvalResult {
    const slot = this.findSlot(name)
    if (!slot) throw new Error(`undefined variable '${name}'`)
    return slot.value
  }

  /** Assign to an existing variable. Coerces to declared type. */
  set(name: string, value: EvalResult): EvalResult {
    const slot = this.slots.get(name)
    if (!slot) {
      if (!this.parent) throw new Error(`undefined variable '${name}'`)
      return this.parent.set(name, value)
    }
    this.store(slot, coerce(value, slot.type))
    return slot.value
  }

  hasOwn(name: string): boolean {
    return this.slots.has(name)
  }

  /** Drop every slot in *this* scope and give back its memory; doesn't touch the parent chain. */
  clear(): void {
    let bytes = 0
    for (const s of this.slots.values()) bytes += s.bytes
    this.charge(-bytes)
    this.slots.clear()
  }

  /** Open a child scope for locals. */
  push(): Env {
    return new Env(this, this.memory, false)
  }

  private store(slot: Slot, value: EvalResult): void {
    const bytes = this.bytesFor(value)
    this.charge(bytes - slot.bytes)
    slot.value = value
    slot.bytes = bytes
  }

  private charge(bytes: number): void {
    if (this.global) this.memory!.alloc(bytes)
    else this.memory?.allocLocal(bytes)
  }

  private bytesFor(value: EvalResult): number {
    if (!this.memory) return 0
    if (this.global) return globalBytes(value.type, value.value)
    if (value.type === 'string') return stringBytes(value.value as string)
    return value.type === 'list' ? listBytes(value.value as ReadonlyArray<LslValue>) : 0
  }

  private findSlot(name: string): Slot | null {
    let env: Env | null = this
    while (env) {
      const s = env.slots.get(name)
      if (s) return s
      env = env.parent
    }
    return null
  }
}
