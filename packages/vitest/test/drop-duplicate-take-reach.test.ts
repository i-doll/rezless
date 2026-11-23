import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, PERM_ALL, seedRlvInventory, PERM_COPY, PERMISSION_CONTROL_CAMERA, PERMISSION_TAKE_CONTROLS, World } from '../src/index.js'

// Every "In-world" note below was measured on the Aditi beta grid, SLua Tideland, 2026-11-23,
// with Firestorm 7 and RLVa 2.4.2. Restrictions came from a worn object that said them with
// llOwnerSay. Menu entries were read from the viewer's pie menu state for the object, and each
// Drop and Duplicate was tried with the viewer's own Drop and Duplicate.

const issuer = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
type Rlv = Awaited<ReturnType<typeof loadRlvPair>>['rlva']

function command(f: Rlv, text: string) {
  f.script.setGlobal('command', text)
  f.script.fire('touch_start', { num_detected: 1 })
}

async function scene(profile: 'rlva' | 'rlv' = 'rlva') {
  const f = (await loadRlvPair({ source: issuer }))[profile]
  f.script.start()
  f.avatar.position = { x: 10, y: 10, z: 10 }
  return f
}

async function box(f: Rlv, at: { x: number, y: number, z: number }, scale = { x: 0.5, y: 0.5, z: 0.5 }, source = 'default { state_entry() { } }') {
  const made = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, position: at,
    prims: [{ size: scale, scripts: [{ name: 'main', source: { source } }] }] })
  made.scripts['main']!.start()
  made.linkset.advanceTime(10)
  return made
}

describe('Take under @editworld alone', () => {
  // In-world: under @editworld alone the menu had Take and Take Copy on (Edit off), and the
  // viewer's Take put the object in inventory.
  it('stays on, and the take goes through', async () => {
    const f = await scene()
    const target = (await box(f, { x: 10, y: 11, z: 10 })).linkset
    command(f, '@editworld=n')
    expect(f.edit(target.prims[0]!).status).toBe('blocked')
    expect(f.take(target.prims[0]!, { copy: true }).status).toBe('taken')
    expect(f.take(target.prims[0]!)).toMatchObject({ status: 'taken' })
    expect(target.dead).toBe(true)
  })
})

// The pie menu's reach under @fartouch is the viewer's own rule, in lltoolselect.cpp
// (handleObjectSelection): the menu opens when the clicked prim's center is within the reach, or
// else when the clicked point is within 1.5 m, whatever the reach. The viewer's menu-state tool
// reads the object's center only and can't name a clicked point, so this is from the source.
describe('the @fartouch reach for Take on a large prim', () => {
  async function long(f: Rlv) {
    // 8 m long along x, its center 4.5 m from the avatar: the near end is 0.5 m away.
    return (await box(f, { x: 14.5, y: 10, z: 10 }, { x: 8, y: 0.5, z: 0.5 })).linkset.prims[0]!
  }

  it('opens the menu when the clicked point is within 1.5 m', async () => {
    const f = await scene()
    const prim = await long(f)
    command(f, '@fartouch=n')
    expect(f.take(prim, { copy: true, offset: { x: -3.8, y: 0, z: 0 } }).status).toBe('taken')
    expect(f.take(prim, { offset: { x: -3.2, y: 0, z: 0.25 } }).status).toBe('taken')
  })

  it('opens none for the far end or the center', async () => {
    const f = await scene()
    const prim = await long(f)
    command(f, '@fartouch=n')
    expect(f.take(prim, { copy: true, offset: { x: 3.8, y: 0, z: 0 } })).toMatchObject({ status: 'blocked', reason: 'fartouch' })
    expect(f.take(prim, { copy: true }).status).toBe('blocked')
    expect(f.take(prim, { copy: true, offset: { x: 0, y: 0.25, z: 0 } }).status).toBe('blocked')
  })

  it('keeps the clicked point to 1.5 m under a longer reach', async () => {
    const f = await scene()
    const prim = await long(f)
    command(f, '@fartouch:3=n')
    // The point is 2 m away, inside the 3 m reach, but the center is 4.5 m away.
    expect(f.take(prim, { copy: true, offset: { x: -2.5, y: 0, z: 0 } }).status).toBe('blocked')
    command(f, '@fartouch:3=y')
    command(f, '@fartouch:5=n')
    expect(f.take(prim, { copy: true }).status).toBe('taken')
  })

  it('needs no clicked point within the reach, and Kokua has no such rule', async () => {
    const f = await scene()
    const near = (await box(f, { x: 11, y: 10, z: 10 })).linkset.prims[0]!
    command(f, '@fartouch=n')
    expect(f.take(near, { copy: true, offset: { x: 5, y: 0, z: 0 } }).status).toBe('taken')
    const kokua = await scene('rlv')
    const prim = await long(kokua)
    command(kokua, '@fartouch=n')
    expect(kokua.take(prim, { copy: true }).status).toBe('taken')
  })
})

