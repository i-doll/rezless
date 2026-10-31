import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'
import { EOF, NAK, InventoryType, makeInventoryItem, NULL_KEY } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlFindNotecardTextSync (llFindNotecardTextCount has no wiki page;
// its tooltip in lsl_definitions.yaml says it raises a dataserver event with the match count).
// In-world probes: Aditi, SLua Tombolo, Mono, 2026-10-31, against a notecard "nc" holding LINES.
const LINES = ['Hello world', 'hello WORLD hello', '', 'abc123def456', 'naïve café ✓', 'a.b*c', 'end']
const NC_KEY = 'b55a2053-c6bc-5e6d-0193-553cdf8ae12e'
const DEBUG = 2147483647

function notecard(name: string, lines: ReadonlyArray<string>, key?: string) {
  return makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: lines, ...(key ? { key } : {}) })
}

async function run(body: string, inventory = [notecard('nc', LINES, NC_KEY)]) {
  const probe = `
    list r;
    key k;
    string data = "none";
    integer events = 0;
    default {
      state_entry() { ${body} }
      dataserver(key id, string d) { events = events + 1; data = d; }
    }
  `
  const { scripts } = await loadLinkset({
    prims: [{ inventory, scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] }],
  })
  const p = scripts['p']!
  p.start()
  p.advanceTime(1000)
  return p
}

const lsl = (s: string) => JSON.stringify(s)

async function sync(pattern: string, start = 0, count = 0, lines = LINES) {
  const p = await run(`r = llFindNotecardTextSync("nc", ${lsl(pattern)}, ${start}, ${count}, []);`, [
    notecard('nc', lines),
  ])
  return p.global('r') as ReadonlyArray<number>
}

async function count(pattern: string, name = 'nc') {
  const p = await run(`k = llFindNotecardTextCount(${lsl(name)}, ${lsl(pattern)}, []);`)
  return { key: p.global('k'), data: p.global('data'), events: p.global('events'), chat: p.chat }
}

