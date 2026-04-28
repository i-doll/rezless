import { readFile } from 'node:fs/promises'
import { parse, LslParseError } from '@lslvm/parser'
import {
  Script,
  Linkset,
  Prim,
  type ScriptOptions,
  type LinksetOptions,
  type PrimOptions,
  type InventoryItem,
} from '@lslvm/vm'

export interface InlineSource {
  /** LSL source code as a string. */
  readonly source: string
  /** Optional virtual filename for diagnostics; defaults to "<inline>". */
  readonly filename?: string
}

export type ScriptSource = string | InlineSource

export interface ScriptInput extends ScriptOptions {
  /** Path or inline source. */
  readonly source: ScriptSource
  /** Inventory name override (defaults to scriptName / filename basename). */
  readonly name?: string
}

export interface PrimInput extends PrimOptions {
  /** Scripts hosted on this prim. */
  readonly scripts?: ReadonlyArray<ScriptInput>
  /** Non-script inventory items (notecards, textures, …). */
  readonly inventory?: ReadonlyArray<InventoryItem>
}

export interface LinksetInput extends LinksetOptions {
  readonly prims: ReadonlyArray<PrimInput>
}

export interface LoadedLinkset {
  readonly linkset: Linkset
  readonly prims: ReadonlyArray<Prim>
  /** Flat name → Script lookup across all prims. */
  readonly scripts: Readonly<Record<string, Script>>
}

async function readScriptSource(src: ScriptSource): Promise<{ source: string; filename: string }> {
  if (typeof src === 'string') {
    return { source: await readFile(src, 'utf8'), filename: src }
  }
  return { source: src.source, filename: src.filename ?? '<inline>' }
}

/**
 * Build a multi-prim, multi-script Linkset for tests. Each prim hosts one or
 * more scripts; the returned `scripts` map keys by inventory name.
 *
 * Existing single-script tests continue to use `loadScript`; this is the
 * additive multi-script path.
 */
export async function loadLinkset(input: LinksetInput): Promise<LoadedLinkset> {
  const linksetOpts: { -readonly [K in keyof LinksetOptions]: LinksetOptions[K] } = {}
  if (input.owner !== undefined) linksetOpts.owner = input.owner
  const linkset = new Linkset(linksetOpts)
  const scripts: Record<string, Script> = {}
  const prims: Prim[] = []
  for (const primInput of input.prims) {
    const primOpts: { -readonly [K in keyof PrimOptions]: PrimOptions[K] } = {}
    if (primInput.key !== undefined) primOpts.key = primInput.key
    if (primInput.name !== undefined) primOpts.name = primInput.name
    if (primInput.description !== undefined) primOpts.description = primInput.description
    const prim = new Prim(primOpts)
    linkset.addPrim(prim)
    prims.push(prim)
    for (const item of primInput.inventory ?? []) {
      prim.addInventory(item)
    }
    for (const sInput of primInput.scripts ?? []) {
      const { source, filename } = await readScriptSource(sInput.source)
      const { script: ast, diagnostics } = parse(source, filename)
      const errors = diagnostics.filter((d) => d.severity === 'error')
      if (errors.length > 0) throw new LslParseError(errors)
      // Build options without the loadLinkset-only fields. The inventory
      // `name` is also surfaced as `scriptName` so llGetScriptName /
      // llSetScriptState / llResetOtherScript all agree on the script's
      // identity.
      const { source: _src, name: invName, ...rest } = sInput
      const opts: ScriptOptions = { ...rest, filename, host: prim }
      const inventoryName = invName ?? rest.scriptName
      if (inventoryName !== undefined) {
        ;(opts as { -readonly [K in keyof ScriptOptions]: ScriptOptions[K] }).scriptName =
          inventoryName
      }
      const s = new Script(ast, opts)
      const finalName = inventoryName ?? s.scriptName
      const item = prim.inventory.find((it) => it.script === s)
      if (item) item.name = finalName
      scripts[finalName] = s
    }
  }
  return { linkset, prims, scripts }
}
