import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { LslValue } from '../values/types.js'
import { listElementType, typedList } from '../values/list-types.js'
import { numberOfSides } from '../prim-params.js'
import {
  CHANGED_MEDIA, LINK_THIS, STATUS_OK, STATUS_MALFORMED_PARAMS, STATUS_TYPE_MISMATCH,
  STATUS_BOUNDS_ERROR, STATUS_NOT_FOUND, STATUS_NOT_SUPPORTED, STATUS_WHITELIST_FAILED,
} from '../generated/constants.js'
import { sayError } from './debug.js'
import { raisePrimChanged } from '../prim-changed.js'

const defaults = (): (number | string)[] => [0, 0, '', '', 0, 0, 0, 0, 0, 0, 0, 0, '', 7, 7]
const strings = new Set([2, 3, 12])

// Media calls select one prim. Negative selectors other than LINK_THIS select
// the first other prim, including LINK_SET and LINK_ALL_CHILDREN (Aditi probes).
function target(ctx: CallContext, link: number): Prim | undefined {
  if (link === LINK_THIS) return ctx.prim
  if (link < 0) return ctx.linkset.prims.find(p => p !== ctx.prim)
  if (link === 0 && ctx.prim.linkNumber > 1) return ctx.linkset.prims[0]
  return ctx.linkset.prims.find(p => p.linkNumber === link)
}

function faceStatus(ctx: CallContext, prim: Prim, face: number): number {
  if (face < 0) {
    sayError(ctx, 'PRIM_MEDIA error: ALL_SIDES not supported')
    return STATUS_NOT_SUPPORTED
  }
  return face < numberOfSides(prim.params.shape) ? STATUS_OK : STATUS_NOT_FOUND
}

function integer(list: ReadonlyArray<LslValue>, index: number): boolean {
  const type = listElementType(list, index)
  return type === 'integer' || (type === undefined && typeof list[index] === 'number' && Number.isInteger(list[index]))
}

function failure(ctx: CallContext, status: number, pair: number, param: number): number {
  const reason = status === STATUS_MALFORMED_PARAMS ? 'Malformed parameters'
    : status === STATUS_TYPE_MISMATCH ? 'Type mismatch'
    : status === STATUS_BOUNDS_ERROR ? 'Bounds error' : 'URL did not pass whitelist'
  sayError(ctx, `llSetPrimMediaParams error: ${reason} near parameter #${pair}, param=${param}.  No values have been set.`)
  return status
}

function normalizeUrl(value: string): string | undefined {
  if (value === '') return ''
  const colon = value.indexOf(':')
  if (colon < 0) return `https://${value}`
  return /^https?:/i.test(value) ? value : undefined
}

// LLURI recognizes lowercase schemes when extracting authority/path. Preserve
// that distinction: an uppercase scheme is stored, but can fail a whitelist.
function uri(value: string): { scheme: string; authority: string; path: string } {
  const colon = value.indexOf(':')
  const scheme = colon < 0 ? '' : value.slice(0, colon)
  const rest = value.slice(colon + 1)
  const parts = /^(?:https?|ftp):\/\/([^/?]*)([^?]*)/.exec(value)
  return { scheme, authority: parts?.[1] ?? '', path: parts?.[2] ?? (scheme === 'about' ? rest.split('?')[0]! : '') }
}

function glob(value: string, pattern: string): boolean {
  if (pattern === '') return true
  const expression = pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${expression}$`, 'i').test(value)
}

function allowed(url: string, whitelist: string): boolean {
  if (whitelist === '') return true
  const candidate = uri(url)
  return whitelist.split(',').some(entry => {
    let filter = uri(entry)
    const scheme = filter.scheme
    if (scheme === '') filter = uri(`https://${entry}`)
    return glob(candidate.scheme, scheme) && glob(candidate.authority, filter.authority) && glob(candidate.path, filter.path)
  })
}