describe('the viewer\'s Drop under RLV', () => {
  const SPINE = 9
  async function worn(f: Rlv) {
    const made = await box(f, { x: 10, y: 11, z: 10 })
    made.linkset.attachToAvatar(f.avatar.key, SPINE)
    return made.linkset
  }

  // In-world: Drop was refused under @rez, @detach:spine and @remattach:spine for an object on
  // the spine, and when the object itself had said @detach=n.
  it('is refused under @rez and for a locked attachment', async () => {
    for (const restriction of ['rez', 'detach:spine', 'remattach:spine', 'remattach']) {
      const f = await scene()
      const object = await worn(f)
      command(f, `@${restriction}=n`)
      const attempt = f.drop(object)
      expect(attempt, restriction).toMatchObject({ status: 'blocked', reason: restriction.split(':')[0] })
      expect(object.attachment).not.toBeNull()
    }
    const f = await scene()
    const self = f.script.linkset
    self.attachToAvatar(f.avatar.key, SPINE)
    command(f, '@detach=n')
    expect(f.drop(self)).toMatchObject({ status: 'blocked', reason: 'detach' })
  })

  // In-world: @detach:stomach, @edit, @editattach, @editobj on the object, @addattach and
  // @detach said by another worn object left Drop on, and a Drop under @editattach went through.
  it('goes through under restrictions that do not reach it', async () => {
    for (const restriction of ['detach:stomach', 'edit', 'editattach', 'addattach', 'detach']) {
      const f = await scene()
      f.script.linkset.attachToAvatar(f.avatar.key, 28)
      const object = await worn(f)
      command(f, `@${restriction}=n`)
      expect(f.drop(object, { x: 12, y: 12, z: 10 }).status, restriction).toBe('dropped')
      expect(object.attachment).toBeNull()
      expect(object.prims[0]!.params.position).toEqual({ x: 12, y: 12, z: 10 })
    }
    const f = await scene()
    const object = await worn(f)
    command(f, `@editobj:${object.prims[0]!.key}=n`)
    expect(f.drop(object).status).toBe('dropped')
  })

  // Drop and Detach go through the same attachment lock check in both viewers
  // (RlvAttachmentLocks::canDetach, RRInterface::canDetach), folder locks and their exceptions too.
  it('follows folder locks and their exceptions as a detach does', async () => {
    const f = await scene()
    const object = (await box(f, { x: 10, y: 11, z: 10 })).linkset
    seedRlvInventory(f.avatar, { sharedRootId: 'r', entries: [
      { id: 'r', parentId: null, kind: 'folder', name: '#RLV' },
      { id: 'base', parentId: 'r', kind: 'folder', name: 'Base' },
      { id: 'child', parentId: 'base', kind: 'folder', name: 'Child' },
      { id: 'worn', parentId: 'child', kind: 'item', name: 'Worn (spine)', assetType: 'object', object },
    ] })
    object.attachToAvatar(f.avatar.key, SPINE)
    f.avatar.viewer.inventory.rememberAttachment('worn', object)
    command(f, '@detachallthis:base=n')
    expect(f.drop(object)).toMatchObject({ status: 'blocked', reason: 'detachallthis' })
    command(f, '@detachthis_except:base/child=n')
    expect(f.attemptDetach(object)).toBe('allowed')
    object.attachToAvatar(f.avatar.key, SPINE)
    f.avatar.viewer.inventory.rememberAttachment('worn', object)
    expect(f.drop(object).status).toBe('dropped')
  })

  // RLVa opens no menu on an attachment under @interact (llviewerwindow.cpp, the pick filter;
  // RlvActions::canInteract), except on a HUD. The viewer tool's Drop doesn't check it, so this
  // is from the source.
  it('has no menu under @interact in RLVa, except on a HUD', async () => {
    const f = await scene()
    const object = await worn(f)
    command(f, '@interact=n')
    expect(f.drop(object)).toMatchObject({ status: 'blocked', reason: 'interact' })
    const hud = (await box(f, { x: 10, y: 11, z: 10 })).linkset
    hud.attachToAvatar(f.avatar.key, 31)
    expect(f.drop(hud).status).toBe('dropped')
  })

  // Kokua's Drop (llviewermenu.cpp, LLAttachmentEnableDrop and enable_detach) checks @rez and
  // whether the attachment can be detached.
  it('is refused by Kokua under @rez and for a locked attachment only', async () => {
    for (const [restriction, status] of [['rez', 'blocked'], ['detach:spine', 'blocked'], ['interact', 'dropped']] as const) {
      const f = await scene('rlv')
      const object = await worn(f)
      command(f, `@${restriction}=n`)
      expect(f.drop(object).status, restriction).toBe(status)
    }
  })

  it('needs a worn object with an inventory item', async () => {
    const f = await scene()
    const rezzed = (await box(f, { x: 10, y: 11, z: 10 })).linkset
    expect(f.drop(rezzed)).toMatchObject({ status: 'unsupported', reason: 'target' })
    const temporary = (await box(f, { x: 10, y: 11, z: 10 })).linkset
    temporary.attachToAvatar(f.avatar.key, SPINE, true)
    expect(f.drop(temporary)).toMatchObject({ status: 'unsupported', reason: 'temporary' })
    expect(f.dropActions).toHaveLength(2)
  })
})

