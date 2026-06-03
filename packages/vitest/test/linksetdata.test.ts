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

  it('ListKeys returns keys in insertion order; FindKeys regex-filters', async () => {
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
    expect(s.global('all')).toEqual(['foo1', 'bar', 'foo2'])
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

  it('linkset_data MULTIDELETE event delivers a CSV of deleted keys in name and empty value (SL parity)', async () => {
    const s = await load(`
      integer act = -1;
      string seenName = "?";
      string seenValue = "?";
      default {
        state_entry() {
          llLinksetDataWrite("k1", "v1");
          llLinksetDataWrite("k2", "v2");
          llLinksetDataWrite("k3", "v3");
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
    expect(s.global('seenName')).toBe('k1,k2,k3')
    expect(s.global('seenValue')).toBe('')
  })
})
