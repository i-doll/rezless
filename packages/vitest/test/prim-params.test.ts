import { describe, it, expect } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'

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
          llSetPos(<5.0, 6.0, 7.0>);
          p = llGetPos();
        }
      }
    `
    const s = await loadScript({ source: src, filename: 'p.lsl' })
    s.start()
    expect(s.global('p')).toEqual({ x: 5, y: 6, z: 7 })
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
