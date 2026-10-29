import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

/**
 * The LSL definitions store LSL escape sequences as literal text (e.g. `\n` is
 * the two characters backslash + 'n', and `\u{FDD2}` for the JSON_* type
 * tags). The codegen has to interpret both before producing TS string
 * literals — otherwise constants
 * that scripts depend on (notably EOF, NAK, JSON_OBJECT, JSON_ARRAY) end
 * up as the wrong characters.
 */
describe('string-constant decoding', () => {
  it('EOF is three actual newlines, not the literal text \\n\\n\\n', async () => {
    const s = await run(`
      string captured = "";
      integer len = 0;
      default {
        state_entry() {
          captured = EOF;
          len = llStringLength(EOF);
        }
      }
    `)
    expect(s.global('captured')).toBe('\n\n\n')
    expect(s.global('len')).toBe(3)
  })

  it('NAK is newline + U+0015 + newline (LSL \\xHH escape)', async () => {
    const s = await run(`
      string captured = "";
      integer len = 0;
      default {
        state_entry() {
          captured = NAK;
          len = llStringLength(NAK);
        }
      }
    `)
    expect(s.global('captured')).toBe('\n\u0015\n')
    expect(s.global('len')).toBe(3)
  })

  it('JSON_* constants decode their numeric character references to one Unicode char', async () => {
    const s = await run(`
      string a = "";
      string o = "";
      integer la = 0;
      integer lo = 0;
      default {
        state_entry() {
          a = JSON_ARRAY;
          o = JSON_OBJECT;
          la = llStringLength(JSON_ARRAY);
          lo = llStringLength(JSON_OBJECT);
        }
      }
    `)
    expect(s.global('a')).toBe('﷒')
    expect(s.global('o')).toBe('﷑')
    expect(s.global('la')).toBe(1)
    expect(s.global('lo')).toBe(1)
  })
})
