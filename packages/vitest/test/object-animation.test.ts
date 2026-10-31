import { describe, it, expect } from 'vitest'
import { loadLinkset, DEBUG_CHANNEL, InventoryType, makeInventoryItem, type Script } from '../src/index.js'

// llStartObjectAnimation, llStopObjectAnimation and llGetObjectAnimationNames
// (https://wiki.secondlife.com/wiki/LlStartObjectAnimation and its siblings).
// In-world probes: Aditi, SLua Tideland, Mono, 2026-10-31. The animated object was a
// copy of "Jinx : Animesh Raven Arm Pet" with its own scripts removed and an
// uploaded animation "pa" (asset 8bb58a4f-...) added; the plain object was a box.
const PA = '8bb58a4f-f0c3-f60c-acb2-9211ad3e98cb'
const STAND = '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f'
const SIT = '1a5fe8ac-a804-8a5d-7cbd-56bd83184568'
const DANCE1 = 'b68a3d7c-de9e-fc87-eec8-543d787e5b0d'
const HELLO = '9b29cd61-c45b-5689-ded2-91756b8d76a9'
const UNKNOWN = '6a3c0e6e-1f6d-4a3b-9b62-2f0c1d1e7a55'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'

const anim = (name: string, key: string) => makeInventoryItem({ name, type: InventoryType.ANIMATION, key })

const PROBE = (body: string) => `
  list out;
  string names() { return llList2CSV(llGetObjectAnimationNames()); }
  default { state_entry() { ${body} } }
`

async function run(body: string, opts: { animesh?: boolean; inventory?: ReturnType<typeof anim>[] } = {}) {
  const { scripts } = await loadLinkset({
    animesh: opts.animesh ?? true,
    prims: [{ inventory: opts.inventory ?? [anim('pa', PA)], scripts: [{ name: 'p', source: { source: PROBE(body) } }] }],
  })
  const p = scripts.p!
  p.start()
  p.advanceTime(100)
  return { p, out: p.global('out') as unknown[] }
}

const errors = (s: Script) => s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)

describe('llStartObjectAnimation', () => {
  it('lists a built-in animation by its UUID, once however often it starts', async () => {
    // In-world: llStartObjectAnimation("stand") twice -> [2408fe9e-...] both times.
    const { out } = await run(`llStartObjectAnimation("stand"); out += names(); llStartObjectAnimation("stand"); out += names();`)
    expect(out).toEqual([STAND, STAND])
  })

  it('matches built-in names in any case', async () => {
    // In-world: llStartObjectAnimation("SIT") -> [1a5fe8ac-...]; "Dance1" -> adds b68a3d7c-..., no error.
    const { p, out } = await run(`llStartObjectAnimation("SIT"); llStartObjectAnimation("Dance1"); out += names();`)
    expect(out).toEqual([`${SIT}, ${DANCE1}`])
    expect(errors(p)).toEqual([])
  })

  it('lists an inventory animation by its name', async () => {
    // In-world: llStartObjectAnimation("pa") -> [..., pa, ...].
    const { out } = await run(`llStartObjectAnimation("pa"); out += names();`)
    expect(out).toEqual(['pa'])
  })

  it('orders the list by animation UUID', async () => {
    // In-world: sit, dance1, pa, then stand -> [1a5fe8ac-..., 2408fe9e-..., pa (8bb58a4f-...), b68a3d7c-...].
    const { out } = await run(`
      llStartObjectAnimation("sit"); llStartObjectAnimation("dance1");
      llStartObjectAnimation("pa"); llStartObjectAnimation("stand"); out += names();`)
    expect(out).toEqual([`${SIT}, ${STAND}, pa, ${DANCE1}`])
  })

  it('takes an inventory animation over a built-in of the same name', async () => {
    // In-world: with "pa" and "stand" (same asset 8bb58a4f-...) in inventory,
    // llStartObjectAnimation("stand") -> [pa]; stopping 2408fe9e-... leaves it.
    const { out } = await run(
      `llStartObjectAnimation("stand"); out += names(); llStopObjectAnimation("${STAND}"); out += names();`,
      { inventory: [anim('pa', PA), anim('stand', PA)] },
    )
    expect(out).toEqual(['pa', 'pa'])
  })

  it('says an error for names it cannot find, UUIDs included', async () => {
    // In-world, each on DEBUG_CHANNEL with no full stop: "Could not find animation 'nosuch'",
    // '' for "", '2408fe9e-...' for the stand UUID, '8bb58a4f-...' for pa's key,
    // 'PA' for "PA", and 'probe152 root3' for a script's name.
    const { p, out } = await run(`
      llStartObjectAnimation("nosuch"); llStartObjectAnimation(""); llStartObjectAnimation("${STAND}");
      llStartObjectAnimation("${PA}"); llStartObjectAnimation("PA"); llStartObjectAnimation("p"); out += names();`)
    expect(out).toEqual([''])
    expect(errors(p)).toEqual([
      "Could not find animation 'nosuch'",
      "Could not find animation ''",
      `Could not find animation '${STAND}'`,
      `Could not find animation '${PA}'`,
      "Could not find animation 'PA'",
      "Could not find animation 'p'",
    ])
  })

  it('plays nothing in an object that is not animated, with the same errors', async () => {
    // In-world (box): "stand", "sit", "pa" -> [] every time; "nosuch" -> the same error.
    const { p, out } = await run(
      `llStartObjectAnimation("stand"); llStartObjectAnimation("pa"); out += names(); llStartObjectAnimation("nosuch");`,
      { animesh: false },
    )
    expect(out).toEqual([''])
    expect(errors(p)).toEqual(["Could not find animation 'nosuch'"])
  })

  it('keeps playing across a script reset', async () => {
    // In-world: [sit, stand, ...] read the same before llResetScript and in the next state_entry.
    const { scripts } = await loadLinkset({
      animesh: true,
      prims: [
        {
          scripts: [
            {
              name: 'p',
              source: {
                source: `list out;
                  default {
                    state_entry() { out += llList2CSV(llGetObjectAnimationNames()); if (out == [""]) llSetTimerEvent(1); }
                    timer() { llSetTimerEvent(0); llStartObjectAnimation("sit"); llResetScript(); }
                  }`,
              },
            },
          ],
        },
      ],
    })
    const p = scripts.p!
    p.start()
    p.advanceTime(2000)
    expect(p.global('out')).toEqual([SIT])
  })
})

