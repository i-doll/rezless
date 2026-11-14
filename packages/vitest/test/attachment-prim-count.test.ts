import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetObjectPrimCount: "Zero is returned if
// prim: (A) is not found, (B) is part of an attachment, or (C) is not a prim."
// https://wiki.secondlife.com/wiki/LlGetObjectDetails says only that
// OBJECT_PRIM_COUNT "Gets the object's prim count".
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-13):
// a lone box and three linked boxes, read while rezzed and then worn on the
// chest (point 1), the left hand (point 5) and the centre HUD point (35), by
// their own scripts, by each other and by a rezzed box next to the avatar, and
// a box attached with llAttachToAvatarTemp.
// Every "In-world:" note in this file is from those probes.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const READ = `
  list out;
  list read(key id) {
    return [llGetObjectPrimCount(id)] + llGetObjectDetails(id, [OBJECT_PRIM_COUNT, OBJECT_PRIM_EQUIVALENCE, OBJECT_ATTACHED_POINT]);
  }`

async function scene(count: number, point: number, readerPoint = 0, temporary = false) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 114, y: 50, z: 20 },
  })
  const worn = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 114, y: 50, z: 20 },
    prims: Array.from({ length: count }, (_, i) => ({
      name: `w${i + 1}`,
      scripts: i ? [] : [{ name: 'worn', source: { source: `${READ}
        default {
          touch_start(integer n) {
            integer last = llGetNumberOfPrims();
            out = [last, llGetLinkNumber()] + read(llGetKey());
            if (last > 1) out += read(llGetLinkKey(2)) + read(llGetLinkKey(last));
            out += [llGetObjectPrimCount(llGetOwner())];
          }
        }` } }],
    })),
  })
  const keys = worn.linkset.prims.map((prim) => prim.key)
  const seat = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
    prims: [{ name: 'seat', scripts: [{ name: 'seat', source: { source: `${READ}
      default {
        touch_start(integer n) { out = read("${keys[0]}") + read("${keys.at(-1)}") + read(llGetKey()); }
      }` } }] }],
  })
  worn.scripts.worn!.start()
  seat.scripts.seat!.start()
  if (point) worn.linkset.attachToAvatar(AVATAR, point, temporary)
  if (readerPoint) seat.linkset.attachToAvatar(AVATAR, readerPoint)
  const run = (object: typeof worn | typeof seat, name: 'worn' | 'seat') => {
    object.linkset.touch(object.linkset.prims[0]!.linkNumber, { avatar: { key: AVATAR, name: 'av' } })
    object.linkset.advanceTime(1000)
    return (object.scripts as Record<string, { global(name: string): unknown }>)[name]!.global('out')
  }
  return { world, avatar, seat, self: () => run(worn, 'worn'), other: () => run(seat, 'seat') }
}

describe('the prim count of an attachment', () => {
  // In-world: rezzed, the three boxes read llGetNumberOfPrims 3, link 1, and
  // llGetObjectPrimCount 3 / OBJECT_PRIM_COUNT 3 / OBJECT_PRIM_EQUIVALENCE 3 /
  // OBJECT_ATTACHED_POINT 0 for the root's key, link 2's and link 3's. The lone
  // box read 1, link 0 and 1 / 1 / 1 / 0. llGetObjectPrimCount(owner) was 0.
  it.each([
    [3, [3, 1, 3, 3, 3, 0, 3, 3, 3, 0, 3, 3, 3, 0, 0]],
    [1, [1, 0, 1, 1, 1, 0, 0]],
  ])('is the number of prims while the %i-prim object is rezzed', async (count, want) => {
    expect((await scene(count, 0)).self()).toEqual(want)
  })

  // In-world: worn, llGetObjectPrimCount read 0 for the attachment's own key and
  // for the keys of its links 2 and 3, on the chest, the left hand and the centre
  // HUD point. llGetNumberOfPrims still read 3 (1 for the lone box), and
  // OBJECT_PRIM_COUNT and OBJECT_PRIM_EQUIVALENCE read 3 (1) for every link's key.
  it.each([
    [3, 5, [3, 1, 0, 3, 3, 5, 0, 3, 3, 5, 0, 3, 3, 5, 0]],
    [1, 1, [1, 0, 0, 1, 1, 1, 0]],
    [1, 35, [1, 0, 0, 1, 1, 35, 0]],
  ])('reads 0 from llGetObjectPrimCount for %i worn prims on point %i', async (count, point, want) => {
    expect((await scene(count, point)).self()).toEqual(want)
  })

  // In-world: a box that asked for PERMISSION_ATTACH and called
  // llAttachToAvatarTemp(ATTACH_RHAND) read the same once worn: 0 from
  // llGetObjectPrimCount, 1 from llGetNumberOfPrims and OBJECT_PRIM_COUNT.
  it('reads 0 from llGetObjectPrimCount for a temporary attachment', async () => {
    expect((await scene(1, 6, 0, true)).self()).toEqual([1, 0, 0, 1, 1, 6, 0])
  })

  // In-world: a rezzed box next to the avatar read the worn object's root key
  // and its last link's key the same way: llGetObjectPrimCount 0,
  // OBJECT_PRIM_COUNT and OBJECT_PRIM_EQUIVALENCE the number of prims. So did
  // the lone box worn on the chest for the three boxes on the left hand, and it
  // read 3 from llGetObjectPrimCount for three rezzed boxes. The last four
  // numbers of a row are the reader's own key.
  it.each([
    [3, 5, 0, [0, 3, 3, 5, 0, 3, 3, 5, 1, 1, 1, 0]],
    [1, 1, 0, [0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0]],
    [1, 35, 0, [0, 1, 1, 35, 0, 1, 1, 35, 1, 1, 1, 0]],
    [3, 0, 0, [3, 3, 3, 0, 3, 3, 3, 0, 1, 1, 1, 0]],
    [3, 5, 1, [0, 3, 3, 5, 0, 3, 3, 5, 0, 1, 1, 1]],
    [3, 0, 1, [3, 3, 3, 0, 3, 3, 3, 0, 0, 1, 1, 1]],
  ])('reads the same from another object: %i prims on point %i, reader on point %i', async (count, point, reader, want) => {
    expect((await scene(count, point, reader)).other()).toEqual(want)
  })

  // In-world: with the wearer seated on a box, the worn objects read the same
  // as before: llGetNumberOfPrims 3 and 1, llGetObjectPrimCount 0.
  it.each([
    [3, 5, [3, 1, 0, 3, 3, 5, 0, 3, 3, 5, 0, 3, 3, 5, 0]],
    [1, 1, [1, 0, 0, 1, 1, 1, 0]],
  ])('does not change when the wearer sits down: %i prims', async (count, point, want) => {
    const s = await scene(count, point)
    expect(s.world.sitAvatar(s.avatar, s.seat.linkset.prims[0]!)).toBe(true)
    s.seat.linkset.advanceTime(100)
    expect(s.self()).toEqual(want)
  })
})

// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-14):
// the lone box and the three linked boxes worn from inventory on the chest and
// the left hand, and the lone box attached with llAttachToAvatarTemp. A second
// script in the worn object called llDetachFromAvatar, so the reporting script
// was idle and ran attach(NULL_KEY) before the object left the region. A rezzed
// box read the worn root's key ten times a second across the detach.
describe('the prim count of an attachment being detached', () => {
  const WORN = `
    list out;
    list read(key id) { return [llGetObjectPrimCount(id)] + llGetObjectDetails(id, [OBJECT_PRIM_COUNT, OBJECT_ATTACHED_POINT]); }
    list all() {
      integer n = llGetNumberOfPrims();
      list o = [llGetAttached(), n] + read(llGetKey());
      if (n > 1) o += read(llGetLinkKey(2)) + read(llGetLinkKey(n));
      return o;
    }
    default {
      attach(key id) { if (id == NULL_KEY) out += ["off"] + all(); }
      run_time_permissions(integer p) { llDetachFromAvatar(); out += ["called"] + all(); }
      touch_start(integer n) { llRequestPermissions(llGetOwner(), PERMISSION_ATTACH); }
    }`

  async function detached(count: number, point: number, temporary: boolean) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: AVATAR, name: 'av', username: 'av', position: { x: 114, y: 50, z: 20 } })
    const worn = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 114, y: 50, z: 20 },
      prims: Array.from({ length: count }, (_, i) => ({ scripts: i ? [] : [{ name: 'worn', source: { source: WORN } }] })),
    })
    const root = worn.linkset.prims[0]!.key
    const reader = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
      prims: [{ scripts: [{ name: 'reader', source: { source: `${READ}
        default { touch_start(integer n) { out = read("${root}") + [llKey2Name("${root}")]; } }` } }] }],
    })
    worn.scripts.worn!.start()
    reader.scripts.reader!.start()
    worn.linkset.attachToAvatar(AVATAR, point, temporary)
    // The wearer is granted PERMISSION_ATTACH without a dialog.
    worn.linkset.touch(worn.linkset.prims[0]!.linkNumber, { avatar: { key: AVATAR, name: 'av' } })
    worn.linkset.advanceTime(1000)
    reader.linkset.touch(0)
    reader.linkset.advanceTime(100)
    return { self: worn.scripts.worn!.global('out'), other: reader.scripts.reader!.global('out') }
  }

  // In-world: in the event that called llDetachFromAvatar the object still read
  // as worn after the call: llGetAttached the point, llGetObjectPrimCount 0,
  // OBJECT_PRIM_COUNT the prims and OBJECT_ATTACHED_POINT the point. In
  // attach(NULL_KEY) llGetAttached and OBJECT_ATTACHED_POINT read 0,
  // llGetNumberOfPrims and OBJECT_PRIM_COUNT still the prims, and
  // llGetObjectPrimCount still 0, for the root's key and for links 2 and 3. It
  // never read the prim count on the way out. The temporary attachment read
  // the same in attach(NULL_KEY).
  it.each([
    [1, 1, false, ['called', 1, 1, 0, 1, 1, 'off', 0, 1, 0, 1, 0]],
    [3, 5, false, ['called', 5, 3, 0, 3, 5, 0, 3, 5, 0, 3, 5, 'off', 0, 3, 0, 3, 0, 0, 3, 0, 0, 3, 0]],
    [1, 6, true, ['called', 6, 1, 0, 1, 6, 'off', 0, 1, 0, 1, 0]],
  ])('reads 0 from llGetObjectPrimCount for %i prims leaving point %i, temporary %s', async (count, point, temporary, want) => {
    expect((await detached(count, point, temporary)).self).toEqual(want)
  })

  // In-world: the rezzed box read llGetObjectPrimCount 0, OBJECT_PRIM_COUNT the
  // prims and the attachment point until the key was gone, and then 0, an empty
  // list from llGetObjectDetails and "" from llKey2Name. It saw nothing between.
  it.each([[1, 1, false], [3, 5, false], [1, 6, true]])('is gone for another object: %i prims, point %i, temporary %s', async (count, point, temporary) => {
    expect((await detached(count, point, temporary)).other).toEqual([0, ''])
  })
})