function set(ctx: CallContext, prim: Prim | undefined, face: number, rules: ReadonlyArray<LslValue>): number {
  if (!prim) return STATUS_OK
  const status = faceStatus(ctx, prim, face)
  if (status !== STATUS_OK) return status
  const next = [...(prim.media.get(face) ?? defaults())]
  let currentPair = -1
  for (let i = 0; i < rules.length; i += 2) {
    const param = integer(rules, i) ? rules[i] as number : -1
    if (param < 0 || param > 14 || i + 1 === rules.length) {
      return failure(ctx, STATUS_MALFORMED_PARAMS, i / 2, param < 0 && !integer(rules, i) ? 0 : param)
    }
    const value = rules[i + 1]!
    if (strings.has(param)) {
      if (typeof value !== 'string' || listElementType(rules, i + 1) === 'key') {
        return failure(ctx, STATUS_TYPE_MISMATCH, i / 2, param)
      }
      if (param === 12) {
        const entries = value.split(',').filter(s => s !== '').map(s => s.trim())
        if (entries.length > 64 || entries.reduce((n, s) => n + Buffer.byteLength(s) + 1, 0) > 1024) {
          return failure(ctx, STATUS_BOUNDS_ERROR, i / 2, param)
        }
        next[param] = entries.join(',')
      } else {
        const url = normalizeUrl(value)
        if (url !== undefined) {
          if (Buffer.byteLength(url) > 1024) return failure(ctx, STATUS_BOUNDS_ERROR, i / 2, param)
          next[param] = url
          if (param === 2) currentPair = i / 2
        }
      }
    } else {
      const dimensions = param === 9 || param === 10
      if (dimensions ? typeof value !== 'number' : !integer(rules, i + 1)) {
        return failure(ctx, STATUS_TYPE_MISMATCH, i / 2, param)
      }
      const n = value as number
      if (dimensions) {
        const size = (n | 0) & 0xffff
        if (size > 2048) return failure(ctx, STATUS_BOUNDS_ERROR, i / 2, param)
        next[param] = size
      } else if (param === 1) {
        if (n !== 0 && n !== 1) return failure(ctx, STATUS_BOUNDS_ERROR, i / 2, param)
        next[param] = n
      } else if (param === 13 || param === 14) next[param] = n & 7
      else next[param] = n === 0 ? 0 : 1
    }
  }
  if (currentPair >= 0 && next[11] && !allowed(next[2] as string, next[12] as string)) {
    return failure(ctx, STATUS_WHITELIST_FAILED, currentPair, 2)
  }
  prim.media.set(face, next)
  raisePrimChanged(prim, CHANGED_MEDIA)
  return STATUS_OK
}

function get(ctx: CallContext, prim: Prim | undefined, face: number, rules: ReadonlyArray<LslValue>): ReadonlyArray<LslValue> {
  const media = prim?.media.get(face)
  if (!media || !prim || face >= numberOfSides(prim.params.shape)) return []
  const values: LslValue[] = []
  for (let i = 0; i < rules.length; i++) {
    if (!integer(rules, i)) continue
    const param = rules[i] as number
    if (param < 0 || param > 14) {
      sayError(ctx, `llGetPrimMediaParams error: Unknown parameter '${param}'`)
      break
    }
    values.push(media[param]!)
  }
  return typedList(values, values.map(v => typeof v === 'string' ? 'string' : 'integer'))
}

function clear(ctx: CallContext, prim: Prim | undefined, face: number): number {
  if (!prim) return STATUS_OK
  const status = faceStatus(ctx, prim, face)
  if (status === STATUS_OK && prim.media.delete(face)) raisePrimChanged(prim, CHANGED_MEDIA)
  return status
}

export const llSetPrimMediaParams: BuiltinImpl = (ctx, args) => set(ctx, ctx.prim, args[0] as number, args[1] as ReadonlyArray<LslValue>)
export const llGetPrimMediaParams: BuiltinImpl = (ctx, args) => get(ctx, ctx.prim, args[0] as number, args[1] as ReadonlyArray<LslValue>)
export const llClearPrimMedia: BuiltinImpl = (ctx, args) => clear(ctx, ctx.prim, args[0] as number)
export const llSetLinkMedia: BuiltinImpl = (ctx, args) => set(ctx, target(ctx, args[0] as number), args[1] as number, args[2] as ReadonlyArray<LslValue>)
export const llGetLinkMedia: BuiltinImpl = (ctx, args) => get(ctx, target(ctx, args[0] as number), args[1] as number, args[2] as ReadonlyArray<LslValue>)
export const llClearLinkMedia: BuiltinImpl = (ctx, args) => clear(ctx, target(ctx, args[0] as number), args[1] as number)