describe('the viewer\'s Duplicate under RLV', () => {
  async function target(f: Rlv) {
    return (await box(f, { x: 11, y: 10, z: 10 })).linkset
  }
  const offset = { x: 0, y: 0, z: 1 }

  // In-world: Duplicate was refused under @rez, @edit, @interact and @editobj on the object, and
  // went through under @editworld, @unsit and @sittp while standing.
  it('follows the menu\'s delete rules, not @editworld', async () => {
    for (const [restriction, status] of [['rez', 'blocked'], ['edit', 'blocked'], ['interact', 'blocked'],
      ['editworld', 'duplicated'], ['unsit', 'duplicated'], ['sittp', 'duplicated']] as const) {
      const f = await scene()
      const original = await target(f)
      command(f, `@${restriction}=n`)
      const attempt = f.duplicate(original.prims[0]!, offset)
      expect(attempt, restriction).toMatchObject({ status, ...(status === 'blocked' ? { reason: restriction } : {}) })
    }
    const f = await scene()
    const original = await target(f)
    command(f, `@editobj:${original.prims[0]!.key}=n`)
    expect(f.duplicate(original.prims[0]!)).toMatchObject({ status: 'blocked', reason: 'editobj' })
  })

  // In-world: @editworld with @unsit, standing, and @editworld with @editobj on another object
  // each refused Duplicate for @editworld. Under @editworld with @unsit the menu had Take off and
  // Take Copy on.
  it('is refused under @editworld once the menu checks the object', async () => {
    for (const second of ['unsit', 'editobj']) {
      const f = await scene()
      const original = await target(f)
      const other = await target(f)
      command(f, `@editworld=n,${second === 'unsit' ? 'unsit' : `editobj:${other.prims[0]!.key}`}=n`)
      expect(f.duplicate(original.prims[0]!), second).toMatchObject({ status: 'blocked', reason: 'editworld' })
      if (second === 'unsit') {
        expect(f.take(original.prims[0]!)).toMatchObject({ status: 'blocked', reason: 'editworld' })
        expect(f.take(original.prims[0]!, { copy: true }).status).toBe('taken')
      }
    }
  })

  // In-world: seated on the object, Duplicate was refused under @unsit, @rez and @edit, and went
  // through under @sittp and @standtp, the avatar staying seated on the original.
  it('is refused for the seat under @unsit only among the sit restrictions', async () => {
    for (const [restriction, status] of [['unsit', 'blocked'], ['rez', 'blocked'], ['edit', 'blocked'],
      ['sittp', 'duplicated'], ['standtp', 'duplicated']] as const) {
      const f = await scene()
      const original = await target(f)
      f.world.sitAvatar(f.avatar, original.prims[0]!)
      command(f, `@${restriction}=n`)
      const attempt = f.duplicate(original.prims[0]!, offset)
      expect(attempt.status, restriction).toBe(status)
      if (status === 'duplicated') {
        expect(attempt.object!.prims[0]!.params.position).toEqual({ x: 11, y: 10, z: 11 })
        expect(f.avatar.sittingOn?.linkset).toBe(original)
      }
    }
  })

  // Kokua's build tools need the object selected for editing (lltoolselect.cpp); its Duplicate
  // itself has no RLV check.
  it('is refused by Kokua only where it can\'t edit the object', async () => {
    for (const [restriction, status] of [['edit', 'blocked'], ['rez', 'duplicated'], ['unsit', 'duplicated']] as const) {
      const f = await scene('rlv')
      const original = await target(f)
      command(f, `@${restriction}=n`)
      expect(f.duplicate(original.prims[0]!).status, restriction).toBe(status)
    }
  })

  it('copies only an object the avatar owns and can copy', async () => {
    const f = await scene()
    const worn = await target(f)
    worn.attachToAvatar(f.avatar.key, 9)
    expect(f.duplicate(worn.prims[0]!)).toMatchObject({ status: 'unsupported', reason: 'worn' })
    const theirs = (await loadLinkset({ world: f.world, owner: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', region: f.avatar.region,
      position: { x: 11, y: 10, z: 10 }, prims: [{}] })).linkset
    expect(f.duplicate(theirs.prims[0]!)).toMatchObject({ status: 'unsupported', reason: 'owner' })
    const noCopy = await target(f)
    noCopy.prims[0]!.permMask = { ...noCopy.prims[0]!.permMask, owner: noCopy.prims[0]!.permMask.owner & ~0x8000 }
    expect(f.duplicate(noCopy.prims[0]!)).toMatchObject({ status: 'unsupported', reason: 'no-copy' })
    expect(f.duplicateActions.map(a => a.status)).toEqual(['unsupported', 'unsupported', 'unsupported'])
  })
})