describe('llStopObjectAnimation', () => {
  it('stops by name, built-in UUID or inventory key, and built-in names in any case', async () => {
    // In-world: stop "sit" removed 1a5fe8ac-...; stop 2408fe9e-... removed stand;
    // stop "AIM_R_RIFLE" removed ea633413-...; stop pa's key removed pa.
    const { p, out } = await run(`
      llStartObjectAnimation("sit"); llStartObjectAnimation("stand");
      llStartObjectAnimation("aim_r_rifle"); llStartObjectAnimation("pa");
      llStopObjectAnimation("sit"); out += names();
      llStopObjectAnimation("${STAND}"); out += names();
      llStopObjectAnimation("AIM_R_RIFLE"); out += names();
      llStopObjectAnimation("${PA}"); out += names();`)
    expect(out).toEqual([
      `${STAND}, pa, ea633413-8006-180a-c3ba-96dd1d756720`,
      'pa, ea633413-8006-180a-c3ba-96dd1d756720',
      'pa',
      '',
    ])
    expect(errors(p)).toEqual([])
  })

  it('does nothing for an animation that is not playing', async () => {
    // In-world: stop "sit" twice, "dance1" never started, and 6a3c0e6e-... -> no change, no error.
    const { p, out } = await run(`
      llStartObjectAnimation("stand");
      llStopObjectAnimation("sit"); llStopObjectAnimation("dance1"); llStopObjectAnimation("${UNKNOWN}"); out += names();`)
    expect(out).toEqual([STAND])
    expect(errors(p)).toEqual([])
  })

  it('says an error, with a full stop, for names it cannot find', async () => {
    // In-world: "Could not find animation 'nosuch'.", "''.", "'00000000-...'." and "'PA'.".
    const { p } = await run(`
      llStartObjectAnimation("pa");
      llStopObjectAnimation("nosuch"); llStopObjectAnimation(""); llStopObjectAnimation("${NULL_KEY}"); llStopObjectAnimation("PA");`)
    expect(errors(p)).toEqual([
      "Could not find animation 'nosuch'.",
      "Could not find animation ''.",
      `Could not find animation '${NULL_KEY}'.`,
      "Could not find animation 'PA'.",
    ])
  })
})

describe('llGetObjectAnimationNames', () => {
  it('is empty before anything starts', async () => {
    const { out } = await run(`out += names();`)
    expect(out).toEqual([''])
  })

  it('reads the calling prim only: a child prim plays its own animations', async () => {
    // In-world: llStartObjectAnimation("hello") in link 2 -> link 2 reads [9b29cd61-...];
    // the root's list stayed [...] without it, and the root stopping "hello" left link 2's.
    const { scripts } = await loadLinkset({
      animesh: true,
      prims: [
        {
          scripts: [
            {
              name: 'root',
              source: {
                source: `list out; default { state_entry() { llStartObjectAnimation("sit"); llMessageLinked(2, 0, "go", ""); }
                  link_message(integer s, integer n, string m, key k) {
                    out += [m, llList2CSV(llGetObjectAnimationNames())]; llStopObjectAnimation("hello"); llMessageLinked(2, 1, "", ""); } }`,
              },
            },
          ],
        },
        {
          scripts: [
            {
              name: 'child',
              source: {
                source: `list out; default { link_message(integer s, integer n, string m, key k) {
                  if (n == 0) { llStartObjectAnimation("hello"); llMessageLinked(LINK_ROOT, 0, llList2CSV(llGetObjectAnimationNames()), ""); }
                  else out += llList2CSV(llGetObjectAnimationNames()); } }`,
              },
            },
          ],
        },
      ],
    })
    for (const s of Object.values(scripts)) s.start()
    scripts.root!.advanceTime(1000)
    expect(scripts.root!.global('out')).toEqual([HELLO, SIT])
    expect(scripts.child!.global('out')).toEqual([HELLO])
  })
})
