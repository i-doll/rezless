import type { Script } from './script.js'
import type { InventoryItem } from './inventory.js'
import { InventoryType } from './inventory.js'
import { defaultPrimParams, type PrimParams } from './prim-params.js'
import { NULL_KEY } from './values/types.js'
import { PERM_ALL } from './generated/constants.js'
import type { Linkset } from './linkset.js'

export interface PrimOptions {
  readonly key?: string
  readonly name?: string
  readonly description?: string
}

/**
 * A single prim in a linkset. Holds the prim's identity, its script roster,
 * its (full) inventory, and the PRIM_* parameter store. Scripts join a prim
 * via `prim.addScript(script)`.
 */
export class Prim {
  /** 1-based link number assigned by the host Linkset. 0 = unlinked single prim. */
  linkNumber = 0
  key: string
  name: string
  description: string
  readonly scripts: Script[] = []
  readonly inventory: InventoryItem[] = []
  readonly params: PrimParams = defaultPrimParams()
  appearance: {
    text: { text: string; color: { x: number; y: number; z: number }; alpha: number } | null
    description: string
  } = { text: null, description: '' }

  /** Set when this prim joins a linkset. */
  linkset?: Linkset

  constructor(opts: PrimOptions = {}) {
    this.key = opts.key ?? NULL_KEY
    this.name = opts.name ?? 'Object'
    this.description = opts.description ?? ''
    this.appearance.description = this.description
  }

  /** Add a script to this prim's inventory and roster. */
  addScript(script: Script, opts: { name?: string; key?: string } = {}): void {
    this.scripts.push(script)
    this.inventory.push({
      name: opts.name ?? script.scriptName,
      type: InventoryType.SCRIPT,
      key: opts.key ?? NULL_KEY,
      creator: NULL_KEY,
      description: '',
      acquireTimeMs: this.linkset?.clock.now ?? 0,
      permMask: {
        base: PERM_ALL,
        owner: PERM_ALL,
        group: 0,
        everyone: 0,
        next: PERM_ALL,
      },
      script,
    })
  }

  /**
   * Add a non-script inventory item (notecard, texture, etc.). The caller
   * is responsible for setting `acquireTimeMs`; if you want it to default
   * to the current linkset clock, build the item with `makeInventoryItem`
   * and pass `acquireTimeMs: this.linkset?.clock.now ?? 0`.
   */
  addInventory(item: InventoryItem): void {
    this.inventory.push({ ...item })
  }

  /** Find a script by inventory name. */
  findScript(name: string): Script | undefined {
    for (const it of this.inventory) {
      if (it.type === InventoryType.SCRIPT && it.name === name) return it.script
    }
    return undefined
  }

  /**
   * Read a single PRIM_* parameter. Stub seam for llGetPrimitiveParams /
   * llGetLinkPrimitiveParams; only a few values are wired today.
   */
  getPrimParam(_param: number): unknown {
    return undefined
  }

  /**
   * Write a single PRIM_* parameter. Stub seam for llSetPrimitiveParams /
   * llSetLinkPrimitiveParams; no-op for parameters that aren't wired yet.
   */
  setPrimParam(_param: number, _value: unknown): void {
    /* intentionally empty — see prim-params.ts for the data shape */
  }
}
