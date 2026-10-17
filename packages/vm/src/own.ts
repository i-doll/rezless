/**
 * Look up `name` in a name-keyed table without falling through to
 * Object.prototype, so script names like `toString` don't match.
 */
export function own<T>(table: Readonly<Record<string, T>>, name: string): T | undefined {
  return Object.hasOwn(table, name) ? table[name] : undefined
}
