import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'
import { JSON_INVALID } from '@rezless/vm'

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
      await expect(loadScript({ source: `key k; default { timer() { ${body} } }` }), body).rejects.toThrow(/Internal server compile error/)
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

  it('keeps the object an object and reads the member as JSON_INVALID', async () => {
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

describe('a JSON value with an object member with no value', () => {
  it('goes in verbatim through llList2Json and llJsonSetValue', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-23): each writer embedded the object text as it was.
    const s = await run(`
      list out;
      default { state_entry() {
        string v = "{\\"a\\":}";
        out = [llList2Json(JSON_ARRAY, [v]), llList2Json(JSON_OBJECT, ["k", v]), llJsonSetValue("[]", [0], v), llJsonSetValue("{}", ["k"], v)];
      } }`)
    expect(s.global('out')).toEqual(['[{"a":}]', '{"k":{"a":}}', '[{"a":}]', '{"k":{"a":}}'])
  })
})

describe('llJsonSetValue on an object with a member with no value', () => {
  const set = async (json: string, path: string, value: string) => {
    const s = await run(`string out; default { state_entry() { out = llJsonSetValue(${JSON.stringify(json)}, ${path}, ${value}); } }`)
    return s.global('out')
  }

  // In-world (Aditi, SLua Tideland, 2026-11-23), for each row: the JSON, the path, the value and
  // what llJsonSetValue returned.
  it.each([
    // A member with no value stays as `"k":` when the object is rebuilt, like one before a comma.
    ['{"c":1,"a":}', '["b"]', '"1"', '{"a":,"b":1,"c":1}'],
    ['{"a":1,"b":}', '["c"]', '"1"', '{"a":1,"b":,"c":1}'],
    ['{"a":1,"b":}', '["a"]', '"2"', '{"a":2,"b":}'],
    ['{"a":1,"b":}', '["b"]', '"2"', '{"a":1,"b":2}'],
    ['{"a":1,"b":}', '["b", "x"]', '"1"', '{"a":1,"b":{"x":1}}'],
    ['{"a":1,"b":}', '["b"]', 'JSON_DELETE', '{"a":1}'],
    ['{"a":1,"b":}', '["a"]', 'JSON_DELETE', '{"b":}'],
    ['{"b":,"a":1}', '["c"]', '"1"', '{"a":1,"b":,"c":1}'],
    ['{"a":,"b":1}', '["b"]', '"2"', '{"a":,"b":2}'],
    ['{"x":{"a":1,"b":}}', '["x", "a"]', '"2"', '{"x":{"a":2,"b":}}'],
    ['{"x":{"a":1,"b":}}', '["x", "c"]', '"2"', '{"x":{"a":1,"b":,"c":2}}'],
    ['{"x":{"a":1,"b":},"y":1}', '["y"]', '"2"', '{"x":{"a":1,"b":},"y":2}'],
    ['[1,{"a":}]', '[0]', '"2"', '[2,{"a":}]'],
    ['[{"a":}]', '[JSON_APPEND]', '"1"', '[{"a":},1]'],
    // An object whose only member has no value is written to as an empty object.
    ['{"a":}', '["b"]', '"1"', '{"b":1}'],
    ['{"a":}', '["a"]', '"1"', '{"a":1}'],
    ['{"a":}', '["a", "x"]', '"1"', '{"a":{"x":1}}'],
    ['{"a":}', '["a", 0]', '"1"', '{"a":[1]}'],
    ['[{"a":}]', '[0, "b"]', '"1"', '[{"b":1}]'],
    ['{"x":{"a":}}', '["x", "b"]', '"1"', '{"x":{"b":1}}'],
    ['{"a":}', '["a"]', 'JSON_DELETE', JSON_INVALID],
    ['{"a":}', '[]', '"1"', '1'],
    // A trailing comma adds a member "" with no value.
    ['{"a":,}', '["b"]', '"1"', '{"":,"a":,"b":1}'],
    ['{"a":1,}', '["a"]', '"2"', '{"":,"a":2}'],
    // Duplicate keys whose last value is missing keep the key with no value.
    ['{"a":1,"a":}', '["b"]', '"1"', '{"a":,"b":1}'],
    ['{"a":,"a":}', '["b"]', '"1"', '{"a":,"b":1}'],
  ])('llJsonSetValue(%s, %s, %s)', async (json, path, value, want) => {
    expect(await set(json, path, value)).toBe(want)
  })

  it('gives JSON_INVALID for deleting a key that is not there', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-23): each of these returned JSON_INVALID, and
    // deleting the only key of {"a":1} returned {}.
    for (const [json, path] of [['{}', '["a"]'], ['{"b":1}', '["a"]'], ['{"a":}', '["b"]'], ['{"x":{}}', '["x", "a"]'], ['{"a":1}', '["b", "c"]']]) {
      expect(await set(json!, path!, 'JSON_DELETE'), json).toBe(JSON_INVALID)
    }
    expect(await set('{"a":1}', '["a"]', 'JSON_DELETE')).toBe('{}')
  })

  it('deletes an array element, and gives JSON_INVALID for one past the end or a key in a non-object', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-23): deleting [0] of [1] returned []. Deleting [0]
    // of [], [1] of [1], or a key of "", [1], 5 or [1] at [0] returned JSON_INVALID.
    expect(await set('[1]', '[0]', 'JSON_DELETE')).toBe('[]')
    for (const [json, path] of [['[]', '[0]'], ['[1]', '[1]'], ['', '["a"]'], ['[1]', '["a"]'], ['5', '["a"]'], ['[1]', '[0, "a"]']]) {
      expect(await set(json!, path!, 'JSON_DELETE'), `${json} ${path}`).toBe(JSON_INVALID)
    }
  })

  it('reads the member a trailing comma adds as JSON_INVALID', async () => {
    // In-world: llJson2List("{\"a\":1,}") is ["a", 1, "", ""], llJson2List("{\"a\":,}") is
    // ["a", "", "", ""], and llJsonGetValue and llJsonValueType at [""] are JSON_INVALID.
    const s = await run(`list a; list b; string c; string d; default { state_entry() {
      a = llJson2List("{\\"a\\":1,}"); b = llJson2List("{\\"a\\":,}");
      c = llJsonGetValue("{\\"a\\":1,}", [""]); d = llJsonValueType("{\\"a\\":1,}", [""]);
    } }`)
    expect(s.global('a')).toEqual(['a', 1, '', ''])
    expect(s.global('b')).toEqual(['a', '', '', ''])
    expect([s.global('c'), s.global('d')]).toEqual([JSON_INVALID, JSON_INVALID])
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
