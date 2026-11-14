import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetLinkMedia documents the status codes and
// says nothing about an avatar link.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-13):
// one avatar seated on a lone box, so the box is link 1 and the avatar link 2.
// A second box 7 m away listened on DEBUG_CHANNEL and reported each speaker's
// name and key, and so did the seat's own script. Every "In-world:" note in
// this file is from those probes.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const CHANGED_MEDIA = 2048

async function scene(body: string, sitHeight = 0.6) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'Av Atar', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 110, y: 50, z: 20 },
  })
  const seat = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
    prims: [{ name: 'box', scripts: [{ name: 'box', source: { source: `
      list out; list changes; list heard; integer step;
      string U = "https://example.com/";
      default {
        state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
        listen(integer c, string name, key id, string msg) { heard += [name]; }
        changed(integer c) { changes += [c]; }
        touch_start(integer n) { ${body} ++step; }
      }` } }] }],
  })
  const listener = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 116, y: 57, z: 20 },
    prims: [{ name: 'listener', scripts: [{ name: 'listener', source: { source: `
      list heard;
      default {
        state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
        listen(integer c, string name, key id, string msg) { heard += [name, (string)id, msg]; }
      }` } }] }],
  })
  const box = seat.scripts.box!
  box.start()
  listener.scripts.listener!.start()
  const prim = seat.linkset.prims[0]!
  prim.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: sitHeight }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
  expect(world.sitAvatar(avatar, prim)).toBe(true)
  seat.linkset.advanceTime(100)
  const run = () => {
    seat.linkset.touch(1, { avatar: { key: AVATAR, name: 'Av Atar' } })
    seat.linkset.advanceTime(60000)
    const changes = (box.global('changes') as number[]).filter((c) => c === CHANGED_MEDIA).length
    return { out: box.global('out') as unknown[], changes }
  }
  return { world, run, box, prim, heard: () => listener.scripts.listener!.global('heard') as string[] }
}

