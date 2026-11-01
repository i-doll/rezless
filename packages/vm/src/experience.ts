import { NULL_KEY } from './values/types.js'
import { deterministicKey } from './keys.js'
import type { DataserverRequestEntry } from './builtins/dataserver.js'

type KeyValueRequest = Pick<DataserverRequestEntry, 'key' | 'source' | 'args'>
type RequestMatcher = (request: KeyValueRequest) => boolean

export interface ExperienceOptions {
  /** Experience key. Defaults to a deterministic key derived from the name. */
  readonly id?: string
  /** Defaults to "Experience". */
  readonly name?: string
  /** Owner key. Defaults to NULL_KEY. */
  readonly owner?: string
  /** Group key. Defaults to NULL_KEY. */
  readonly group?: string
  /** Key-value store quota in bytes. Defaults to 128 MiB. */
  readonly quota?: number
  /** Whether the land the script runs on allows the experience. Defaults to true. */
  readonly allowedHere?: boolean
  /** Agents who already accepted the experience. */
  readonly agents?: Iterable<string>
}

/**
 * An experience a test compiles scripts with. Every script given the same
 * Experience shares its key-value store and the agents who accepted it, as
 * scripts in one experience do across the grid.
 */
export class Experience {
  readonly id: string
  name: string
  readonly owner: string
  readonly group: string
  quota: number
  allowedHere: boolean
  /** The key-value store, in key order as llKeysKeyValue lists it. */
  readonly store = new Map<string, string>()
  /** Agents who accepted the experience. */
  readonly agents: Set<string>
  private holding = false
  private readonly pending: Array<() => void> = []
  private readonly failures: Array<{ error: number; matches: RequestMatcher }> = []

  constructor(options: ExperienceOptions = {}) {
    this.name = options.name ?? 'Experience'
    this.id = options.id ?? deterministicKey(`experience/${this.name}`)
    this.owner = options.owner ?? NULL_KEY
    this.group = options.group ?? NULL_KEY
    this.quota = options.quota ?? 128 * 1024 * 1024
    this.allowedHere = options.allowedHere ?? true
    this.agents = new Set(options.agents ?? [])
  }

  /** Pre-populate the key-value store. */
  seed(entries: Iterable<readonly [string, string]>): void {
    for (const [k, v] of entries) this.store.set(k, v)
  }

  /** Fail the next matching key-value request without applying its operation. */
  failNext(error: number, matches: RequestMatcher = () => true): void {
    if (!Number.isSafeInteger(error) || error <= 0) {
      throw new RangeError('error must be a positive integer XP_ERROR code')
    }
    this.failures.push({ error, matches })
  }

  /** Defer key-value operations and their answers until release. */
  hold(): void {
    this.holding = true
  }

  /**
   * Release answers in request order, applying each operation now. With a count,
   * keep holding subsequent requests; without one, drain and resume automatic answers.
   * Advance each affected script's clock to dispatch the scheduled dataserver events.
   */
  release(count?: number): void {
    if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) {
      throw new RangeError('count must be a nonnegative integer')
    }
    if (count === undefined) this.holding = false
    const released = this.pending.splice(0, count ?? this.pending.length)
    for (const answer of released) answer()
  }

  /** @internal Route a builtin request through the fixture controls. */
  keyValueRequest(request: KeyValueRequest, answer: (error?: number) => void): void {
    const index = this.failures.findIndex((failure) => failure.matches(request))
    const failure = index < 0 ? undefined : this.failures.splice(index, 1)[0]
    const respond = () => answer(failure?.error)
    if (this.holding) this.pending.push(respond)
    else respond()
  }
}

/** Bytes an entry counts against the quota: its UTF-8 key and value plus 125. */
export function entrySize(key: string, value: string): number {
  return 125 + Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8')
}
