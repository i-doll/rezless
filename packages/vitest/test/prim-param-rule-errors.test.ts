import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

// Two grids, which disagree. "In-world" results are from the Aditi beta
// grid, region SLua Tideland, 2026-11-14: a probe set its name to "probe"
// and its description to "start", ran one llSetPrimitiveParams call, and
// said the name, description and affected values. A second object listened
// on DEBUG_CHANNEL and repeated what it heard, and a listener worn by the
// avatar listened too. Both heard the llDialog error used as a control;
// neither heard anything for any rule here.
//
// "Main grid" results are from the main-grid probes of 2026-10-29: a bad
// rule said `llSetPrimitiveParams error running rule #1 (PRIM_SIZE): arg #1
// vector expected but string given.`, `... rule #1: unknown rule.` or
// `... rule #1 (PRIM_GLOW): bounds error; 5 is not in (0, 1).`, and ended
// the call, PRIM_GLOW 5 included.
//
// rezless follows the main grid where it was measured: it says those
// errors, in the same form for the other wrong types, and PRIM_GLOW out of
// range ends the call. Everything else follows Aditi. The Aditi results
// that differ are kept below as it.fails.

const K = '5748decc-f629-461c-9a36-a35a221fe21f'

async function lsl(rules: string) {
  const s = await loadScript({
    source: `
      list out;
      default {
        state_entry() {
          llSetPrimitiveParams([PRIM_NAME, "probe", PRIM_DESC, "start", PRIM_GLOW, ALL_SIDES, 0.25]);
          llSetPrimitiveParams(${rules});
          out = [llGetObjectName(), llGetObjectDesc()] + llGetPrimitiveParams([PRIM_GLOW, 0]);
        }
      }
    `,
    filename: 'rules.lsl',
  })
  s.start()
  return s
}

async function slua(rules: string) {
  const s = await loadScript({
    source: `
      ll.SetPrimitiveParams({PRIM_NAME, "probe", PRIM_DESC, "start"})
      local U = touuid("${K}")
      local ok = pcall(function() ll.SetPrimitiveParams(${rules}) end)
      ll.Say(7, tostring(ok) .. "|" .. ll.GetObjectName() .. "|" .. ll.GetObjectDesc())
    `,
    language: 'slua',
    filename: 'rules.luau',
  })
  s.start()
  return s
}

const debugChat = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }) =>
  s.chat.filter((c) => c.channel === 0x7fffffff)

const say = (rest: string) => `llSetPrimitiveParams error running rule #2${rest}.`

