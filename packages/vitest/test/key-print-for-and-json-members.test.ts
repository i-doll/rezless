import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

const texts = (s: { chat: ReadonlyArray<{ text: string }> }) => s.chat.map((c) => c.text)

describe('a key print in a for clause', () => {
  const loop = (statement: string) => `
    integer i;
    default { timer() { llOwnerSay("in"); ${statement} llOwnerSay("out " + (string)i); } }
  `

  it('runs when the init or step only discards it', async () => {
    // In-world: each loop below compiled and ran to the end (Aditi, SLua Tideland, 2026-11-23).
    const loops: Array<[string, number]> = [
      ['for (print((key)"k"); i < 1; ++i) ;', 1],
      ['for (; i < 1; print((key)"k")) ++i;', 1],
      ['for (i = 0, print((key)"k"); i < 1; ++i) ;', 1],
      ['for (i = 0; i < 2; ++i, print((key)"k")) ;', 2],
    ]
    for (const [statement, end] of loops) {
      const s = await run(loop(statement))
      s.fire('timer')
      expect(texts(s), statement).toEqual(['in', `out ${end}`])
    }
  })

  it('halts on entering the handler when the condition or step uses its value', async () => {
    // In-world: each loop below said nothing from the timer and reported "Script run-time error"
    // and "System.InvalidProgramException: Invalid IL code in LSL :timer ()" (Aditi, SLua
    // Tideland, 2026-11-23).
    for (const statement of ['for (; (key)"x" == print((key)"k"); ) ++i;', 'for (; i < 1; i += ((key)"x" == print((key)"k"))) ++i;']) {
      const s = await run(loop(statement))
      expect(() => s.fire('timer')).toThrow('System.InvalidProgramException')
      expect(texts(s), statement).toEqual([
        'Object [script:<inline>] Script run-time error',
        'System.InvalidProgramException: Invalid IL code in LSL :timer ()',
      ])
    }
  })

  it('does not compile when its value is assigned', async () => {
    // In-world: k = print((key)"k"); as a statement, and in a for init or step, failed to compile
    // with "Internal server compile error" (Aditi, SLua Tideland, 2026-11-23).
    for (const body of ['k = print((key)"k");', 'integer i; for (k = print((key)"k"); i < 1; ++i) ;', 'integer i; for (; i < 1; k = print((key)"k")) ++i;']) {
      await expect(loadScript({ source: `key k; default { timer() { ${body} } }` }), body).rejects.toThrow()
    }
  })
})

describe('an object member with no value', () => {
  const evaluate = async (expr: string) => {
    const s = await run(`string out; default { state_entry() { out = ${expr}; } }`)
    return s.global('out')
  }

  it('reads as an empty string in llJson2List', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-23): llJson2List("{\"a\":}") is ["a", ""], two
    // entries with an empty string second.
    const s = await run(`list l; default { state_entry() { l = llJson2List("{\\"a\\":}"); } }`)
    expect(s.global('l')).toEqual(['a', ''])
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\":1,\\"b\\":}"))')).toBe('a, 1, b, ')
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\":,\\"b\\":1}"))')).toBe('a, , b, 1')
    expect(await evaluate('llList2CSV(llJson2List("{\\"a\\":{\\"b\\":}}"))')).toBe('a, {"b":}')
  })

  it('keeps a nested object with one as text in llJson2List', async () => {
    // In-world: llJson2List("[1,{\"a\":}]") is [1, "{\"a\":}"] and llJson2List("[{\"a\":}]") is ["{\"a\":}"].
    expect(await evaluate('llList2CSV(llJson2List("[1,{\\"a\\":}]"))')).toBe('1, {"a":}')
    expect(await evaluate('llList2CSV(llJson2List("[{\\"a\\":}]"))')).toBe('{"a":}')
  })

  it('leaves the object an object in llJsonValueType', async () => {
    // In-world: the object is JSON_OBJECT, and so is the nested one; only reading the member
    // itself gives JSON_INVALID.
    expect(await evaluate('llJsonValueType("{\\"a\\":}", [])')).toBe('﷑')
    expect(await evaluate('llJsonValueType("{\\"a\\":,\\"b\\":1}", [])')).toBe('﷑')
    expect(await evaluate('llJsonValueType("[1,{\\"a\\":}]", [])')).toBe('﷒')
    expect(await evaluate('llJsonValueType("[1,{\\"a\\":}]", [1])')).toBe('﷑')
    expect(await evaluate('llJsonValueType("{\\"a\\":{\\"b\\":}}", ["a"])')).toBe('﷑')
    expect(await evaluate('llJsonGetValue("[1,{\\"a\\":}]", [1])')).toBe('{"a":}')
    expect(await evaluate('llJsonValueType("{\\"a\\":}", ["a"])')).toBe('﷐')
  })
})

describe('JSON reads and writes already matching Second Life', () => {
  it('gives JSON_INVALID or the input for a float specifier on objects and nested values', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-23): every read below is JSON_INVALID and every
    // write returns its input unchanged.
    const s = await run(`
      list out;
      default { state_entry() {
        out = [llJsonGetValue("{\\"a\\":1}", [1.0]), llJsonGetValue("{\\"a\\":[1,2]}", ["a", 1.0]), llJsonGetValue("[[1,2]]", [0, 1.0]),
          llJsonValueType("{\\"a\\":1}", [1.0]), llJsonGetValue("{\\"a\\":{\\"b\\":1}}", ["a", 0.0]),
          llJsonSetValue("{\\"a\\":1}", [1.0], "x"), llJsonSetValue("{\\"a\\":[1,2]}", ["a", 1.0], "x"),
          llJsonSetValue("[[1,2]]", [0, 1.0], "x"), llJsonSetValue("{\\"a\\":{\\"b\\":1}}", ["a", 0.0], "x")];
      } }`)
    expect(s.global('out')).toEqual(['﷐', '﷐', '﷐', '﷐', '﷐', '{"a":1}', '{"a":[1,2]}', '[[1,2]]', '{"a":{"b":1}}'])
  })

  it('sorts non-ASCII keys by UTF-8 bytes in llJsonSetValue', async () => {
    // In-world: the keys below came back as Z, a, z, É, ä, é, €, Ａ, 😀. U+FF21 before U+1F600 is
    // UTF-8 and code point order, not UTF-16 order.
    const s = await run(`string out; default { state_entry() {
      out = llJsonSetValue("{\\"é\\":1,\\"z\\":2,\\"Z\\":3,\\"€\\":4,\\"ä\\":5,\\"😀\\":6,\\"Ａ\\":7,\\"É\\":8}", ["a"], "0");
    } }`)
    expect(s.global('out')).toBe('{"Z":3,"a":0,"z":2,"É":8,"ä":5,"é":1,"€":4,"Ａ":7,"😀":6}')
  })
})
