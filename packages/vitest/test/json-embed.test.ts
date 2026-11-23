import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlJsonSetValue
// https://wiki.secondlife.com/wiki/LlList2Json

const fixture = (file: string) => readFileSync(new URL(`./json-embed/${file}`, import.meta.url), 'utf8')

async function said(file: string, language: 'lsl' | 'slua') {
  const s = await loadScript({ source: fixture(file), language })
  s.start()
  s.advanceTime(60_000)
  return s.chat.map((c) => c.text).filter((t) => !t.startsWith('DONE'))
}

const evaluate = async (expr: string) => {
  const s = await loadScript({ source: `string out; default { state_entry() { out = ${expr}; } }` })
  s.start()
  return s.global('out')
}

/**
 * Each script in json-embed/ ran in Second Life, and the transcript next to it is what it said
 * there. An embed row is the value, then llJsonSetValue("[]", [0], v) (A),
 * llJsonSetValue("{}", ["k"], v) (O), llList2Json(JSON_ARRAY, [v]) (L),
 * llList2Json(JSON_OBJECT, ["k", v]) (M), llList2Json(JSON_ARRAY, [" " + v + " "]) (P) and
 * llJsonSetValue("[]", [0], " " + v + " ") (Q). The whitespace rows are URL-escaped.
 *
 * In-world: Aditi, SLua Tideland, 2026-11-24. whitespace.lsl ran in LSL Mono. embed.lsl compiled to Mono and to Luau, and
 * embed.luau, gave the same transcript.
 */
describe('how Second Life writes JSON-shaped values', () => {
  it('answers the embed script as Second Life did in LSL', async () => {
    expect(await said('embed.lsl', 'lsl')).toEqual(fixture('embed.txt').trimEnd().split('\n'))
  })

  it('answers the embed script as Second Life did in SLua', async () => {
    expect(await said('embed.luau', 'slua')).toEqual(fixture('embed.txt').trimEnd().split('\n'))
  })

  it('answers the whitespace script as Second Life did', async () => {
    expect(await said('whitespace.lsl', 'lsl')).toEqual(fixture('whitespace.txt').trimEnd().split('\n'))
  })

  // In-world: Aditi, SLua Tideland, 2026-11-24, LSL Mono. Each sentinel row is what
  // llJsonSetValue and llList2Json wrote for a sentinel value, bare or padded; the N rows set
  // malformed values through deeper paths and read them back.
  it('answers the sentinels script as Second Life did', async () => {
    expect(await said('sentinels.lsl', 'lsl')).toEqual(fixture('sentinels.txt').trimEnd().split('\n'))
  })

  it('answers the padded sentinels script as Second Life did', async () => {
    expect(await said('sentinels-padded.lsl', 'lsl')).toEqual(fixture('sentinels-padded.txt').trimEnd().split('\n'))
  })
})

/**
 * paths.lsl sets JSON_INVALID and other values through deeper paths, appends and an empty
 * path, then reads each result back with llJsonGetValue and llJsonValueType.
 *
 * In-world: Aditi, SLua Tideland, 2026-11-24, LSL Mono.
 */
describe('values written through other paths', () => {
  it('writes what Second Life wrote on every row', async () => {
    const written = (lines: string[]) => lines.map((l) => l.split(' G=')[0])
    expect(written(await said('paths.lsl', 'lsl'))).toEqual(written(fixture('paths.txt').trimEnd().split('\n')))
  })

  // In-world: Z0 and Z14 read the empty member of {"a":,"z":1} and {"a":1,"m":,"z":1} as
  // JSON_INVALID; the VM reads an empty member followed by a comma as JSON_NULL.
  it.fails('reads back every row as Second Life did', async () => {
    expect(await said('paths.lsl', 'lsl')).toEqual(fixture('paths.txt').trimEnd().split('\n'))
  })
})

