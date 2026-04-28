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

  it('llGetLinkPrimitiveParams against multi-prim target concatenates per-prim results', async () => {
    const probe = `
      list out = [];
      default {
        state_entry() {
          out = llGetLinkPrimitiveParams(LINK_SET, [PRIM_NAME]);
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
    expect(s.host.params.faces[1]!.alpha).toBe(0.2) // preserved
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
    expect(s.global('out')).toEqual([1.5, 0.3, 0.7, 1234])
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
