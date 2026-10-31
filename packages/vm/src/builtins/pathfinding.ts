import type { BuiltinImpl } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { Script } from '../script.js'
import type { LslValue, Vector } from '../values/types.js'
import { CHARACTER_LENGTH, CHARACTER_RADIUS, PU_FAILURE_INVALID_GOAL } from '../generated/constants.js'
import { sayError } from './debug.js'

/** A pathfinding operation requested by a script, in call order. */
export interface CharacterCommand {
  readonly name: string
  readonly args: ReadonlyArray<LslValue>
}

/** Requested configuration and command history, shared by an object's scripts. */
export interface Character {
  /** Explicit option values. Simulator defaults, clamping and capsule fitting are not calculated. */
  readonly options: ReadonlyMap<number, LslValue>
  readonly commands: ReadonlyArray<CharacterCommand>
}

interface MutableCharacter {
  options: Map<number, LslValue>
  commands: CharacterCommand[]
}

/** Fixed answers to navigation queries; use script.mock for answers that depend on the arguments. */
export interface NavigationResults {
  readonly closestNavPoint?: ReadonlyArray<Vector>
  /** Waypoints followed by a status integer, or a single failure status. */
  readonly staticPath?: ReadonlyArray<LslValue>
}

// Pathfinding belongs to the object, not the script that created it. Keeping
// the state on the root also preserves it when that script resets or is removed.
const characters = new WeakMap<Prim, MutableCharacter>()
const navigation = new WeakMap<Script, NavigationResults>()

export function characterFor(script: Script): Character | null {
  return characters.get(script.linkset.prims[0]!) ?? null
}

export function setNavigationResults(script: Script, results: NavigationResults): void {
  navigation.set(script, structuredClone(results))
}

function optionsInto(target: Map<number, LslValue>, options: ReadonlyArray<LslValue>): void {
  for (let i = 0; i + 1 < options.length; i += 2) {
    const key = options[i]
    if (typeof key === 'number') target.set(key, structuredClone(options[i + 1]!))
  }
}

export const llCreateCharacter: BuiltinImpl = (ctx, args) => {
  const root = ctx.linkset.prims[0]!
  const previous = characters.get(root)
  const character = previous ?? { options: new Map<number, LslValue>(), commands: [] }
  const options = new Map<number, LslValue>()
  // Re-creation resets omitted settings, except the character's dimensions.
  for (const size of [CHARACTER_RADIUS, CHARACTER_LENGTH]) {
    if (previous?.options.has(size)) options.set(size, previous.options.get(size)!)
  }
  optionsInto(options, args[0] as ReadonlyArray<LslValue>)
  character.options = options
  characters.set(root, character)
  return undefined
}

export const llUpdateCharacter: BuiltinImpl = (ctx, args) => {
  const character = characters.get(ctx.linkset.prims[0]!)
  if (character) optionsInto(character.options, args[0] as ReadonlyArray<LslValue>)
  return undefined
}

export const llDeleteCharacter: BuiltinImpl = (ctx) => {
  characters.delete(ctx.linkset.prims[0]!)
  return undefined
}

function command(name: string): BuiltinImpl {
  return (ctx, args) => {
    const character = characters.get(ctx.linkset.prims[0]!)
    if (!character) {
      sayError(ctx, `You must call llCreateCharacter before ${name}.`)
      return undefined
    }
    character.commands.push({ name, args: structuredClone(args) })
    return undefined
  }
}

export const llEvade = command('llEvade')
export const llExecCharacterCmd = command('llExecCharacterCmd')
export const llFleeFrom = command('llFleeFrom')
export const llNavigateTo = command('llNavigateTo')
export const llPatrolPoints = command('llPatrolPoints')
export const llPursue = command('llPursue')
export const llWanderWithin = command('llWanderWithin')

/** Without a supplied navmesh answer, there is no nearby navigation point. */
export const llGetClosestNavPoint: BuiltinImpl = (ctx) =>
  structuredClone(navigation.get(ctx.script)?.closestNavPoint ?? [])

/** Without a supplied path, the goal cannot be found in navigation geometry. */
export const llGetStaticPath: BuiltinImpl = (ctx, args) => {
  const radius = args[2] as number
  if (radius < 0.125 || radius > 5) return []
  return structuredClone(navigation.get(ctx.script)?.staticPath ?? [PU_FAILURE_INVALID_GOAL])
}

/** Deliver one simulator result to the root prim's scripts, not the child prims. */
export function pathUpdate(script: Script, type: number, reserved: ReadonlyArray<LslValue> = []): void {
  if (!characterFor(script)) return
  const targets = script.linkset.prims[0]!.scripts
  const started = targets.filter((s) => s.handles('path_update'))
  for (const target of targets) {
    script.clockView.scheduleOn(target, script.now, 'path_update', { type, reserved: structuredClone(reserved) })
  }
  script.linkset.settle(started)
}