describe('the permissions a dropped attachment keeps', () => {
  const probe = `list log;
    default {
      attach(key id) {
        log += "attach " + (string)(id != NULL_KEY) + " " + (string)llGetPermissions() + " " + (string)(llGetPermissionsKey() != NULL_KEY);
        if (id) llRequestPermissions(id, 0xC34);
      }
      run_time_permissions(integer p) {
        log += "perm " + (string)p;
        llTakeControls(CONTROL_FWD | CONTROL_BACK, TRUE, FALSE);
        llSetCameraParams([CAMERA_ACTIVE, TRUE, CAMERA_DISTANCE, 6.0]);
      }
      control(key id, integer level, integer edge) { log += "control " + (string)level; }
    }`

  // In-world: a worn box asked for controls, camera tracking and control, animation and attach,
  // and got all of them (3124). It took the forward and back controls and set a camera. Dropped,
  // it read 1072 in attach(NULL_KEY), with the same permission key: it had lost controls and
  // camera control. The forward key raised no control event any more, and the camera moved off
  // the scripted position.
  it('loses controls and camera control and keeps the rest', async () => {
    const f = await scene()
    const made = await box(f, { x: 10, y: 11, z: 10 }, undefined, probe)
    const script = made.scripts['main']!
    made.linkset.attachToAvatar(f.avatar.key, 9)
    made.linkset.advanceTime(10)
    script.sendControl(1)
    script.sendControl(0)
    made.linkset.advanceTime(10)
    expect(made.linkset.prims[0]!.scriptedCameras.size).toBe(1)
    expect(f.drop(made.linkset).status).toBe('dropped')
    made.linkset.advanceTime(10)
    script.sendControl(1)
    made.linkset.advanceTime(10)
    expect(script.global('log')).toEqual(['attach 1 0 0', 'perm 3124', 'control 1', 'control 0', 'attach 0 1072 1'])
    expect(script.state.permissions.granted & (PERMISSION_TAKE_CONTROLS | PERMISSION_CONTROL_CAMERA)).toBe(0)
    expect(script.state.permissions.agent).toBe(f.avatar.key)
    expect(script.controls).toBeNull()
    expect(made.linkset.prims[0]!.scriptedCameras.size).toBe(0)
  })

  // In-world: a worn box that held only controls (4) read 0 and NULL_KEY in attach(NULL_KEY)
  // after the Drop.
  it('loses the permission key when nothing else is held', async () => {
    const f = await scene()
    const made = await box(f, { x: 10, y: 11, z: 10 }, undefined, probe.replace('0xC34', 'PERMISSION_TAKE_CONTROLS'))
    made.linkset.attachToAvatar(f.avatar.key, 9)
    made.linkset.advanceTime(10)
    f.drop(made.linkset)
    made.linkset.advanceTime(10)
    expect(made.scripts['main']!.global('log')).toEqual(['attach 1 0 0', 'perm 4', 'attach 0 0 0'])
  })
})