describe('llFindNotecardTextSync', () => {
  // In-world: "hello" -> [1,0,5, 1,12,5]; "(?i)hello" -> [0,0,5, 1,0,5, 1,12,5]; "(?i)WORLD" -> [0,6,5, 1,6,5].
  it('returns [line, column, length] per match, case-sensitive unless the pattern starts with (?i)', async () => {
    expect(await sync('hello')).toEqual([1, 0, 5, 1, 12, 5])
    expect(await sync('(?i)hello')).toEqual([0, 0, 5, 1, 0, 5, 1, 12, 5])
    expect(await sync('(?i)WORLD')).toEqual([0, 6, 5, 1, 6, 5])
  })

  // In-world: "(?i)CAFÉ" -> [] although the notecard holds "café".
  it('folds case for ASCII letters only', async () => {
    expect(await sync('(?i)CAFÉ')).toEqual([])
  })

  // In-world: "o" -> four matches; start 2 count 2 -> [1,4,1, 1,16,1]; start -1 and -2 -> all four;
  // start 5 and 100 -> [].
  it('skips start matches and clamps a negative start to 0', async () => {
    expect(await sync('o')).toEqual([0, 4, 1, 0, 7, 1, 1, 4, 1, 1, 16, 1])
    expect(await sync('o', 2, 2)).toEqual([1, 4, 1, 1, 16, 1])
    expect(await sync('o', -1)).toEqual([0, 4, 1, 0, 7, 1, 1, 4, 1, 1, 16, 1])
    expect(await sync('o', -2)).toEqual([0, 4, 1, 0, 7, 1, 1, 4, 1, 1, 16, 1])
    expect(await sync('o', 5)).toEqual([])
    expect(await sync('o', 100)).toEqual([])
  })

  // In-world: count -1, -2 and -100 each return one match; start 1 count -1 -> [0,7,1]; start 3 count -1 -> [1,16,1].
  it('returns one match for a negative count', async () => {
    expect(await sync('o', 0, -1)).toEqual([0, 4, 1])
    expect(await sync('o', 0, -100)).toEqual([0, 4, 1])
    expect(await sync('o', 1, -1)).toEqual([0, 7, 1])
    expect(await sync('o', 3, -1)).toEqual([1, 16, 1])
    expect(await sync('o', 0, 1)).toEqual([0, 4, 1])
  })

  // In-world: "" and "." with count 0 -> 192 entries; "." count 64 -> 192, 65 -> 195, 100 -> 210 (all 70);
  // "." start 10 -> 180; "" start 60 -> 33.
  it('caps a count of 0 at 64 matches, but not an explicit count', async () => {
    expect((await sync('')).length).toBe(192)
    expect((await sync('.')).length).toBe(192)
    expect((await sync('.', 0, 64)).length).toBe(192)
    expect((await sync('.', 0, 65)).length).toBe(195)
    expect((await sync('.', 0, 100)).length).toBe(210)
    expect((await sync('.', 10)).length).toBe(180)
    expect((await sync('', 60)).length).toBe(33)
  })

  // In-world: "^h" -> [1,0,1]; "world$" -> [0,6,5]; "end$" -> [6,0,3]; "\\AHello" -> [0,0,5];
  // "\\Ahello" -> []; "world\\Z" -> []; "end\\z" -> [6,0,3]; "\\G" -> [0,0,0]; "^$" -> [2,0,0].
  it('anchors ^ and $ at line ends and \\A, \\z, \\Z at the ends of the notecard', async () => {
    expect(await sync('^h')).toEqual([1, 0, 1])
    expect(await sync('world$')).toEqual([0, 6, 5])
    expect(await sync('end$')).toEqual([6, 0, 3])
    expect(await sync('^$')).toEqual([2, 0, 0])
    expect(await sync('\\AHello')).toEqual([0, 0, 5])
    expect(await sync('\\Ahello')).toEqual([])
    expect(await sync('world\\Z')).toEqual([])
    expect(await sync('end\\z')).toEqual([6, 0, 3])
    expect(await sync('\\G')).toEqual([0, 0, 0])
  })

  // In-world: "\\n" -> one match at the end of each line but the last; "d\\nh" -> [0,10,3];
  // "\\n\\n" -> [1,17,2]; "WORLD hello\\n\\nabc" -> [1,6,16]; "o.*o" -> [0,4,25].
  it('searches the notecard as one text, so matches and . cross line ends', async () => {
    expect(await sync('\\n')).toEqual([0, 11, 1, 1, 17, 1, 2, 0, 1, 3, 12, 1, 4, 12, 1, 5, 5, 1])
    expect(await sync('d\\nh')).toEqual([0, 10, 3])
    expect(await sync('\\n\\n')).toEqual([1, 17, 2])
    expect(await sync('WORLD hello\\n\\nabc')).toEqual([1, 6, 16])
    expect(await sync('o.*o')).toEqual([0, 4, 25])
    expect(await sync('\\s+')).toEqual([0, 5, 1, 0, 11, 1, 1, 5, 1, 1, 11, 1, 1, 17, 2, 3, 12, 1, 4, 5, 1, 4, 10, 1, 4, 12, 1, 5, 5, 1])
  })

  // In-world: "caf" -> [4,6,3]; "✓" -> [4,11,1]; "\\xE2" -> [4,11,1]; "caf." -> [4,6,4]; "caf.." -> [4,6,4];
  // "ï." -> [4,2,2]; "." from match 44 walks line 4 byte by byte:
  // columns 0,1,2,3,3,4,5,6,7,8,9,10,10,11,12,12,12, each length 1.
  it('matches UTF-8 bytes but reports columns and lengths in characters', async () => {
    expect(await sync('caf')).toEqual([4, 6, 3])
    expect(await sync('✓')).toEqual([4, 11, 1])
    expect(await sync('\\xE2')).toEqual([4, 11, 1])
    expect(await sync('caf.')).toEqual([4, 6, 4])
    expect(await sync('caf..')).toEqual([4, 6, 4])
    expect(await sync('ï.')).toEqual([4, 2, 2])
    const cols = [0, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 12, 12]
    expect(await sync('.', 44, 17)).toEqual(cols.flatMap((c) => [4, c, 1]))
  })

  // In-world, notecard "a😀b\nc": "b" -> [0,2,1]; "c" -> [1,0,1]; "a." -> [0,0,2]; "a....b" -> [0,0,3].
  it('counts a character outside the BMP as one column', async () => {
    const lines = ['a😀b', 'c']
    expect(await sync('b', 0, 0, lines)).toEqual([0, 2, 1])
    expect(await sync('c', 0, 0, lines)).toEqual([1, 0, 1])
    expect(await sync('a.', 0, 0, lines)).toEqual([0, 0, 2])
    expect(await sync('a....b', 0, 0, lines)).toEqual([0, 0, 3])
  })

  // In-world: "\\w+" splits "naïve" into "na" and "ve"; "[[:alpha:]]+" likewise; "\\S+" keeps "naïve" whole.
  it('treats non-ASCII bytes as non-word, non-space characters', async () => {
    const w = await sync('\\w+')
    expect(w.slice(0, 27)).toEqual([0, 0, 5, 0, 6, 5, 1, 0, 5, 1, 6, 5, 1, 12, 5, 3, 0, 12, 4, 0, 2, 4, 3, 2, 4, 6, 3])
    const a = await sync('[[:alpha:]]+')
    expect(a).toEqual([
      0, 0, 5, 0, 6, 5, 1, 0, 5, 1, 6, 5, 1, 12, 5, 3, 0, 3, 3, 6, 3, 4, 0, 2, 4, 3, 2, 4, 6, 3, 5, 0, 1, 5, 2, 1, 5,
      4, 1, 6, 0, 3,
    ])
    expect(await sync('\\S+')).toEqual([
      0, 0, 5, 0, 6, 5, 1, 0, 5, 1, 6, 5, 1, 12, 5, 3, 0, 12, 4, 0, 5, 4, 6, 4, 4, 11, 1, 5, 0, 5, 6, 0, 3,
    ])
  })

  // In-world: "\\d+" and "[\\d]+" -> [3,3,3, 3,9,3]; "[[:digit:]]+" the same; "\\D+" -> [0,0,34, 3,6,3, 3,12,23];
  // "[^\\n]+" -> [0,0,44, 4,1,19, 6,2,1] (a class reads \n as the letter n).
  it('supports Perl class escapes, POSIX classes and literal escapes inside a set', async () => {
    expect(await sync('\\d+')).toEqual([3, 3, 3, 3, 9, 3])
    expect(await sync('[\\d]+')).toEqual([3, 3, 3, 3, 9, 3])
    expect(await sync('[[:digit:]]+')).toEqual([3, 3, 3, 3, 9, 3])
    expect(await sync('\\D+')).toEqual([0, 0, 34, 3, 6, 3, 3, 12, 23])
    expect(await sync('[^\\n]+')).toEqual([0, 0, 44, 4, 1, 19, 6, 2, 1])
  })

  // In-world: "a\\.b\\*c" -> [5,0,5]; "\\Qa.b\\E" -> [5,0,3]; "W\\OR" -> [1,6,3]; "\\y" -> []; "\\u00e9" -> [];
  // "l{2}" -> [0,2,2, 1,2,2, 1,14,2]; "(ab|de)" -> [3,0,2, 3,6,2]; "\\bhello\\b" -> [1,0,5, 1,12,5];
  // "l\\B" -> seven matches; "[a-c]+" -> [3,0,3, 4,1,1, 4,6,2, 5,0,1, 5,2,1, 5,4,1].
  it('supports escapes, \\Q…\\E, bounded repeats, groups, alternation and word boundaries', async () => {
    expect(await sync('a\\.b\\*c')).toEqual([5, 0, 5])
    expect(await sync('\\Qa.b\\E')).toEqual([5, 0, 3])
    expect(await sync('W\\OR')).toEqual([1, 6, 3])
    expect(await sync('\\y')).toEqual([])
    expect(await sync('\\u00e9')).toEqual([])
    expect(await sync('l{2}')).toEqual([0, 2, 2, 1, 2, 2, 1, 14, 2])
    expect(await sync('(ab|de)')).toEqual([3, 0, 2, 3, 6, 2])
    expect(await sync('\\bhello\\b')).toEqual([1, 0, 5, 1, 12, 5])
    expect(await sync('l\\B')).toEqual([0, 2, 1, 0, 3, 1, 0, 9, 1, 1, 2, 1, 1, 3, 1, 1, 14, 1, 1, 15, 1])
    expect(await sync('[a-c]+')).toEqual([3, 0, 3, 4, 1, 1, 4, 6, 2, 5, 0, 1, 5, 2, 1, 5, 4, 1])
    expect(await sync('l+')).toEqual([0, 2, 2, 0, 9, 1, 1, 2, 2, 1, 14, 2])
  })

  // In-world (Aditi, SLua Tideland, 2026-10-31): "\\Qa.b" -> [5,0,3]; "a\\E.b" -> []; "\\x48ello" -> [0,0,5];
  // "l{2,}" -> [0,2,2, 1,2,2, 1,14,2]; "[]a]" -> [3,0,1, 4,1,1, 4,7,1, 5,0,1]; "[a\\]]+" -> [];
  // "[[:space:]]+" matches as "\\s+" does.
  it('reads \\Q to the end, a lone \\E as E, and a backslash in a set as itself', async () => {
    expect(await sync('\\Qa.b')).toEqual([5, 0, 3])
    expect(await sync('a\\E.b')).toEqual([])
    expect(await sync('\\x48ello')).toEqual([0, 0, 5])
    expect(await sync('l{2,}')).toEqual([0, 2, 2, 1, 2, 2, 1, 14, 2])
    expect(await sync('[]a]')).toEqual([3, 0, 1, 4, 1, 1, 4, 7, 1, 5, 0, 1])
    expect(await sync('[a\\]]+')).toEqual([])
    expect(await sync('[[:space:]]+')).toEqual(await sync('\\s+'))
  })

  // In-world (Aditi, SLua Tideland, 2026-10-31): "l\\Q\\E+" -> [0,2,2, 0,9,1, 1,2,2, 1,14,2];
  // "\\Q\\Ea" -> the matches of "a".
  it('lets a quantifier after an empty \\Q\\E repeat what came before it', async () => {
    expect(await sync('l\\Q\\E+')).toEqual([0, 2, 2, 0, 9, 1, 1, 2, 2, 1, 14, 2])
    expect(await sync('\\Q\\Ea')).toEqual([3, 0, 1, 4, 1, 1, 4, 7, 1, 5, 0, 1])
  })

  // In-world (Aditi, SLua Tideland, 2026-10-31), notecard "a﻿b\n﻿xb": "b" -> [0,2,1, 1,2,1];
  // "\\xEF\\xBB\\xBF" -> [0,1,1, 1,0,1].
  it('counts U+FEFF as a character, also at the start of a line', async () => {
    const lines = ['a﻿b', '﻿xb']
    expect(await sync('b', 0, 0, lines)).toEqual([0, 2, 1, 1, 2, 1])
    expect(await sync('\\xEF\\xBB\\xBF', 0, 0, lines)).toEqual([0, 1, 1, 1, 0, 1])
  })

  // In-world: "" and "x*" match empty at every byte; "(?i)" alone behaves like "".
  it('reports empty matches at every byte offset', async () => {
    const empty = await sync('')
    expect(empty.slice(0, 9)).toEqual([0, 0, 0, 0, 1, 0, 0, 2, 0])
    expect(await sync('x*')).toEqual(empty)
    expect(await sync('(?i)')).toEqual(empty)
  })

  // In-world: options [1, "x"] are ignored.
  it('ignores the options list', async () => {
    const p = await run(`r = llFindNotecardTextSync("nc", "hello", 0, 0, [1, "x"]);`)
    expect(p.global('r')).toEqual([1, 0, 5, 1, 12, 5])
  })

  // In-world: the notecard's asset key works as the name.
  it('accepts the notecard key as the name', async () => {
    const p = await run(`r = llFindNotecardTextSync("${NC_KEY}", "hello", 0, 0, []);`)
    expect(p.global('r')).toEqual([1, 0, 5, 1, 12, 5])
    expect(p.chat).toEqual([])
  })

  // In-world: "nope", "" and a script's name say "Could not find notecard '<name>'." and return [NAK].
  it.each([['nope'], [''], ['p']])('says an error and returns [NAK] for %j, which is not a notecard here', async (name) => {
    const p = await run(`r = llFindNotecardTextSync(${lsl(name)}, "o", 0, 0, []);`)
    expect(p.global('r')).toEqual([NAK])
    expect(p.chat).toEqual([{ channel: DEBUG, text: `Could not find notecard '${name}'.`, type: 'say' }])
  })

  // In-world: a random key (llGenerateKey) returns [NAK] without an error, as an uncached notecard does.
  it('returns [NAK] silently for a key that is not a notecard in the prim', async () => {
    const p = await run(`r = llFindNotecardTextSync((string)llGenerateKey(), "o", 0, 0, []);`)
    expect(p.global('r')).toEqual([NAK])
    expect(p.chat).toEqual([])
  })

  // In-world: Sync("nope", "(") says only the missing-notecard error.
  it('looks up the notecard before checking the pattern', async () => {
    const p = await run(`r = llFindNotecardTextSync("nope", "(", 0, 0, []);`)
    expect(p.global('r')).toEqual([NAK])
    expect(p.chat).toEqual([{ channel: DEBUG, text: "Could not find notecard 'nope'.", type: 'say' }])
  })

  // In-world, each on DEBUG_CHANNEL, returning []:
  it.each([
    ['(', 'Mismatched \'(\' and \')\' in "(" at position 1'],
    [')', 'Mismatched \'(\' and \')\' in ")" at position 0'],
    ['é(', 'Mismatched \'(\' and \')\' in "??(" at position 3'],
    ['[', 'Invalid character set [...] in "[" at position 1'],
    ['(?s).', 'Invalid repetition in "(?s)." at position 2'],
    ['(?-s).', 'Invalid repetition in "(?-s)." at position 2'],
    ['(?m)^h', 'Invalid repetition in "(?m)^h" at position 2'],
    ['(?:ab)c', 'Invalid repetition in "(?:ab)c" at position 2'],
    ['o(?= )', 'Invalid repetition in "o(?= )" at position 3'],
    ['(?<=h)e', 'Invalid repetition in "(?<=h)e" at position 2'],
    ['(?P<x>ab)c', 'Invalid repetition in "(?P<x>ab)c" at position 2'],
    ['a(?i)BC', 'Invalid repetition in "a(?i)BC" at position 3'],
    [' (?i)hello', 'Invalid repetition in " (?i)hello" at position 3'],
    ['(?I)hello', 'Invalid repetition in "(?I)hello" at position 2'],
    ['(?i)(?i)hello', 'Invalid repetition in "(?i)hello" at position 2'],
    ['l+?', 'Invalid repetition in "l+?" at position 3'],
    ['l++', 'Invalid repetition in "l++" at position 3'],
    ['*a', 'Invalid repetition in "*a" at position 0'],
    ['(l)\\1', 'Invalid or trailing escape in "(l)\\1" at position 3'],
    ['\\', 'Invalid or trailing escape in "\\" at position 1'],
    ['a{2,1}', 'Invalid contents of a {...} block in "a{2,1}" at position 4'],
    ['\\x{e9}', 'Invalid contents of a {...} block in "\\x{e9}" at position 0'],
    // In-world (Aditi, SLua Tideland, 2026-10-31):
    ['\\xZ', 'Invalid or trailing escape in "\\xZ" at position 0'],
    ['^*', 'Invalid repetition in "^*" at position 2'],
    ['a{2', 'Mismatched \'{\' and \'}\' in "a{2" at position 3'],
    ['l{,2}', 'Mismatched \'{\' and \'}\' in "l{,2}" at position 2'],
    ['a{x}', 'Mismatched \'{\' and \'}\' in "a{x}" at position 2'],
    ['[[:bogus:]]', 'Invalid character class name was specified in a [[:name:]] block in "[[:bogus:]]" at position 3'],
    ['[z-a]', 'Invalid character class name was specified in a [[:name:]] block in "[z-a]" at position 5'],
    ['[[:alpha:]', 'Mismatched \'(\' and \')\' in "[[:alpha:]" at position 10'],
    // In-world (Aditi, SLua Tideland, 2026-10-31). The listener cut "[[:constructor:]]"'s message off before
    // its position; position 3 is where "[[:bogus:]]" reported the same error.
    ['\\Q\\E*', 'Invalid repetition in "\\Q\\E*" at position 5'],
    ['a*\\Q\\E*', 'Invalid repetition in "a*\\Q\\E*" at position 7'],
    ['[[:constructor:]]', 'Invalid character class name was specified in a [[:name:]] block in "[[:constructor:]]" at position 3'],
    ['[[:__proto__:]]', 'Invalid character class name was specified in a [[:name:]] block in "[[:__proto__:]]" at position 3'],
  ])('rejects %j', async (pattern, error) => {
    const p = await run(`r = llFindNotecardTextSync("nc", ${lsl(pattern)}, 0, 0, []);`)
    expect(p.global('r')).toEqual([])
    expect(p.chat).toEqual([{ channel: DEBUG, text: `Regex error: ${error}`, type: 'say' }])
  })
})

