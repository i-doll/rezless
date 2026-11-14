import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'

// SHA-256 of the "<code point>:<lower>:<upper>" lines, in hex and in code point
// order, for every BMP code point that llToLower or llToUpper changes. Taken
// from the case tables rezless shipped up to 0.13.0, before they were
// regenerated from Unicode data, so a change to any mapping fails here.
const CASE_MAP_SHA256 = '916ff8dc71b282c3bb320ca7b604fbaa573cced1306ffec59ee653c60678cd73'

const lines = (said: string[]) => said.join('').split(';').filter(Boolean)
const digest = (rows: string[]) => createHash('sha256').update(rows.join('\n')).digest('hex')

describe('llToLower and llToUpper over the whole BMP', () => {
  it('map every code point the same way from LSL', async () => {
    const s = await loadScript({
      source: `
        default {
          state_entry() {
            string out;
            integer c;
            for (c = 1; c < 65536; ++c) {
              if (c < 0xD800 || c > 0xDFFF) {
                string ch = llChar(c);
                integer l = llOrd(llToLower(ch), 0);
                integer u = llOrd(llToUpper(ch), 0);
                if (l != c || u != c) {
                  out += (string)c + ":" + (string)l + ":" + (string)u + ";";
                  if (llStringLength(out) > 900) {
                    llOwnerSay(out);
                    out = "";
                  }
                }
              }
            }
            llOwnerSay(out);
          }
        }`,
    })
    s.start()
    const rows = lines(s.chat.map((c) => c.text))
    expect(rows.length).toBeGreaterThan(600)
    expect(digest(rows.map(hexRow))).toBe(CASE_MAP_SHA256)
  })

  it('map every code point the same way from SLua, through ll and llcompat', async () => {
    for (const lib of ['ll', 'llcompat']) {
      const s = await loadScript({
        language: 'slua',
        filename: 'case.luau',
        source: `
          local out = {}
          local n = 0
          for c = 1, 65535 do
            if c < 0xD800 or c > 0xDFFF then
              local ch = utf8.char(c)
              local l = utf8.codepoint(${lib}.ToLower(ch))
              local u = utf8.codepoint(${lib}.ToUpper(ch))
              if l ~= c or u ~= c then
                table.insert(out, c .. ":" .. l .. ":" .. u .. ";")
                n += 1
                if n == 40 then
                  ll.OwnerSay(table.concat(out))
                  out = {}
                  n = 0
                end
              end
            end
          end
          ll.OwnerSay(table.concat(out))
        `,
      })
      s.start()
      const rows = lines(s.chat.map((c) => c.text))
      expect(rows.length, lib).toBeGreaterThan(600)
      expect(digest(rows.map(hexRow)), lib).toBe(CASE_MAP_SHA256)
    }
  })
})

function hexRow(row: string) {
  return row
    .split(':')
    .map((n) => Number(n).toString(16))
    .join(':')
}
