import { describe, expect, it } from 'vitest'
import { loadLinkset, NULL_KEY } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetLinkName
// https://wiki.secondlife.com/wiki/LlGetLinkKey
// https://wiki.secondlife.com/wiki/LlGetLinkPrimitiveParams
// In-world: link 0 selects a lone prim; a linked root returns NULL_KEY for
// name/key and [] for params; children return root data, including through
// PRIM_LINK_TARGET, 0 (Aditi, SLua Tideland, 2026-11-01, Firestorm 7.3.0.83011).
const source = `
  integer myLink;
  string name0;
  key key0;
  list params0;
  list redirected0;
  default {
    state_entry() {
      myLink = llGetLinkNumber();
      name0 = llGetLinkName(0);
      key0 = llGetLinkKey(0);
      params0 = llGetLinkPrimitiveParams(0, [PRIM_NAME]);
      redirected0 = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, 0, PRIM_NAME]);
    }
  }
`

describe('link zero reads', () => {
  for (const count of [1, 2, 3]) {
    it(`resolves link 0 from every caller in a ${count}-prim object`, async () => {
      const { linkset, scripts } = await loadLinkset({
        prims: Array.from({ length: count }, (_, i) => ({
          name: i === 0 ? 'Root' : `Child ${i}`,
          scripts: [{ name: `p${i}`, source: { source, filename: 'link-zero.lsl' } }],
        })),
      })
      for (let i = 0; i < count; i++) {
        const script = scripts[`p${i}`]!
        script.start()
        const empty = count > 1 && i === 0
        expect(script.global('myLink')).toBe(count === 1 ? 0 : i + 1)
        expect(script.global('name0')).toBe(empty ? NULL_KEY : 'Root')
        expect(script.global('key0')).toBe(empty ? NULL_KEY : linkset.prims[0]!.key)
        expect(script.global('params0')).toEqual(empty ? [] : ['Root'])
        expect(script.global('redirected0')).toEqual(empty ? [] : ['Root'])
      }
    })
  }
})
