import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Changed
// https://wiki.secondlife.com/wiki/LlRemoveInventory
// In-world: a two-prim linkset of boxes, deleted from through the object's contents as its
// owner, one item per request. The root held a logging script, a second running script that
// logs changed, a stopped copy of it, and copied Library items: a texture twice ("tex" and
// "tex 1"), a sculpt map, a sound, a material, a landmark, a notecard and an object. The child
// held the logging script and another texture. The logging script set face 0 to the texture by
// name, face 4 by key, the normal map of face 1 and the specular map of face 2 by name, face 3's
// material by name, and looped the sound. Aditi beta grid, SLua Tideland, Mono, 2026-11-23.

const PLYWOOD = '89556747-24cb-43ed-920b-47caed15465f'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const SCULPT_DEFAULT = 'be293869-d0d9-0a69-5989-ad27f1946fd4'
const TEX = '373c9aa6-635d-1347-fef4-d44037b36a74'
const TEX2 = '342a98a0-0a64-d392-4d88-138ca488c335'
const SCU = '7b2d53e3-5f43-2d39-a6ed-48572e0e0b24'
const SND = 'c26f4395-3bd9-0f43-8a69-a91f76515ff1'
const MAT = '10828fa3-903f-4d31-8d89-187d50bfd95e'

const LOG = `
  string p(list r) { list l = llGetPrimitiveParams(r); return llList2String(l, 0) + ";t" + (string)llGetListEntryType(l, 0); }
  dump(string why) {
    llSay(0, "L" + (string)llGetLinkNumber() + " " + why + " inv=" + (string)llGetInventoryNumber(INVENTORY_ALL)
      + " f0=" + p([PRIM_TEXTURE, 0]) + " f4=" + p([PRIM_TEXTURE, 4])
      + " n1=" + p([PRIM_NORMAL, 1]) + " s2=" + p([PRIM_SPECULAR, 2])
      + " m3=" + p([PRIM_RENDER_MATERIAL, 3]) + " ty=" + llList2CSV(llList2List(llGetPrimitiveParams([PRIM_TYPE]), 0, 2)));
  }
  default {
    state_entry() {
      string t = "tex";
      if (llGetLinkNumber() == 2) t = "tex2";
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TEXTURE, 0, t, <2,3,0>, <0.1,0.2,0>, 0.5,
        PRIM_TEXTURE, 4, llGetInventoryKey(t), <1,1,0>, <0,0,0>, 0.0,
        PRIM_NORMAL, 1, t, <1,1,0>, <0,0,0>, 0.0,
        PRIM_SPECULAR, 2, t, <1,1,0>, <0,0,0>, 0.0, <1,1,1>, 51, 2]);
      if (llGetLinkNumber() == 1) {
        llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 3, "mat"]);
        llLoopSound("snd", 1.0);
      }
    }
    changed(integer c) { dump("changed " + (string)c); }
    link_message(integer sender, integer num, string str, key id) {
      if (str == "sculpt") llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE, PRIM_TYPE_SCULPT, "scu", PRIM_SCULPT_TYPE_SPHERE]);
      else if (str == "rm") llRemoveInventory("snd");
      else dump(str);
    }
  }`
const QUIET = `default { changed(integer c) { llSay(0, llGetScriptName() + " changed " + (string)c); } }`

const item = (name: string, type: typeof InventoryType[keyof typeof InventoryType], key: string) =>
  makeInventoryItem({ name, type, key })

async function load() {
  const loaded = await loadLinkset({
    prims: [
      {
        inventory: [
          item('tex', InventoryType.TEXTURE, TEX), item('tex 1', InventoryType.TEXTURE, TEX),
          item('scu', InventoryType.TEXTURE, SCU), item('snd', InventoryType.SOUND, SND),
          item('mat', InventoryType.MATERIAL, MAT), item('lm', InventoryType.LANDMARK, '073ad79c-9fd6-bc52-a97c-021d7dad3301'),
          makeInventoryItem({ name: 'nc', type: InventoryType.NOTECARD, notecardLines: ['hello 440'] }),
          item('obj', InventoryType.OBJECT, '4f477799-e681-8533-625d-9f3d373bef2c'),
        ],
        scripts: [
          { name: 'log', source: { source: LOG, filename: 'log.lsl' } },
          { name: 'quiet', source: { source: QUIET, filename: 'quiet.lsl' } },
          { name: 'quiet 1', source: { source: QUIET, filename: 'quiet1.lsl' } },
        ],
      },
      {
        inventory: [item('tex2', InventoryType.TEXTURE, TEX2)],
        scripts: [{ name: 'clog', source: { source: LOG, filename: 'clog.lsl' } }],
      },
    ],
  })
  const { linkset, prims, scripts } = loaded
  const log = scripts['log']!
  const quiet = scripts['quiet']!
  const childLog = scripts['clog']!
  log.start()
  quiet.start()
  childLog.start()
  linkset.advanceTime(5_000)
  const seen = new Map<object, number>()
  const said = () => [log, quiet, childLog].flatMap((script) => {
    const lines = script.chat.slice(seen.get(script) ?? 0)
    seen.set(script, script.chat.length)
    return lines.filter((c) => c.channel === 0).map((c) => c.text)
  })
  said()
  const send = (script: typeof log, str: string) => {
    linkset.clock.schedule(script, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str, id: NULL_KEY })
    linkset.advanceTime(5_000)
  }
  return { linkset, prims, log, quiet, childLog, said, send }
}