describe('Take Copy of a seat someone sits on', () => {
  const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const seat = `list log;
    default {
      state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); }
      changed(integer c) { log += (string)c + " " + (string)(llAvatarOnSitTarget() != NULL_KEY) + " " + (string)llGetNumberOfPrims(); }
    }`
  async function scene() {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 118, y: 48, z: 20 } })
    const other = world.addAvatar({ region: 'home', key: OTHER, username: 'other', position: { x: 116, y: 48, z: 20 } })
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 117, y: 49.5, z: 20 },
      prims: [{ scripts: [{ name: 'seat', source: { source: seat } }] }] })
    for (const prim of made.linkset.prims) {
      prim.permMask = { ...prim.permMask, everyone: PERM_COPY, next: PERM_ALL }
      for (const item of prim.inventory) item.permMask = { ...item.permMask, everyone: PERM_COPY, next: PERM_ALL }
    }
    const script = made.scripts['seat']!
    script.start()
    made.linkset.advanceTime(10)
    return { world, owner, other, linkset: made.linkset, log: () => script.global('log') as string[] }
  }

  // In-world: with everyone-copy on the seat and its script, the owner sat on it and the other
  // avatar took a copy. The owner was stood up, and the seat's script got one changed(160)
  // reading no sitter and one prim, then still read its owner.
  it('stands the owner up when another avatar takes the copy, with one changed(160)', async () => {
    const f = await scene()
    f.world.sitAvatar(f.owner, f.linkset.prims[0]!)
    f.linkset.advanceTime(10)
    expect(f.world.attemptAvatarTake(f.other, f.linkset.prims[0]!, { copy: true }).status).toBe('taken')
    f.linkset.advanceTime(10)
    expect(f.owner.sittingOn).toBeNull()
    expect(f.log()).toEqual(['32 1 2', '160 0 1'])
    expect(f.linkset.owner).toBe(OWNER)
  })

  // In-world: the other avatar sat on it and the owner took a copy: the other avatar was stood up
  // and the script got changed(32). Then the other avatar sat again and took a copy itself, from
  // the menu's Take Copy, which it offered while Take was off: stood up, with changed(160).
  it('stands the other avatar up whoever takes the copy', async () => {
    const f = await scene()
    f.world.sitAvatar(f.other, f.linkset.prims[0]!)
    f.linkset.advanceTime(10)
    expect(f.world.attemptAvatarTake(f.owner, f.linkset.prims[0]!, { copy: true }).status).toBe('taken')
    f.linkset.advanceTime(10)
    expect(f.other.sittingOn).toBeNull()
    f.world.sitAvatar(f.other, f.linkset.prims[0]!)
    f.linkset.advanceTime(10)
    expect(f.world.attemptAvatarTake(f.other, f.linkset.prims[0]!).reason).toBe('owner')
    expect(f.world.attemptAvatarTake(f.other, f.linkset.prims[0]!, { copy: true }).status).toBe('taken')
    f.linkset.advanceTime(10)
    expect(f.other.sittingOn).toBeNull()
    expect(f.log()).toEqual(['32 1 2', '32 0 1', '32 1 2', '160 0 1'])
  })
})
