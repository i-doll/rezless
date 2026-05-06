import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'
import {
  JSON_INVALID,
  JSON_OBJECT,
  JSON_ARRAY,
  JSON_NUMBER,
  JSON_STRING,
  JSON_NULL,
  JSON_TRUE,
  JSON_FALSE,
  JSON_APPEND,
  JSON_DELETE,
} from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

describe('JSON_* constants', () => {
  it('FDDx sentinels are single Unicode characters', () => {
    expect(JSON_INVALID).toBe('﷐')
    expect(JSON_OBJECT).toBe('﷑')
    expect(JSON_ARRAY).toBe('﷒')
    expect(JSON_NUMBER).toBe('﷓')
    expect(JSON_STRING).toBe('﷔')
    expect(JSON_NULL).toBe('﷕')
    expect(JSON_TRUE).toBe('﷖')
    expect(JSON_FALSE).toBe('﷗')
    expect(JSON_DELETE).toBe('﷘')
  })

  it('JSON_APPEND is the integer -1, not a sentinel string', () => {
    expect(JSON_APPEND).toBe(-1)
  })
})

describe('llJson2List', () => {
  it('object → strided [k, v, k, v]; nested compounds remain JSON strings', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() {
        out = llJson2List("{\\"a\\":1,\\"b\\":[1,2,3],\\"c\\":{}}");
      } }
    `)
    expect(s.global('out')).toEqual(['a', 1, 'b', '[1,2,3]', 'c', '{}'])
  })

  it('array → element list; nested compounds remain JSON strings', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() {
        out = llJson2List("[0, 3.14, [1,2,3], {}]");
      } }
    `)
    // canonical wiki example
    const out = s.global('out') as ReadonlyArray<unknown>
    expect(out).toHaveLength(4)
    expect(out[0]).toBe(0)
    expect(out[1]).toBeCloseTo(3.14, 5)
    expect(out[2]).toBe('[1,2,3]')
    expect(out[3]).toBe('{}')
  })

  it('single primitive string → 1-element list', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() {
        out = llJson2List("\\"hello\\"");
      } }
    `)
    expect(s.global('out')).toEqual(['hello'])
  })

  it('bare-word true → [JSON_TRUE]', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() {
        out = llJson2List("true");
      } }
    `)
    expect(s.global('out')).toEqual([JSON_TRUE])
  })

  it('invalid JSON → 1-element list of the input verbatim', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() {
        out = llJson2List("not really json {");
      } }
    `)
    expect(s.global('out')).toEqual(['not really json {'])
  })

  it('empty input → empty list', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() {
        out = llJson2List("");
      } }
    `)
    expect(s.global('out')).toEqual([])
  })

  it('UUID-shaped bare string → 1-element list', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() {
        out = llJson2List("89556747-24cb-43ed-920b-47caed15465f");
      } }
    `)
    expect(s.global('out')).toEqual(['89556747-24cb-43ed-920b-47caed15465f'])
  })
})

describe('llJsonGetValue', () => {
  it('empty specifiers → whole JSON', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llJsonGetValue("[1,2,3]", []); } }
    `)
    expect(s.global('out')).toBe('[1,2,3]')
  })

  it('object key lookup is case-sensitive', async () => {
    const s = await run(`
      string a = ""; string b = "";
      default { state_entry() {
        a = llJsonGetValue("{\\"True\\":1}", ["True"]);
        b = llJsonGetValue("{\\"True\\":1}", ["true"]);
      } }
    `)
    expect(s.global('a')).toBe('1')
    expect(s.global('b')).toBe(JSON_INVALID)
  })

  it('array index lookup; out-of-bounds → JSON_INVALID', async () => {
    const s = await run(`
      string a = ""; string b = "";
      default { state_entry() {
        a = llJsonGetValue("[10,20,30]", [1]);
        b = llJsonGetValue("[10,20,30]", [5]);
      } }
    `)
    expect(s.global('a')).toBe('20')
    expect(s.global('b')).toBe(JSON_INVALID)
  })

  it('nested specifiers walk through objects and arrays', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("{\\"a\\":{\\"b\\":{\\"c\\":7}}}", ["a","b","c"]);
      } }
    `)
    expect(s.global('out')).toBe('7')
  })

  it('mixed nested specifiers: [1,"name"] on [null,{"name":"a"}]', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("[null,{\\"name\\":\\"a\\"}]", [1, "name"]);
      } }
    `)
    expect(s.global('out')).toBe('a')
  })

  it('JSON null → JSON_NULL', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llJsonGetValue("null", []); } }
    `)
    expect(s.global('out')).toBe(JSON_NULL)
  })

  it('JSON true / false → JSON_TRUE / JSON_FALSE (sentinels)', async () => {
    const s = await run(`
      string a = ""; string b = "";
      default { state_entry() {
        a = llJsonGetValue("true", []);
        b = llJsonGetValue("false", []);
      } }
    `)
    expect(s.global('a')).toBe(JSON_TRUE)
    expect(s.global('b')).toBe(JSON_FALSE)
  })

  it('case-sensitive bare-words: "True" / "TRUE" → JSON_INVALID', async () => {
    const s = await run(`
      string a = ""; string b = "";
      default { state_entry() {
        a = llJsonGetValue("True", []);
        b = llJsonGetValue("TRUE", []);
      } }
    `)
    expect(s.global('a')).toBe(JSON_INVALID)
    expect(s.global('b')).toBe(JSON_INVALID)
  })

  it('JSON string containing digits stays a string (not canonicalized)', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("\\"3.14\\"", []);
      } }
    `)
    expect(s.global('out')).toBe('3.14')
  })

  it('JSON string containing "TRUE" stays the literal string "TRUE"', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("\\"TRUE\\"", []);
      } }
    `)
    expect(s.global('out')).toBe('TRUE')
  })

  it('passing a sentinel as JSON text → JSON_INVALID', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llJsonGetValue(JSON_TRUE, []); } }
    `)
    expect(s.global('out')).toBe(JSON_INVALID)
  })

  it('escape sequences inside JSON strings are unescaped on retrieval', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("\\"line\\\\nbreak\\\\there\\"", []);
      } }
    `)
    expect(s.global('out')).toBe('line\nbreak\there')
  })

  it('empty-value short-circuit → JSON_NULL even with extra specifiers', async () => {
    const s = await run(`
      string a = ""; string b = "";
      default { state_entry() {
        a = llJsonGetValue("{\\"parent\\":,}", ["parent"]);
        b = llJsonGetValue("{\\"parent\\":,}", ["parent","missing"]);
      } }
    `)
    expect(s.global('a')).toBe(JSON_NULL)
    expect(s.global('b')).toBe(JSON_NULL)
  })

  it('empty array slot → JSON_NULL', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("[ , , , , ]", [2]);
      } }
    `)
    expect(s.global('out')).toBe(JSON_NULL)
  })

  it('duplicate keys → returns the last occurrence', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("{\\"k\\":1,\\"k\\":2,\\"k\\":3}", ["k"]);
      } }
    `)
    expect(s.global('out')).toBe('3')
  })

  it('compound value returned as raw JSON text', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonGetValue("[[1,2],[4,5,6]]", [1]);
      } }
    `)
    expect(s.global('out')).toBe('[4,5,6]')
  })
})