const ROOT_SET = 'f0=tex;t3 f4=tex;t3 n1=tex;t3 s2=tex;t3 m3=mat;t3 ty=0, 0, <0.000000, 1.000000, 0.000000>'
const RESET = `f0=${PLYWOOD};t3 f4=${PLYWOOD};t3 n1=${NULL_KEY};t4 s2=${NULL_KEY};t4`
const BOX = 'ty=0, 0, <0.000000, 1.000000, 0.000000>'

describe('the owner deletes an item a prim is using', () => {
  it('resets the faces that show a removed texture, even with a copy left, and sends only CHANGED_INVENTORY', async () => {
    const { prims, log, said, send, linkset } = await load()
    send(log, 'dump')
    expect(said()).toEqual([`L1 dump inv=11 ${ROOT_SET}`])
    prims[0]!.removeInventory('tex 1')
    linkset.advanceTime(5_000)
    // In-world: deleting "tex 1" reset the root's faces set to "tex" by name or by key, though
    // "tex" was still there: plywood, with the default normal and specular maps. Both running
    // root scripts got changed(1) once; the child's faces and script were left alone.
    expect(said()).toEqual([
      `L1 changed 1 inv=10 ${RESET} m3=mat;t3 ${BOX}`,
      'quiet changed 1',
    ])
    expect(prims[1]!.params.faces[0]!.texture).toBe(TEX2)
  })

  it('clears a removed material and sends CHANGED_INVENTORY and CHANGED_RENDER_MATERIAL in one event', async () => {
    const { prims, said, linkset } = await load()
    prims[0]!.removeInventory('mat')
    linkset.advanceTime(5_000)
    // In-world: deleting "mat" cleared face 3's material, and each running root script got one
    // changed(4097). llRemoveInventory of a material gives changed(4096) alone.
    expect(said()).toEqual([
      `L1 changed 4097 inv=10 ${ROOT_SET.replace('m3=mat;t3', `m3=${NULL_KEY};t3`)}`,
      'quiet changed 4097',
    ])
  })

  it('keeps a looping sound playing, as llRemoveInventory does', async () => {
    const { prims, log, said, send, linkset } = await load()
    prims[0]!.removeInventory('snd')
    linkset.advanceTime(5_000)
    // In-world: the root kept looping the sound after its item was deleted, and each running
    // root script got changed(1).
    expect(prims[0]!.sound.current?.sound).toBe(SND)
    expect(said()).toEqual([`L1 changed 1 inv=10 ${ROOT_SET}`, 'quiet changed 1'])
    prims[0]!.addInventory(item('snd', InventoryType.SOUND, SND))
    said()
    send(log, 'rm')
    // In-world: after a fresh llLoopSound, llRemoveInventory of the sound left it looping too,
    // with no changed event.
    expect(prims[0]!.sound.current?.sound).toBe(SND)
    expect(said()).toEqual([])
  })

  it('gives a sculpt the default sculpt map and sends only CHANGED_INVENTORY', async () => {
    const { prims, log, said, send, linkset } = await load()
    send(log, 'sculpt')
    expect(said()).toEqual([
      `L1 changed 4 inv=11 f0=${PLYWOOD};t3 f4=;t0 n1=;t0 s2=;t0 m3=;t0 ty=7, scu, 1`,
      'quiet changed 4',
    ])
    prims[0]!.removeInventory('scu')
    linkset.advanceTime(5_000)
    // The sculpt's one face takes face 1's settings (#445).
    // In-world: with the sculpt set and its changed(4) heard, deleting "scu" left the sculpt type
    // and gave the default map. Each running root script got changed(1) and no CHANGED_SHAPE.
    // An earlier run that set the sculpt just before the delete showed changed(4) arriving after
    // the delete, which reads as a CHANGED_SHAPE from the delete but came from the set.
    expect(said()).toEqual([
      `L1 changed 1 inv=10 f0=${PLYWOOD};t3 f4=;t0 n1=;t0 s2=;t0 m3=;t0 ty=7, ${SCULPT_DEFAULT}, 1`,
      'quiet changed 1',
    ])
  })

  it('sends one CHANGED_INVENTORY for a landmark, notecard, object or script, running or stopped', async () => {
    const { prims, said, linkset } = await load()
    // In-world: each of these deletes gave each running root script one changed(1). The stopped
    // script never logged.
    for (const [name, inv] of [['lm', 10], ['nc', 9], ['obj', 8], ['quiet 1', 7]] as const) {
      prims[0]!.removeInventory(name)
      linkset.advanceTime(5_000)
      expect(said()).toEqual([`L1 changed 1 inv=${inv} ${ROOT_SET}`, 'quiet changed 1'])
    }
    prims[0]!.removeInventory('quiet')
    linkset.advanceTime(5_000)
    expect(said()).toEqual([`L1 changed 1 inv=6 ${ROOT_SET}`])
  })

  it('resets a child prim faces and tells only that prim', async () => {
    const { prims, said, linkset } = await load()
    prims[1]!.removeInventory('tex2')
    linkset.advanceTime(5_000)
    // In-world: deleting "tex2" from the child reset the child's faces; the child's script got
    // changed(1) and the root's scripts nothing.
    expect(said()).toEqual([`L2 changed 1 inv=1 ${RESET} m3=${NULL_KEY};t3 ${BOX}`])
    expect(prims[0]!.params.faces[0]!.texture).toBe(TEX)
  })

  it('tells the root of a child material when no child script handles changed, in one event', async () => {
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [
        { inventory: [item('mat', InventoryType.MATERIAL, MAT)], scripts: [{ name: 'quiet', source: { source: QUIET, filename: 'quiet.lsl' } }] },
        { inventory: [item('mat', InventoryType.MATERIAL, MAT)], scripts: [{ name: 'stopped', source: { source: QUIET, filename: 'stopped.lsl' } }] },
      ],
    })
    scripts['quiet']!.start()
    prims[0]!.params.faces[3]!.renderMaterial = MAT
    prims[1]!.params.faces[3]!.renderMaterial = MAT
    linkset.advanceTime(1_000)
    prims[1]!.removeInventory('mat')
    linkset.advanceTime(1_000)
    // In-world: a second two-prim linkset with the material on face 3 of both prims and the
    // child's only script stopped. Deleting the child's material cleared the child's face 3 only,
    // and the root's script got one changed(4097).
    expect(prims[1]!.params.faces[3]!.renderMaterial).toBe(NULL_KEY)
    expect(prims[0]!.params.faces[3]!.renderMaterial).toBe(MAT)
    expect(scripts['quiet']!.chat.map((c) => c.text)).toEqual(['quiet changed 4097'])
    expect(scripts['stopped']!.chat).toEqual([])
  })

  it('sends one event for a material and a script deleted in one call, and none to the deleted script', async () => {
    const { prims, quiet, log, said, linkset } = await load()
    prims[0]!.removeInventory('mat', 'quiet')
    linkset.advanceTime(5_000)
    // Combines the material delete above with the one-event rule for several items deleted in
    // one request (owner-inventory-edits.test.ts).
    expect(said()).toEqual([`L1 changed 4097 inv=9 ${ROOT_SET.replace('m3=mat;t3', `m3=${NULL_KEY};t3`)}`])
    expect(quiet.dead).toBe(true)
    expect(log.dead).toBe(false)
  })

  it('gives a script asleep in a handler one event for a notecard and a material deleted meanwhile', async () => {
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [{
        inventory: [item('mat', InventoryType.MATERIAL, MAT), makeInventoryItem({ name: 'nc', type: InventoryType.NOTECARD })],
        scripts: [{
          name: 'sleeper',
          source: { source: `default {
            link_message(integer s, integer n, string m, key k) { llSleep(15.0); llSay(0, "woke"); }
            changed(integer c) { llSay(0, "changed " + (string)c); }
          }`, filename: 'sleeper.lsl' },
        }],
      }],
    })
    const sleeper = scripts['sleeper']!
    sleeper.start()
    prims[0]!.params.faces[3]!.renderMaterial = MAT
    linkset.clock.schedule(sleeper, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
    linkset.advanceTime(1_000)
    prims[0]!.removeInventory('nc')
    prims[0]!.removeInventory('mat')
    linkset.advanceTime(20_000)
    // In-world: the root's script slept 15 s in a handler while the owner deleted the notecard
    // and then the material with face 3 using it. After waking it got one changed(4097).
    expect(sleeper.chat.map((c) => c.text)).toEqual(['woke', 'changed 4097'])
  })
})
