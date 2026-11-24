import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadScript } from '../src/index.js'
import { JSON_INVALID, JSON_NUMBER, JSON_OBJECT, JSON_STRING } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlJson2List
// https://wiki.secondlife.com/wiki/LlJsonGetValue
// https://wiki.secondlife.com/wiki/LlJsonValueType
// https://wiki.secondlife.com/wiki/LlJsonSetValue

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

const evaluate = async (expr: string) =>
  (await run(`string out; default { state_entry() { out = ${expr}; } }`)).global('out')

const fixture = (file: string) => readFileSync(new URL(`./json-reader/${file}`, import.meta.url), 'utf8')

/**
 * Each script in json-reader/ ran in Second Life, and the transcript next to it is what it said
 * there. A row is the input JSON, then what llJson2List returned (each entry with its type),
 * llJsonValueType and llJsonGetValue with no path, the value and type at a few paths, and what
 * llJsonSetValue returned for ["z"], [0] and ["a"]. The S rows are further llJsonSetValue calls,
 * and the P and W rows read [10,11,12] with string specifiers. Chat showed the tab in one
 * whitespace-and-writes row as four spaces.
 *
 * In-world: Aditi, SLua Tideland, 2026-11-23, LSL Mono. The objects-and-arrays script compiled
 * to Luau gave the same transcript.
 *
 * empty-members reads and writes an object member with nothing between its colon and the next
 * comma or brace, and an empty array slot, in every position. Its E rows are the reads and its
 * W rows the writes. In-world: Aditi, SLua Tideland, 2026-11-24, LSL Mono; the same script
 * compiled to Luau gave the same transcript.
 */
const TRANSCRIPTS = [
  'objects-and-arrays',
  'strings-brackets-numbers',
  'closers-and-numbers',
  'array-string-specifiers',
  'whitespace-and-writes',
  'empty-members',
]

describe('how Second Life reads malformed JSON', () => {
  for (const name of TRANSCRIPTS) {
    it(`answers the ${name} script as Second Life did`, async () => {
      const s = await run(fixture(`${name}.lsl`))
      s.advanceTime(60_000)
      const said = s.chat.map((c) => c.text.replaceAll('\t', '    ')).filter((t) => !t.startsWith('DONE'))
      const want = fixture(`${name}.txt`).trimEnd().split('\n')
      expect(said.join('\n').split('\n')).toEqual(want.filter((t) => !t.startsWith('DONE')))
    })
  }
})