describe('sentinel values', () => {
  it('writes JSON_INVALID as an empty slot in both functions', async () => {
    // In-world: llJsonSetValue("[1,2]", [0], JSON_INVALID) is [,2],
    // llJsonSetValue("{}", ["k"], JSON_INVALID) is {"k":} and
    // llList2Json(JSON_ARRAY, [1, JSON_INVALID, 2]) is [1,,2].
    expect(await evaluate('llJsonSetValue("[1,2]", [0], JSON_INVALID)')).toBe('[,2]')
    expect(await evaluate('llJsonSetValue("{}", ["k"], JSON_INVALID)')).toBe('{"k":}')
    expect(await evaluate('llList2Json(JSON_ARRAY, [1, JSON_INVALID, 2])')).toBe('[1,,2]')
  })

  it('trims a padded sentinel, so a padded JSON_DELETE still deletes', async () => {
    // In-world: llJsonSetValue("[1]", [0], " " + JSON_DELETE) is [] and
    // llList2Json(JSON_ARRAY, [" " + JSON_TRUE]) is [true]; a no-break space is not trimmed.
    expect(await evaluate('llJsonSetValue("[1]", [0], " " + JSON_DELETE)')).toBe('[]')
    expect(await evaluate('llJsonSetValue("[1]", [0], " " + JSON_TRUE)')).toBe('[true]')
    expect(await evaluate('llList2Json(JSON_ARRAY, [llUnescapeURL("%C2%A0") + JSON_TRUE])')).toBe('[" ﷖"]')
  })
})

describe('malformed JSON-shaped values', () => {
  it('writes text framed by a matching bracket pair as it is, however malformed inside', async () => {
    // In-world: llJsonSetValue("[]", [0], "{\"a\"}") and llList2Json(JSON_ARRAY, ["{\"a\"}"])
    // are both [{"a"}]; "[1,,2]" and "[1]]" are written as they are too.
    expect(await evaluate('llJsonSetValue("[]", [0], "{\\"a\\"}")')).toBe('[{"a"}]')
    expect(await evaluate('llList2Json(JSON_ARRAY, ["{\\"a\\"}"])')).toBe('[{"a"}]')
    expect(await evaluate('llList2Json(JSON_OBJECT, ["k", "[1,,2]"])')).toBe('{"k":[1,,2]}')
    expect(await evaluate('llJsonSetValue("{}", ["k"], "[1]]")')).toBe('{"k":[1]]}')
  })

  it('quotes text whose brackets do not pair up at its two ends', async () => {
    // In-world: "[1}", "{\"a\":1]", "[1" and "[1]x" are each written as a JSON string.
    expect(await evaluate('llJsonSetValue("[]", [0], "[1}")')).toBe('["[1}"]')
    expect(await evaluate('llList2Json(JSON_ARRAY, ["{\\"a\\":1]"])')).toBe('["{\\"a\\":1]"]')
    expect(await evaluate('llList2Json(JSON_ARRAY, ["[1"])')).toBe('["[1"]')
    expect(await evaluate('llJsonSetValue("[]", [0], "[1]x")')).toBe('["[1]x"]')
  })

  it('writes text framed by double quotes as it is, and quotes a lone or unclosed quote', async () => {
    // In-world: "\"a\"b\"" is written as "a"b"; "\"a" becomes "\"a"; a lone "\"" becomes "\"".
    expect(await evaluate('llJsonSetValue("[]", [0], "\\"a\\"b\\"")')).toBe('["a"b"]')
    expect(await evaluate('llList2Json(JSON_ARRAY, ["\\"a"])')).toBe('["\\"a"]')
    expect(await evaluate('llList2Json(JSON_ARRAY, ["\\""])')).toBe('["\\""]')
  })

  it('writes a loosely read number as it is in llJsonSetValue but quotes it in llList2Json', async () => {
    // In-world: llJsonSetValue writes "1.", ".5", "1e" and "-" bare and quotes "01", "+1" and
    // "0x10"; llList2Json quotes all of them.
    expect(await evaluate('llJsonSetValue("[]", [0], ".5")')).toBe('[.5]')
    expect(await evaluate('llJsonSetValue("[]", [0], "-")')).toBe('[-]')
    expect(await evaluate('llJsonSetValue("[]", [0], "01")')).toBe('["01"]')
    expect(await evaluate('llList2Json(JSON_ARRAY, [".5"])')).toBe('[".5"]')
  })

  it('trims space, tab, newline, CR, VT and FF from the value, but not a no-break space', async () => {
    // In-world: llJsonSetValue("[]", [0], " tru ") is ["tru"]; "\v[1]\v" is written as [1];
    // " x " keeps its no-break spaces.
    expect(await evaluate('llJsonSetValue("[]", [0], " tru ")')).toBe('["tru"]')
    expect(await evaluate('llJsonSetValue("[]", [0], llUnescapeURL("%0B[1]%0B"))')).toBe('[[1]]')
    expect(await evaluate('llList2Json(JSON_ARRAY, [llUnescapeURL("%C2%A0x%C2%A0")])')).toBe('[" x "]')
  })
})