describe('media errors on an avatar link', () => {
  // In-world: llSetLinkMedia(2, 45, ...) returned 1003, llGetLinkMedia(2, ALL_SIDES,
  // ...) returned [], llSetLinkMedia(2, 0, [99, 1]) returned 1000, and with media on
  // the avatar's face 0 llGetLinkMedia(2, 0, [99]) returned []. The listener heard
  // each error from the avatar: its name, and its key as the speaker. So did
  // llClearLinkMedia(2, 45), llGetLinkMedia(2, 45, ...), a type mismatch and a
  // bounds error in llSetLinkMedia(2, 0, ...). The seat's own script heard them
  // too. The same calls on the box (face 6, and [99, 1] on face 0) were heard from
  // the box, by name and key, and the box did not hear itself.
  it('are heard from the avatar, and a prim link errors from the prim', async () => {
    const s = await scene(`
      out = [llSetLinkMedia(2, 45, [PRIM_MEDIA_HOME_URL, U + "a"])];
      out += [llGetListLength(llGetLinkMedia(2, ALL_SIDES, [PRIM_MEDIA_HOME_URL]))];
      out += [llSetLinkMedia(2, 0, [99, 1])];
      llSetLinkMedia(2, 0, [PRIM_MEDIA_HOME_URL, U + "a"]);
      out += [llGetListLength(llGetLinkMedia(2, 0, [99]))];
      out += [llSetLinkMedia(1, 6, [PRIM_MEDIA_HOME_URL, U + "a"]), llSetLinkMedia(1, 0, [99, 1])];`)
    expect(s.run().out).toEqual([1003, 0, 1000, 0, 1003, 1000])
    const malformed = 'llSetPrimMediaParams error: Malformed parameters near parameter #0, param=99.  No values have been set.'
    expect(s.heard()).toEqual([
      'Av Atar', AVATAR, `PRIM_MEDIA error: face 45 on object ${AVATAR} not found`,
      'Av Atar', AVATAR, 'PRIM_MEDIA error: ALL_SIDES not supported',
      'Av Atar', AVATAR, malformed,
      'Av Atar', AVATAR, "llGetPrimMediaParams error: Unknown parameter '99'",
      'box', s.prim.key, `PRIM_MEDIA error: face 6 on object ${s.prim.key} not found`,
      'box', s.prim.key, malformed,
    ])
    expect(s.box.global('heard')).toEqual(Array(4).fill('Av Atar'))
    expect(s.box.chat.map((c) => c.from)).toEqual([AVATAR, AVATAR, AVATAR, AVATAR, undefined, undefined])
    expect(s.box.chat.every((c) => c.channel === 2147483647 && c.type === 'say')).toBe(true)
  })

  it.each([
    ['llClearLinkMedia(2, 45);', 'PRIM_MEDIA error: face 45 on object abcdefab-1234-1234-1234-abcdefabcdef not found'],
    ['llGetLinkMedia(2, 45, [PRIM_MEDIA_HOME_URL]);', 'PRIM_MEDIA error: face 45 on object abcdefab-1234-1234-1234-abcdefabcdef not found'],
    ['llSetLinkMedia(2, 0, [PRIM_MEDIA_HOME_URL, 5]);', 'llSetPrimMediaParams error: Type mismatch near parameter #0, param=3.  No values have been set.'],
    ['llSetLinkMedia(2, 0, [PRIM_MEDIA_WIDTH_PIXELS, 99999]);', 'llSetPrimMediaParams error: Bounds error near parameter #0, param=9.  No values have been set.'],
  ])('are heard from the avatar: %s', async (call, error) => {
    const s = await scene(call)
    s.run()
    expect(s.heard()).toEqual(['Av Atar', AVATAR, error])
  })

  // In-world: with the sit target 30 m above the box, llSetLinkMedia(2, 45, ...)
  // was heard by a listener 2 m from the avatar and not by the listener 4 m from
  // the box, nor by the box's own script. The avatar says it from where it is.
  it('are said from where the avatar is', async () => {
    const s = await scene('llSetLinkMedia(2, 45, [PRIM_MEDIA_HOME_URL, U]);', 30)
    const far = await loadLinkset({
      world: s.world, region: 'home', owner: AVATAR, position: { x: 116, y: 52, z: 50 },
      prims: [{ name: 'far', scripts: [{ name: 'far', source: { source: `
        list heard;
        default {
          state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
          listen(integer c, string name, key id, string msg) { heard += [name]; }
        }` } }] }],
    })
    far.scripts.far!.start()
    s.run()
    far.linkset.advanceTime(1000)
    expect(far.scripts.far!.global('heard')).toEqual(['Av Atar'])
    expect(s.heard()).toEqual([])
    expect(s.box.global('heard')).toEqual([])
  })

  // In-world (the same grid and day, a later probe): the seated avatar wore a
  // box on the chest and three linked boxes on the left hand, and in a second
  // run a box on the centre HUD point and a temporary attachment on the right
  // hand. Each listened on DEBUG_CHANNEL and heard llSetLinkMedia(2, 45, ...)
  // from the avatar, by its name and key. The test wears the chest box, and
  // puts it far away because a worn object hears its wearer wherever the
  // fixture has it.
  it('are heard by what the avatar wears', async () => {
    const s = await scene('llSetLinkMedia(2, 45, [PRIM_MEDIA_HOME_URL, U]);')
    const worn = await loadLinkset({
      world: s.world, region: 'home', owner: AVATAR, position: { x: 200, y: 200, z: 20 },
      prims: [{ name: 'worn', scripts: [{ name: 'worn', source: { source: `
        list heard;
        default {
          state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
          listen(integer c, string name, key id, string msg) { heard += [name, (string)id]; }
        }` } }] }],
    })
    worn.scripts.worn!.start()
    worn.linkset.attachToAvatar(AVATAR, 1)
    s.run()
    worn.linkset.advanceTime(1000)
    expect(worn.scripts.worn!.global('heard')).toEqual(['Av Atar', AVATAR])
  })

  // In-world, two linked boxes: llSetLinkMedia(2, 6, ...) and llGetLinkMedia(2,
  // ALL_SIDES, ...) from the root were heard from child 2, by its name and key,
  // by the root's script and by a listener in another object. Child 2 did not
  // hear them. The same calls from child 2 on link 1 were heard from the root.
  it('for another prim of the object are heard from that prim', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const source = `
      list heard;
      default {
        state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
        listen(integer c, string name, key id, string msg) { heard += [name, (string)id]; }
        touch_start(integer n) {
          integer other = 3 - llGetLinkNumber();
          llSetLinkMedia(other, 6, [PRIM_MEDIA_HOME_URL, "https://example.com/"]);
          llGetLinkMedia(other, ALL_SIDES, [PRIM_MEDIA_HOME_URL]);
        }
      }`
    const { linkset, scripts } = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
      prims: ['e1', 'e2'].map((name) => ({ name, scripts: [{ name, source: { source } }] })),
    })
    for (const script of Object.values(scripts)) script.start()
    const [e1, e2] = linkset.prims.map((prim) => prim.key)
    linkset.touch(1)
    linkset.advanceTime(1000)
    expect(scripts.e1!.global('heard')).toEqual(['e2', e2, 'e2', e2])
    expect(scripts.e2!.global('heard')).toEqual([])
    expect(scripts.e1!.chat.map((c) => c.from)).toEqual([e2, e2])
    expect(scripts.e2!.chat).toEqual([])
    linkset.touch(2)
    linkset.advanceTime(1000)
    expect(scripts.e1!.global('heard')).toEqual(['e2', e2, 'e2', e2])
    expect(scripts.e2!.global('heard')).toEqual(['e1', e1, 'e1', e1])
  })

  // In-world: llGetLinkMedia(2, 0, [99]) on an avatar face that held no media
  // returned [] and said nothing.
  it('says nothing for an unknown parameter on a face without media', async () => {
    const s = await scene('out = [llGetListLength(llGetLinkMedia(2, 0, [99]))];')
    expect(s.run().out).toEqual([0])
    expect(s.heard()).toEqual([])
  })
})