describe('llJsonValueType', () => {
  it('classifies all eight JSON types correctly', async () => {
    const s = await run(`
      string sObj = ""; string sArr = ""; string sNum = ""; string sStr = "";
      string sNull = ""; string sTrue = ""; string sFalse = ""; string sBad = "";
      default { state_entry() {
        sObj   = llJsonValueType("{}", []);
        sArr   = llJsonValueType("[1,2]", []);
        sNum   = llJsonValueType("3.14", []);
        sStr   = llJsonValueType("\\"hello\\"", []);
        sNull  = llJsonValueType("null", []);
        sTrue  = llJsonValueType("true", []);
        sFalse = llJsonValueType("false", []);
        sBad   = llJsonValueType("not json", []);
      } }
    `)
    expect(s.global('sObj')).toBe(JSON_OBJECT)
    expect(s.global('sArr')).toBe(JSON_ARRAY)
    expect(s.global('sNum')).toBe(JSON_NUMBER)
    expect(s.global('sStr')).toBe(JSON_STRING)
    expect(s.global('sNull')).toBe(JSON_NULL)
    expect(s.global('sTrue')).toBe(JSON_TRUE)
    expect(s.global('sFalse')).toBe(JSON_FALSE)
    expect(s.global('sBad')).toBe(JSON_INVALID)
  })

  it('empty string → JSON_INVALID', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llJsonValueType("", []); } }
    `)
    expect(s.global('out')).toBe(JSON_INVALID)
  })

  it('empty-value short-circuit returns JSON_NULL', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonValueType("{\\"parent\\":,}", ["parent"]);
      } }
    `)
    expect(s.global('out')).toBe(JSON_NULL)
  })

  it('nested specifier path: {"a":[1,{"b":true}]} via ["a",1,"b"] → JSON_TRUE', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonValueType("{\\"a\\":[1,{\\"b\\":true}]}", ["a",1,"b"]);
      } }
    `)
    expect(s.global('out')).toBe(JSON_TRUE)
  })
})

describe('llJsonSetValue', () => {
  it('replaces an existing object value', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("{\\"A\\":2,\\"B\\":1}", ["B"], "10");
      } }
    `)
    expect(s.global('out')).toBe('{"A":2,"B":10}')
  })

  it('appends when index == array length', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("[1,2,3]", [3], "4");
      } }
    `)
    expect(s.global('out')).toBe('[1,2,3,4]')
  })

  it('out-of-bounds index at root → JSON_INVALID', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("[1,2,3]", [5], "x");
      } }
    `)
    expect(s.global('out')).toBe(JSON_INVALID)
  })

  it('out-of-bounds index at deeper level → JSON_INVALID (post-BUG-3692)', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("[[1,2,3]]", [0, 5], "x");
      } }
    `)
    expect(s.global('out')).toBe(JSON_INVALID)
  })

  it('JSON_APPEND on array → appends at end', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("[1,2,3]", [JSON_APPEND], "4");
      } }
    `)
    expect(s.global('out')).toBe('[1,2,3,4]')
  })

  it('JSON_APPEND on non-array root → overwrites with [value]', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("{\\"k\\":1}", [JSON_APPEND], "9");
      } }
    `)
    expect(s.global('out')).toBe('[9]')
  })

  it('new key on object → inserted', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("{\\"a\\":1}", ["b"], "2");
      } }
    `)
    expect(s.global('out')).toBe('{"a":1,"b":2}')
  })

  it('JSON_DELETE removes an object key', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("{\\"a\\":1,\\"b\\":2}", ["a"], JSON_DELETE);
      } }
    `)
    expect(s.global('out')).toBe('{"b":2}')
  })

  it('auto-creates intermediate objects on missing string-key path', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("{}", ["a","b","c"], "10");
      } }
    `)
    expect(s.global('out')).toBe('{"a":{"b":{"c":10}}}')
  })

  it('canonical wiki force-fit: [3,"W","X"] on a mixed array', async () => {
    // starting: [9,"<1,1,1>",false,{"A":8,"Z":9}]
    // setting [3,"W","X"]=10 should yield:
    //   [9,"<1,1,1>",false,{"A":8,"W":{"X":10},"Z":9}]
    const s = await run(`
      string out = "";
      default { state_entry() {
        string j = "[9,\\"<1,1,1>\\",false,{\\"A\\":8,\\"Z\\":9}]";
        out = llJsonSetValue(j, [3,"W","X"], "10");
      } }
    `)
    expect(s.global('out')).toBe(
      '[9,"<1,1,1>",false,{"A":8,"Z":9,"W":{"X":10}}]',
    )
  })

  it('all-integer chain auto-creates nested arrays in-bounds', async () => {
    // [4,0,0,0] on a 4-element array → creates [[[10]]] at the appended slot
    const s = await run(`
      string out = "";
      default { state_entry() {
        string j = "[1,2,3,4]";
        out = llJsonSetValue(j, [4,0,0,0], "10");
      } }
    `)
    expect(s.global('out')).toBe('[1,2,3,4,[[[10]]]]')
  })

  it('string spec on root array overwrites root with object', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("[1,2,3]", ["X"], "10");
      } }
    `)
    expect(s.global('out')).toBe('{"X":10}')
  })

  it('JSON_TRUE / JSON_FALSE / JSON_NULL as value → bare words', async () => {
    const s = await run(`
      string a = ""; string b = ""; string c = "";
      default { state_entry() {
        a = llJsonSetValue("{}", ["k"], JSON_TRUE);
        b = llJsonSetValue("{}", ["k"], JSON_FALSE);
        c = llJsonSetValue("{}", ["k"], JSON_NULL);
      } }
    `)
    expect(s.global('a')).toBe('{"k":true}')
    expect(s.global('b')).toBe('{"k":false}')
    expect(s.global('c')).toBe('{"k":null}')
  })

  it('negative integer specifier other than -1 → JSON_INVALID', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("[1,2,3]", [-2], "x");
      } }
    `)
    expect(s.global('out')).toBe(JSON_INVALID)
  })

  it('embedded " in value gets backslash-escaped', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("{}", ["k"], "a \\"b\\" c");
      } }
    `)
    expect(s.global('out')).toBe('{"k":"a \\"b\\" c"}')
  })

  it('object with duplicate keys collapses to last on any set', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llJsonSetValue("{\\"a\\":1,\\"a\\":2,\\"b\\":3,\\"a\\":4}", ["b"], "9");
      } }
    `)
    // duplicates collapsed; surviving "a":4 in last position; "b":9 in its position
    expect(s.global('out')).toBe('{"b":9,"a":4}')
  })

  it('three successive sets build a 3-level nested object; gets read each level back', async () => {
    const s = await run(`
      string a = ""; string b = ""; string c = "";
      default { state_entry() {
        string j = "{}";
        j = llJsonSetValue(j, ["x"], "1");
        j = llJsonSetValue(j, ["y","z"], "2");
        j = llJsonSetValue(j, ["y","w","q"], "3");
        a = llJsonGetValue(j, ["x"]);
        b = llJsonGetValue(j, ["y","z"]);
        c = llJsonGetValue(j, ["y","w","q"]);
      } }
    `)
    expect(s.global('a')).toBe('1')
    expect(s.global('b')).toBe('2')
    expect(s.global('c')).toBe('3')
  })
})

