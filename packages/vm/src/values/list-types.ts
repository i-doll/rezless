import type { LslType, LslValue } from './types.js'

/**
 * LSL list elements keep their own type, but list values here are plain JS
 * arrays, so a key and a string with the same text (or an integer and a
 * float with the same value) look identical. This side table records the
 * element types of lists the script builds itself. Lists from elsewhere
 * (builtins, test inputs) have no entry, and their element types are unknown.
 */
const elementTypes = new WeakMap<ReadonlyArray<LslValue>, ReadonlyArray<LslType | undefined>>()

/** Build a list whose elements have the given LSL types. */
export function typedList(
  values: LslValue[],
  types: ReadonlyArray<LslType | undefined>,
): ReadonlyArray<LslValue> {
  if (types.some((t) => t !== undefined)) elementTypes.set(values, types)
  return values
}

/** The recorded LSL type of `list[index]`, or undefined if unknown. */
export function listElementType(list: ReadonlyArray<LslValue>, index: number): LslType | undefined {
  return elementTypes.get(list)?.[index]
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