describe('llFindNotecardTextCount', () => {
  // In-world: "o" -> 4, "hello" -> 2, "(?i)WORLD" -> 2, "zzz" -> 0, "" -> 71, "." -> 70, "\\n" -> 6,
  // "^" -> 7, "$" -> 7, "\\xE2" -> 1. The count isn't capped at 64.
  it.each([
    ['o', '4'],
    ['hello', '2'],
    ['(?i)WORLD', '2'],
    ['zzz', '0'],
    ['', '71'],
    ['.', '70'],
    ['\\n', '6'],
    ['^', '7'],
    ['$', '7'],
    ['\\xE2', '1'],
  ])('raises dataserver with the number of matches of %j', async (pattern, n) => {
    const c = await count(pattern)
    expect(c.key).not.toBe(NULL_KEY)
    expect(c.events).toBe(1)
    expect(c.data).toBe(n)
    expect(c.chat).toEqual([])
  })

  // In-world: Count by the notecard's key -> 2 for "hello".
  it('accepts the notecard key as the name', async () => {
    const c = await count('hello', NC_KEY)
    expect(c.data).toBe('2')
  })

  // In-world: Count with a random key returns a key, and dataserver delivers EOF.
  it('delivers EOF for a key that is not a notecard in the prim', async () => {
    const p = await run(`k = llFindNotecardTextCount((string)llGenerateKey(), "o", []);`)
    expect(p.global('k')).not.toBe(NULL_KEY)
    expect(p.global('data')).toBe(EOF)
    expect(p.chat).toEqual([])
  })

  // In-world: "nope", "" and a script's name say "Could not find notecard '<name>'.", return NULL_KEY and raise
  // no dataserver; Count("nope", "(") says only that error.
  it.each([
    ['nope', 'o'],
    ['', 'o'],
    ['p', 'o'],
    ['nope', '('],
  ])('returns NULL_KEY for %j, which is not a notecard here', async (name, pattern) => {
    const c = await count(pattern, name)
    expect(c.key).toBe(NULL_KEY)
    expect(c.events).toBe(0)
    expect(c.chat).toEqual([{ channel: DEBUG, text: `Could not find notecard '${name}'.`, type: 'say' }])
  })

  // In-world: Count("nc", "(") says the regex error, returns NULL_KEY and raises no dataserver;
  // "é(" says it with the pattern as "??(".
  it.each([
    ['(', 'Mismatched \'(\' and \')\' in "(" at position 1'],
    ['é(', 'Mismatched \'(\' and \')\' in "??(" at position 3'],
  ])('returns NULL_KEY for the invalid pattern %j', async (pattern, error) => {
    const c = await count(pattern)
    expect(c.key).toBe(NULL_KEY)
    expect(c.events).toBe(0)
    expect(c.chat).toEqual([{ channel: DEBUG, text: `Regex error: ${error}`, type: 'say' }])
  })

  // In-world: dataserver from notecard reads reaches every script in the prim (see multiscript.test.ts).
  it('delivers the count to every script in the prim', async () => {
    const requester = `default { state_entry() { llFindNotecardTextCount("nc", "o", []); } }`
    const sibling = `string got = ""; default { dataserver(key id, string d) { got = d; } }`
    const { scripts } = await loadLinkset({
      prims: [
        {
          inventory: [notecard('nc', LINES)],
          scripts: [
            { source: { source: requester, filename: 'req.lsl' }, name: 'req' },
            { source: { source: sibling, filename: 'sib.lsl' }, name: 'sib' },
          ],
        },
      ],
    })
    scripts['sib']!.start()
    scripts['req']!.start()
    scripts['req']!.advanceTime(1000)
    expect(scripts['sib']!.global('got')).toBe('4')
  })
})
