import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function load(source: string) {
  return loadScript({ source })
}

describe('Linkset Data', () => {
  it('write / read round-trips and returns LINKSETDATA_OK', async () => {
    const s = await load(`
      integer rc = -1;
      string got = "";
      default {
        state_entry() {
          rc = llLinksetDataWrite("k", "v");
          got = llLinksetDataRead("k");
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(0)
    expect(s.global('got')).toBe('v')
    expect(s.linksetData.get('k')).toMatchObject({ value: 'v', password: '' })
  })

  it('re-writing the same value returns LINKSETDATA_NOUPDATE and does not fire event', async () => {
    const s = await load(`
      integer events = 0;
      integer rc = -1;
      default {
        state_entry() {
          llLinksetDataWrite("k", "v");
          rc = llLinksetDataWrite("k", "v");
        }
        linkset_data(integer action, string name, string value) {
          events = events + 1;
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(5)
    expect(s.global('events')).toBe(1)
  })

  it('write fires linkset_data with action UPDATE for the writing script', async () => {
    const s = await load(`
      integer act = -1;
      string seenKey = "";
      default {
        state_entry() {
          llLinksetDataWrite("hello", "world");
        }
        linkset_data(integer action, string name, string value) {
          act = action;
          seenKey = name;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(1)
    expect(s.global('seenKey')).toBe('hello')
  })

  it('delete fires DELETE; subsequent read returns ""', async () => {
    const s = await load(`
      integer act = -1;
      string after = "x";
      default {
        state_entry() {
          llLinksetDataWrite("k", "v");
          llLinksetDataDelete("k");
          after = llLinksetDataRead("k");
        }
        linkset_data(integer action, string name, string value) {
          act = action;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(2)
    expect(s.global('after')).toBe('')
  })

  it('protected: read with correct password works, plain read and wrong password return ""', async () => {
    const s = await load(`
      string a = "x";
      string b = "x";
      string c = "x";
      default {
        state_entry() {
          llLinksetDataWriteProtected("k", "v", "pw");
          a = llLinksetDataRead("k");
          b = llLinksetDataReadProtected("k", "pw");
          c = llLinksetDataReadProtected("k", "wrong");
        }
      }
    `)
    s.start()
    expect(s.global('a')).toBe('')
    expect(s.global('b')).toBe('v')
    expect(s.global('c')).toBe('')
  })

  it('ReadProtected on an unprotected entry returns "" when called with a non-empty password (SL parity)', async () => {
    const s = await load(`
      string got = "?";
      default {
        state_entry() {
          llLinksetDataWrite("k", "v");
          got = llLinksetDataReadProtected("k", "any-password");
        }
      }
    `)
    s.start()
    // Strict partition: a non-empty-password Protected accessor only sees
    // protected entries, so an unprotected entry is invisible and returns "".
    expect(s.global('got')).toBe('')
  })

  it('WriteProtected onto an unprotected entry returns EPROTECTED and preserves the value (SL parity)', async () => {
    const s = await load(`
      integer rc = -1;
      string after = "?";
      default {
        state_entry() {
          llLinksetDataWrite("k", "unprot-val");
          rc = llLinksetDataWriteProtected("k", "overwrite", "pw");
          after = llLinksetDataRead("k");
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(3) // LINKSETDATA_EPROTECTED
    expect(s.global('after')).toBe('unprot-val')
    expect(s.linksetData.get('k')).toMatchObject({ value: 'unprot-val', password: '' })
  })

  it('DeleteProtected of an unprotected entry returns EPROTECTED and preserves it (SL parity)', async () => {
    const s = await load(`
      integer rc = -1;
      string after = "?";
      default {
        state_entry() {
          llLinksetDataWrite("k", "unprot-val");
          rc = llLinksetDataDeleteProtected("k", "pw");
          after = llLinksetDataRead("k");
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(3) // LINKSETDATA_EPROTECTED
    expect(s.global('after')).toBe('unprot-val')
  })

  it('DeleteFound with a password against an unprotected entry returns [0, 1] and preserves it (SL parity)', async () => {
    const s = await load(`
      list result = [];
      string after = "?";
      default {
        state_entry() {
          llLinksetDataWrite("k", "unprot-val");
          result = llLinksetDataDeleteFound("^k$", "pw");
          after = llLinksetDataRead("k");
        }
      }
    `)
    s.start()
    // Probe row [4]: cross-partition entries land in the notDeleted bucket.
    expect(s.global('result')).toEqual([0, 1])
    expect(s.global('after')).toBe('unprot-val')
  })

  it('DeleteFound with no password against a protected entry returns [0, 1] and preserves it (SL parity)', async () => {
    const s = await load(`
      list result = [];
      string after = "?";
      default {
        state_entry() {
          llLinksetDataWriteProtected("k", "prot-val", "pw");
          result = llLinksetDataDeleteFound("^k$", "");
          after = llLinksetDataReadProtected("k", "pw");
        }
      }
    `)
    s.start()
    // Probe row [5]: symmetric — unprotected accessor on a protected entry
    // also lands in notDeleted.
    expect(s.global('result')).toEqual([0, 1])
    expect(s.global('after')).toBe('prot-val')
  })

  it('Delete on missing key returns NOTFOUND; on empty name returns ENOKEY', async () => {
    const s = await load(`
      integer rcMissing = -1;
      integer rcEmpty = -1;
      integer rcMissingP = -1;
      integer rcEmptyP = -1;
      default {
        state_entry() {
          rcMissing  = llLinksetDataDelete("nope");
          rcEmpty    = llLinksetDataDelete("");
          rcMissingP = llLinksetDataDeleteProtected("nope", "pw");
          rcEmptyP   = llLinksetDataDeleteProtected("", "pw");
        }
      }
    `)
    s.start()
    expect(s.global('rcMissing')).toBe(4)
    expect(s.global('rcEmpty')).toBe(2)
    expect(s.global('rcMissingP')).toBe(4)
    expect(s.global('rcEmptyP')).toBe(2)
  })

  it('write with empty key name returns LINKSETDATA_ENOKEY', async () => {
    const s = await load(`
      integer rcW = -1;
      integer rcP = -1;
      default {
        state_entry() {
          rcW = llLinksetDataWrite("", "v");
          rcP = llLinksetDataWriteProtected("", "v", "pw");
        }
      }
    `)
    s.start()
    expect(s.global('rcW')).toBe(2)
    expect(s.global('rcP')).toBe(2)
    expect(s.linksetData.size).toBe(0)
  })

  it('empty-value write to a missing key returns LINKSETDATA_NOTFOUND', async () => {
    const s = await load(`
      integer rc = -1;
      integer events = 0;
      default {
        state_entry() {
          rc = llLinksetDataWrite("missing", "");
        }
        linkset_data(integer action, string name, string value) {
          events = events + 1;
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(4)
    expect(s.global('events')).toBe(0)
  })

  it('plain write over a protected key returns EPROTECTED', async () => {
    const s = await load(`
      integer rc = -1;
      default {
        state_entry() {
          llLinksetDataWriteProtected("k", "v", "pw");
          rc = llLinksetDataWrite("k", "other");
        }
      }
    `)
    s.start()
    expect(s.global('rc')).toBe(3)
    expect(s.linksetData.get('k')?.value).toBe('v')
  })

  it('Reset clears all keys and fires RESET', async () => {
    const s = await load(`
      integer act = -1;
      integer countAfter = -1;
      default {
        state_entry() {
          llLinksetDataWrite("a", "1");
          llLinksetDataWrite("b", "2");
          llLinksetDataReset();
          countAfter = llLinksetDataCountKeys();
        }
        linkset_data(integer action, string name, string value) {
          if (action == 0) act = action;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(0)
    expect(s.global('countAfter')).toBe(0)
    expect(s.linksetData.size).toBe(0)
  })

  it('ListKeys and FindKeys return keys in alphabetical order (SL parity)', async () => {
    const s = await load(`
      list all = [];
      list found = [];
      default {
        state_entry() {
          llLinksetDataWrite("foo1", "a");
          llLinksetDataWrite("bar",  "b");
          llLinksetDataWrite("foo2", "c");
          all = llLinksetDataListKeys(0, -1);
          found = llLinksetDataFindKeys("^foo", 0, -1);
        }
      }
    `)
    s.start()
    expect(s.global('all')).toEqual(['bar', 'foo1', 'foo2'])
    expect(s.global('found')).toEqual(['foo1', 'foo2'])
  })

  it('LSD persists across llResetScript', async () => {
    const s = await load(`
      string got = "";
      default {
        state_entry() {
          if (llLinksetDataRead("seed") == "") {
            llLinksetDataWrite("seed", "kept");
            llResetScript();
          }
          got = llLinksetDataRead("seed");
        }
      }
    `)
    s.start()
    expect(s.global('got')).toBe('kept')
  })

  it('CountFound counts pattern matches', async () => {
    const s = await load(`
      integer n = -1;
      default {
        state_entry() {
          llLinksetDataWrite("a1", "x");
          llLinksetDataWrite("a2", "x");
          llLinksetDataWrite("b1", "x");
          n = llLinksetDataCountFound("^a");
        }
      }
    `)
    s.start()
    expect(s.global('n')).toBe(2)
  })

  it('linkset_data UPDATE event for an unprotected write carries the value (SL parity)', async () => {
    const s = await load(`
      integer act = -1;
      string seenName = "?";
      string seenValue = "?";
      default {
        state_entry() {
          llLinksetDataWrite("k", "the-value");
        }
        linkset_data(integer action, string name, string value) {
          act = action;
          seenName = name;
          seenValue = value;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(1) // LINKSETDATA_UPDATE
    expect(s.global('seenName')).toBe('k')
    expect(s.global('seenValue')).toBe('the-value')
  })

  it('linkset_data UPDATE event for a protected write blanks the value (SL parity, regression guard)', async () => {
    const s = await load(`
      integer act = -1;
      string seenValue = "?";
      default {
        state_entry() {
          llLinksetDataWriteProtected("k", "the-value", "pw");
        }
        linkset_data(integer action, string name, string value) {
          act = action;
          seenValue = value;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(1) // LINKSETDATA_UPDATE
    expect(s.global('seenValue')).toBe('')
  })

  it('linkset_data UPDATE event for an empty-password WriteProtected call carries the value (SL parity)', async () => {
    const s = await load(`
      integer act = -1;
      string seenName = "?";
      string seenValue = "?";
      default {
        state_entry() {
          // In real SL, WriteProtected with an empty password is effectively
          // an unprotected write: it creates an unprotected entry and fires
          // an UPDATE event that carries the value (probe-verified, PR #45).
          llLinksetDataWriteProtected("k", "the-value", "");
        }
        linkset_data(integer action, string name, string value) {
          act = action;
          seenName = name;
          seenValue = value;
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(1) // LINKSETDATA_UPDATE
    expect(s.global('seenName')).toBe('k')
    expect(s.global('seenValue')).toBe('the-value')
    expect(s.linksetData.get('k')).toMatchObject({ value: 'the-value', password: '' })
  })

  it('linkset_data MULTIDELETE event delivers deleted keys lex-sorted in name with empty value (SL parity)', async () => {
    const s = await load(`
      integer act = -1;
      string seenName = "?";
      string seenValue = "?";
      default {
        state_entry() {
          // Deliberately insert out of lex order — SL emits MULTIDELETE.name
          // in ASCII-lex order, not insertion order (probe-confirmed for PR #45).
          llLinksetDataWrite("kc", "v1");
          llLinksetDataWrite("ka", "v2");
          llLinksetDataWrite("kb", "v3");
          llLinksetDataDeleteFound("^k", "");
        }
        linkset_data(integer action, string name, string value) {
          if (action == 3) { // LINKSETDATA_MULTIDELETE
            act = action;
            seenName = name;
            seenValue = value;
          }
        }
      }
    `)
    s.start()
    expect(s.global('act')).toBe(3) // LINKSETDATA_MULTIDELETE
    expect(s.global('seenName')).toBe('ka,kb,kc')
    expect(s.global('seenValue')).toBe('')
  })

  it('ListKeys / FindKeys with count < 1 return all remaining keys (SL parity)', async () => {
    const s = await load(`
      list a = [];
      list b = [];
      list c = [];
      default {
        state_entry() {
          llLinksetDataWrite("k1", "v");
          llLinksetDataWrite("k2", "v");
          llLinksetDataWrite("k3", "v");
          a = llLinksetDataListKeys(0, 0);
          b = llLinksetDataListKeys(1, -1);
          c = llLinksetDataFindKeys("k", 1, 0);
        }
      }
    `)
    s.start()
    expect(s.global('a')).toEqual(['k1', 'k2', 'k3'])
    expect(s.global('b')).toEqual(['k2', 'k3'])
    expect(s.global('c')).toEqual(['k2', 'k3'])
  })

  it('llLinksetDataAvailable counts UTF-8 bytes, plus 32 for a protected pair (SL parity)', async () => {
    const s = await load(`
      integer plain = 0;
      integer utf8 = 0;
      integer prot = 0;
      default {
        state_entry() {
          integer full = llLinksetDataAvailable();
          llLinksetDataWrite("k", "v");
          plain = full - llLinksetDataAvailable();
          llLinksetDataReset();
          llLinksetDataWrite("k", "é");
          utf8 = full - llLinksetDataAvailable();
          llLinksetDataReset();
          llLinksetDataWriteProtected("k", "v", "pw");
          prot = full - llLinksetDataAvailable();
        }
      }
    `)
    s.start()
    expect(s.global('plain')).toBe(2)
    expect(s.global('utf8')).toBe(3)
    expect(s.global('prot')).toBe(34)
  })

  it('a write past the 131072-byte store returns LINKSETDATA_EMEMORY and writes nothing (SL parity)', async () => {
    const s = await load(`
      integer ok = 0;
      integer failRc = -1;
      integer failedAt = -1;
      integer avail = -1;
      default {
        state_entry() {
          string big = "";
          integer i;
          for (i = 0; i < 1000; i++) big += "x";
          for (i = 0; i < 200 && failedAt < 0; i++) {
            integer rc = llLinksetDataWrite("k" + (string)i, big);
            if (rc == 0) ok++;
            else { failRc = rc; failedAt = i; }
          }
          avail = llLinksetDataAvailable();
        }
      }
    `)
    s.start()
    expect(s.global('ok')).toBe(130)
    expect(s.global('failedAt')).toBe(130)
    expect(s.global('failRc')).toBe(1)
    expect(s.global('avail')).toBe(662)
    expect(s.linksetData.has('k130')).toBe(false)
  })
})

const REGEX_KEYS = [
  'abc', 'ABC', 'a.b', 'axb', 'aab', 'a1', 'z9', 'é', 'word here', 'x y',
  'a    b', '(paren)', 'back\\slash', '[x]', 'aaa',
]

// In-world results from /tmp/rzprobe/regex.lsl (main grid, 2026-10-29).
const REGEX_CASES: Array<[string, string[]]> = [
  ['[[:digit:]]', ['a1', 'z9']],
  ['[[:alpha:]]+$', ['ABC', 'a    b', 'a.b', 'aaa', 'aab', 'abc', 'axb', 'back\\slash', 'word here', 'x y']],
  ['[[:space:]]', ['a    b', 'word here', 'x y']],
  ['\\h', ['a    b', 'word here', 'x y']],
  ['(?i)abc', ['ABC', 'abc']],
  ['(?i:abc)', []],
  ['a(?=b)', []],
  ['(?<=a)b', []],
  ['(?<=x)b', []],
  ['(a)\\1', []],
  ['(?<n>a)\\k<n>', []],
  ['a++b', []],
  ['(?>a+)b', []],
  ['\\Qa.b\\E', ['a.b']],
  ['\\x41', ['ABC']],
  ['\\x{41}', ['ABC']],
  ['\\u0041', []],
  ['\\Aabc\\z', ['abc']],
  ['\\p{L}', REGEX_KEYS.filter((k) => /[a-z]/.test(k))],
  ['[[:upper:]]', ['ABC']],
  ['', []],
  ['|', []],
  ['^\\w$', []],
  ['\\w+$', REGEX_KEYS.filter((k) => !['(paren)', '[x]', 'é'].includes(k))],
  ['(', []],
  ['[a', []],
  ['a{2,1}', []],
  ['*a', []],
  ['\\', []],
]

const REGEX_KEYS_2 = [...REGEX_KEYS, ']x', 'a]']
const lower = REGEX_KEYS_2.filter((k) => /[a-z]/.test(k))
const notOnlyLower = REGEX_KEYS_2.filter((k) => /[^a-z]/.test(k))
const withA = REGEX_KEYS_2.filter((k) => k.includes('a'))
const withX = ['[x]', ']x', 'axb', 'x y']

// Second in-world probe, same grid, 2026-10-30.
const REGEX_CASES_2: Array<[string, string[]]> = [
  ['^[^a]', ['(paren)', 'ABC', '[x]', ']x', 'back\\slash', 'word here', 'x y', 'z9', 'é']],
  ['[]x]', ['[x]', ']x', 'a]', 'axb', 'x y']],
  ['^[]x]', [']x', 'x y']],
  ['[^]a]', REGEX_KEYS_2.filter((k) => !['aaa', 'a]'].includes(k))],
  ['[[=a=]]', [...withA, 'ABC']],
  ['[[.a.]]', withA],
  ['[\\d]', ['a1', 'z9']],
  ['[\\]]', []],
  ['[a\\-z]', REGEX_KEYS_2.filter((k) => /[a\\-z]/.test(k))],
  ['\\pL', lower],
  ['\\PL', notOnlyLower],
  ['\\p{L', []],
  ['\\pZ', []],
  ['a|z9', [...withA, 'z9']],
  ['^(abc|ABC)$', ['ABC', 'abc']],
  ['a{2,3}', ['aaa', 'aab']],
  ['a{2,}', ['aaa', 'aab']],
  ['^a{1,2}b', ['aab', 'abc']],
  ['x|', withX],
  ['|x', withX],
  ['a{3,2}', []],
  ['a{,2}', []],
  ['(ab)+', ['aab', 'abc']],
  ['((a))', withA],
  ['a)', []],
  ['[[:foo:]]', []],
  ['[[:digit:', []],
]

function lslString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

async function findKeys(keys: string[], pattern: string) {
  const s = await load(`
      list found = [];
      integer count = -1;
      default {
        state_entry() {
          list keys = [${keys.map(lslString).join(', ')}];
          integer i;
          for (i = 0; i < llGetListLength(keys); i++) llLinksetDataWrite(llList2String(keys, i), "v");
          found = llLinksetDataFindKeys(${lslString(pattern)}, 0, 100);
          count = llLinksetDataCountFound(${lslString(pattern)});
        }
      }
    `)
  s.start()
  return { found: [...(s.global('found') as string[])].sort(), count: s.global('count') }
}

describe('Linkset Data regex dialect (SL parity)', () => {
  it.each(REGEX_CASES)('/%s/', async (pattern, expected) => {
    const { found, count } = await findKeys(REGEX_KEYS, pattern)
    expect(found).toEqual([...expected].sort())
    expect(count).toBe(expected.length)
  })

  it.each([
    ['a\\|', ['a|b']],
    ['(\\()', ['(paren)']],
    ['(a|)b', ['aab', 'abc']],
  ])('/%s/ drops only real empty alternatives', async (pattern, expected) => {
    const { found } = await findKeys([...REGEX_KEYS, 'a|b'], pattern)
    expect(found).toEqual([...expected].sort())
  })

  it.each(REGEX_CASES_2)('/%s/ (second probe)', async (pattern, expected) => {
    const { found, count } = await findKeys(REGEX_KEYS_2, pattern)
    expect(found).toEqual([...new Set(expected)].sort())
    expect(count).toBe(new Set(expected).size)
  })
})

describe('Linkset Data with non-ASCII keys (measured in-world)', () => {
  const KEYS = ['é', 'aé', '日本', 'x', 'É', '😀']

  async function probe(pattern: string) {
    const s = await load(`
      list all = [];
      list found = [];
      integer count = -1;
      default {
        state_entry() {
          list keys = [${KEYS.map(lslString).join(', ')}];
          integer i;
          for (i = 0; i < llGetListLength(keys); i++) llLinksetDataWrite(llList2String(keys, i), "v");
          all = llLinksetDataListKeys(0, -1);
          found = llLinksetDataFindKeys(${lslString(pattern)}, 0, 100);
          count = llLinksetDataCountFound(${lslString(pattern)});
        }
      }
    `)
    s.start()
    return s
  }

  it('ListKeys orders keys by their UTF-8 bytes', async () => {
    const s = await probe('x')
    expect(s.global('all')).toEqual(['aé', 'x', 'É', 'é', '日本', '😀'])
  })

  it.each([
    ['^.$', ['x']],
    ['^..$', ['É', 'é']],
    ['^...$', ['aé']],
    ['^....$', ['😀']],
    ['^.{2}$', ['É', 'é']],
    ['é', ['aé', 'é']],
    ['[é]', ['aé', 'É', 'é']],
    ['^[^x]$', []],
    ['^\\w$', ['x']],
    ['[[:alpha:]]', ['aé', 'x']],
    ['^\\W+$', ['É', 'é', '日本', '😀']],
    ['(?i)é', ['aé', 'é']],
    ['\\xE9', []],
    ['\\x{E9}', []],
    ['\\xC3\\xA9', ['aé', 'é']],
    ['\\xC3', ['aé', 'É', 'é']],
    ['^\\xE6\\x97\\xA5', ['日本']],
    ['\\xF0', ['😀']],
    ['\\x{C3}\\x{A9}', []],
    ['[\\x80-\\xFF]', ['x']],
    ['^[\\x00-\\x7F]+$', ['x']],
    ['[\\xC3][\\xA9]', []],
    ['日', ['日本']],
    ['[日本]', ['日本']],
    ['😀', ['😀']],
  ])('/%s/ matches UTF-8 bytes', async (pattern, expected) => {
    const s = await probe(pattern)
    expect(s.global('found')).toEqual(expected)
    expect(s.global('count')).toBe(expected.length)
  })

  it('DeleteFound matches UTF-8 bytes', async () => {
    const s = await load(`
      list res = [];
      default {
        state_entry() {
          llLinksetDataWrite("é", "v");
          llLinksetDataWrite("x", "v");
          res = llLinksetDataDeleteFound("^..$", "");
        }
      }
    `)
    s.start()
    expect(s.global('res')).toEqual([1, 0])
    expect([...s.linksetData.keys()]).toEqual(['x'])
  })
})