describe('malformed JSON objects', () => {
  it('reads a member with no colon as the value of a "" key, but only as the last member', async () => {
    // In-world: llJson2List("{\"a\"}") is ["", "a"], llJson2List("{\"a\":1,\"b\"}") is
    // ["a", 1, "", "b"], and llJson2List("{\"a\",1}") is [JSON_INVALID].
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\"}"))')).toBe(', a')
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\":1,\\"b\\"}"))')).toBe('a, 1, , b')
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\",1}"))')).toBe(JSON_INVALID)
    expect(await evaluate('llJsonGetValue("{\\"a\\"}", [""])')).toBe('a')
  })

  it('gives JSON_INVALID for a doubled comma, a "" key before a comma, two colons in a member or a key that is not a string', async () => {
    // In-world: each of these is [JSON_INVALID] from llJson2List while llJsonValueType still
    // says JSON_OBJECT; {"a":1,"":1} reads as ["a", 1, "", 1].
    for (const json of ['{\\"a\\":1,,\\"b\\":2}', '{,}', '{\\"\\":1,\\"a\\":1}', '{\\"a\\":1:2}', '{a:1}', '{\\"a\\"b:1}']) {
      expect(await evaluate(`llList2CSV(llJson2List("${json}"))`), json).toBe(JSON_INVALID)
      expect(await evaluate(`llJsonValueType("${json}", [])`), json).toBe(JSON_OBJECT)
    }
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\":1,\\"\\":1}"))')).toBe('a, 1, , 1')
  })

  it('keeps a value it cannot read as text, which reads back as JSON_INVALID', async () => {
    // In-world: llJson2List("{\"a\":tru}") is ["a", "tru"]; llJsonGetValue and llJsonValueType
    // at ["a"] are JSON_INVALID; llJsonSetValue(..., ["z"], "9") is {"a":tru,"z":9}.
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\":tru}"))')).toBe('a, tru')
    expect(await evaluate('llJsonGetValue("{\\"a\\":tru}", ["a"])')).toBe(JSON_INVALID)
    expect(await evaluate('llJsonSetValue("{\\"a\\":tru}", ["z"], "9")')).toBe('{"a":tru,"z":9}')
  })

  it('takes the last string when a value or key holds more than one', async () => {
    // In-world: {"a":"x" "y"} reads a as "y", {"a" "b":1} has the key "b", and ["a"x] keeps
    // "a"x as text.
    expect(await evaluate('llJsonGetValue("{\\"a\\":\\"x\\" \\"y\\"}", ["a"])')).toBe('y')
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\" \\"b\\":1}"))')).toBe('b, 1')
    expect(await evaluate('llList2CSV(llJson2List("[\\"a\\"x]"))')).toBe('"a"x')
  })

  it('reads a value left open at the end as a member with no value', async () => {
    // In-world: llJson2List("{\"a\":1,\"b\":{}") is ["a", 1, "b", ""] and llJsonSetValue on it
    // at ["a"] gives {"a":9,"b":}; llJson2List("[[1,2]") is [""].
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\":1,\\"b\\":{}"))')).toBe('a, 1, b, ')
    expect(await evaluate('llJsonSetValue("{\\"a\\":1,\\"b\\":{}", ["a"], "9")')).toBe('{"a":9,"b":}')
    expect(await evaluate('llList2CSV(llJson2List("[[1,2]") + ["end"])')).toBe(", end")
  })

  it('keeps an unclosed bracket as text only right after a comma', async () => {
    // In-world: llJson2List("[1,{\"a\":1]") is [1, "{\"a\":1]"], but with a space after the
    // comma it is [1, ""]; llJson2List("{\"a\": [1,2}") is ["a", ""].
    expect(await evaluate('llList2CSV(llJson2List("[1,{\\"a\\":1]"))')).toBe('1, {"a":1]')
    expect(await evaluate('llList2CSV(llJson2List("[1, {\\"a\\":1]") + ["end"])')).toBe('1, , end')
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\": [1,2}") + ["end"])')).toBe('a, , end')
    // In-world: llJson2List("[1,[ [2]") is [1, "[ [2]"]: the text runs to the end of the input.
    expect(await evaluate('llList2CSV(llJson2List("[1,[ [2]"))')).toBe('1, [ [2]')
  })
})