describe('llList2Json', () => {
  it('JSON_ARRAY empty list → "[]"', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llList2Json(JSON_ARRAY, []); } }
    `)
    expect(s.global('out')).toBe('[]')
  })

  it('JSON_OBJECT empty list → "{}"', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llList2Json(JSON_OBJECT, []); } }
    `)
    expect(s.global('out')).toBe('{}')
  })

  it('JSON_OBJECT odd-length list → JSON_INVALID', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_OBJECT, ["a", 1, "b"]);
      } }
    `)
    expect(s.global('out')).toBe(JSON_INVALID)
  })

  it('unknown type → JSON_INVALID', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json("nope", [1,2,3]);
      } }
    `)
    expect(s.global('out')).toBe(JSON_INVALID)
  })

  it('mixed-type array elements: integer, float, string, "true", JSON_NULL', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_ARRAY, [1, 2.5, "hi", "true", JSON_NULL]);
      } }
    `)
    expect(s.global('out')).toBe('[1,2.500000,"hi",true,null]')
  })

  it('nested JSON-shaped string is kept-as-is (not re-quoted)', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_ARRAY, ["set", "[1,2,3]"]);
      } }
    `)
    expect(s.global('out')).toBe('["set",[1,2,3]]')
  })

  it('vector inside JSON → 5-decimal LSL string representation, JSON-quoted', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_ARRAY, [<1,1,1>]);
      } }
    `)
    expect(s.global('out')).toBe('["<1.00000, 1.00000, 1.00000>"]')
  })

  it('round-trip: build {"a":{"b":[1,2,3]}} via list2json, then get nested', async () => {
    const s = await run(`
      string j = ""; string two = "";
      default { state_entry() {
        string inner = llList2Json(JSON_ARRAY, [1,2,3]);
        string mid = llList2Json(JSON_OBJECT, ["b", inner]);
        j = llList2Json(JSON_OBJECT, ["a", mid]);
        two = llJsonGetValue(j, ["a","b",1]);
      } }
    `)
    expect(s.global('j')).toBe('{"a":{"b":[1,2,3]}}')
    expect(s.global('two')).toBe('2')
  })

  it('LSL string already JSON-quoted ("\\"bacon\\"") emits verbatim (no double-quoting)', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_ARRAY, ["\\"bacon\\""]);
      } }
    `)
    expect(s.global('out')).toBe('["bacon"]')
  })

  it('LSL strings "true" / "false" / "null" → bare-word JSON', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_ARRAY, ["true","false","null"]);
      } }
    `)
    expect(s.global('out')).toBe('[true,false,null]')
  })

  it('LSL string holding a JSON number ("42", "-3.14", "1e3") embeds as bare number', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_ARRAY, ["42", "-3.14", "1e3"]);
      } }
    `)
    expect(s.global('out')).toBe('[42,-3.14,1e3]')
  })

  it('LSL string holding a JSON number works as object value too', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_OBJECT, ["k", "42"]);
      } }
    `)
    expect(s.global('out')).toBe('{"k":42}')
  })

  it('numeric-looking but invalid JSON string ("12abc") stays a quoted string', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_ARRAY, ["12abc"]);
      } }
    `)
    expect(s.global('out')).toBe('["12abc"]')
  })

  it('string that looks like a number stays quoted', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() {
        out = llList2Json(JSON_OBJECT, ["val", "42"]);
      } }
    `)
    expect(s.global('out')).toBe('{"val":"42"}')
  });
})
