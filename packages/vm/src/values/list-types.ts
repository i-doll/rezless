import type { LslType, LslValue } from './types.js'
import { toFloat32 } from './types.js'

/**
 * LSL list elements keep their own type, but list values here are plain JS
 * arrays, so a key and a string with the same text (or an integer and a
 * float with the same value) look identical. This side table records the
 * element types of lists the script and the builtins build. Lists from
 * elsewhere (test inputs, mocks) have no entry, and their element types are
 * unknown.
 */
const elementTypes = new WeakMap<ReadonlyArray<LslValue>, ReadonlyArray<LslType | undefined>>()

/**
 * Build a list whose elements have the given LSL types. A list element is a
 * runtime error, as in SL, where `[x]` with a list `x` compiles but halts.
 */
export function typedList(
  values: LslValue[],
  types: ReadonlyArray<LslType | undefined>,
): ReadonlyArray<LslValue> {
  if (types.includes('list')) throw new Error('Lists may not contain lists')
  if (types.some((t) => t !== undefined)) elementTypes.set(values, types)
  return values
}

/**
 * Build a list from values the script computed: like `typedList`, but a
 * float element, which may be a double temporary, is stored as float32.
 */
export function scriptList(
  values: LslValue[],
  types: ReadonlyArray<LslType | undefined>,
): ReadonlyArray<LslValue> {
  return typedList(values.map((v, i) => (types[i] === 'float' ? toFloat32(v as number) : v)), types)
}

/** The recorded element types of `list`, or undefined if none were recorded. */
export function listElementTypes(list: ReadonlyArray<LslValue>): ReadonlyArray<LslType | undefined> | undefined {
  return elementTypes.get(list)
}

/** Build a list whose elements all have the same LSL type. */
export function uniformList(values: LslValue[], type: LslType): ReadonlyArray<LslValue> {
  return typedList(values, values.map(() => type))
}

/** The recorded LSL type of `list[index]`, or undefined if unknown. */
export function listElementType(list: ReadonlyArray<LslValue>, index: number): LslType | undefined {
  return elementTypes.get(list)?.[index]
}

/** What an element of a list from an SLua script was in Lua, where LSL's type doesn't say. */
export type LuaKind = 'number' | 'boolean' | undefined

/**
 * Lists an SLua script passed. A Lua number arrives as an LSL integer or
 * float and a boolean as an integer, but SLua still tells them apart.
 */
const luaKinds = new WeakMap<ReadonlyArray<LslValue>, ReadonlyArray<LuaKind>>()

/** Record what the elements of a list an SLua script passed were in Lua. */
export function markLuaList(list: ReadonlyArray<LslValue>, kinds: ReadonlyArray<LuaKind>): ReadonlyArray<LslValue> {
  luaKinds.set(list, kinds)
  return list
}

/**
 * `list` as the functions that hand an SLua list back read it: every Lua
 * number, whole or not, as a 32-bit float. Other lists come back as they are.
 */
export function luaNumbersAsFloats(list: ReadonlyArray<LslValue>): ReadonlyArray<LslValue> {
  const kinds = luaKinds.get(list)
  if (!kinds) return list
  const values = list.map((v, i) => (kinds[i] === 'number' ? toFloat32(v as number) : v))
  const types = values.map((_, i) => (kinds[i] === 'number' ? 'float' : listElementType(list, i)))
  return markLuaList(typedList(values, types), kinds)
}

/** What `list[index]` was in Lua: a number, a boolean, or neither (or `list` isn't from SLua). */
export function luaKind(list: ReadonlyArray<LslValue>, index: number): LuaKind {
  return luaKinds.get(list)?.[index]
}

/**
 * The type of `list[index]` as a rule or selector reads it. SLua sends a
 * whole Lua number as an LSL integer, so this is listElementType.
 */
export function ruleElementType(list: ReadonlyArray<LslValue>, index: number): LslType | undefined {
  return listElementType(list, index)
}

/** `list.slice(start, end)`, keeping element types. */
export function sliceList(list: ReadonlyArray<LslValue>, start: number, end?: number): ReadonlyArray<LslValue> {
  const types = elementTypes.get(list)
  return typedList(list.slice(start, end), types ? types.slice(start, end) : [])
}

/** Concatenate lists, keeping element types. */
export function concatLists(...lists: ReadonlyArray<LslValue>[]): ReadonlyArray<LslValue> {
  const values: LslValue[] = []
  const types: (LslType | undefined)[] = []
  for (const list of lists) {
    const t = elementTypes.get(list)
    for (let i = 0; i < list.length; i++) {
      values.push(list[i]!)
      types.push(t?.[i])
    }
  }
  return typedList(values, types)
}
