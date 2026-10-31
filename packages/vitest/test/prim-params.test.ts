import { describe, it, expect } from 'vitest'
import { loadScript, loadLinkset, NULL_KEY, PRIM_SIZE, PRIM_TEXT, ZERO_ROTATION } from '../src/index.js'

describe('llSetPrimitiveParams + alt accessors (script-level)', () => {
  it('llSetPrimitiveParams + llGetPrimitiveParams round-trip a single prim', async () => {
    const src = `
      list out = [];
      default {
        state_entry() {
          llSetPrimitiveParams([PRIM_COLOR, ALL_SIDES, <1.0, 0.0, 0.0>, 0.5,
                                PRIM_POS_LOCAL, <1.0, 2.0, 3.0>,
                                PRIM_NAME, "primA",
                                PRIM_DESC, "descA"]);
          out = llGetPrimitiveParams([PRIM_COLOR, 0, PRIM_POS_LOCAL, PRIM_NAME, PRIM_DESC]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'a.lsl' })
    s.start()
    const got = s.global('out') as unknown[]
    expect(got).toEqual([
      { x: 1, y: 0, z: 0 }, 0.5,
      { x: 1, y: 2, z: 3 },
      'primA',
      'descA',
    ])
  })

  it('PRIM_LINK_TARGET redirects subsequent rules to a sibling prim', async () => {
    const src = `
      default {
        state_entry() {
          llSetLinkPrimitiveParamsFast(LINK_THIS, [
            PRIM_NAME, "self",
            PRIM_LINK_TARGET, 2,
            PRIM_NAME, "other",
            PRIM_POS_LOCAL, <9.0, 9.0, 9.0>
          ]);
        }
      }
    `
    const probe = `
      string n = "";
      vector p = ZERO_VECTOR;
      default {
        state_entry() {}
        link_message(integer s, integer m, string str, key id) {
          list out = llGetPrimitiveParams([PRIM_NAME, PRIM_POS_LOCAL]);
          n = llList2String(out, 0);
          p = llList2Vector(out, 1);
        }
      }
    `
    const { scripts, linkset } = await loadLinkset({
      prims: [
        { name: 'P1', scripts: [{ source: { source: src, filename: 's.lsl' }, name: 's' }] },
        { name: 'P2', scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] },
      ],
    })
    scripts['s']!.start()
    scripts['p']!.start()
    expect(linkset.prims[0]!.name).toBe('self')
    expect(linkset.prims[1]!.name).toBe('other')
    expect(linkset.prims[1]!.params.position).toEqual({ x: 9, y: 9, z: 9 })
  })

  it('llSetColor + llGetPrimitiveParams agree (alt-accessor consistency)', async () => {
    const src = `
      list out = [];
      default {
        state_entry() {
          llSetColor(<0.0, 1.0, 0.0>, ALL_SIDES);
          out = llGetPrimitiveParams([PRIM_COLOR, 2]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'c.lsl' })
    s.start()
    expect(s.global('out')).toEqual([{ x: 0, y: 1, z: 0 }, 1])
  })

  it('llSetPos / llGetPos consistency', async () => {
    const src = `
      vector p = ZERO_VECTOR;
      default {
        state_entry() {
          llSetPos(<3.0, 4.0, 5.0>);
          p = llGetPos();
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'p.lsl' })
    s.start()
    expect(s.global('p')).toEqual({ x: 3, y: 4, z: 5 })
  })

  it('llSetText writes to PRIM_TEXT (cross-builtin consistency)', async () => {
    const src = `
      list out = [];
      default {
        state_entry() {
          llSetText("hi", <1.0, 1.0, 1.0>, 0.75);
          out = llGetPrimitiveParams([PRIM_TEXT]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 't.lsl' })
    s.start()
    expect(s.global('out')).toEqual(['hi', { x: 1, y: 1, z: 1 }, 0.75])
  })

  it('llSetStatus(STATUS_PHYSICS, TRUE) is observable via PRIM_PHYSICS', async () => {
    const src = `
      list out = [];
      default {
        state_entry() {
          llSetStatus(STATUS_PHYSICS, TRUE);
          out = llGetPrimitiveParams([PRIM_PHYSICS, PRIM_PHANTOM]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'st.lsl' })
    s.start()
    expect(s.global('out')).toEqual([1, 0])
  })

  it('llSetLinkPrimitiveParams advances clock by 0.2s; Fast does not', async () => {
    const src = `
      default {
        state_entry() {
          llSetLinkPrimitiveParams(LINK_THIS, [PRIM_NAME, "x"]);
        }
      }
    `
    const fastSrc = `
      default {
        state_entry() {
          llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_NAME, "y"]);
        }
      }
    `
    const slow = await loadScript({ source: src, filename: 'slow.lsl' })
    slow.start()
    expect(slow.linkset.clock.now).toBe(200)

    const fast = await loadScript({ source: fastSrc, filename: 'fast.lsl' })
    fast.start()
    expect(fast.linkset.clock.now).toBe(0)
  })

  it('PRIM_LINK_TARGET LINK_SET applies remaining rules to every prim', async () => {
    const driver = `
      default {
        state_entry() {
          llSetLinkPrimitiveParamsFast(LINK_THIS, [
            PRIM_LINK_TARGET, LINK_SET,
            PRIM_NAME, "all"
          ]);
        }
      }
    `
    const noop = `default { state_entry() {} }`
    const { scripts, linkset } = await loadLinkset({
      prims: [
        { name: 'P1', scripts: [{ source: { source: driver, filename: 'd.lsl' }, name: 'd' }] },
        { name: 'P2', scripts: [{ source: { source: noop, filename: 'n.lsl' }, name: 'n' }] },
        { name: 'P3', scripts: [{ source: { source: noop, filename: 'n2.lsl' }, name: 'n2' }] },
      ],
    })
    scripts['d']!.start()
    scripts['n']!.start()
    scripts['n2']!.start()
    expect(linkset.prims.map((p) => p.name)).toEqual(['all', 'all', 'all'])
  })

  it('llGetLinkPrimitiveParams follows PRIM_LINK_TARGET across prims', async () => {
    const probe = `
      list out = [];
      default {
        state_entry() {
          out = llGetLinkPrimitiveParams(1, [PRIM_NAME, PRIM_LINK_TARGET, 2, PRIM_NAME, PRIM_LINK_TARGET, 3, PRIM_NAME]);
        }
      }
    `
    const noop = `default { state_entry() {} }`
    const { scripts } = await loadLinkset({
      prims: [
        { name: 'Alpha', scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] },
        { name: 'Bravo', scripts: [{ source: { source: noop, filename: 'n.lsl' }, name: 'n' }] },
        { name: 'Charlie', scripts: [{ source: { source: noop, filename: 'n2.lsl' }, name: 'n2' }] },
      ],
    })
    scripts['p']!.start()
    scripts['n']!.start()
    scripts['n2']!.start()
    expect(scripts['p']!.global('out')).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('llGetPrimitiveParams results keep their element types', async () => {
    const src = `
      string out;
      integer glowFound;
      integer nameFound;
      default {
        state_entry() {
          llSetObjectName("a");
          out = llDumpList2String(llGetPrimitiveParams([PRIM_GLOW, 0, PRIM_FULLBRIGHT, 0, PRIM_TYPE, PRIM_TEXT]), "|");
          glowFound = llListFindList(llGetPrimitiveParams([PRIM_GLOW, ALL_SIDES]), [0]);
          nameFound = llListFindList(llGetPrimitiveParams([PRIM_NAME]), [(key)"a"]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'types.lsl' })
    s.start()
    expect(s.global('out')).toBe(
      '0.000000|0|0|0|<0.000000, 1.000000, 0.000000>|0.000000|<0.000000, 0.000000, 0.000000>' +
        '|<1.000000, 1.000000, 0.000000>|<0.000000, 0.000000, 0.000000>||<0.000000, 0.000000, 0.000000>|1.000000',
    )
    expect(s.global('glowFound')).toBe(-1)
    expect(s.global('nameFound')).toBe(-1)
  })

  it('llGetLinkPrimitiveParams keeps element types across prims', async () => {
    const probe = `
      string out;
      default {
        state_entry() {
          out = llDumpList2String(llGetLinkPrimitiveParams(1, [PRIM_GLOW, 0, PRIM_FULLBRIGHT, 0,
            PRIM_LINK_TARGET, 2, PRIM_GLOW, 0, PRIM_FULLBRIGHT, 0]), "|");
        }
      }
    `
    const noop = `default { state_entry() {} }`
    const { scripts } = await loadLinkset({
      prims: [
        { name: 'Alpha', scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] },
        { name: 'Bravo', scripts: [{ source: { source: noop, filename: 'n.lsl' }, name: 'n' }] },
      ],
    })
    scripts['p']!.start()
    expect(scripts['p']!.global('out')).toBe('0.000000|0|0.000000|0')
  })

  it('unknown PRIM_* constant in llSetPrimitiveParams stops the rest of the walk', async () => {
    const src = `
      default {
        state_entry() {
          llSetPrimitiveParams([PRIM_NAME, "ok", 999999, "should-stop", PRIM_DESC, "never"]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'us.lsl' })
    s.start()
    expect(s.host.name).toBe('ok')
    expect(s.host.description).toBe('') // PRIM_DESC was unreachable
  })

  it('llSetLinkColor preserves per-face alpha (does not overwrite from face 0)', async () => {
    const setup = `
      default {
        state_entry() {
          // face 1 gets distinctive alpha 0.2; face 0 stays at 1.0
          llSetPrimitiveParams([PRIM_COLOR, 1, <1,1,1>, 0.2]);
          llSetLinkColor(LINK_THIS, <0,1,0>, ALL_SIDES);
        }
      }
    `
    const s = await loadScript({ source: setup, filename: 'lc.lsl' })
    s.start()
    expect(s.host.params.faces[0]!.alpha).toBe(1)
    expect(s.host.params.faces[1]!.alpha).toBe(Math.fround(0.2)) // preserved
    expect(s.host.params.faces[0]!.color).toEqual({ x: 0, y: 1, z: 0 })
    expect(s.host.params.faces[1]!.color).toEqual({ x: 0, y: 1, z: 0 })
  })

  it('llSetPhysicsMaterial mask: only flagged fields update', async () => {
    const src = `
      list out = [];
      default {
        state_entry() {
          // First call: set everything (mask = DENSITY|FRICTION|RESTITUTION|GRAVITY_MULTIPLIER = 0xF)
          llSetPhysicsMaterial(0xF, 1.5, 0.3, 0.7, 800.0);
          // Second call: only update DENSITY (0x1) — gravity/friction/restitution should be unchanged
          llSetPhysicsMaterial(0x1, 9.9, 9.9, 9.9, 1234.0);
          out = llGetPhysicsMaterial();
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'pm.lsl' })
    s.start()
    expect(s.global('out')).toEqual([1.5, Math.fround(0.3), Math.fround(0.7), 1234])
  })

  it('llSetObjectDesc syncs prim.description (visible to llGetPrimitiveParams)', async () => {
    const src = `
      list out = [];
      default {
        state_entry() {
          llSetObjectDesc("hello-desc");
          out = llGetPrimitiveParams([PRIM_DESC]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'od.lsl' })
    s.start()
    expect(s.global('out')).toEqual(['hello-desc'])
    expect(s.host.description).toBe('hello-desc')
  })

  it('llSetPrimitiveParams advances the clock by its 0.2s spec delay', async () => {
    const src = `
      default {
        state_entry() {
          llSetPrimitiveParams([PRIM_NAME, "x"]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'sp.lsl' })
    s.start()
    expect(s.linkset.clock.now).toBe(200)
  })

  it('PRIM_TYPE with unknown sub-shape kind terminates the walk', async () => {
    const src = `
      default {
        state_entry() {
          // 99 is not a valid PRIM_TYPE_* discriminator. The walk must
          // stop there, leaving PRIM_NAME unchanged.
          llSetPrimitiveParams([
            PRIM_TYPE, 99, 0, <0,1,0>, 0.0, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR,
            PRIM_NAME, "should-not-apply"
          ]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'pt.lsl' })
    s.start()
    expect(s.host.name).toBe('Object')
  })

  it('PRIM_LINK_TARGET to nonexistent link skips its rules but later valid PRIM_LINK_TARGET still applies', async () => {
    const src = `
      default {
        state_entry() {
          llSetPrimitiveParams([
            PRIM_LINK_TARGET, 99,
            PRIM_NAME, "lost",
            PRIM_LINK_TARGET, LINK_THIS,
            PRIM_NAME, "kept"
          ]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'rl.lsl' })
    s.start()
    expect(s.host.name).toBe('kept')
  })

  it('unknown PRIM_* constant terminates llGetPrimitiveParams response', async () => {
    const src = `
      list out = [];
      default {
        state_entry() {
          // PRIM_NAME is valid; 999999 is not. The walk stops at 999999.
          out = llGetPrimitiveParams([PRIM_NAME, 999999, PRIM_DESC]);
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'u.lsl' })
    s.start()
    // Only PRIM_NAME is in the response — PRIM_DESC was never reached.
    expect(s.global('out')).toEqual(['Object'])
  })
})

describe('prim behaviour measured in Second Life', () => {
  const debugErrors = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }) =>
    s.chat.filter((c) => c.channel === 0x7fffffff).map((c) => c.text)

  async function run(body: string, globals = '') {
    const s = await loadScript({ source: `${globals}\ndefault { state_entry() { ${body} } }`, filename: 'sl.lsl' })
    s.start()
    return s
  }

  it('a new prim is wood with the default physics material', async () => {
    const s = await run(`m = llList2Integer(llGetPrimitiveParams([PRIM_MATERIAL]), 0); pm = llGetPhysicsMaterial();`,
      'integer m; list pm;')
    expect(s.global('m')).toBe(3)
    expect(s.global('pm')).toEqual([1, 0.5, Math.fround(0.6), 1000])
  })

  // In-world: llSetText("t", <2,-1,0.5>, 3.0) reads back [t, <1,0,0.5>, 1.0].
  it('llSetText clamps colour and alpha to [0, 1]', async () => {
    const s = await run(`llSetText("t", <2,-1,0.5>, 3.0); out = llGetPrimitiveParams([PRIM_TEXT]);`, 'list out;')
    expect(s.global('out')).toEqual(['t', { x: 1, y: 0, z: 0.5 }, 1])
  })

  // In-world: a new prim whose text was never set reads PRIM_TEXT as ["", <0,0,0>, 1.0] (alpha 1.0, not 0.0).
  it('an unset PRIM_TEXT reads back with alpha 1.0', async () => {
    const s = await run(`out = llGetPrimitiveParams([PRIM_TEXT]);`, 'list out;')
    expect(s.global('out')).toEqual(['', { x: 0, y: 0, z: 0 }, 1])
  })

  // In-world: PRIM_TEXT "t2" with alpha -3.0 left the text, colour and alpha unchanged, with no error shout.
  it('PRIM_TEXT with an out-of-range alpha changes nothing and says no error', async () => {
    const s = await run(
      `llSetText("t", <1,0,0.5>, 0.5);
       llSetPrimitiveParams([PRIM_TEXT, "t2", <0,1,0>, -3.0]);
       out = llGetPrimitiveParams([PRIM_TEXT]);`,
      'list out;',
    )
    expect(s.global('out')).toEqual(['t', { x: 1, y: 0, z: 0.5 }, 0.5])
    expect(debugErrors(s)).toEqual([])
  })

  // In-world: PRIM_TEXT with a colour channel or alpha outside [0, 1] is ignored silently (text, colour and
  // alpha unchanged) and later rules still apply; <1,0,1> with alpha 1.0 and <0.1,0.2,0.3> with 0.4 apply.
  it.each([
    ['[PRIM_TEXT, "c", <2,-1,0.5>, 0.5]'],
    ['[PRIM_TEXT, "d", <0.1,0.2,0.3>, 1.5]'],
    ['[PRIM_TEXT, "x", <1.01,0,0>, 1.0]'],
  ])('PRIM_TEXT %s is ignored without an error', async (rule) => {
    const s = await run(`llSetText("t", <1,0,0.5>, 0.5); llSetPrimitiveParams(${rule}); out = llGetPrimitiveParams([PRIM_TEXT]);`, 'list out;')
    expect(s.global('out')).toEqual(['t', { x: 1, y: 0, z: 0.5 }, 0.5])
    expect(debugErrors(s)).toEqual([])
  })

  it('an ignored PRIM_TEXT rule does not stop later rules', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_TEXT, "e", <0.1,0.2,0.3>, -0.5, PRIM_DESC, "after neg alpha"]);
       out = llGetPrimitiveParams([PRIM_TEXT, PRIM_DESC]);`,
      'list out;',
    )
    expect(s.global('out')).toEqual(['', { x: 0, y: 0, z: 0 }, 1, 'after neg alpha'])
  })

  it('PRIM_TEXT applies colour channels at the 0 and 1 edges', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_TEXT, "edge", <1,0,1>, 1.0]);
       out = llGetPrimitiveParams([PRIM_TEXT]);
       llSetPrimitiveParams([PRIM_TEXT, "ok", <0.1,0.2,0.3>, 0.4]);
       out += llGetPrimitiveParams([PRIM_TEXT]);`,
      'list out;',
    )
    expect(s.global('out')).toEqual([
      'edge', { x: 1, y: 0, z: 1 }, 1,
      'ok', { x: Math.fround(0.1), y: Math.fround(0.2), z: Math.fround(0.3) }, Math.fround(0.4),
    ])
  })

  // In-world: llSetColor(<1,0,0>, -5), llSetAlpha(0.2, -3), PRIM_COLOR with face -7 and
  // llSetLinkColor(LINK_THIS, <0,0,1>, -9) each set every face.
  it('negative faces set every face', async () => {
    const s = await run(
      `llSetColor(<1,0,0>, -5);
       out = llGetPrimitiveParams([PRIM_COLOR, 3]);
       llSetAlpha(0.2, -3);
       out += llGetPrimitiveParams([PRIM_COLOR, 5]);
       llSetPrimitiveParams([PRIM_COLOR, -7, <0,1,0>, 0.5]);
       out += llGetPrimitiveParams([PRIM_COLOR, 0, PRIM_COLOR, 5]);
       llSetLinkColor(LINK_THIS, <0,0,1>, -9);
       out += llGetPrimitiveParams([PRIM_COLOR, 0, PRIM_COLOR, 5]);`,
      'list out;',
    )
    const f = Math.fround
    const red = { x: 1, y: 0, z: 0 }, green = { x: 0, y: 1, z: 0 }, blue = { x: 0, y: 0, z: 1 }
    expect(s.global('out')).toEqual([
      red, 1, red, f(0.2),
      green, 0.5, green, 0.5,
      blue, 0.5, blue, 0.5,
    ])
  })

  // In-world: llGetColor(-5) and llGetColor(-2) average the faces like ALL_SIDES; llGetAlpha(-2) sums them;
  // [PRIM_COLOR, -5] returns every face, [PRIM_TEXTURE, -5] 24 values on a box and [PRIM_GLOW, -2] 6;
  // [PRIM_TEXTURE, 6] and [PRIM_COLOR, 6] return nothing.
  it('negative faces read every face; a face past the count reads nothing', async () => {
    const s = await run(
      `llSetColor(<1,0,0>, 0);
       llSetAlpha(0.5, 1);
       out = [llGetColor(-5), llGetColor(-2), llGetColor(ALL_SIDES), llGetAlpha(-2)];
       counts = [llGetListLength(llGetPrimitiveParams([PRIM_COLOR, -5])),
                 llGetListLength(llGetPrimitiveParams([PRIM_TEXTURE, -5])),
                 llGetListLength(llGetPrimitiveParams([PRIM_GLOW, -2])),
                 llGetListLength(llGetPrimitiveParams([PRIM_TEXTURE, 6])),
                 llGetListLength(llGetPrimitiveParams([PRIM_COLOR, 6]))];`,
      'list out; list counts;',
    )
    const avg = { x: 1, y: Math.fround(5 / 6), z: Math.fround(5 / 6) }
    expect(s.global('out')).toEqual([avg, avg, avg, 5.5])
    expect(s.global('counts')).toEqual([12, 24, 6, 0, 0])
  })

  // In-world: llSetText("f", <1,1,1>, (float)"nan") reads back PRIM_TEXT = [f, <1,1,1>, nan].
  it('llSetText with a NaN alpha stores the text and keeps NaN', async () => {
    const s = await run(`llSetText("f", <1,1,1>, (float)"nan"); out = llGetPrimitiveParams([PRIM_TEXT]);`, 'list out;')
    const out = s.global('out') as unknown[]
    expect(out[0]).toBe('f')
    expect(out[1]).toEqual({ x: 1, y: 1, z: 1 })
    expect(out[2]).toBeNaN()
  })

  // In-world: [PRIM_TEXT, "nanc", <nan,0,0>, 1.0] reads back [nanc, <nan, 0, 0>, 1.0].
  it('PRIM_TEXT with a NaN colour channel stores the text and keeps NaN', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_TEXT, "nanc", <(float)"nan", 0, 0>, 1.0]); out = llGetPrimitiveParams([PRIM_TEXT]);`,
      'list out;',
    )
    const out = s.global('out') as Array<{ x: number; y: number; z: number }>
    expect(out[0]).toBe('nanc')
    expect(out[1]!.x).toBeNaN()
    expect([out[1]!.y, out[1]!.z, out[2]]).toEqual([0, 0, 1])
  })

  // In-world: llSetObjectDesc("a|b\nc") -> "a?b?c"; llSetObjectName("n|m\nx") -> "n?m?x";
  // PRIM_DESC "p|q" -> "p?q"; PRIM_NAME "probe k|z" -> "probe k?z".
  it('names and descriptions turn | and newline into ?', async () => {
    const s = await run(
      `llSetObjectDesc("a|b\nc");
       llSetObjectName("n|m\nx");
       out = [llGetObjectDesc(), llGetObjectName()];
       llSetPrimitiveParams([PRIM_DESC, "p|q", PRIM_NAME, "probe k|z"]);
       out += llGetPrimitiveParams([PRIM_DESC, PRIM_NAME]);`,
      'list out;',
    )
    expect(s.global('out')).toEqual(['a?b?c', 'n?m?x', 'p?q', 'probe k?z'])
  })

  // In-world: gravity 50 and -5 ignored, 28 and 2 accepted; restitution 5 and -1 ignored, 0.3 accepted;
  // friction 500 and -1 ignored, 99 accepted; density 50000 and -1 ignored, 500 and 900 accepted.
  // The exact edges (wiki ranges) were not measured.
  it.each([
    ['gravity 50', 'llSetPhysicsMaterial(GRAVITY_MULTIPLIER, 50.0, 0, 0, 0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['gravity -5', 'llSetPhysicsMaterial(GRAVITY_MULTIPLIER, -5.0, 0, 0, 0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['gravity 28', 'llSetPhysicsMaterial(GRAVITY_MULTIPLIER, 28.0, 0, 0, 0);', [28, 0.5, Math.fround(0.6), 1000]],
    ['gravity 2', 'llSetPhysicsMaterial(GRAVITY_MULTIPLIER, 2.0, 0, 0, 0);', [2, 0.5, Math.fround(0.6), 1000]],
    ['restitution 5', 'llSetPhysicsMaterial(RESTITUTION, 0, 5.0, 0, 0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['restitution -1', 'llSetPhysicsMaterial(RESTITUTION, 0, -1.0, 0, 0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['restitution 0.3', 'llSetPhysicsMaterial(RESTITUTION, 0, 0.3, 0, 0);', [1, Math.fround(0.3), Math.fround(0.6), 1000]],
    ['friction 500', 'llSetPhysicsMaterial(FRICTION, 0, 0, 500.0, 0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['friction -1', 'llSetPhysicsMaterial(FRICTION, 0, 0, -1.0, 0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['friction 99', 'llSetPhysicsMaterial(FRICTION, 0, 0, 99.0, 0);', [1, 0.5, 99, 1000]],
    ['density 50000', 'llSetPhysicsMaterial(DENSITY, 0, 0, 0, 50000.0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['density -1', 'llSetPhysicsMaterial(DENSITY, 0, 0, 0, -1.0);', [1, 0.5, Math.fround(0.6), 1000]],
    ['density 500', 'llSetPhysicsMaterial(DENSITY, 0, 0, 0, 500.0);', [1, 0.5, Math.fround(0.6), 500]],
    ['density 900', 'llSetPhysicsMaterial(DENSITY, 0, 0, 0, 900.0);', [1, 0.5, Math.fround(0.6), 900]],
  ])('llSetPhysicsMaterial %s', async (_, call, expected) => {
    const s = await run(`${call} out = llGetPhysicsMaterial();`, 'list out;')
    expect(s.global('out')).toEqual(expected)
  })

  it('llSetPhysicsMaterial still applies the in-range fields of a call with an out-of-range one', async () => {
    const s = await run(
      `llSetPhysicsMaterial(GRAVITY_MULTIPLIER | RESTITUTION | FRICTION | DENSITY, 50.0, 0.25, 99.0, 900.0);
       out = llGetPhysicsMaterial();`,
      'list out;',
    )
    expect(s.global('out')).toEqual([1, 0.25, 99, 900])
  })

  // In-world: a new prim's PRIM_ALPHA_MODE per face is [PRIM_ALPHA_MODE_BLEND, 0] and
  // PRIM_POINT_LIGHT is [FALSE, <0,0,0>, 0.0, 0.0, 0.0].
  it('a new prim has alpha mode blend and a zeroed point light', async () => {
    const s = await run(
      `out = llGetPrimitiveParams([PRIM_ALPHA_MODE, 0, PRIM_ALPHA_MODE, 5, PRIM_POINT_LIGHT]);`,
      'list out;',
    )
    expect(s.global('out')).toEqual([1, 0, 1, 0, 0, { x: 0, y: 0, z: 0 }, 0, 0, 0])
  })

  // In-world: on a 6-face box llGetColor(99) and llGetColor(6) = <1,1,1>, llGetAlpha(99) = 1.0, and
  // llGetAlpha(-5) is the sum over faces (face 0 at 0.3, the rest 1 -> 5.3).
  it('colour and alpha past the last face read white and 1.0; a negative alpha face sums', async () => {
    const s = await run(
      `llSetAlpha(0.3, 0);
       out = [llGetColor(99), llGetColor(6), llGetAlpha(99), llGetAlpha(-5)];`,
      'list out;',
    )
    expect(s.global('out')).toEqual([
      { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, 1, Math.fround(5.3),
    ])
  })

  // In-world: PRIM_CLICK_ACTION yields a value only as the last rule.
  describe('PRIM_CLICK_ACTION in llGetPrimitiveParams', () => {
    it.each([
      ['[PRIM_CLICK_ACTION]', [0]],
      ['[PRIM_CLICK_ACTION, PRIM_NAME]', ['Object']],
      ['[PRIM_NAME, PRIM_CLICK_ACTION, PRIM_DESC, PRIM_NAME]', ['Object', '', 'Object']],
      ['[PRIM_CLICK_ACTION, PRIM_CLICK_ACTION]', [0]],
    ])('%s', async (rules, expected) => {
      const s = await run(`out = llGetPrimitiveParams(${rules});`, 'list out;')
      expect(s.global('out')).toEqual(expected)
    })

    it('llGetLinkPrimitiveParams follows the same rule', async () => {
      const s = await run(`out = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_CLICK_ACTION, PRIM_NAME]);`, 'list out;')
      expect(s.global('out')).toEqual(['Object'])
    })

    it('reads the changed value as the last rule', async () => {
      const s = await run(`llSetClickAction(CLICK_ACTION_SIT); out = llGetPrimitiveParams([PRIM_CLICK_ACTION]);`, 'list out;')
      expect(s.global('out')).toEqual([1])
    })
  })

  // In-world: PRIM_TYPE with shape kind 99 applies the rules before it, not it or later ones, and says no error.
  it('PRIM_TYPE with an unknown shape kind says no error', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_DESC, "before", PRIM_TYPE, 99, 0, <0,1,0>, 0.0, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR, PRIM_NAME, "after"]);`,
    )
    expect(debugErrors(s)).toEqual([])
    expect(s.host.description).toBe('before')
    expect(s.host.name).toBe('Object')
  })

  it('scale factors of a 0.5 m cube are 128 and 0.02', async () => {
    const s = await run(`mx = llGetMaxScaleFactor(); mn = llGetMinScaleFactor();`, 'float mx; float mn;')
    expect(s.global('mx')).toBe(128)
    expect(s.global('mn')).toBe(Math.fround(0.02))
  })

  // Measured with a 0.5 m root cube and a 0.5 m child cube.
  it.each([
    ['child at <0,1,0>', { x: 0.5, y: 0.5, z: 0.5 }, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 1, z: 0 }, 64, 0.02],
    ['child resized to 2 m', { x: 0.5, y: 0.5, z: 0.5 }, { x: 2, y: 2, z: 2 }, { x: 0, y: 1, z: 0 }, 32, 0.02],
    ['child at <0,20,0>', { x: 0.5, y: 0.5, z: 0.5 }, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 20, z: 0 }, 3.2, 0.02],
    ['root resized to <0.1,4,0.5>', { x: 0.1, y: 4, z: 0.5 }, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 1, z: 0 }, 16, 0.1],
  ])('scale factors of a linkset with %s', async (_, rootSize, childSize, childPos, max, min) => {
    const probe = `float mx; float mn; default { state_entry() { mx = llGetMaxScaleFactor(); mn = llGetMinScaleFactor(); } }`
    const { scripts, prims } = await loadLinkset({
      prims: [
        { name: 'Root', scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] },
        { name: 'Child' },
      ],
    })
    prims[0]!.params.size = rootSize
    prims[1]!.params.size = childSize
    prims[1]!.params.position = childPos
    scripts['p']!.start()
    expect(scripts['p']!.global('mx')).toBe(Math.fround(max))
    expect(scripts['p']!.global('mn')).toBe(Math.fround(min))
  })

  it('llGetAlpha(ALL_SIDES) sums the faces', async () => {
    const s = await run(`llSetAlpha(0.5, ALL_SIDES); a = llGetAlpha(ALL_SIDES);`, 'float a;')
    expect(s.global('a')).toBe(3)
  })

  it('llGetNumberOfSides: box 6, hollow box 7', async () => {
    const s = await run(
      `box = llGetNumberOfSides();
       llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,1,0>, 0.5, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]);
       hollow = llGetNumberOfSides();`,
      'integer box; integer hollow;',
    )
    expect(s.global('box')).toBe(6)
    expect(s.global('hollow')).toBe(7)
  })

  it('a hollow box has seven faces for every per-face call', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,1,0>, 0.5, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]);
       all = llGetPrimitiveParams([PRIM_COLOR, ALL_SIDES]);
       llSetColor(<0.7, 0, 0>, 6);
       llSetColor(<0.8, 0, 0>, 7);
       llSetAlpha(0.5, ALL_SIDES);
       llSetTexture(TEXTURE_BLANK, 6);
       six = llGetPrimitiveParams([PRIM_COLOR, 6]);
       seven = llGetPrimitiveParams([PRIM_COLOR, 7]);
       avg = llGetColor(ALL_SIDES);
       sum = llGetAlpha(ALL_SIDES);
       tex = llGetTexture(6);`,
      'list all; list six; list seven; vector avg; float sum; string tex;',
    )
    expect(s.global('all')).toHaveLength(14)
    expect(s.global('six')).toEqual([{ x: Math.fround(0.7), y: 0, z: 0 }, 0.5])
    expect(s.global('seven')).toEqual([])
    expect((s.global('avg') as { x: number }).x).toBeCloseTo((6 + 0.7) / 7, 5)
    expect(s.global('sum')).toBeCloseTo(3.5)
    expect(s.global('tex')).toBe('5748decc-f629-461c-9a36-a35a221fe21f')
  })

  it('a box cut 0.1-0.9 has eight faces, nine with a hollow', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0.1,0.9,0>, 0.0, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]);
       eight = llGetNumberOfSides();
       all8 = llGetPrimitiveParams([PRIM_COLOR, ALL_SIDES]);
       f7 = llGetPrimitiveParams([PRIM_COLOR, 7]);
       f8 = llGetPrimitiveParams([PRIM_COLOR, 8]);
       llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0.1,0.9,0>, 0.5, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]);
       nine = llGetNumberOfSides();
       all9 = llGetPrimitiveParams([PRIM_COLOR, ALL_SIDES]);
       g8 = llGetPrimitiveParams([PRIM_COLOR, 8]);
       g9 = llGetPrimitiveParams([PRIM_COLOR, 9]);`,
      'integer eight; integer nine; list all8; list all9; list f7; list f8; list g8; list g9;',
    )
    expect(s.global('eight')).toBe(8)
    expect(s.global('all8')).toHaveLength(16)
    expect(s.global('f7')).toHaveLength(2)
    expect(s.global('f8')).toEqual([])
    expect(s.global('nine')).toBe(9)
    expect(s.global('all9')).toHaveLength(18)
    expect(s.global('g8')).toHaveLength(2)
    expect(s.global('g9')).toEqual([])
  })

  it('llSetColor per face, then hollowing, keeps colours by face role', async () => {
    const s = await run(
      `integer i;
       vector c;
       for (i = 0; i < 6; i++) llSetColor(<(i + 1) / 10.0, 0, 0>, i);
       llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,1,0>, 0.5, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]);
       for (i = 0; i < llGetNumberOfSides(); i++) { c = llGetColor(i); reds += c.x; }`,
      'list reds;',
    )
    expect(s.global('reds')).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.6].map(Math.fround))
  })

  it('per-face accessors past the face count read defaults and write nothing', async () => {
    const s = await run(
      `llSetTexture(TEXTURE_BLANK, 6);
       llScaleTexture(2, 2, 6);
       llOffsetTexture(0.5, 0.5, 6);
       llRotateTexture(1, 6);
       llSetLinkColor(LINK_THIS, <0,0,0>, 6);
       llSetLinkAlpha(LINK_THIS, 0.0, 6);
       llSetLinkTexture(LINK_THIS, TEXTURE_BLANK, 6);
       out = [llGetColor(6), llGetAlpha(6), llGetTexture(6), llGetTextureOffset(6), llGetTextureScale(6),
              llGetTextureRot(6), llGetRenderMaterial(6)];`,
      'list out;',
    )
    // In-world: llGetRenderMaterial and llGetTexture past the face count return NULL_KEY (probes p4 allsides_rm, p6 gettex_bad).
    expect(s.global('out')).toEqual([{ x: 1, y: 1, z: 1 }, 1, NULL_KEY, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0, NULL_KEY])
  })

  it('ALL_SIDES texture and link calls reach the seventh face of a hollow box', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,1,0>, 0.5, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]);
       llSetTexture(TEXTURE_BLANK, ALL_SIDES);
       llScaleTexture(2, 3, ALL_SIDES);
       llOffsetTexture(0.25, 0.5, ALL_SIDES);
       llRotateTexture(1, ALL_SIDES);
       llSetLinkColor(LINK_THIS, <0,1,0>, ALL_SIDES);
       llSetLinkAlpha(LINK_THIS, 0.5, ALL_SIDES);
       llSetRenderMaterial("f35823e6-40dc-d992-f4cc-85a4cb5464c0", ALL_SIDES);
       out = [llGetTexture(6), llGetTextureScale(6), llGetTextureOffset(6), llGetTextureRot(6),
              llGetColor(6), llGetAlpha(6), llGetRenderMaterial(6)];
       llSetLinkTexture(LINK_THIS, TEXTURE_DEFAULT, 6);
       linked = llGetTexture(6);`,
      'list out; string linked;',
    )
    expect(s.global('out')).toEqual([
      '5748decc-f629-461c-9a36-a35a221fe21f', { x: 2, y: 3, z: 0 }, { x: 0.25, y: 0.5, z: 0 }, 1,
      { x: 0, y: 1, z: 0 }, 0.5, 'f35823e6-40dc-d992-f4cc-85a4cb5464c0',
    ])
    expect(s.global('linked')).toBe('89556747-24cb-43ed-920b-47caed15465f')
  })

  it('PRIM_SIZE clamps each axis to [0.01, 64]', async () => {
    const s = await run(`llSetPrimitiveParams([PRIM_SIZE, <100, 0.001, 2>]); v = llGetScale();`, 'vector v;')
    expect(s.global('v')).toEqual({ x: 64, y: Math.fround(0.01), z: 2 })
  })

  it('PRIM_COLOR clamps colour and alpha to [0, 1]; llSetColor does not clamp', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_COLOR, 0, <3, -1, 0.5>, 2.0]);
       pp = llGetPrimitiveParams([PRIM_COLOR, 0]);
       llSetColor(<3, 3, 3>, 1);
       c = llGetColor(1);`,
      'list pp; vector c;',
    )
    expect(s.global('pp')).toEqual([{ x: 1, y: 0, z: 0.5 }, 1])
    expect(s.global('c')).toEqual({ x: 3, y: 3, z: 3 })
  })

  it('truncates text to 254 bytes, name to 63 and description to 127', async () => {
    const s = await run(
      `string long = "";
       integer i;
       for (i = 0; i < 300; ++i) long += "a";
       llSetPrimitiveParams([PRIM_TEXT, long, <1,1,1>, 1.0, PRIM_DESC, long]);
       llSetObjectName(long);
       t = llStringLength(llList2String(llGetPrimitiveParams([PRIM_TEXT]), 0));
       n = llStringLength(llGetObjectName());
       d = llStringLength(llGetObjectDesc());
       llSetPrimitiveParams([PRIM_NAME, long]);
       pn = llStringLength(llGetObjectName());`,
      'integer t; integer n; integer d; integer pn;',
    )
    expect(s.global('t')).toBe(254)
    expect(s.global('n')).toBe(63)
    expect(s.global('d')).toBe(127)
    expect(s.global('pn')).toBe(63)
  })

  it('llSetRot and PRIM_ROTATION normalise the quaternion', async () => {
    const s = await run(
      `llSetRot(<0,0,0,2>); a = llGetRot();
       llSetPrimitiveParams([PRIM_ROTATION, <0,0,0,3>]); b = llGetRot();`,
      'rotation a; rotation b;',
    )
    expect(s.global('a')).toEqual({ x: 0, y: 0, z: 0, s: 1 })
    expect(s.global('b')).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  })

  it('llSetPos moves at most 10 m per call', async () => {
    const s = await loadScript({
      source: 'vector p; default { state_entry() { llSetPos(<128, 128, 40>); p = llGetPos(); } }',
      filename: 'pos.lsl',
    })
    s.host.params.position = { x: 128, y: 128, z: 20 }
    s.start()
    expect(s.global('p')).toEqual({ x: 128, y: 128, z: 30 })
  })

  it('PRIM_GLOW out of bounds says an error and aborts the call', async () => {
    const s = await run(`llSetPrimitiveParams([PRIM_GLOW, ALL_SIDES, 5.0, PRIM_NAME, "after"]);`)
    expect(debugErrors(s)).toEqual([
      'llSetPrimitiveParams error running rule #1 (PRIM_GLOW): bounds error; 5 is not in (0, 1).',
    ])
    expect(s.host.params.faces[0]!.glow).toBe(0)
    expect(s.host.name).toBe('Object')
  })

  it('a bad rule partway through keeps the rules before it and skips the rest', async () => {
    const s = await run(
      `llSetPrimitiveParams([PRIM_TEXT, "first", <1,1,1>, 1.0, PRIM_GLOW, ALL_SIDES, 5.0, PRIM_DESC, "after"]);
       out = llGetPrimitiveParams([PRIM_TEXT, PRIM_DESC]);`,
      'list out;',
    )
    expect(debugErrors(s)).toEqual([
      'llSetPrimitiveParams error running rule #2 (PRIM_GLOW): bounds error; 5 is not in (0, 1).',
    ])
    expect(s.global('out')).toEqual(['first', { x: 1, y: 1, z: 1 }, 1, ''])
  })

  it('a wrong argument type says an error and aborts the whole call', async () => {
    const s = await run(`llSetPrimitiveParams([PRIM_SIZE, "big", PRIM_NAME, "after"]);`)
    expect(debugErrors(s)).toEqual([
      'llSetPrimitiveParams error running rule #1 (PRIM_SIZE): arg #1 vector expected but string given.',
    ])
    expect(s.host.name).toBe('Object')
  })

  it('an unknown rule says an error and aborts', async () => {
    const s = await run(`llSetPrimitiveParams([999999, "x", PRIM_NAME, "after"]);`)
    expect(debugErrors(s)).toEqual(['llSetPrimitiveParams error running rule #1: unknown rule.'])
    expect(s.host.name).toBe('Object')
  })

  it('rule numbers count from 1 and errors name the calling function', async () => {
    const s = await run(`llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_NAME, "a", PRIM_COLOR, 0, "red", 1.0]);`)
    expect(debugErrors(s)).toEqual([
      'llSetLinkPrimitiveParamsFast error running rule #2 (PRIM_COLOR): arg #2 vector expected but string given.',
    ])
  })

  it('llGetLinkPrimitiveParams with a multi-prim link returns an empty list', async () => {
    const probe = `
      integer a; integer b; integer c;
      default {
        state_entry() {
          a = llGetListLength(llGetLinkPrimitiveParams(LINK_SET, [PRIM_NAME]));
          b = llGetListLength(llGetLinkPrimitiveParams(LINK_ALL_OTHERS, [PRIM_NAME]));
          c = llGetListLength(llGetLinkPrimitiveParams(LINK_ALL_CHILDREN, [PRIM_NAME]));
        }
      }
    `
    const { scripts } = await loadLinkset({
      prims: [
        { name: 'Root', scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] },
        { name: 'Child' },
      ],
    })
    scripts['p']!.start()
    expect([scripts['p']!.global('a'), scripts['p']!.global('b'), scripts['p']!.global('c')]).toEqual([0, 0, 0])
  })

  it('llGetLinkName of an invalid link is NULL_KEY', async () => {
    const s = await run(`n = llGetLinkName(42);`, 'string n;')
    expect(s.global('n')).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('a child prim reports region position from llGetPos and local position from llGetLocalPos', async () => {
    const probe = `
      vector pos; vector local; list pp;
      default {
        state_entry() {
          pos = llGetPos();
          local = llGetLocalPos();
          pp = llGetPrimitiveParams([PRIM_POSITION, PRIM_POS_LOCAL]);
        }
      }
    `
    const { scripts, prims } = await loadLinkset({
      prims: [
        { name: 'Root' },
        { name: 'Child', scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] },
      ],
    })
    prims[0]!.params.position = { x: 133.5, y: 200, z: 2001 }
    prims[1]!.params.position = { x: 0, y: 1, z: 0.5 }
    scripts['p']!.start()
    expect(scripts['p']!.global('pos')).toEqual({ x: 133.5, y: 201, z: 2001.5 })
    expect(scripts['p']!.global('local')).toEqual({ x: 0, y: 1, z: 0.5 })
    expect(scripts['p']!.global('pp')).toEqual([{ x: 133.5, y: 201, z: 2001.5 }, { x: 0, y: 1, z: 0.5 }])
  })
})

describe('PRIM_GLTF_* overrides', () => {
  it('accept "" in any slot after the face, meaning no override', async () => {
    const s = await loadScript({
      source: `
        string text;
        default {
          state_entry() {
            llSetPrimitiveParams([
              PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", "", "", "", "", "",
              PRIM_GLTF_EMISSIVE, 0, "", "", "", "", "",
              PRIM_TEXT, "after", <1, 1, 1>, 1.0]);
            text = llList2String(llGetPrimitiveParams([PRIM_TEXT]), 0);
          }
        }
      `,
    })
    s.start()
    expect(s.chat.filter((c) => c.channel === 2147483647)).toEqual([])
    expect(s.global('text')).toBe('after')
  })
})

describe('llSetPrimitiveParams rule type errors on untyped lists', () => {
  // A mock can hand back a plain array with no recorded element types; the
  // type check then infers each value's type from the value itself.
  it.each([
    ['string', [PRIM_SIZE, 'abc'], 'arg #1 vector expected but string given'],
    ['integer', [PRIM_SIZE, 3], 'arg #1 vector expected but integer given'],
    ['float', [PRIM_SIZE, 1.5], 'arg #1 vector expected but float given'],
    ['rotation', [PRIM_SIZE, ZERO_ROTATION], 'arg #1 vector expected but rotation given'],
    ['vector', [PRIM_TEXT, { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, 1], 'arg #1 string expected but vector given'],
    ['list', [PRIM_SIZE, []], 'arg #1 vector expected but list given'],
  ])('reports a %s argument', async (_label, rules, message) => {
    const s = await loadScript({
      source: `
        default {
          state_entry() { llSetPrimitiveParams(llGetLinkPrimitiveParams(LINK_THIS, [])); }
        }
      `,
    })
    s.mock('llGetLinkPrimitiveParams', () => rules)
    s.start()
    const errors = s.chat.filter((c) => c.channel === 2147483647).map((c) => c.text)
    expect(errors).toEqual([expect.stringContaining(message)])
  })
})

describe('llGetAlpha(ALL_SIDES) on non-box shapes', () => {
  it('sums only the faces the shape has', async () => {
    const s = await loadScript({
      source: `
        float sphere; float box;
        default {
          state_entry() {
            llSetAlpha(0.5, ALL_SIDES);
            box = llGetAlpha(ALL_SIDES);
            llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, <0, 1, 0>, 0.0, <0, 0, 0>, <0, 1, 0>]);
            llSetAlpha(0.5, ALL_SIDES);
            sphere = llGetAlpha(ALL_SIDES);
          }
        }
      `,
    })
    s.start()
    expect(s.global('box')).toBeCloseTo(3)
    expect(s.global('sphere')).toBeCloseTo(0.5)
  })
})

describe('llSetPos 10 m cap', () => {
  it('applies to the root only; a child moves its local offset freely', async () => {
    const { scripts } = await loadLinkset({
      prims: [
        { scripts: [{ name: 'root', source: { source: 'default { state_entry() { } }' } }] },
        {
          scripts: [
            {
              name: 'child',
              source: {
                source: `
                  vector local;
                  default { state_entry() { llSetPos(<20, 0, 0>); local = llGetLocalPos(); } }
                `,
              },
            },
          ],
        },
      ],
    })
    scripts.root!.start()
    scripts.child!.start()
    expect(scripts.child!.global('local')).toEqual({ x: 20, y: 0, z: 0 })
  })
})

describe('PRIM_HEALTH, PRIM_DAMAGE and PRIM_OMEGA', () => {
  const run = async (body: string) => {
    const s = await loadScript({ source: `list out; default { state_entry() { ${body} } }` })
    s.start()
    return s.global('out')
  }

  // In-world, a new box: llGetPrimitiveParams([PRIM_HEALTH, PRIM_DAMAGE]) -> [0.0, 0.0, 0].
  it('start at no health and no damage', async () => {
    expect(await run('out = llGetPrimitiveParams([PRIM_HEALTH, PRIM_DAMAGE]);')).toEqual([0, 0, 0])
  })

  // In-world: llTargetOmega(<0, 0, 2>, 1.5, 1.0) -> PRIM_OMEGA [<0, 0, 1>, 3.0, 1.0];
  // llTargetOmega(<3, 4, 0>, 1.0, 1.0) -> [<0.6, 0.8, 0>, 5.0, 1.0]; PRIM_OMEGA
  // [<0, 0.5, 0>, 4.0, 0.5] -> [<0, 1, 0>, 2.0, 0.5]; llTargetOmega(ZERO_VECTOR,
  // 2.0, 1.0) -> [<0, 0, 0>, 2.0, 1.0].
  it('reads the spin axis back as a unit vector with the rate scaled by its length', async () => {
    expect(
      await run(
        'llTargetOmega(<0, 0, 2>, 1.5, 1.0); out = llGetPrimitiveParams([PRIM_OMEGA]); llTargetOmega(<3, 4, 0>, 1.0, 1.0); out += llGetPrimitiveParams([PRIM_OMEGA]); llSetPrimitiveParams([PRIM_OMEGA, <0, 0.5, 0>, 4.0, 0.5]); out += llGetPrimitiveParams([PRIM_OMEGA]); llTargetOmega(ZERO_VECTOR, 2.0, 1.0); out += llGetPrimitiveParams([PRIM_OMEGA]);',
      ),
    ).toEqual([
      { x: 0, y: 0, z: 1 }, 3, 1,
      { x: expect.closeTo(0.6, 6), y: expect.closeTo(0.8, 6), z: 0 }, 5, 1,
      { x: 0, y: 1, z: 0 }, 2, 0.5,
      { x: 0, y: 0, z: 0 }, 2, 1,
    ])
  })
})
