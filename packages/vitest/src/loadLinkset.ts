import { readFile } from 'node:fs/promises'
import { parse, LslParseError } from '@rezless/parser'
import {
  Script,
  typecheck,
  Linkset,
  Prim,
  type ScriptOptions,
  type LinksetOptions,
  type PrimOptions,
  type InventoryItem,
  type Vector,
  makeInventoryItem,
  InventoryType,
} from '@rezless/vm'
import { isCoverageEnabled } from './coverage-config.js'
import { registerScript } from './coverage-registry.js'

export interface InlineSource {
  /** Script source code as a string. */
  readonly source: string
  /** Optional virtual filename for diagnostics; defaults to "<inline>". */
  readonly filename?: string
}

export type ScriptSource = string | InlineSource

export interface ScriptInput extends Omit<ScriptOptions, 'source'> {
  /** Path or inline source. */
  readonly source: ScriptSource
  /** Inventory name override (defaults to scriptName / filename basename). */
  readonly name?: string
  /** 'slua' runs the source as SLua; default 'lsl', or 'slua' for a .lua / .luau filename. */
  readonly language?: 'lsl' | 'slua'
}

export interface PrimInput extends PrimOptions {
  /** Scripts hosted on this prim. */
  readonly scripts?: ReadonlyArray<ScriptInput>
  /** Non-script inventory items (notecards, textures, …). */
  readonly inventory?: ReadonlyArray<InventoryItem>
  /** Named inventory objects, each described with the same prim/script fixture syntax. */
  readonly objects?: Readonly<Record<string, ObjectInput>>
}

export type ObjectInput = Omit<LinksetInput, 'world' | 'region' | 'owner' | 'startParameter' | 'startString'>

export interface LinksetInput extends LinksetOptions {
  readonly prims: ReadonlyArray<PrimInput>
  /** Region position of the root prim. */
  readonly position?: Vector
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
 * Parse a script and build it on `prim`, stored under its inventory name and
 * not yet started. `numbered` appends a number to a name the prim already holds.
 */
async function buildScript(prim: Prim, input: ScriptInput, numbered = false): Promise<Script> {
  const { source, filename } = await readScriptSource(input.source)
  const slua = input.language === 'slua' || (input.language === undefined && /\.luau?$/i.test(filename))
  const ast = slua ? null : parse(source, filename)
  if (ast) {
    const errors = ast.diagnostics.filter((d) => d.severity === 'error')
    if (errors.length === 0) errors.push(...typecheck(ast.script, filename, input.functions))
    if (errors.length > 0) throw new LslParseError(errors)
  }
  // Build options without the loadLinkset-only fields. The inventory
  // `name` is also surfaced as `scriptName` so llGetScriptName /
  // llSetScriptState / llResetOtherScript all agree on the script's
  // identity.
  const { source: _src, name: invName, language: _language, ...rest } = input
  const coverage = rest.coverage ?? isCoverageEnabled()
  const opts: ScriptOptions = { ...rest, filename, host: prim, source, coverage }
  const given = invName ?? rest.scriptName
  const inventoryName = numbered
    ? prim.freeInventoryName(given ?? filename.split('/').pop()!.replace(/\.(lsl|luau?)$/i, ''))
    : given
  if (numbered && !inventoryName) throw new Error('addScript: the script name has no ASCII characters')
  if (inventoryName !== undefined) {
    ;(opts as { -readonly [K in keyof ScriptOptions]: ScriptOptions[K] }).scriptName =
      inventoryName
  }
  const s = ast ? new Script(ast.script, opts) : Script.fromSlua(source, opts)
  if (coverage) registerScript(s)
  const item = prim.inventory.find((it) => it.script === s)
  if (item) item.name = s.scriptName
  return s
}

/**
 * Add a script to a prim as its owner does by dropping it in. The scripts
 * already in the prim get `changed(CHANGED_INVENTORY)`, then the new script
 * runs `state_entry` unless `running` is false. A name the prim already holds
 * gets a number appended. A script that one of their `changed` handlers
 * deletes is returned dead.
 */
export async function addScript(prim: Prim, input: ScriptInput, opts: { running?: boolean } = {}): Promise<Script> {
  if (prim.linkset?.dead) throw new Error('addScript: the object no longer exists')
  const script = await buildScript(prim, input, true)
  prim.dropScript(script, opts)
  return script
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
  if (input.startUnixTime !== undefined) linksetOpts.startUnixTime = input.startUnixTime
  if (input.world !== undefined) linksetOpts.world = input.world
  if (input.region !== undefined) linksetOpts.region = input.region
  if (input.startParameter !== undefined) linksetOpts.startParameter = input.startParameter
  if (input.startString !== undefined) linksetOpts.startString = input.startString
  if (input.animesh !== undefined) linksetOpts.animesh = input.animesh
  const linkset = new Linkset(linksetOpts)
  // Object.create(null) avoids prototype keys ('toString', 'constructor', …)
  // false-positive-tripping the duplicate-name check below.
  const scripts: Record<string, Script> = Object.create(null) as Record<string, Script>
  const prims: Prim[] = []
  for (const primInput of input.prims) {
    const primOpts: { -readonly [K in keyof PrimOptions]: PrimOptions[K] } = {}
    if (primInput.key !== undefined) primOpts.key = primInput.key
    if (primInput.name !== undefined) primOpts.name = primInput.name
    if (primInput.description !== undefined) primOpts.description = primInput.description
    const prim = new Prim(primOpts)
    linkset.addPrim(prim)
    if (prims.length === 0 && input.position) prim.params.position = input.position
    prims.push(prim)
    for (const item of primInput.inventory ?? []) {
      prim.placeInventory(item)
    }
    for (const [name, definition] of Object.entries(primInput.objects ?? {})) {
      const object = (await loadLinkset(definition)).linkset
      if (!object.prims.length) throw new Error(`loadLinkset: inventory object '${name}' has no prims`)
      prim.placeInventory(makeInventoryItem({ name, type: InventoryType.OBJECT,
        key: object.prims[0]!.key, object }))
    }
    for (const sInput of primInput.scripts ?? []) {
      const s = await buildScript(prim, sInput)
      const finalName = s.scriptName
      if (finalName in scripts) {
        throw new Error(
          `loadLinkset: duplicate script name '${finalName}' across prims; ` +
            `give each script a unique inventory name to avoid silent overwrites`,
        )
      }
      scripts[finalName] = s
    }
  }
  return { linkset, prims, scripts }
}