describe('a set rule that cannot run ends the call', () => {
  // In-world (LSL): each list left the name "before" and the description
  // "start", so the rule before the bad one applied and nothing after it did.
  // The string glow and the integer normal map were measured from glow 0.25.
  // Main grid: the error said for each wrong type (only PRIM_SIZE "big" and
  // an unknown rule were measured there). Nothing is said for a bad link
  // target, which neither grid's probes heard an error for.
  it.each([
    ['an unknown rule', '999999, "x"', say(': unknown rule')],
    ['a rule given as a float', '7.0, <0.6, 0.6, 0.6>', say(': unknown rule')],
    ['a rule given as a string', '"7", <0.6, 0.6, 0.6>', say(': unknown rule')],
    ['a string for a vector', 'PRIM_SIZE, "big"', say(' (PRIM_SIZE): arg #1 vector expected but string given')],
    ['an integer for a vector', 'PRIM_SIZE, 3', say(' (PRIM_SIZE): arg #1 vector expected but integer given')],
    ['a string for a colour', 'PRIM_COLOR, 0, "red", 1.0', say(' (PRIM_COLOR): arg #2 vector expected but string given')],
    ['a float for an integer', 'PRIM_MATERIAL, 1.5', say(' (PRIM_MATERIAL): arg #1 integer expected but float given')],
    ['a whole float for an integer', 'PRIM_MATERIAL, 4.0', say(' (PRIM_MATERIAL): arg #1 integer expected but float given')],
    ['a float for an on/off value', 'PRIM_PHANTOM, 1.0', say(' (PRIM_PHANTOM): arg #1 integer expected but float given')],
    ['a string for a face', 'PRIM_FULLBRIGHT, "0", TRUE', say(' (PRIM_FULLBRIGHT): arg #1 integer expected but string given')],
    ['a float for a face', 'PRIM_GLOW, 1.5, 0.5', say(' (PRIM_GLOW): arg #1 integer expected but float given')],
    ['a string for a float', 'PRIM_GLOW, ALL_SIDES, "0.5"', say(' (PRIM_GLOW): arg #2 float expected but string given')],
    ['an integer for a key', 'PRIM_NORMAL, 0, 5, <1, 1, 0>, ZERO_VECTOR, 0.0', say(' (PRIM_NORMAL): arg #2 key expected but integer given')],
    ['a string link target', 'PRIM_LINK_TARGET, "x"', null],
    ['a float link target', 'PRIM_LINK_TARGET, 1.0', null],
  ])('%s', async (_label, bad, error) => {
    const s = await lsl(`[PRIM_NAME, "before", ${bad}, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', 'start', 0.25])
    expect(debugChat(s).map((c) => c.text)).toEqual(error === null ? [] : [error])
  })

  // In-world (LSL): [PRIM_NAME, "before", PRIM_GLOW], [.., PRIM_SIZE] and
  // [.., PRIM_GLOW, ALL_SIDES] set the name and left the glow at 0.25. The
  // main grid's probes had no cut-short list, so nothing is said.
  it.each([['PRIM_GLOW'], ['PRIM_SIZE'], ['PRIM_GLOW, ALL_SIDES']])('a list cut short after %s', async (tail) => {
    const s = await lsl(`[PRIM_NAME, "before", ${tail}]`)
    expect(s.global('out')).toEqual(['before', 'start', 0.25])
    expect(s.host.params.size).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
    expect(debugChat(s)).toEqual([])
  })

  // In-world: the same through llSetLinkPrimitiveParamsFast.
  it('llSetLinkPrimitiveParamsFast ends the call the same way', async () => {
    const s = await loadScript({
      source: `default { state_entry() { llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_NAME, "a", PRIM_COLOR, 0, "red", 1.0, PRIM_DESC, "after"]); } }`,
    })
    s.start()
    expect(s.host.name).toBe('a')
    expect(s.host.description).toBe('')
  })
})

describe('values a set rule accepts in place of its own type', () => {
  // In-world: [PRIM_GLOW, ALL_SIDES, 1] set the glow to 1.0, and
  // [PRIM_TEXT, "t", <1,0,0>, 1] set the text; both went on to the next rule.
  it('an integer where a float is wanted', async () => {
    const s = await lsl(`[PRIM_NAME, "before", PRIM_GLOW, ALL_SIDES, 1, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', 'after', 1])
  })

  it('an integer text alpha', async () => {
    const s = await lsl(`[PRIM_TEXT, "t", <1, 0, 0>, 1, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['probe', 'after', 0.25])
    expect(s.host.appearance.text).toEqual({ text: 't', color: { x: 1, y: 0, z: 0 }, alpha: 1 })
  })

  // In-world: PRIM_RENDER_MATERIAL, 0 with NULL_KEY as a key or a string, and
  // PRIM_NORMAL, 0 with TEXTURE_BLANK either way, went on to the next rule.
  it.each([
    ['PRIM_RENDER_MATERIAL, 0, (key)NULL_KEY'],
    ['PRIM_RENDER_MATERIAL, 0, NULL_KEY'],
    ['PRIM_NORMAL, 0, TEXTURE_BLANK, <1, 1, 0>, ZERO_VECTOR, 0.0'],
    ['PRIM_NORMAL, 0, (key)TEXTURE_BLANK, <1, 1, 0>, ZERO_VECTOR, 0.0'],
  ])('a string or a key for a material or map: %s', async (rule) => {
    const s = await lsl(`[PRIM_NAME, "before", ${rule}, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', 'after', 0.25])
  })

  // In-world: PRIM_TEXTURE with the key as a string, and as a key, set face 0's texture to it.
  it.each([[`"${K}"`], [`(key)"${K}"`]])('a string or a key for a texture: %s', async (texture) => {
    const s = await loadScript({
      source: `
        string tex;
        default {
          state_entry() {
            llSetPrimitiveParams([PRIM_TEXTURE, 0, ${texture}, <1, 1, 0>, ZERO_VECTOR, 0.0, PRIM_DESC, "after"]);
            tex = llList2String(llGetPrimitiveParams([PRIM_TEXTURE, 0]), 0);
          }
        }
      `,
    })
    s.start()
    expect(s.global('tex')).toBe(K)
    expect(s.host.description).toBe('after')
  })
})

describe('PRIM_NAME and PRIM_DESC take only a string', () => {
  // In-world (LSL): [PRIM_DESC, v, PRIM_NAME, "after"] with a key, 5, 1.5,
  // <1,2,3> or ZERO_ROTATION left the description "start" and the name
  // unchanged; [PRIM_NAME, v, PRIM_DESC, "after"] the same way round.
  it.each([[`(key)"${K}"`], ['5'], ['1.5'], ['<1, 2, 3>'], ['ZERO_ROTATION']])('PRIM_DESC with %s', async (v) => {
    const s = await lsl(`[PRIM_DESC, ${v}, PRIM_NAME, "after"]`)
    expect(s.global('out')).toEqual(['probe', 'start', 0.25])
  })

  it.each([[`(key)"${K}"`], ['5'], ['1.5'], ['<1, 2, 3>']])('PRIM_NAME with %s', async (v) => {
    const s = await lsl(`[PRIM_NAME, ${v}, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['probe', 'start', 0.25])
  })

  // In-world: PRIM_PROJECTOR with (key)TEXTURE_BLANK left the description
  // "start"; with TEXTURE_BLANK as a string it went on to the next rule.
  it.each([['(key)TEXTURE_BLANK', 'start'], ['TEXTURE_BLANK', 'after']])('PRIM_PROJECTOR with %s', async (texture, desc) => {
    const s = await lsl(`[PRIM_NAME, "before", PRIM_PROJECTOR, ${texture}, 1.0, 0.0, 0.0, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', desc, 0.25])
  })

  // In-world: [PRIM_NAME, "before", PRIM_TEXT, key, <1,1,1>, 1.0, PRIM_DESC, "after"] left the text empty and the description "start".
  it('PRIM_TEXT with a key stops the same way', async () => {
    const s = await lsl(`[PRIM_NAME, "before", PRIM_TEXT, (key)"${K}", <1, 1, 1>, 1.0, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', 'start', 0.25])
    expect(s.host.appearance.text).toBeNull()
  })

  // In-world: [PRIM_DESC, (string)key] set the description to the key's text.
  it('a key cast to a string', async () => {
    const s = await lsl(`[PRIM_DESC, (string)((key)"${K}")]`)
    expect(s.global('out')).toEqual(['probe', K, 0.25])
  })

  // In-world (SLua): ll.SetPrimitiveParams with a uuid, 5, 1.5, a vector,
  // true or a quaternion for PRIM_DESC, and a uuid, 5 or true for PRIM_NAME,
  // raised no Lua error and left both as they were; llcompat the same.
  it.each([['U'], ['5'], ['1.5'], ['vector(1, 2, 3)'], ['true'], ['quaternion(0, 0, 0, 1)']])(
    'll.SetPrimitiveParams PRIM_DESC with %s',
    async (v) => {
      const s = await slua(`{PRIM_DESC, ${v}, PRIM_NAME, "after"}`)
      expect(s.chat.filter((c) => c.channel === 7).map((c) => c.text)).toEqual(['true|probe|start'])
    },
  )

  it.each([['U'], ['5'], ['true']])('ll.SetPrimitiveParams PRIM_NAME with %s', async (v) => {
    const s = await slua(`{PRIM_NAME, ${v}, PRIM_DESC, "after"}`)
    expect(s.chat.filter((c) => c.channel === 7).map((c) => c.text)).toEqual(['true|probe|start'])
  })
})

describe('a value out of range', () => {
  // Main grid: PRIM_GLOW 5 said the bounds error and ended the call. The
  // same is done for -1 and 1.5, which only Aditi's probes tried. 1.0 sets
  // the glow on both grids.
  it.each([['5.0', '5'], ['-1.0', '-1'], ['1.5', '1.5']])('PRIM_GLOW %s ends the call', async (glow, shown) => {
    const s = await lsl(`[PRIM_NAME, "before", PRIM_GLOW, ALL_SIDES, ${glow}, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', 'start', 0.25])
    expect(debugChat(s).map((c) => c.text)).toEqual([say(` (PRIM_GLOW): bounds error; ${shown} is not in (0, 1)`)])
  })

  it('PRIM_GLOW 1.0 sets the glow', async () => {
    const s = await lsl(`[PRIM_NAME, "before", PRIM_GLOW, ALL_SIDES, 1.0, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', 'after', 1])
  })

  // In-world: PRIM_MATERIAL 99, -1 and 8 left the material as it was, from
  // wood (3) and again from glass (2); 6 and 7 set it. Each went on to the
  // description that followed.
  it.each([
    [99, 3, 3], [-1, 3, 3], [8, 3, 3], [6, 3, 6], [7, 3, 7],
    [99, 2, 2], [-1, 2, 2], [8, 2, 2],
  ])('PRIM_MATERIAL %i from %i', async (material, start, expected) => {
    const s = await loadScript({
      source: `
        list out;
        default { state_entry() { llSetPrimitiveParams([PRIM_MATERIAL, ${start}]); llSetPrimitiveParams([PRIM_MATERIAL, ${material}, PRIM_DESC, "after"]); out = llGetPrimitiveParams([PRIM_MATERIAL, PRIM_DESC]); } }
      `,
    })
    s.start()
    expect(s.global('out')).toEqual([expected, 'after'])
  })

  // In-world: [PRIM_FULLBRIGHT, ALL_SIDES, 2] left full bright off when it
  // was off, and 2 and -1 left it on when it was on; each set the
  // description that followed.
  it.each([[2, 0], [2, 1], [-1, 1]])('PRIM_FULLBRIGHT %i from %i', async (value, start) => {
    const s = await loadScript({
      source: `
        list out;
        default { state_entry() { llSetPrimitiveParams([PRIM_FULLBRIGHT, ALL_SIDES, ${start}]); llSetPrimitiveParams([PRIM_FULLBRIGHT, ALL_SIDES, ${value}, PRIM_DESC, "after"]); out = llGetPrimitiveParams([PRIM_FULLBRIGHT, 0, PRIM_DESC]); } }
      `,
    })
    s.start()
    expect(s.global('out')).toEqual([start, 'after'])
  })
})

describe('measured on Aditi, where the grids disagree', () => {
  // In-world: none of these said anything a script could hear. The main grid
  // said the error, which rezless does.
  it.fails.each([['999999, "x"'], ['PRIM_SIZE, "big"'], ['PRIM_GLOW, ALL_SIDES, 5.0']])('[%s] says nothing', async (bad) => {
    const s = await lsl(`[PRIM_NAME, "before", ${bad}, PRIM_DESC, "after"]`)
    expect(debugChat(s)).toEqual([])
  })

  // In-world: [PRIM_GLOW, ALL_SIDES, 5.0], -1.0 and 1.5 left the glow at 0.25
  // and set the description that followed, also through
  // llSetLinkPrimitiveParamsFast(LINK_THIS, ...). The main grid ended the call.
  it.fails.each([['5.0'], ['-1.0'], ['1.5']])('PRIM_GLOW %s skips only its rule', async (glow) => {
    const s = await lsl(`[PRIM_NAME, "before", PRIM_GLOW, ALL_SIDES, ${glow}, PRIM_DESC, "after"]`)
    expect(s.global('out')).toEqual(['before', 'after', 0.25])
  })

  // In-world: a bad rule on a seated avatar's link ([999999, "x"],
  // [PRIM_POS_LOCAL, "bad"], [PRIM_GLOW, ALL_SIDES, 5.0], [PRIM_SIZE, "big"],
  // [PRIM_DESC, 5]) or on LINK_SET said nothing either. Who says it on the
  // main grid was not measured; rezless has the calling prim say it.
  it.fails('llSetLinkPrimitiveParamsFast says nothing', async () => {
    const s = await loadScript({
      source: `default { state_entry() { llSetLinkPrimitiveParamsFast(LINK_THIS, [999999, "x"]); } }`,
    })
    s.start()
    expect(debugChat(s)).toEqual([])
  })
})

describe('a get rule that cannot be read ends the result', () => {
  // In-world: llGetPrimitiveParams on a box described "D", each list ending in PRIM_DESC.
  async function get(rules: string) {
    const s = await loadScript({
      source: `list out; default { state_entry() { llSetObjectDesc("D"); out = llGetPrimitiveParams(${rules}); } }`,
    })
    s.start()
    return s.global('out')
  }

  // In-world: each of these returned an empty list.
  it.each([
    ['a float face', '[PRIM_FULLBRIGHT, 1.5, PRIM_DESC]'],
    ['a whole float face', '[PRIM_TEXTURE, 0.0, PRIM_DESC]'],
    ['a string face', '[PRIM_TEXTURE, "x", PRIM_DESC]'],
    ['a string glow face', '[PRIM_GLOW, "0", PRIM_DESC]'],
    ['a float glow face', '[PRIM_GLOW, 1.5, PRIM_DESC]'],
    ['no face', '[PRIM_TEXTURE]'],
    ['a float rule', '[7.0, PRIM_DESC]'],
    ['a string rule', '["7", PRIM_DESC]'],
    ['an unknown rule', '[999999, PRIM_DESC]'],
    ['a string link target', '[PRIM_LINK_TARGET, "x", PRIM_DESC]'],
    ['a float link target', '[PRIM_LINK_TARGET, 1.0, PRIM_DESC]'],
  ])('%s', async (_label, rules) => {
    expect(await get(rules)).toEqual([])
  })

  // In-world: a face the box doesn't have reads nothing for that rule, and the rest of the list is read.
  it.each([['[PRIM_FULLBRIGHT, 99, PRIM_DESC]'], ['[PRIM_GLOW, 6, PRIM_DESC]']])('a face out of range: %s', async (rules) => {
    expect(await get(rules)).toEqual(['D'])
  })
})