describe('malformed JSON arrays', () => {
  it('stops at a closer followed directly by another value, and keeps other stray closers', async () => {
    // In-world: llJson2List("[1][2]") is [1], "[1]]" is ["1]"] and "[1],[2]" is ["1]", "[2]"].
    expect(await evaluate('llList2CSV(llJson2List("[1][2]"))')).toBe('1')
    expect(await evaluate('llList2CSV(llJson2List("[1]]"))')).toBe('1]')
    expect(await evaluate('llList2CSV(llJson2List("[1],[2]"))')).toBe('1], [2]')
  })

  it('matches nested brackets without regard to strings', async () => {
    // In-world: llJson2List("[{\"a\":\"}\"},1]") is ["\"},1]"], while "[\"]\"]" is ["]"].
    expect(await evaluate('llList2CSV(llJson2List("[{\\"a\\":\\"}\\"},1]"))')).toBe('"},1]')
    expect(await evaluate('llList2CSV(llJson2List("[\\"]\\"]"))')).toBe(']')
  })

  it('reads numbers loosely', async () => {
    // In-world: [-] is [0], [.] is [0.0], [1e] is [1.0], [01] and [.e1] stay text, and
    // llJsonValueType at [0] of [1E+] is JSON_NUMBER.
    expect(await evaluate('llList2CSV(llJson2List("[-,.,1e,01,.e1]"))')).toBe('0, 0.000000, 1.000000, 01, .e1')
    expect(await evaluate('llJsonValueType("[1E+]", [0])')).toBe(JSON_NUMBER)
  })

  it('reads a string specifier on an array as decimal digits after whitespace and a plus sign', async () => {
    // In-world: on [10,11,12], [" 1"], ["+1"], ["1x"] and ["0x1"] read 11, 11, 11 and 10;
    // ["-0"], ["x1"], [""] and ["a"] read JSON_INVALID.
    for (const [spec, want] of [[' 1', '11'], ['+1', '11'], ['1x', '11'], ['0x1', '10'], ['-0', JSON_INVALID], ['x1', JSON_INVALID], ['', JSON_INVALID], ['a', JSON_INVALID]]) {
      expect(await evaluate(`llJsonGetValue("[10,11,12]", ["${spec}"])`), spec).toBe(want)
    }
    // In-world: ["4294967297"] and ["2147483648"] read JSON_INVALID; a large index does not wrap.
    expect(await evaluate('llJsonGetValue("[10,11,12]", ["4294967297"])')).toBe(JSON_INVALID)
  })

  it('writes to [ ] as to an empty array', async () => {
    // In-world: llJson2List("[ ]") is [""], but llJsonSetValue("[ ]", [JSON_APPEND], "9") is [9]
    // and llJsonSetValue("[ ]", [1], "9") is JSON_INVALID.
    expect(await evaluate('llList2CSV(llJson2List("[ ]") + ["end"])')).toBe(', end')
    expect(await evaluate('llJsonSetValue("[ ]", [JSON_APPEND], "9")')).toBe('[9]')
    expect(await evaluate('llJsonSetValue("[ ]", [1], "9")')).toBe(JSON_INVALID)
  })

  it('reads a whole text in quotes as one string', async () => {
    // In-world: llJsonValueType("\"a\" \"b\"", []) is JSON_STRING and the value is a" "b.
    expect(await evaluate('llJsonValueType("\\"a\\" \\"b\\"", [])')).toBe(JSON_STRING)
    expect(await evaluate('llJsonGetValue("\\"a\\" \\"b\\"", [])')).toBe('a" "b')
  })
})

describe('llJsonSetValue on an object with a "" key', () => {
  // In-world (Aditi, SLua Tideland, 2026-11-23): an object where a "" key comes before a comma
  // reads as invalid, so llJsonSetValue starts a new object; a "" key at the end is kept.
  it.each([
    ['{"":1,"a":1,}', '["a"]', '"2"', '{"a":2}'],
    ['{"":1,"a":1}', '["a"]', '"2"', '{"a":2}'],
    ['{"":1,"a":1}', '[""]', '"2"', '{"":2}'],
    ['{"b":1,"":1,"a":1}', '["a"]', '"2"', '{"a":2}'],
    ['{"":1,"a":1}', '["a"]', 'JSON_DELETE', JSON_INVALID],
    ['{"a":1,"":1}', '["b"]', '"2"', '{"":1,"a":1,"b":2}'],
    ['{"":1}', '["a"]', '"2"', '{"":1,"a":2}'],
    ['{"x":{"":1,"a":1,}}', '["x","a"]', '"2"', '{"x":{"a":2}}'],
    ['{"a"}', '["a"]', '"2"', '{"":"a","a":2}'],
  ])('llJsonSetValue(%s, %s, %s)', async (json, path, value, want) => {
    expect(await evaluate(`llJsonSetValue(${JSON.stringify(json)}, ${path}, ${value})`)).toBe(want)
  })
})