describe('media events raised inside one event', () => {
  // In-world, one step every five seconds. Two llSetLinkMedia calls on one avatar
  // face in one event raised one changed(CHANGED_MEDIA). A set and then a clear of
  // one avatar face in one event raised one, left the face empty, and the next
  // clear of that face raised nothing. The same on a face of the box. A media set
  // and llSetLinkAlpha in one event raised one changed with both bits (2050).
  it.each([
    ['llSetLinkMedia(2, 1, [PRIM_MEDIA_HOME_URL, U + "c"]); llSetLinkMedia(2, 1, [PRIM_MEDIA_HOME_URL, U + "d"]);', 2, 1, 1, 2],
    ['llSetLinkMedia(2, 2, [PRIM_MEDIA_HOME_URL, U + "c"]); llClearLinkMedia(2, 2);', 2, 2, 0, 1],
    ['llSetLinkMedia(1, 1, [PRIM_MEDIA_HOME_URL, U + "c"]); llClearLinkMedia(1, 1);', 1, 1, 0, 1],
  ])('merges them into one changed event: %s', async (calls, link, face, left, after) => {
    const s = await scene(`
      if (step == 0) { changes = []; ${calls} }
      else llClearLinkMedia(${link}, ${face});
      out = [llGetListLength(llGetLinkMedia(${link}, ${face}, [PRIM_MEDIA_HOME_URL]))];`)
    expect(s.run()).toEqual({ out: [left], changes: 1 })
    expect(s.run()).toEqual({ out: [0], changes: after })
  })

  it('merges a media change and a colour change into one changed event', async () => {
    const s = await scene('changes = []; llSetLinkMedia(1, 1, [PRIM_MEDIA_HOME_URL, U + "c"]); llSetLinkAlpha(1, 0.5, 0);')
    s.run()
    expect(s.box.global('changes')).toEqual([2050])
  })

  // LSL evaluates the operands of + right to left, so in
  // (string)llSetLinkMedia(...) + "," + (string)llClearLinkMedia(...) the clear runs
  // first. In-world that expression on an empty avatar face returned "0,0", raised
  // one changed(CHANGED_MEDIA) and left media on the face; the next clear raised
  // one more, and the clear after that none.
  it('clears before it sets when both calls are operands of one +', async () => {
    const s = await scene(`
      if (step == 0) { changes = []; out = [(string)llSetLinkMedia(2, 0, [PRIM_MEDIA_HOME_URL, U + "a"]) + "," + (string)llClearLinkMedia(2, 0)]; }
      else out = [(string)llClearLinkMedia(2, 0)];
      out += [llGetListLength(llGetLinkMedia(2, 0, [PRIM_MEDIA_HOME_URL]))];`)
    expect(s.run()).toEqual({ out: ['0,0', 1], changes: 1 })
    expect(s.run()).toEqual({ out: ['0', 0], changes: 2 })
    expect(s.run()).toEqual({ out: ['0', 0], changes: 2 })
  })
})
