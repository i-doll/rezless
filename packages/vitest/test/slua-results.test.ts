import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, makeInventoryItem, InventoryType, World } from '../src/index.js'

// Every "In-world" result below was measured on the Aditi beta grid, region
// SLua Tideland, on 2026-11-13: one SLua script per case group called each
// case under pcall and said the result, or the error text, on a channel.

const U = '5748decc-f629-461c-9a36-a35a221fe21f'
const KEYLIKE = '5748decc-f629-461c-9a36-a35a221fe21e'
const ASSET = 'ab7ce10e-a483-d234-91ae-9ad00c60d38b'
const PLYWOOD = '89556747-24cb-43ed-920b-47caed15465f'
const NULL = '00000000-0000-0000-0000-000000000000'
const MATERIAL = 'db03a3f9-5fa5-6274-66dd-4a0cec9cf641'
const AVATAR = 'af576265-1cc4-46de-98d1-1d0d64d10d3b'

const PRELUDE = `
  local U = touuid("${U}")
  local R1 = vector(1, 1, 0)
  local Z = vector(0, 0, 0)
  local Q = quaternion(0, 0, 0, 1)
  local function show(v)
    if typeof(v) == "table" then
      local parts = {}
      for i = 1, #v do parts[i] = typeof(v[i]) .. ":" .. tostring(v[i]) end
      return "{" .. table.concat(parts, " | ") .. "}"
    end
    return typeof(v) .. ":" .. tostring(v)
  end
  local function kinds(v)
    local parts = {}
    for i = 1, #v do parts[i] = typeof(v[i]) == "boolean" and tostring(v[i]) or typeof(v[i]) end
    return table.concat(parts, " ")
  end
  local function t(f, ...)
    local r = table.pack(pcall(f, ...))
    if not r[1] then return "!! " .. tostring(r[2]) end
    return r.n == 1 and "(nothing)" or show(r[2])
  end
`

type Script = Awaited<ReturnType<typeof loadScript>>

/** Run each expression (see PRELUDE) and return what it gave, in order. */
async function results(cases: ReadonlyArray<string>, setup = '', prepare?: (s: Script) => void) {
  const body = cases.map((c) => `ll.Say(7777, ${c})`).join('\n')
  const s = await loadScript({ source: `${PRELUDE}\n${setup}\n${body}`, language: 'slua' })
  prepare?.(s)
  s.start()
  return s.chat.filter((c) => c.channel === 7777).map((c) => c.text)
}

async function expectResults(cases: ReadonlyArray<readonly [string, string]>, setup = '', prepare?: (s: Script) => void) {
  const got = await results(cases.map(([c]) => c), setup, prepare)
  expect(Object.fromEntries(cases.map(([c], i) => [c, got[i]]))).toEqual(Object.fromEntries(cases))
}

describe('SLua: booleans in list results', () => {
  it('returns the on/off prim parameters as booleans from ll and as numbers from llcompat', async () => {
    await expectResults([
      // In-world: ll.GetPrimitiveParams({PRIM_FULLBRIGHT, 0, PRIM_PHANTOM, PRIM_PHYSICS, PRIM_TEMP_ON_REZ,
      // PRIM_ALLOW_UNSIT, PRIM_SCRIPTED_SIT_ONLY}) on a new prim -> false false false false true false;
      // the same through llcompat -> numbers 0 0 0 0 1 0
      [
        'kinds(ll.GetPrimitiveParams({PRIM_FULLBRIGHT, 0, PRIM_PHANTOM, PRIM_PHYSICS, PRIM_TEMP_ON_REZ, PRIM_ALLOW_UNSIT, PRIM_SCRIPTED_SIT_ONLY}))',
        'false false false false true false',
      ],
      [
        'show(llcompat.GetPrimitiveParams({PRIM_FULLBRIGHT, 0, PRIM_PHANTOM, PRIM_PHYSICS, PRIM_TEMP_ON_REZ, PRIM_ALLOW_UNSIT, PRIM_SCRIPTED_SIT_ONLY}))',
        '{number:0 | number:0 | number:0 | number:0 | number:1 | number:0}',
      ],
      // In-world: {PRIM_FULLBRIGHT, ALL_SIDES} on a box -> six booleans; through llcompat -> six numbers
      ['kinds(ll.GetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES}))', 'false false false false false false'],
      ['kinds(llcompat.GetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES}))', 'number number number number number number'],
      // In-world: only the first value of these is a boolean:
      // {PRIM_FLEXIBLE} -> false, 5 numbers, a vector; {PRIM_POINT_LIGHT} -> false, vector, 3 numbers;
      // {PRIM_SIT_TARGET} -> false, vector, quaternion; {PRIM_REFLECTION_PROBE} -> false, 3 numbers
      ['kinds(ll.GetPrimitiveParams({PRIM_FLEXIBLE}))', 'false number number number number number vector'],
      ['kinds(ll.GetPrimitiveParams({PRIM_POINT_LIGHT}))', 'false vector number number number'],
      ['kinds(ll.GetPrimitiveParams({PRIM_SIT_TARGET}))', 'false vector quaternion'],
      ['kinds(ll.GetPrimitiveParams({PRIM_REFLECTION_PROBE}))', 'false number number number'],
      ['kinds(llcompat.GetPrimitiveParams({PRIM_FLEXIBLE}))', 'number number number number number number vector'],
      ['kinds(llcompat.GetPrimitiveParams({PRIM_SIT_TARGET}))', 'number vector quaternion'],
      // In-world: these stay numbers: {PRIM_BUMP_SHINY, 0, PRIM_TEXGEN, 0, PRIM_COLOR, 0, PRIM_GLOW, 0, PRIM_ALPHA_MODE, 0}
      // -> number number number vector number number number number; {PRIM_MATERIAL}, {PRIM_PHYSICS_SHAPE_TYPE},
      // {PRIM_CLICK_ACTION}, {PRIM_SIT_FLAGS} -> a number each
      [
        'kinds(ll.GetPrimitiveParams({PRIM_BUMP_SHINY, 0, PRIM_TEXGEN, 0, PRIM_COLOR, 0, PRIM_GLOW, 0, PRIM_ALPHA_MODE, 0}))',
        'number number number vector number number number number',
      ],
      ['kinds(ll.GetPrimitiveParams({PRIM_MATERIAL, PRIM_PHYSICS_SHAPE_TYPE, PRIM_SIT_FLAGS, PRIM_CLICK_ACTION}))', 'number number number number'],
    ])
  })

  it('reads true for what a script switched on', async () => {
    await expectResults(
      [
        // In-world: after setting each to TRUE: {PRIM_FULLBRIGHT, ALL_SIDES} -> six true; {PRIM_PHANTOM} and
        // {PRIM_PHYSICS} -> true; llcompat -> 1
        ['kinds(ll.GetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES}))', 'true true true true true true'],
        ['kinds(ll.GetPrimitiveParams({PRIM_PHANTOM, PRIM_PHYSICS, PRIM_SCRIPTED_SIT_ONLY}))', 'true true true'],
        ['show(llcompat.GetPrimitiveParams({PRIM_FULLBRIGHT, 0, PRIM_PHANTOM}))', '{number:1 | number:1}'],
        // In-world: {PRIM_FLEXIBLE} -> true, 2, 0.3, 2, 0, 1, <0, 0, 0>; {PRIM_POINT_LIGHT} -> true, ...;
        // {PRIM_SIT_TARGET} -> true, <0, 0, 1>, <0, 0, 0, 1>; {PRIM_REFLECTION_PROBE} -> true, 0.5, 0.1, 1
        ['kinds(ll.GetPrimitiveParams({PRIM_FLEXIBLE}))', 'true number number number number number vector'],
        ['kinds(ll.GetPrimitiveParams({PRIM_POINT_LIGHT}))', 'true vector number number number'],
        ['kinds(ll.GetPrimitiveParams({PRIM_SIT_TARGET}))', 'true vector quaternion'],
        ['kinds(ll.GetPrimitiveParams({PRIM_REFLECTION_PROBE}))', 'true number number number'],
        // In-world: ll.GetLinkPrimitiveParams(LINK_THIS, {PRIM_FULLBRIGHT, 0, PRIM_PHANTOM}) -> true true;
        // llcompat -> 1 1; {PRIM_LINK_TARGET, LINK_THIS, PRIM_FULLBRIGHT, 0} -> true
        ['kinds(ll.GetLinkPrimitiveParams(LINK_THIS, {PRIM_FULLBRIGHT, 0, PRIM_PHANTOM}))', 'true true'],
        ['show(llcompat.GetLinkPrimitiveParams(LINK_THIS, {PRIM_FULLBRIGHT, 0, PRIM_PHANTOM}))', '{number:1 | number:1}'],
        ['kinds(ll.GetPrimitiveParams({PRIM_LINK_TARGET, LINK_THIS, PRIM_FULLBRIGHT, 0}))', 'true'],
      ],
      `ll.SetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES, true, PRIM_PHANTOM, true, PRIM_PHYSICS, true, PRIM_SCRIPTED_SIT_ONLY, true,
        PRIM_FLEXIBLE, true, 2, 0.3, 2, 0, 1, Z, PRIM_POINT_LIGHT, true, vector(1, 1, 1), 1, 10, 0.75,
        PRIM_SIT_TARGET, true, vector(0, 0, 1), Q, PRIM_REFLECTION_PROBE, true, 0.5, 0.1, PRIM_REFLECTION_PROBE_BOX})`,
    )
  })

  it('hands a boolean entry back to the list functions as a boolean', async () => {
    await expectResults(
      [
        // In-world: with r = ll.GetPrimitiveParams({PRIM_FULLBRIGHT, 0, PRIM_PHANTOM, PRIM_TEXTURE, 0}) on a new prim:
        // ll.List2CSV(r) -> 0, 0, 89556747-…, <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0
        ['ll.List2CSV(r)', `0, 0, ${PLYWOOD}, <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0`],
        // In-world: ll.ListFindList(r, {false}) -> 1; ll.ListFindList(r, {0}) -> 6 (the rotation, not a boolean)
        ['t(ll.ListFindList, r, {false})', 'number:1'],
        ['t(ll.ListFindList, r, {0})', 'number:6'],
        // In-world: ll.List2Json(JSON_ARRAY, {r[1], r[3]}) -> [0,"89556747-…"]
        ['ll.List2Json(JSON_ARRAY, {r[1], r[3]})', `[0,"${PLYWOOD}"]`],
        // In-world: ll.ListFindList(r, {r[3]}) -> 3; with tostring(r[3]) -> nil
        ['t(ll.ListFindList, r, {r[3]})', 'number:3'],
        ['t(ll.ListFindList, r, {tostring(r[3])})', 'nil:nil'],
        // In-world: ll.SetPrimitiveParams({PRIM_FULLBRIGHT, 1, x}) with x read from a full-bright face -> face 1 full bright
        [
          't(function() ll.SetPrimitiveParams({PRIM_FULLBRIGHT, 0, true}); ll.SetPrimitiveParams({PRIM_FULLBRIGHT, 1, ll.GetPrimitiveParams({PRIM_FULLBRIGHT, 0})[1]}); return kinds(ll.GetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES})) end)',
          'string:true true false false false false',
        ],
      ],
      'local r = ll.GetPrimitiveParams({PRIM_FULLBRIGHT, 0, PRIM_PHANTOM, PRIM_TEXTURE, 0})',
    )
  })

  it('returns the on/off object details as booleans', async () => {
    await expectResults(
      [
        // In-world: ll.GetObjectDetails(ll.GetKey(), {OBJECT_PHYSICS}), {OBJECT_PHANTOM}, {OBJECT_TEMP_ON_REZ},
        // {OBJECT_TEMP_ATTACHED}, {OBJECT_LOCKED}, {OBJECT_VOLUME_DETECT} -> false each on a new prim; llcompat -> 0
        [
          'kinds(ll.GetObjectDetails(me, {OBJECT_PHYSICS, OBJECT_PHANTOM, OBJECT_TEMP_ON_REZ, OBJECT_TEMP_ATTACHED, OBJECT_LOCKED, OBJECT_VOLUME_DETECT}))',
          'false false false false false false',
        ],
        [
          'kinds(llcompat.GetObjectDetails(me, {OBJECT_PHYSICS, OBJECT_PHANTOM, OBJECT_TEMP_ON_REZ, OBJECT_TEMP_ATTACHED, OBJECT_LOCKED, OBJECT_VOLUME_DETECT}))',
          'number number number number number number',
        ],
        // In-world: after ll.SetStatus(STATUS_PHANTOM, true) and {PRIM_TEMP_ON_REZ, true}: {OBJECT_PHANTOM} and
        // {OBJECT_TEMP_ON_REZ} -> true
        [
          't(function() ll.SetStatus(STATUS_PHANTOM, true); ll.SetPrimitiveParams({PRIM_TEMP_ON_REZ, true}); return kinds(ll.GetObjectDetails(me, {OBJECT_PHYSICS, OBJECT_PHANTOM, OBJECT_TEMP_ON_REZ})) end)',
          'string:false true true',
        ],
        // In-world: {OBJECT_PHANTOM, OBJECT_NAME, OBJECT_OWNER, OBJECT_PHYSICS, OBJECT_POS} -> boolean, string, uuid,
        // boolean, vector; through llcompat -> number, string, uuid, number, vector
        ['kinds(ll.GetObjectDetails(me, {OBJECT_PHANTOM, OBJECT_NAME, OBJECT_OWNER, OBJECT_PHYSICS, OBJECT_POS}))', 'true string uuid false vector'],
        ['kinds(llcompat.GetObjectDetails(me, {OBJECT_PHANTOM, OBJECT_NAME, OBJECT_OWNER, OBJECT_PHYSICS, OBJECT_POS}))', 'number string uuid number vector'],
        // In-world: every other detail from 1 to 56 is a number, string, vector, quaternion or uuid, for example
        // {OBJECT_PRIM_COUNT, OBJECT_RUNNING_SCRIPT_COUNT, OBJECT_SELECT_COUNT, OBJECT_SIT_COUNT, OBJECT_ATTACHED_POINT}
        // -> numbers; {OBJECT_PERMS} -> five numbers; an unknown detail -> number -1
        [
          'kinds(ll.GetObjectDetails(me, {OBJECT_PRIM_COUNT, OBJECT_RUNNING_SCRIPT_COUNT, OBJECT_SELECT_COUNT, OBJECT_SIT_COUNT, OBJECT_ATTACHED_POINT, OBJECT_CLICK_ACTION}))',
          'number number number number number number',
        ],
        ['kinds(ll.GetObjectDetails(me, {OBJECT_PERMS, OBJECT_LOCKED}))', 'number number number number number false'],
        ['show(ll.GetObjectDetails(me, {99, OBJECT_PHANTOM}))', '{number:-1 | boolean:true}'],
      ],
      'local me = ll.GetKey()',
    )
  })

  it('returns them as booleans for an avatar too', async () => {
    // In-world: ll.GetObjectDetails(ll.GetOwner(), {OBJECT_PHYSICS}), {OBJECT_PHANTOM}, {OBJECT_TEMP_ON_REZ},
    // {OBJECT_TEMP_ATTACHED}, {OBJECT_LOCKED}, {OBJECT_VOLUME_DETECT} -> false each; {OBJECT_NAME} -> a string,
    // {OBJECT_OWNER} -> a uuid, {OBJECT_PRIM_COUNT} -> a number
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: AVATAR, name: 'i Doll', username: 'idoll' })
    const { scripts } = await loadLinkset({
      world,
      region: 'home',
      owner: AVATAR,
      prims: [
        {
          scripts: [
            {
              name: 'test',
              language: 'slua',
              source: {
                source: `local r = ll.GetObjectDetails(ll.GetOwner(), {OBJECT_PHYSICS, OBJECT_PHANTOM, OBJECT_TEMP_ON_REZ, OBJECT_TEMP_ATTACHED, OBJECT_LOCKED, OBJECT_VOLUME_DETECT, OBJECT_NAME, OBJECT_OWNER, OBJECT_PRIM_COUNT})
                  local parts = {}
                  for i = 1, #r do parts[i] = typeof(r[i]) end
                  ll.Say(7777, table.concat(parts, " "))`,
              },
            },
          ],
        },
      ],
    })
    const s = scripts.test!
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['boolean boolean boolean boolean boolean boolean string uuid number'])
  })

  it('returns the on/off parcel details as booleans', async () => {
    await expectResults(
      [
        // In-world: ll.GetParcelDetails(pos, {PARCEL_DETAILS_SEE_AVATARS}) -> true; {PARCEL_DETAILS_SCRIPT_DANGER}
        // -> false; through llcompat -> 1 and 0
        ['show(ll.GetParcelDetails(pos, {PARCEL_DETAILS_SEE_AVATARS, PARCEL_DETAILS_SCRIPT_DANGER}))', '{boolean:true | boolean:false}'],
        ['show(llcompat.GetParcelDetails(pos, {PARCEL_DETAILS_SEE_AVATARS, PARCEL_DETAILS_SCRIPT_DANGER}))', '{number:1 | number:0}'],
        // In-world: details 0 to 13 otherwise: name and description strings, owner, group and id uuids, area,
        // capacity, used, teleport routing and flags numbers, landing point and look-at vectors
        [
          'kinds(ll.GetParcelDetails(pos, {PARCEL_DETAILS_NAME, PARCEL_DETAILS_OWNER, PARCEL_DETAILS_AREA, PARCEL_DETAILS_ID, PARCEL_DETAILS_PRIM_CAPACITY, PARCEL_DETAILS_LANDING_POINT, PARCEL_DETAILS_TP_ROUTING, PARCEL_DETAILS_FLAGS}))',
          'string uuid number uuid number vector number number',
        ],
      ],
      'local pos = ll.GetPos()',
    )
  })

  it('returns the on/off media settings as booleans', async () => {
    await expectResults(
      [
        // In-world: after ll.SetPrimMediaParams(1, {PRIM_MEDIA_AUTO_PLAY, true, PRIM_MEDIA_HOME_URL, "http://example.com/",
        // PRIM_MEDIA_WHITELIST_ENABLE, true, PRIM_MEDIA_WHITELIST, "example.com", PRIM_MEDIA_AUTO_LOOP, 1}),
        // ll.GetPrimMediaParams(1, {n}) for n = 0 to 14 -> false, 0, "", "http://example.com/", true, true, false,
        // false, false, 0, 0, true, "example.com", 7, 7; through llcompat the booleans are 0 and 1
        [
          'kinds(ll.GetPrimMediaParams(1, {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14}))',
          'false number string string true true false false false number number true string number number',
        ],
        [
          'kinds(llcompat.GetPrimMediaParams(1, {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14}))',
          'number number string string number number number number number number number number string number number',
        ],
        // In-world: ll.GetLinkMedia(LINK_THIS, 1, {PRIM_MEDIA_AUTO_PLAY, PRIM_MEDIA_HOME_URL, PRIM_MEDIA_AUTO_SCALE,
        // PRIM_MEDIA_PERMS_CONTROL}) -> true, "http://example.com/", false, 7
        [
          'show(ll.GetLinkMedia(LINK_THIS, 1, {PRIM_MEDIA_AUTO_PLAY, PRIM_MEDIA_HOME_URL, PRIM_MEDIA_AUTO_SCALE, PRIM_MEDIA_PERMS_CONTROL}))',
          '{boolean:true | string:http://example.com/ | boolean:false | number:7}',
        ],
      ],
      'll.SetPrimMediaParams(1, {PRIM_MEDIA_AUTO_PLAY, true, PRIM_MEDIA_HOME_URL, "http://example.com/", PRIM_MEDIA_WHITELIST_ENABLE, true, PRIM_MEDIA_WHITELIST, "example.com", PRIM_MEDIA_AUTO_LOOP, 1})',
    )
  })

  it('returns the on/off environment settings as booleans', async () => {
    await expectResults(
      [
        // In-world: ll.GetEnvironment(pos, {SKY_TEXTURE_DEFAULTS}) -> true true true; {SKY_CLOUDS} -> the last of
        // eight is true; {SKY_MOON} and {SKY_SUN} -> the fourth of seven is true; through llcompat they are 1
        ['kinds(ll.GetEnvironment(pos, {SKY_TEXTURE_DEFAULTS}))', 'true true true'],
        ['kinds(ll.GetEnvironment(pos, {SKY_CLOUDS}))', 'vector number number number vector vector vector true'],
        ['kinds(ll.GetEnvironment(pos, {SKY_MOON}))', 'quaternion number number true vector vector vector'],
        ['kinds(ll.GetEnvironment(pos, {SKY_SUN}))', 'quaternion number vector true vector vector vector'],
        ['kinds(llcompat.GetEnvironment(pos, {SKY_TEXTURE_DEFAULTS, SKY_SUN}))', 'number number number quaternion number vector number vector vector vector'],
        // In-world: {WATER_TEXTURE_DEFAULTS} -> true false; through llcompat -> 1 0. The other water rules (100 to
        // 106) are numbers and vectors, for example {WATER_BLUR_MULTIPLIER, WATER_FOG} -> number, vector, number, number
        ['kinds(ll.GetEnvironment(pos, {WATER_TEXTURE_DEFAULTS}))', 'true false'],
        ['kinds(llcompat.GetEnvironment(pos, {WATER_TEXTURE_DEFAULTS}))', 'number number'],
        ['kinds(ll.GetEnvironment(pos, {WATER_BLUR_MULTIPLIER, WATER_FOG}))', 'number vector number number'],
        // In-world: the other sky rules are vectors and numbers, for example {SKY_AMBIENT, SKY_GAMMA, SKY_TRACKS,
        // ENVIRONMENT_DAYINFO} -> vector, number, three numbers, three numbers
        ['kinds(ll.GetEnvironment(pos, {SKY_AMBIENT, SKY_GAMMA, SKY_TRACKS, ENVIRONMENT_DAYINFO}))', 'vector number number number number number number number'],
      ],
      'local pos = ll.GetPos()',
    )
  })
})

describe('SLua: uuids in list results', () => {
  it('returns the texture and material a face holds by key as uuids, from ll and llcompat', async () => {
    await expectResults([
      // In-world: ll.GetPrimitiveParams({PRIM_TEXTURE, 0}) on a new prim -> uuid 89556747-…, <1, 1, 0>, <0, 0, 0>, 0;
      // the same through llcompat and ll.GetLinkPrimitiveParams(LINK_THIS, …)
      ['show(ll.GetPrimitiveParams({PRIM_TEXTURE, 0}))', `{uuid:${PLYWOOD} | vector:<1, 1, 0> | vector:<0, 0, 0> | number:0}`],
      ['show(llcompat.GetPrimitiveParams({PRIM_TEXTURE, 0}))', `{uuid:${PLYWOOD} | vector:<1, 1, 0> | vector:<0, 0, 0> | number:0}`],
      ['kinds(ll.GetLinkPrimitiveParams(LINK_THIS, {PRIM_TEXTURE, 0, PRIM_RENDER_MATERIAL, 0}))', 'uuid vector vector number uuid'],
      ['kinds(llcompat.GetLinkPrimitiveParams(LINK_THIS, {PRIM_TEXTURE, 0, PRIM_RENDER_MATERIAL, 0}))', 'uuid vector vector number uuid'],
      // In-world: {PRIM_TEXTURE, ALL_SIDES} on a box -> a uuid, two vectors and a number for each of six faces
      ['kinds(ll.GetPrimitiveParams({PRIM_TEXTURE, ALL_SIDES}))', Array(6).fill('uuid vector vector number').join(' ')],
      // In-world: {PRIM_RENDER_MATERIAL, 0} -> uuid 00000000-…, through llcompat too, while ll.GetRenderMaterial(0)
      // is that key as a string
      ['show(ll.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 0}))', `{uuid:${NULL}}`],
      ['show(llcompat.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 0}))', `{uuid:${NULL}}`],
      ['show(ll.GetRenderMaterial(0))', `string:${NULL}`],
      // In-world: {PRIM_NORMAL, 0} -> uuid 00000000-…, <1, 1, 0>, <0, 0, 0>, 0; {PRIM_SPECULAR, 0} -> the same,
      // then <1, 1, 1>, 51, 0
      ['show(ll.GetPrimitiveParams({PRIM_NORMAL, 0}))', `{uuid:${NULL} | vector:<1, 1, 0> | vector:<0, 0, 0> | number:0}`],
      ['kinds(ll.GetPrimitiveParams({PRIM_SPECULAR, 0}))', 'uuid vector vector number vector number number'],
      // In-world: {PRIM_NAME, PRIM_DESC, PRIM_TEXT} with all three set to a key's text -> strings
      [
        't(function() ll.SetPrimitiveParams({PRIM_NAME, tostring(U), PRIM_DESC, tostring(U), PRIM_TEXT, tostring(U), vector(1, 1, 1), 1}); return kinds(ll.GetPrimitiveParams({PRIM_NAME, PRIM_DESC, PRIM_TEXT})) end)',
        'string:string string string vector number',
      ],
    ])
  })

  it('returns them in lower case after a script set them', async () => {
    await expectResults(
      [
        // In-world: after {PRIM_TEXTURE, 0, "5748DECC-F629-461C-9A36-A35A221FE21F", …}: {PRIM_TEXTURE, 0} -> uuid
        // 5748decc-f629-461c-9a36-a35a221fe21f; after {PRIM_NORMAL, 0, U, …} and {PRIM_SPECULAR, 0, U, …} -> uuid U
        ['show(ll.GetPrimitiveParams({PRIM_TEXTURE, 0})[1])', `uuid:${U}`],
        ['show(llcompat.GetPrimitiveParams({PRIM_TEXTURE, 0})[1])', `uuid:${U}`],
        ['show(ll.GetPrimitiveParams({PRIM_NORMAL, 0})[1])', `uuid:${U}`],
        ['show(ll.GetPrimitiveParams({PRIM_SPECULAR, 0})[1])', `uuid:${U}`],
        // In-world: after {PRIM_TYPE, PRIM_TYPE_SCULPT, U, PRIM_SCULPT_TYPE_SPHERE}: {PRIM_TYPE} -> 7, uuid U, 1,
        // through llcompat too
        [
          't(function() ll.SetPrimitiveParams({PRIM_TYPE, PRIM_TYPE_SCULPT, U, PRIM_SCULPT_TYPE_SPHERE}); return ll.GetPrimitiveParams({PRIM_TYPE}) end)',
          `{number:7 | uuid:${U} | number:1}`,
        ],
        ['show(llcompat.GetPrimitiveParams({PRIM_TYPE}))', `{number:7 | uuid:${U} | number:1}`],
      ],
      `ll.SetPrimitiveParams({PRIM_TEXTURE, 0, string.upper(tostring(U)), R1, Z, 0, PRIM_NORMAL, 0, U, R1, Z, 0,
        PRIM_SPECULAR, 0, U, R1, Z, 0, vector(1, 1, 1), 51, 0})`,
    )
  })

  it('returns a glTF texture as a uuid once it is set, and the double-sided flag as a boolean', async () => {
    await expectResults(
      [
        // In-world: on a face with no material, {PRIM_GLTF_BASE_COLOR, 0} -> "", <1, 1, 0>, <0, 0, 0>, 0 and five
        // more "" (strings); {PRIM_GLTF_NORMAL, 0} -> "", <1, 1, 0>, <0, 0, 0>, 0
        ['show(before)', '{string: | vector:<1, 1, 0> | vector:<0, 0, 0> | number:0 | string: | string: | string: | string: | string:}'],
        // In-world: after ll.SetRenderMaterial(U, 0) and {PRIM_GLTF_BASE_COLOR, 0, U, <1, 1, 0>, <0, 0, 0>, 0, <1, 1, 1>,
        // 1, PRIM_GLTF_ALPHA_MODE_MASK, 0.5, true}: {PRIM_GLTF_BASE_COLOR, 0} -> uuid U, vector, vector, number,
        // vector, number, number 2, number, boolean true; through llcompat the last is number 1
        ['kinds(ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0}))', 'uuid vector vector number vector number number number true'],
        ['kinds(llcompat.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0}))', 'uuid vector vector number vector number number number number'],
        // In-world: {PRIM_GLTF_NORMAL, 0} -> uuid U, …; {PRIM_GLTF_METALLIC_ROUGHNESS, 0} -> uuid U, …, two numbers;
        // {PRIM_GLTF_EMISSIVE, 0} -> uuid U, …, a vector; {PRIM_RENDER_MATERIAL, 0} -> uuid U
        ['kinds(ll.GetPrimitiveParams({PRIM_GLTF_NORMAL, 0}))', 'uuid vector vector number'],
        ['kinds(ll.GetPrimitiveParams({PRIM_GLTF_METALLIC_ROUGHNESS, 0}))', 'uuid vector vector number number number'],
        ['kinds(ll.GetPrimitiveParams({PRIM_GLTF_EMISSIVE, 0}))', 'uuid vector vector number vector'],
        ['show(ll.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 0}))', `{uuid:${U}}`],
        ['show(llcompat.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 0}))', `{uuid:${U}}`],
        // In-world: ll.GetRenderMaterial(0) and llcompat.GetRenderMaterial(0) -> string U
        ['show(ll.GetRenderMaterial(0))', `string:${U}`],
      ],
      `local before = ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0})
      ll.SetRenderMaterial(U, 0)
      ll.SetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0, U, R1, Z, 0, vector(1, 1, 1), 1, PRIM_GLTF_ALPHA_MODE_MASK, 0.5, true,
        PRIM_GLTF_NORMAL, 0, U, R1, Z, 0, PRIM_GLTF_METALLIC_ROUGHNESS, 0, U, R1, Z, 0, 1, 1, PRIM_GLTF_EMISSIVE, 0, U, R1, Z, 0, vector(1, 1, 1)})`,
    )
  })

  it("returns a texture the prim holds as an item by the item's name, as a string", async () => {
    await expectResults(
      [
        // In-world: with a texture item "probe420 tex" in the prim, after ll.SetTexture("probe420 tex", 1):
        // ll.GetTexture(1) and llcompat.GetTexture(1) -> string "probe420 tex"; {PRIM_TEXTURE, 1} -> string
        // "probe420 tex", <1, 1, 0>, <0, 0, 0>, 0, through llcompat too
        ['t(function() ll.SetTexture("probe420 tex", 1); return ll.GetTexture(1) end)', 'string:probe420 tex'],
        ['show(llcompat.GetTexture(1))', 'string:probe420 tex'],
        ['show(ll.GetPrimitiveParams({PRIM_TEXTURE, 1}))', '{string:probe420 tex | vector:<1, 1, 0> | vector:<0, 0, 0> | number:0}'],
        ['show(llcompat.GetPrimitiveParams({PRIM_TEXTURE, 1})[1])', 'string:probe420 tex'],
        // In-world: after {PRIM_NORMAL, 1, "probe420 tex", …, PRIM_SPECULAR, 1, "probe420 tex", …}:
        // {PRIM_NORMAL, 1, PRIM_SPECULAR, 1} -> string "probe420 tex" in both
        [
          't(function() ll.SetPrimitiveParams({PRIM_NORMAL, 1, "probe420 tex", R1, Z, 0, PRIM_SPECULAR, 1, "probe420 tex", R1, Z, 0, vector(1, 1, 1), 51, 0}); return kinds(ll.GetPrimitiveParams({PRIM_NORMAL, 1, PRIM_SPECULAR, 1})) end)',
          'string:string vector vector number string vector vector number vector number number',
        ],
        ['show(ll.GetPrimitiveParams({PRIM_NORMAL, 1})[1])', 'string:probe420 tex'],
        // In-world: after {PRIM_TYPE, PRIM_TYPE_SCULPT, "probe420 tex", PRIM_SCULPT_TYPE_SPHERE}: {PRIM_TYPE} ->
        // 7, string "probe420 tex", 1
        [
          't(function() ll.SetPrimitiveParams({PRIM_TYPE, PRIM_TYPE_SCULPT, "probe420 tex", PRIM_SCULPT_TYPE_SPHERE}); return ll.GetPrimitiveParams({PRIM_TYPE}) end)',
          '{number:7 | string:probe420 tex | number:1}',
        ],
      ],
      '',
      (s) => s.host.addInventory(makeInventoryItem({ name: 'probe420 tex', type: InventoryType.TEXTURE, key: ASSET })),
    )
  })

  it('finds the item again when the script set the asset by key', async () => {
    await expectResults(
      [
        // In-world: with texture item "probe420 tex" (asset 97505205-…) in the prim, after
        // ll.SetTexture(string.upper(tostring(ll.GetInventoryKey("probe420 tex"))), 3): ll.GetTexture(3) and
        // {PRIM_TEXTURE, 3} -> string "probe420 tex". rezless matches the key's case exactly, so this sets the
        // key as the item has it.
        [
          't(function() ll.SetTexture(ll.GetInventoryKey("probe420 tex"), 3); return {ll.GetTexture(3), ll.GetPrimitiveParams({PRIM_TEXTURE, 3})[1]} end)',
          '{string:probe420 tex | string:probe420 tex}',
        ],
        // In-world: after {PRIM_NORMAL, 1, key, …, PRIM_SPECULAR, 1, key, …} with the item's asset key:
        // {PRIM_NORMAL, 1}, {PRIM_SPECULAR, 1} and llcompat's {PRIM_NORMAL, 1} -> string "probe420 tex"
        [
          't(function() local k = ll.GetInventoryKey("probe420 tex"); ll.SetPrimitiveParams({PRIM_NORMAL, 1, k, R1, Z, 0, PRIM_SPECULAR, 1, k, R1, Z, 0, vector(1, 1, 1), 51, 0}); return {ll.GetPrimitiveParams({PRIM_NORMAL, 1})[1], ll.GetPrimitiveParams({PRIM_SPECULAR, 1})[1], llcompat.GetPrimitiveParams({PRIM_NORMAL, 1})[1]} end)',
          '{string:probe420 tex | string:probe420 tex | string:probe420 tex}',
        ],
      ],
      '',
      (s) => s.host.addInventory(makeInventoryItem({ name: 'probe420 tex', type: InventoryType.TEXTURE, key: ASSET })),
    )
  })

  it("returns a glTF texture by key even when it was set by an item's name", async () => {
    await expectResults(
      [
        // In-world: on a face with a material, after {PRIM_GLTF_NORMAL, 2, "probe420 tex", <1, 1, 0>, <0, 0, 0>, 0}:
        // {PRIM_GLTF_NORMAL, 2} -> uuid, the item's asset key, through llcompat too; after {PRIM_GLTF_EMISSIVE, 2,
        // ll.GetInventoryKey("probe420 tex"), …} -> the same uuid
        ['show(ll.GetPrimitiveParams({PRIM_GLTF_NORMAL, 2})[1])', `uuid:${ASSET}`],
        ['show(llcompat.GetPrimitiveParams({PRIM_GLTF_NORMAL, 2})[1])', `uuid:${ASSET}`],
        ['show(ll.GetPrimitiveParams({PRIM_GLTF_EMISSIVE, 2})[1])', `uuid:${ASSET}`],
        // In-world: after {PRIM_GLTF_BASE_COLOR, 2, "", "", "", "", "", "", "", "", false}: {PRIM_GLTF_BASE_COLOR, 2}
        // -> "", <1, 1, 0>, <0, 0, 0>, 0, "", "", "", "", boolean false
        [
          't(function() ll.SetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 2, "", "", "", "", "", "", "", "", false}); return ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 2}) end)',
          '{string: | vector:<1, 1, 0> | vector:<0, 0, 0> | number:0 | string: | string: | string: | string: | boolean:false}',
        ],
      ],
      `ll.SetRenderMaterial(U, 2)
      ll.SetPrimitiveParams({PRIM_GLTF_NORMAL, 2, "probe420 tex", R1, Z, 0, PRIM_GLTF_EMISSIVE, 2, ll.GetInventoryKey("probe420 tex"), R1, Z, 0, vector(1, 1, 1)})`,
      (s) => s.host.addInventory(makeInventoryItem({ name: 'probe420 tex', type: InventoryType.TEXTURE, key: ASSET })),
    )
  })

  it("returns a material the prim holds as an item by the item's name, as a string", async () => {
    await expectResults(
      [
        // In-world: with a material item "probe420mat (probe420 mat)" in the prim, after ll.SetRenderMaterial(name, 2):
        // ll.GetRenderMaterial(2), llcompat.GetRenderMaterial(2), {PRIM_RENDER_MATERIAL, 2} and llcompat's -> string, the name
        ['t(function() ll.SetRenderMaterial("probe420mat (probe420 mat)", 2); return ll.GetRenderMaterial(2) end)', 'string:probe420mat (probe420 mat)'],
        ['show(llcompat.GetRenderMaterial(2))', 'string:probe420mat (probe420 mat)'],
        ['show(ll.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 2}))', '{string:probe420mat (probe420 mat)}'],
        ['show(llcompat.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 2}))', '{string:probe420mat (probe420 mat)}'],
        // In-world: after ll.SetRenderMaterial(ll.GetInventoryKey(name), 3): ll.GetRenderMaterial(3) and
        // {PRIM_RENDER_MATERIAL, 3} -> string, the name; after {PRIM_RENDER_MATERIAL, 4, name}: the same
        [
          't(function() ll.SetRenderMaterial(ll.GetInventoryKey("probe420mat (probe420 mat)"), 3); return {ll.GetRenderMaterial(3), ll.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 3})[1]} end)',
          '{string:probe420mat (probe420 mat) | string:probe420mat (probe420 mat)}',
        ],
        [
          't(function() ll.SetPrimitiveParams({PRIM_RENDER_MATERIAL, 4, "probe420mat (probe420 mat)"}); return ll.GetPrimitiveParams({PRIM_RENDER_MATERIAL, 4}) end)',
          '{string:probe420mat (probe420 mat)}',
        ],
        // In-world: {PRIM_GLTF_BASE_COLOR, 2} on that face, with no override set -> "" where a texture would be
        ['show(ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 2})[1])', 'string:'],
      ],
      '',
      (s) => s.host.addInventory(makeInventoryItem({ name: 'probe420mat (probe420 mat)', type: InventoryType.MATERIAL, key: MATERIAL })),
    )
  })

  it("keeps the item's name a string when the name reads like a key", async () => {
    await expectResults(
      [
        // In-world: with a texture item named "5748decc-f629-461c-9a36-a35a221fe21e" (asset ab7ce10e-…) in the prim,
        // after ll.SetTexture(that name, 2): ll.GetTexture(2) and llcompat.GetTexture(2) -> string, the name;
        // {PRIM_TEXTURE, 2} -> string, the name, through llcompat too
        [`t(function() ll.SetTexture("${KEYLIKE}", 2); return ll.GetTexture(2) end)`, `string:${KEYLIKE}`],
        ['show(llcompat.GetTexture(2))', `string:${KEYLIKE}`],
        ['show(ll.GetPrimitiveParams({PRIM_TEXTURE, 2})[1])', `string:${KEYLIKE}`],
        ['show(llcompat.GetPrimitiveParams({PRIM_TEXTURE, 2})[1])', `string:${KEYLIKE}`],
        // In-world: after ll.SetTexture(touuid(that name), 3): ll.GetTexture(3) -> string, the name
        [`t(function() ll.SetTexture(touuid("${KEYLIKE}"), 3); return ll.GetTexture(3) end)`, `string:${KEYLIKE}`],
        // In-world: after ll.SetTexture(ll.GetInventoryKey(that name), 4): ll.GetTexture(4) and {PRIM_TEXTURE, 4}
        // -> string, the name
        [`t(function() ll.SetTexture(ll.GetInventoryKey("${KEYLIKE}"), 4); return ll.GetTexture(4) end)`, `string:${KEYLIKE}`],
        ['show(ll.GetPrimitiveParams({PRIM_TEXTURE, 4})[1])', `string:${KEYLIKE}`],
        // In-world: after {PRIM_NORMAL, 2, that name, …}: {PRIM_NORMAL, 2} -> string, the name
        [
          `t(function() ll.SetPrimitiveParams({PRIM_NORMAL, 2, "${KEYLIKE}", R1, Z, 0}); return ll.GetPrimitiveParams({PRIM_NORMAL, 2})[1] end)`,
          `string:${KEYLIKE}`,
        ],
        // In-world: a face that still holds plywood -> uuid
        ['show(ll.GetTexture(0))', `uuid:${PLYWOOD}`],
      ],
      '',
      (s) => s.host.addInventory(makeInventoryItem({ name: KEYLIKE, type: InventoryType.TEXTURE, key: ASSET })),
    )
  })

  it('still returns a key for a face that holds another asset than the item of that name', async () => {
    await expectResults(
      [
        // In-world: with a texture item named "89556747-24cb-43ed-920b-47caed15465f" (the default texture's key)
        // that holds another asset, on a new prim: ll.GetTexture(0), llcompat.GetTexture(0) and {PRIM_TEXTURE, 0}
        // -> uuid 89556747-…, not the item's name
        ['show(ll.GetTexture(0))', `uuid:${PLYWOOD}`],
        ['show(llcompat.GetTexture(0))', `uuid:${PLYWOOD}`],
        ['show(ll.GetPrimitiveParams({PRIM_TEXTURE, 0})[1])', `uuid:${PLYWOOD}`],
        // In-world: ll.GetInventoryKey(that name) -> the item's own asset key
        [`show(ll.GetInventoryKey("${PLYWOOD}"))`, `uuid:${ASSET}`],
        // In-world: after ll.SetTexture(that name, 1): ll.GetTexture(1) and {PRIM_TEXTURE, 1} -> string, the name;
        // after ll.SetTexture(touuid(that name), 2): the same. The name is looked up before the key.
        [`t(function() ll.SetTexture("${PLYWOOD}", 1); return {ll.GetTexture(1), ll.GetPrimitiveParams({PRIM_TEXTURE, 1})[1]} end)`, `{string:${PLYWOOD} | string:${PLYWOOD}}`],
        [`t(function() ll.SetTexture(touuid("${PLYWOOD}"), 2); return {ll.GetTexture(2), ll.GetPrimitiveParams({PRIM_TEXTURE, 2})[1]} end)`, `{string:${PLYWOOD} | string:${PLYWOOD}}`],
      ],
      '',
      (s) => s.host.addInventory(makeInventoryItem({ name: PLYWOOD, type: InventoryType.TEXTURE, key: ASSET })),
    )
  })

  it('returns keys and names from the other list functions as LSL types them', async () => {
    await expectResults([
      // In-world: ll.GetObjectDetails(ll.GetKey(), {OBJECT_OWNER, OBJECT_CREATOR, OBJECT_ROOT, OBJECT_REZZER_KEY,
      // OBJECT_GROUP, OBJECT_LAST_OWNER_ID}) -> uuids; {OBJECT_NAME, OBJECT_DESC, OBJECT_CREATION_TIME, OBJECT_TEXT}
      // -> strings
      [
        'kinds(ll.GetObjectDetails(ll.GetKey(), {OBJECT_OWNER, OBJECT_CREATOR, OBJECT_ROOT, OBJECT_REZZER_KEY, OBJECT_GROUP, OBJECT_LAST_OWNER_ID}))',
        'uuid uuid uuid uuid uuid uuid',
      ],
      ['kinds(ll.GetObjectDetails(ll.GetKey(), {OBJECT_NAME, OBJECT_DESC, OBJECT_CREATION_TIME, OBJECT_TEXT}))', 'string string string string'],
      // In-world: ll.Json2List('["5748decc-…"]'), ll.CSV2List("5748decc-…,1"), ll.ParseString2List("5748decc-…|1",
      // {"|"}, {}) -> strings; ll.LinksetDataListKeys(1, 0) with a key's text as the key -> string
      [`kinds(ll.Json2List('["${U}",1]'))`, 'string number'],
      [`kinds(ll.CSV2List("${U},1"))`, 'string string'],
      [`kinds(ll.ParseString2List("${U}|1", {"|"}, {}))`, 'string string'],
      ['t(function() ll.LinksetDataWrite(tostring(U), "v"); return ll.LinksetDataListKeys(1, 0) end)', `{string:${U}}`],
      // In-world: ll.List2List({U, tostring(U), true, 1}, 1, 4) -> uuid, string, boolean, number
      ['kinds(ll.List2List({U, tostring(U), true, 1}, 1, 4))', 'uuid string true number'],
    ])
  })
})

describe('SLua: whole and fractional numbers as text', () => {
  it('prints a whole number without decimals from ll.List2CSV and ll.List2Json, and with them from ll.DumpList2String', async () => {
    await expectResults([
      // In-world: ll.List2CSV({1, 1.5, -0, 2^31}) -> 1, 1.500000, 0, 2147483648.000000; llcompat.List2CSV the same
      ['ll.List2CSV({1, 1.5, -0, 2 ^ 31})', '1, 1.500000, 0, 2147483648.000000'],
      ['llcompat.List2CSV({1, 1.5, -0, 2 ^ 31})', '1, 1.500000, 0, 2147483648.000000'],
      // In-world: ll.DumpList2String({1, 1.5, -0, 2^31}, "|") -> 1.000000|1.500000|0.000000|2147484000.000000;
      // llcompat.DumpList2String the same
      ['ll.DumpList2String({1, 1.5, -0, 2 ^ 31}, "|")', '1.000000|1.500000|0.000000|2147484000.000000'],
      ['llcompat.DumpList2String({1, 1.5, -0, 2 ^ 31}, "|")', '1.000000|1.500000|0.000000|2147484000.000000'],
      // In-world: ll.List2Json(JSON_ARRAY, {1, 1.5, -0, 2^31}) -> [1,1.500000,0,2147483648.000000]
      ['ll.List2Json(JSON_ARRAY, {1, 1.5, -0, 2 ^ 31})', '[1,1.500000,0,2147483648.000000]'],
      ['llcompat.List2Json(JSON_ARRAY, {1, 1.5, -0, 2 ^ 31})', '[1,1.500000,0,2147483648.000000]'],
      // In-world: {1.0, 100, 1e6, 1e-7} -> List2CSV 1, 100, 1000000, 0.000000; DumpList2String
      // 1.000000|100.000000|1000000.000000|0.000000; List2Json [1,100,1000000,0.000000]
      ['ll.List2CSV({1.0, 100, 1e6, 1e-7})', '1, 100, 1000000, 0.000000'],
      ['ll.DumpList2String({1.0, 100, 1e6, 1e-7}, "|")', '1.000000|100.000000|1000000.000000|0.000000'],
      ['ll.List2Json(JSON_ARRAY, {1.0, 100, 1e6, 1e-7})', '[1,100,1000000,0.000000]'],
      // In-world: ll.List2Json(JSON_OBJECT, {"a", 1, "b", 1.5, "c", 2^31}) -> {"a":1,"b":1.500000,"c":2147483648.000000}
      ['ll.List2Json(JSON_OBJECT, {"a", 1, "b", 1.5, "c", 2 ^ 31})', '{"a":1,"b":1.500000,"c":2147483648.000000}'],
      // In-world: ll.List2String({1}, 1) -> 1.000000; ({1.5}, 1) -> 1.500000; ({2^31}, 1) -> 2147484000.000000;
      // llcompat.List2String({1}, 0) -> 1.000000
      ['ll.List2String({1}, 1)', '1.000000'],
      ['ll.List2String({1.5}, 1)', '1.500000'],
      ['ll.List2String({2 ^ 31}, 1)', '2147484000.000000'],
      ['llcompat.List2String({1}, 0)', '1.000000'],
    ])
  })

  it('prints the numbers a function returned the same way', async () => {
    await expectResults([
      // In-world: on a new 0.5 m cube, r = ll.GetPrimitiveParams({PRIM_SIZE, PRIM_GLOW, 0, PRIM_COLOR, 0}):
      // ll.List2CSV(r) -> <0.500000, 0.500000, 0.500000>, 0, <1.000000, 1.000000, 1.000000>, 1;
      // ll.DumpList2String(r, "|") -> <0.500000, 0.500000, 0.500000>|0.000000|<1.000000, 1.000000, 1.000000>|1.000000;
      // ll.List2Json(JSON_ARRAY, r) -> ["<0.500000, 0.500000, 0.500000>",0,"<1.000000, 1.000000, 1.000000>",1]
      ['ll.List2CSV(ll.GetPrimitiveParams({PRIM_SIZE, PRIM_GLOW, 0, PRIM_COLOR, 0}))', '<0.500000, 0.500000, 0.500000>, 0, <1.000000, 1.000000, 1.000000>, 1'],
      [
        'll.DumpList2String(ll.GetPrimitiveParams({PRIM_SIZE, PRIM_GLOW, 0, PRIM_COLOR, 0}), "|")',
        '<0.500000, 0.500000, 0.500000>|0.000000|<1.000000, 1.000000, 1.000000>|1.000000',
      ],
      [
        'll.List2Json(JSON_ARRAY, ll.GetPrimitiveParams({PRIM_SIZE, PRIM_GLOW, 0, PRIM_COLOR, 0}))',
        '["<0.500000, 0.500000, 0.500000>",0,"<1.000000, 1.000000, 1.000000>",1]',
      ],
      // In-world: llcompat.List2CSV(llcompat.GetPrimitiveParams({PRIM_GLOW, 0, PRIM_COLOR, 0})) -> 0, <1.000000, 1.000000, 1.000000>, 1
      ['llcompat.List2CSV(llcompat.GetPrimitiveParams({PRIM_GLOW, 0, PRIM_COLOR, 0}))', '0, <1.000000, 1.000000, 1.000000>, 1'],
      // In-world: ll.List2CSV(ll.Json2List("[1,1.0,2.5,true]")) -> 1, 1, 2.500000, and JSON_TRUE;
      // ll.List2CSV(ll.ListSort({2, 1.5, 1}, 1, true)) -> 1, 1.500000, 2; ll.List2CSV(ll.List2List({1, 2.5, 3.0}, 1, 3)) -> 1, 2.500000, 3
      ['tostring(ll.List2CSV(ll.Json2List("[1,1.0,2.5,true]")) == "1, 1, 2.500000, " .. JSON_TRUE)', 'true'],
      ['ll.List2CSV(ll.ListSort({2, 1.5, 1}, 1, true))', '1, 1.500000, 2'],
      ['ll.List2CSV(ll.List2List({1, 2.5, 3.0}, 1, 3))', '1, 2.500000, 3'],
      // In-world: ll.List2CSV(ll.CSV2List("1,1.0,2.5")) -> 1, 1.0, 2.5 (strings stay as written)
      ['ll.List2CSV(ll.CSV2List("1,1.0,2.5"))', '1, 1.0, 2.5'],
      // In-world: ll.List2CSV({ll.Floor(1.5), ll.Ceil(1.5), ll.Round(1.5), ll.Abs(-2), ll.Fabs(-2), ll.Pow(2, 0.5),
      // ll.Sqrt(9), ll.Frand(0), true, ll.GetNumberOfSides(), false}) -> 1, 2, 2, 2, 2, 1.414214, 3, 0, 1, 6, 0 (the
      // case below leaves out the last four but one); ll.DumpList2String({ll.Floor(1.5),
      // ll.Fabs(-2), ll.GetNumberOfSides(), ll.GetAlpha(0)}, "|") -> 1.000000|2.000000|6.000000|1.000000
      ['ll.List2CSV({ll.Floor(1.5), ll.Ceil(1.5), ll.Round(1.5), ll.Abs(-2), ll.Fabs(-2), ll.Pow(2, 0.5), ll.Sqrt(9), ll.GetNumberOfSides()})', '1, 2, 2, 2, 2, 1.414214, 3, 6'],
      ['ll.DumpList2String({ll.Floor(1.5), ll.Fabs(-2), ll.GetNumberOfSides(), ll.GetAlpha(0)}, "|")', '1.000000|2.000000|6.000000|1.000000'],
    ])
  })

  it("turns a number into text as Lua does, and doesn't take one for a string", async () => {
    await expectResults([
      // In-world: tostring(1), tostring(1.0), 1 .. "" -> 1; tostring(1.5) -> 1.5; 2^31 .. "" -> 2147483648;
      // 1e15 .. "" -> 1000000000000000; 1e16 .. "" -> 10000000000000000; 0.1 .. "" -> 0.1; -0.0 .. "" -> -0
      ['tostring(1) .. " " .. tostring(1.0) .. " " .. 1 .. " " .. tostring(1.5)', '1 1 1 1.5'],
      ['2 ^ 31 .. " " .. 1e15 .. " " .. 1e16 .. " " .. 0.1 .. " " .. -0.0', '2147483648 1000000000000000 10000000000000000 0.1 -0'],
      // In-world: tostring(ll.GetAlpha(0)), tostring(ll.Fabs(-1)), tostring(ll.GetListLength({1})) -> 1
      ['tostring(ll.GetAlpha(0)) .. tostring(ll.Fabs(-1)) .. tostring(ll.GetListLength({1}))', '111'],
      // In-world: tostring(vector(1, 2, 3)) -> <1, 2, 3>; ll.List2CSV({vector(1, 2, 3), quaternion(0, 0, 0, 1)}) ->
      // <1.000000, 2.000000, 3.000000>, <0.000000, 0.000000, 0.000000, 1.000000>; ll.List2String({vector(1, 2, 3)}, 1)
      // -> <1.000000, 2.000000, 3.000000>
      ['tostring(vector(1, 2, 3))', '<1, 2, 3>'],
      ['ll.List2CSV({vector(1, 2, 3), Q})', '<1.000000, 2.000000, 3.000000>, <0.000000, 0.000000, 0.000000, 1.000000>'],
      ['ll.List2String({vector(1, 2, 3)}, 1)', '<1.000000, 2.000000, 3.000000>'],
      // In-world: ll.Say(7778, 1) -> invalid argument #2 to 'Say' (string expected, got number)
      ['t(ll.Say, 7778, 1)', "!! invalid argument #2 to 'Say' (string expected, got number)"],
      // In-world: ll.JsonGetValue("[1.0,1,1.50]", {1}) -> 1; ({2}) -> 1.50 (JSON text is kept as written)
      ['ll.JsonGetValue("[1.0,1,1.50]", {1}) .. " " .. ll.JsonGetValue("[1.0,1,1.50]", {2})', '1 1.50'],
    ])
  })
})

describe('SLua: integer arguments that do not fit', () => {
  const roundTrip = (v: string) => `show(ll.Base64ToInteger(ll.IntegerToBase64(${v})))`

  it('keeps the low 32 bits of a number that fits 64 bits', async () => {
    await expectResults([
      // In-world: ll.Base64ToInteger(ll.IntegerToBase64(x)) for 2^31 -> -2147483648; 2^31 - 1 -> 2147483647;
      // -2^31 - 1 -> 2147483647; 2^32 -> 0; 2^32 + 5 -> 5; 2^40 + 7 -> 7; -(2^40 + 7) -> -7; 2^53 + 2 -> 2
      [roundTrip('2 ^ 31'), 'number:-2147483648'],
      [roundTrip('2 ^ 31 - 1'), 'number:2147483647'],
      [roundTrip('-2 ^ 31 - 1'), 'number:2147483647'],
      [roundTrip('2 ^ 32'), 'number:0'],
      [roundTrip('2 ^ 32 + 5'), 'number:5'],
      [roundTrip('2 ^ 40 + 7'), 'number:7'],
      [roundTrip('-(2 ^ 40 + 7)'), 'number:-7'],
      [roundTrip('2 ^ 53 + 2'), 'number:2'],
      // In-world: 2^62 -> 0; 2^62 + 2^31 -> -2147483648; 9e18 -> -494665728; 9e18 + 3072 -> -494662656;
      // 2^63 - 1024 -> -1024; -2^63 + 1024 -> 1024
      [roundTrip('2 ^ 62'), 'number:0'],
      [roundTrip('2 ^ 62 + 2 ^ 31'), 'number:-2147483648'],
      [roundTrip('9e18'), 'number:-494665728'],
      [roundTrip('9e18 + 3072'), 'number:-494662656'],
      [roundTrip('2 ^ 63 - 1024'), 'number:-1024'],
      [roundTrip('-2 ^ 63 + 1024'), 'number:1024'],
      // In-world: 1.9 -> 1; -1.9 -> -1; 2^31 + 0.5 -> -2147483648; "4294967301" -> 5
      [roundTrip('1.9'), 'number:1'],
      [roundTrip('-1.9'), 'number:-1'],
      [roundTrip('2 ^ 31 + 0.5'), 'number:-2147483648'],
      [roundTrip('"4294967301"'), 'number:5'],
      // In-world: "0x1p40" -> 0
      [roundTrip('"0x1p40"'), 'number:0'],
    ])
  })

  it('reads a number past 64 bits as 0', async () => {
    await expectResults([
      // In-world: ll.Base64ToInteger(ll.IntegerToBase64(x)) -> 0 for 1e20, -1e20, 2^63, 2^63 + 2048, -2^63,
      // -2^63 - 2048, 2^64, 2^64 + 20480, 1e19, 1e300, inf, -inf, nan, "1e20", "9223372036854775808", "inf", "nan"
      ...['1e20', '-1e20', '2 ^ 63', '2 ^ 63 + 2048', '-2 ^ 63', '-2 ^ 63 - 2048', '2 ^ 64', '2 ^ 64 + 20480', '1e19', '1e300']
        .concat(['1 / 0', '-1 / 0', '0 / 0', '"1e20"', '"9223372036854775808"', '"inf"', '"nan"'])
        .map((v) => [roundTrip(v), 'number:0'] as const),
      // In-world: through llcompat: 1e20 -> 0; 2^32 + 5 -> 5; 2^63 -> 0
      ['show(llcompat.Base64ToInteger(llcompat.IntegerToBase64(1e20)))', 'number:0'],
      ['show(llcompat.Base64ToInteger(llcompat.IntegerToBase64(2 ^ 32 + 5)))', 'number:5'],
    ])
  })

  it('does the same for the other integer parameters', async () => {
    await expectResults([
      // In-world: #ll.Char(1e20) -> 0; ll.Char(2^32 + 65) -> A; #ll.Char(2^63) -> 0
      ['#ll.Char(1e20) .. ll.Char(2 ^ 32 + 65) .. #ll.Char(2 ^ 63)', '0A0'],
      // In-world: ll.ModPow(1e20, 1, 7) -> 0; (2^32 + 5, 1, 7) -> 5; (5, 1, 1e20) -> 0; (5, 2^32 + 1, 7) -> 5
      ['show({ll.ModPow(1e20, 1, 7), ll.ModPow(2 ^ 32 + 5, 1, 7), ll.ModPow(5, 1, 1e20), ll.ModPow(5, 2 ^ 32 + 1, 7)})', '{number:0 | number:5 | number:0 | number:5}'],
      // In-world: ll.StringTrim(" a ", 1e20) -> " a "; (" a ", 2^32 + 1) -> "a "; (" a ", 2^32 + 3) -> "a"
      ['"[" .. ll.StringTrim(" a ", 1e20) .. "][" .. ll.StringTrim(" a ", 2 ^ 32 + 1) .. "][" .. ll.StringTrim(" a ", 2 ^ 32 + 3) .. "]"', '[ a ][a ][a]'],
      // In-world: ll.MD5String("", 1e20) == ll.MD5String("", 0); ll.MD5String("", 2^32 + 5) == ll.MD5String("", 5)
      ['show({ll.MD5String("", 1e20) == ll.MD5String("", 0), ll.MD5String("", 2 ^ 32 + 5) == ll.MD5String("", 5)})', '{boolean:true | boolean:true}'],
      // In-world: ll.List2CSV(ll.ListSort({3, 1, 2}, 2^32 + 1, true)) and with stride 1e20 -> 1, 2, 3
      ['ll.List2CSV(ll.ListSort({3, 1, 2}, 2 ^ 32 + 1, true)) .. " / " .. ll.List2CSV(ll.ListSort({3, 1, 2}, 1e20, true))', '1, 2, 3 / 1, 2, 3'],
      // In-world: ll.List2CSV(ll.List2ListStrided({1, 2, 3, 4}, 1, -1, 2^32 + 2)) -> 1, 3; with stride 1e20 -> 1, 2, 3, 4
      [
        'll.List2CSV(ll.List2ListStrided({1, 2, 3, 4}, 1, -1, 2 ^ 32 + 2)) .. " / " .. ll.List2CSV(ll.List2ListStrided({1, 2, 3, 4}, 1, -1, 1e20))',
        '1, 3 / 1, 2, 3, 4',
      ],
      // In-world: ll.SetAlpha(0.5, 2^32), then ll.GetAlpha(0) -> 0.5; ll.SetAlpha(0.25, 1e20), then ll.GetAlpha(0) -> 0.25
      ['t(function() ll.SetAlpha(0.5, 2 ^ 32); local a = ll.GetAlpha(0); ll.SetAlpha(0.25, 1e20); return {a, ll.GetAlpha(0)} end)', '{number:0.5 | number:0.25}'],
      // In-world: on an unlinked prim, ll.GetLinkName(1e20) -> its own name (link 0); ll.GetLinkKey(2^32) -> its own key
      ['show({ll.GetLinkName(1e20) == ll.GetObjectName(), ll.GetLinkKey(2 ^ 32) == ll.GetKey()})', '{boolean:true | boolean:true}'],
      // In-world: llcompat.DeleteSubString("abcdef", 1e20, 1e20) -> bcdef; ("abcdef", 2^32 + 1, 2^32 + 1) -> acdef
      ['llcompat.DeleteSubString("abcdef", 1e20, 1e20) .. " " .. llcompat.DeleteSubString("abcdef", 2 ^ 32 + 1, 2 ^ 32 + 1)', 'bcdef acdef'],
    ])
  })

  it('reads a 1-based index that does not fit 32 bits as one before the start', async () => {
    await expectResults([
      // In-world: ll.DeleteSubString("abcdef", 1e20, 1e20), (2^32 + 2, 2^32 + 2) and (-1e20, -1e20) -> abcdef;
      // ("abcdef", 2, 2) -> acdef
      ['ll.DeleteSubString("abcdef", 1e20, 1e20)', 'abcdef'],
      ['ll.DeleteSubString("abcdef", 2 ^ 32 + 2, 2 ^ 32 + 2)', 'abcdef'],
      ['ll.DeleteSubString("abcdef", -1e20, -1e20)', 'abcdef'],
      ['ll.DeleteSubString("abcdef", 2, 2)', 'acdef'],
      // In-world: ll.InsertString("abc", 1e20, "x") and ("abc", 2^32 + 2, "x") -> xabc; ("abc", 2, "x") -> axbc
      ['ll.InsertString("abc", 1e20, "x")', 'xabc'],
      ['ll.InsertString("abc", 2 ^ 32 + 2, "x")', 'xabc'],
      ['ll.InsertString("abc", 2, "x")', 'axbc'],
      // In-world: ll.Ord("abc", 1e20) and ("abc", 2^32 + 2) -> 0; ("abc", 2) -> 98
      ['show({ll.Ord("abc", 1e20), ll.Ord("abc", 2 ^ 32 + 2), ll.Ord("abc", 2)})', '{number:0 | number:0 | number:98}'],
    ])
  })

  it('draws that line at 2^31', async () => {
    const insert = (n: string) => `t(ll.InsertString, "abc", ${n}, "x")`
    await expectResults([
      // In-world: ll.InsertString("abc", n, "x") for n = 2^31 - 1, 4 and 5 -> abcx (past the end)
      ...['2 ^ 31 - 1', '4', '5'].map((n) => [insert(n), 'string:abcx'] as const),
      // In-world: for n = 2^31, 2^31 + 1, 2^31 + 0.5, 2^32 - 1, 2^32, 2^33, -2^31, -2^31 - 1, -2^31 + 1, -2^32, inf,
      // -inf, nan, "2147483648", "1e20" -> xabc (before the start); -1, -2 and 1.9 -> xabc as well
      ...['2 ^ 31', '2 ^ 31 + 1', '2 ^ 31 + 0.5', '2 ^ 32 - 1', '2 ^ 32', '2 ^ 33', '-2 ^ 31', '-2 ^ 31 - 1', '-2 ^ 31 + 1', '-2 ^ 32']
        .concat(['1 / 0', '-1 / 0', '0 / 0', '"2147483648"', '"1e20"', '-1', '-2', '1.9'])
        .map((n) => [insert(n), 'string:xabc'] as const),
      // In-world: n = 0.5 and -0.5 -> passed 0 when a 1-based index was expected
      [insert('0.5'), '!! passed 0 when a 1-based index was expected'],
      [insert('-0.5'), '!! passed 0 when a 1-based index was expected'],
      // In-world: ll.Ord("abc", 2^31), ("abc", 2^31 - 1), ("abc", -2^31), ("abc", -2^31 - 1) -> 0; ("abc", -1) -> 99
      ['show({ll.Ord("abc", 2 ^ 31), ll.Ord("abc", 2 ^ 31 - 1), ll.Ord("abc", -2 ^ 31), ll.Ord("abc", -2 ^ 31 - 1), ll.Ord("abc", -1)})', '{number:0 | number:0 | number:0 | number:0 | number:99}'],
      // In-world: ll.DeleteSubString("abcdef", 2^31, 2^31) -> abcdef; (1, 2^31) and (1, 2^31 - 1) -> ""; (-2^31, 2)
      // -> cdef; (2, -2^31 - 1) and (2, 1e20) -> a; (1e20, 2) -> cdef
      ['ll.DeleteSubString("abcdef", 2 ^ 31, 2 ^ 31)', 'abcdef'],
      ['"[" .. ll.DeleteSubString("abcdef", 1, 2 ^ 31) .. "][" .. ll.DeleteSubString("abcdef", 1, 2 ^ 31 - 1) .. "]"', '[][]'],
      ['ll.DeleteSubString("abcdef", -2 ^ 31, 2) .. " " .. ll.DeleteSubString("abcdef", 1e20, 2)', 'cdef cdef'],
      ['ll.DeleteSubString("abcdef", 2, -2 ^ 31 - 1) .. " " .. ll.DeleteSubString("abcdef", 2, 1e20)', 'a a'],
      // In-world: through llcompat the index is an ordinary integer: llcompat.InsertString("abc", 2^31, "x") -> xabc;
      // ("abc", 2^32 + 1, "x") -> axbc; ("abc", -2^31 - 1, "x") -> abcx; ("abc", 1e20, "x") -> xabc
      [
        'show({llcompat.InsertString("abc", 2 ^ 31, "x"), llcompat.InsertString("abc", 2 ^ 32 + 1, "x"), llcompat.InsertString("abc", -2 ^ 31 - 1, "x"), llcompat.InsertString("abc", 1e20, "x")})',
        '{string:xabc | string:axbc | string:abcx | string:xabc}',
      ],
      // In-world: ll.GetInventoryName(INVENTORY_ALL, 2^31) and (INVENTORY_ALL, 1e20) -> ""
      ['"[" .. ll.GetInventoryName(INVENTORY_ALL, 2 ^ 31) .. ll.GetInventoryName(INVENTORY_ALL, 1e20) .. "]"', '[]'],
    ])
  })
})

describe('SLua: where an error says it happened', () => {
  const said = async (source: string, filename?: string) => {
    const s = await loadScript({ source, language: 'slua', ...(filename ? { filename } : {}) })
    s.start()
    s.advanceTime(1000)
    return s.chat.filter((c) => c.channel === 7777).map((c) => c.text)
  }

  it('calls the script lua_script, whatever file it was loaded from', async () => {
    // In-world: pcall(function() error("x") end) on line 2 -> lua_script:2: x; error("x", 0) -> x;
    // local a = nil; return a.b -> lua_script:4: attempt to index nil with 'b';
    // ll.OwnerSay(5) inside a function -> lua_script:5: invalid argument #1 to 'OwnerSay' (string expected, got number);
    // pcall(ll.OwnerSay, 5) -> the same without a position
    expect(
      await said(
        [
          'local function e(f, ...) local ok, m = pcall(f, ...); ll.Say(7777, tostring(m)) end',
          'e(function() error("x") end)',
          'e(function() error("x", 0) end)',
          'e(function() local a = nil; return a.b end)',
          'e(function() ll.OwnerSay(5) end)',
          'e(ll.OwnerSay, 5)',
        ].join('\n'),
        'door.luau',
      ),
    ).toEqual([
      'lua_script:2: x',
      'x',
      "lua_script:4: attempt to index nil with 'b'",
      "lua_script:5: invalid argument #1 to 'OwnerSay' (string expected, got number)",
      "invalid argument #1 to 'OwnerSay' (string expected, got number)",
    ])
  })

  it('names lua_script in debug.info and in tracebacks', async () => {
    // In-world: debug.info(1, "s") -> lua_script; debug.info(1, "l") -> the line; debug.info(t, "s"), "l" and "n"
    // for a function t defined on line 24 -> lua_script, 24, t; debug.info(ll.Say, …) -> [C], -1, Say;
    // debug.traceback("m") on line 54, in a function that t called from its line 25 -> four lines: m,
    // lua_script:54, lua_script:25 function t, lua_script:54
    expect(
      await said(
        [
          'local function f() return debug.traceback("m") end',
          'll.Say(7777, debug.info(1, "s") .. " " .. debug.info(1, "l"))',
          'll.Say(7777, debug.info(f, "s") .. " " .. debug.info(f, "l") .. " " .. debug.info(f, "n"))',
          'll.Say(7777, debug.info(ll.Say, "s") .. " " .. debug.info(ll.Say, "l") .. " " .. debug.info(ll.Say, "n"))',
          'll.Say(7777, (string.gsub(f(), "\\n", " / ")))',
        ].join('\n'),
        'door.luau',
      ),
    ).toEqual(['lua_script 2', 'lua_script 1 f', '[C] -1 Say', 'm / lua_script:1 function f / lua_script:5 / '])
    // In-world: debug.info(print, "s"), "l" and "n" -> [C], -1, lsl_print
    expect(await said('ll.Say(7777, debug.info(print, "s") .. " " .. debug.info(print, "l") .. " " .. debug.info(print, "n"))')).toEqual([
      '[C] -1 lsl_print',
    ])
  })

  it('says lua_script inside a timer callback and a coroutine too', async () => {
    // In-world: in an LLTimers:once callback, pcall(function() error("x") end) -> lua_script:<line>: x;
    // coroutine.resume of a function that calls error("in co") on line 3 -> false, lua_script:3: in co
    expect(
      await said(
        [
          'LLTimers:once(0.2, function()',
          '  local ok, m = pcall(function() error("x") end); ll.Say(7777, tostring(m)) end)',
          'local co = coroutine.create(function() error("in co") end)',
          'local ok, m = coroutine.resume(co); ll.Say(7777, tostring(m))',
        ].join('\n'),
        'door.luau',
      ),
    ).toEqual(['lua_script:3: in co', 'lua_script:2: x'])
  })

  it('crashes with the position in lua_script, and names the file in a compile error', async () => {
    // A crash throws the message a pcall would have caught, so it names lua_script too. (In-world a script whose
    // line 3 calls error("uncaught F") stops there; a listener hears only "Script run-time error" and "runtime
    // error".) In-world: saving a script whose line 2 is `local y = = 2` reports ":2: Expected identifier when
    // parsing expression, got '='", and one whose line 2 is `break` reports ":2: break statement must be inside
    // a loop", with no chunk name; rezless puts the file's name in front, since a script can't see it.
    const s = await loadScript({ source: 'local x = 1\nlocal function f()\n  error("uncaught F")\nend\nf()', language: 'slua', filename: 'door.luau' })
    expect(() => s.start()).toThrow('lua_script:3: uncaught F')
    await expect(loadScript({ source: 'local x = 1\nlocal y = = 2', language: 'slua', filename: 'door.luau' })).rejects.toThrow(
      "door.luau:2: Expected identifier when parsing expression, got '='",
    )
    await expect(loadScript({ source: 'local x = 1\nbreak', language: 'slua', filename: 'door.luau' })).rejects.toThrow(
      'door.luau:2: break statement must be inside a loop',
    )
  })
})

describe('a list of items to give', () => {
  const OWNER = '00000000-0000-0000-0000-00000000000a'
  const card = (name: string) => makeInventoryItem({ name, type: InventoryType.NOTECARD, key: U, notecardLines: ['hello'] })
  const errors = (s: Script) => s.chat.filter((c) => c.channel === 2147483647).map((c) => c.text)
  const NOTHING = ['Unable to give inventory list: No items passed filter']

  async function give(language: 'lsl' | 'slua', list: string) {
    const source =
      language === 'slua'
        ? `ll.GiveInventoryList(ll.GetOwner(), "folder", ${list})`
        : `default { state_entry() { llGiveInventoryList(llGetOwner(), "folder", ${list}); } }`
    const s = await loadScript({ owner: OWNER, source, language })
    s.host.addInventory(card('1'))
    s.host.addInventory(card('probe420 nc'))
    s.start()
    return { offered: s.inventoryOffers.map((o) => o.items.map((i) => i.name)), errors: errors(s) }
  }

  it('takes only strings as item names in SLua', async () => {
    // In-world: with notecards "1" and "probe420 nc" in the prim, ll.GiveInventoryList(owner, folder, {1}),
    // {1.5}, {true}, {vector(1, 2, 3)}, {"nope"} and {} each say "Unable to give inventory list: No items passed
    // filter" on DEBUG_CHANNEL and give nothing; llcompat.GiveInventoryList(owner, folder, {1}) the same
    for (const list of ['{1}', '{1.5}', '{true}', '{vector(1, 2, 3)}', '{"nope"}', '{}']) {
      expect(await give('slua', list), list).toEqual({ offered: [], errors: NOTHING })
    }
    // In-world: {"1"} gives a folder; {"1", 1}, {1, "1"} and {"probe420 nc", 1} give a folder too, with no error
    expect(await give('slua', '{"1"}')).toEqual({ offered: [['1']], errors: [] })
    expect(await give('slua', '{"1", 1}')).toEqual({ offered: [['1']], errors: [] })
    expect(await give('slua', '{1, "1"}')).toEqual({ offered: [['1']], errors: [] })
    expect(await give('slua', '{"probe420 nc", 1}')).toEqual({ offered: [['probe420 nc']], errors: [] })
  })

  it('takes only strings as item names in ll.GiveAgentInventory', async () => {
    // In-world: ll.GiveAgentInventory(owner, folder, {1}, {}), {1.5}, {"nope"} and llcompat's {1} -> -4, nothing
    // given; {"1"} and {"1", 1} -> 0, a folder holding "1". With a texture item named
    // "5748decc-f629-461c-9a36-a35a221fe21e" in the prim, {touuid(that name)} -> -4, and
    // ll.GiveInventoryList(owner, folder, {touuid(that name)}) says "No items passed filter"
    const run = async (call: string) => {
      const s = await loadScript({ owner: OWNER, source: `ll.Say(7777, tostring((${call})))`, language: 'slua' })
      s.host.addInventory(card('1'))
      s.host.addInventory(makeInventoryItem({ name: KEYLIKE, type: InventoryType.TEXTURE, key: ASSET }))
      s.start()
      return { said: s.chat.filter((c) => c.channel === 7777).map((c) => c.text), offered: s.inventoryOffers.map((o) => o.items.map((i) => i.name)), errors: errors(s) }
    }
    for (const list of ['{1}', '{1.5}', '{"nope"}', `{touuid("${KEYLIKE}")}`]) {
      expect(await run(`ll.GiveAgentInventory(ll.GetOwner(), "folder", ${list}, {})`), list).toEqual({ said: ['-4'], offered: [], errors: [] })
    }
    expect(await run('llcompat.GiveAgentInventory(ll.GetOwner(), "folder", {1}, {})')).toEqual({ said: ['-4'], offered: [], errors: [] })
    expect(await run('ll.GiveAgentInventory(ll.GetOwner(), "folder", {"1"}, {})')).toEqual({ said: ['0'], offered: [['1']], errors: [] })
    expect(await run('ll.GiveAgentInventory(ll.GetOwner(), "folder", {"1", 1}, {})')).toEqual({ said: ['0'], offered: [['1']], errors: [] })
    expect(await run(`ll.GiveInventoryList(ll.GetOwner(), "folder", {touuid("${KEYLIKE}")})`)).toEqual({ said: ['nil'], offered: [], errors: NOTHING })
    expect(await run(`ll.GiveInventoryList(ll.GetOwner(), "folder", {"${KEYLIKE}"})`)).toEqual({ said: ['nil'], offered: [[KEYLIKE]], errors: [] })
  })

  it('takes only strings as item names in LSL', async () => {
    // In-world: llGiveInventoryList(llGetOwner(), folder, [1]), [1.5], [(key)"1"], ["nope"] and [] each say
    // "Unable to give inventory list: No items passed filter"; ["1"], ["1", 1] and [1, "1"] give a folder
    for (const list of ['[1]', '[1.5]', '[(key)"1"]', '["nope"]', '[]']) {
      expect(await give('lsl', list), list).toEqual({ offered: [], errors: NOTHING })
    }
    expect(await give('lsl', '["1"]')).toEqual({ offered: [['1']], errors: [] })
    expect(await give('lsl', '["1", 1]')).toEqual({ offered: [['1']], errors: [] })
    expect(await give('lsl', '[1, "1"]')).toEqual({ offered: [['1']], errors: [] })
  })
})

describe('SLua: the functions only llcompat has', () => {
  const run = async (source: string, ms = 0) => {
    const s = await loadScript({ source, language: 'slua' })
    s.start()
    if (ms) s.advanceTime(ms)
    return s.chat.filter((c) => c.channel === 7777).map((c) => c.text)
  }

  it('has SetTimerEvent, ResetTime, GetAndResetTime and SetMemoryLimit in llcompat and not in ll', async () => {
    // In-world: the names in llcompat that ll lacks -> GetAndResetTime, ResetTime, SetMemoryLimit, SetTimerEvent;
    // ll has none that llcompat lacks; typeof(ll.SetTimerEvent) -> nil
    expect(
      await run(`
        local only, missing = {}, {}
        for k in pairs(llcompat) do if ll[k] == nil then only[#only + 1] = k end end
        for k in pairs(ll) do if llcompat[k] == nil then missing[#missing + 1] = k end end
        table.sort(only)
        ll.Say(7777, table.concat(only, ",") .. " / " .. #missing .. " / " .. typeof(ll.SetTimerEvent))`),
    ).toEqual(['GetAndResetTime,ResetTime,SetMemoryLimit,SetTimerEvent / 0 / nil'])
  })

  it('checks their arguments like any other function', async () => {
    await expectResults([
      // In-world: llcompat.SetTimerEvent() -> Fewer arguments than expected, 0 < 1; ("x") -> invalid argument #1 to
      // 'SetTimerEvent' (number expected, got string); (true) -> (number expected, got boolean); (nil) -> got nil
      ['t(llcompat.SetTimerEvent)', '!! Fewer arguments than expected, 0 < 1'],
      ['t(llcompat.SetTimerEvent, "x")', "!! invalid argument #1 to 'SetTimerEvent' (number expected, got string)"],
      ['t(llcompat.SetTimerEvent, true)', "!! invalid argument #1 to 'SetTimerEvent' (number expected, got boolean)"],
      ['t(llcompat.SetTimerEvent, nil)', "!! invalid argument #1 to 'SetTimerEvent' (number expected, got nil)"],
      // In-world: llcompat.SetTimerEvent(0) and llcompat.ResetTime(1) -> nothing returned, no error
      ['t(llcompat.SetTimerEvent, 0)', '(nothing)'],
      ['t(llcompat.ResetTime, 1)', '(nothing)'],
      // In-world: llcompat.SetMemoryLimit() -> Fewer arguments than expected, 0 < 1; ("x") -> (number expected, got string)
      ['t(llcompat.SetMemoryLimit)', '!! Fewer arguments than expected, 0 < 1'],
      ['t(llcompat.SetMemoryLimit, "x")', "!! invalid argument #1 to 'SetMemoryLimit' (number expected, got string)"],
    ])
  })

  it('lets an SLua script set its memory limit up to 131072', async () => {
    const lim = (n: string) => [`tostring(llcompat.SetMemoryLimit(${n})) .. "/" .. ll.GetMemoryLimit()`, ''] as const
    const cases: Array<readonly [string, string]> = [
      // In-world: ll.GetMemoryLimit() and llcompat.GetMemoryLimit() -> 131072 at first
      ['ll.GetMemoryLimit() .. "/" .. llcompat.GetMemoryLimit()', '131072/131072'],
      // In-world, in this order, llcompat.SetMemoryLimit(n) and then ll.GetMemoryLimit(): 131073 -> 0, 131072;
      // 262144 -> 0, 131072; 131072 -> 1, 131072; 131071 -> 1, 131071; 131072 -> 1, 131072 (back up);
      // 100000 -> 1, 100000; 120000 -> 1, 120000; 65537 -> 1, 65537; 65536 -> 1, 65536; 65535 -> 1, 65535
      [lim('131073')[0], '0/131072'],
      [lim('262144')[0], '0/131072'],
      [lim('131072')[0], '1/131072'],
      [lim('131071')[0], '1/131071'],
      [lim('131072')[0], '1/131072'],
      [lim('100000')[0], '1/100000'],
      [lim('120000')[0], '1/120000'],
      [lim('65537')[0], '1/65537'],
      [lim('65536')[0], '1/65536'],
      [lim('65535')[0], '1/65535'],
      // In-world: ll.GetFreeMemory() is then 65535 less ll.GetUsedMemory()
      ['tostring(ll.GetFreeMemory() == 65535 - ll.GetUsedMemory())', 'true'],
      // In-world: 0, 1 and -1 -> 0, limit unchanged; 1e9 -> 0; 70000.9 -> 1, 70000; "70001" -> 1, 70001;
      // 2^32 + 70002 -> 1, 70002; true -> 0. (A limit at or below what the script uses is refused in-world: with
      // 9644 bytes in use, 10668 -> 1 and 9645, 9644, 8620 and 4000 -> 0. rezless does not compare with the VM's
      // count yet; the README lists that.)
      [lim('0')[0], '0/65535'],
      [lim('-1')[0], '0/65535'],
      [lim('1e9')[0], '0/65535'],
      [lim('70000.9')[0], '1/70000'],
      [lim('"70001"')[0], '1/70001'],
      [lim('2 ^ 32 + 70002')[0], '1/70002'],
      [lim('true')[0], '0/70002'],
    ]
    await expectResults(cases)
  })

  it('keeps the 64 KiB ceiling for an LSL script', async () => {
    // In-world (LSL, Mono): llSetMemoryLimit(65536) -> 1; llSetMemoryLimit(60000) -> 1; llSetMemoryLimit(70000) -> 0
    const s = await loadScript({
      source: 'default { state_entry() { llSay(7777, llList2CSV([llSetMemoryLimit(65536), llSetMemoryLimit(60000), llSetMemoryLimit(70000), llGetMemoryLimit()])); } }',
    })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['1, 1, 0, 60000'])
  })

  it('finds nothing with ll.ListFindStrided when the start or the end is before the list', async () => {
    await expectResults([
      // In-world: ll.ListFindStrided({1, 2, 3, 4}, {3}, start, -1, 1) for start = -1 -> nil; -2 and -4 -> 3;
      // -5, -100, -2^31 and 1e20 -> nil; 10 -> nil
      ['show({ll.ListFindStrided(l, {3}, -1, -1, 1) or "nil", ll.ListFindStrided(l, {3}, -2, -1, 1), ll.ListFindStrided(l, {3}, -4, -1, 1)})', '{string:nil | number:3 | number:3}'],
      [
        'show({ll.ListFindStrided(l, {3}, -5, -1, 1) or "nil", ll.ListFindStrided(l, {3}, -100, -1, 1) or "nil", ll.ListFindStrided(l, {3}, -2 ^ 31, -1, 1) or "nil", ll.ListFindStrided(l, {3}, 1e20, -1, 1) or "nil", ll.ListFindStrided(l, {3}, 10, -1, 1) or "nil"})',
        '{string:nil | string:nil | string:nil | string:nil | string:nil}',
      ],
      // In-world: (l, {3}, 1, end, 1) for end = -5 and -100 -> nil; 10 -> 3
      ['show({ll.ListFindStrided(l, {3}, 1, -5, 1) or "nil", ll.ListFindStrided(l, {3}, 1, -100, 1) or "nil", ll.ListFindStrided(l, {3}, 1, 10, 1)})', '{string:nil | string:nil | number:3}'],
      // In-world: through llcompat with the same starts -1, -2, -4, -5, -100, -2^31 -> -1, 2, 2, -1, -1, -1; ends
      // -5, -100 from start 0 -> -1; start 10 -> -1; end 10 -> 2
      [
        'll.List2CSV({llcompat.ListFindStrided(l, {3}, -1, -1, 1), llcompat.ListFindStrided(l, {3}, -2, -1, 1), llcompat.ListFindStrided(l, {3}, -4, -1, 1), llcompat.ListFindStrided(l, {3}, -5, -1, 1), llcompat.ListFindStrided(l, {3}, -100, -1, 1), llcompat.ListFindStrided(l, {3}, -2 ^ 31, -1, 1), llcompat.ListFindStrided(l, {3}, 0, -5, 1), llcompat.ListFindStrided(l, {3}, 0, -100, 1), llcompat.ListFindStrided(l, {3}, 10, -1, 1), llcompat.ListFindStrided(l, {3}, 0, 10, 1)})',
        '-1, 2, 2, -1, -1, -1, -1, -1, -1, 2',
      ],
      // In-world: ll.List2ListStrided still takes the whole list from a start before it: ({1, 2, 3, 4}, -100, -1, 1),
      // (-5, -1, 1) and (1, -100, 1) -> 1, 2, 3, 4
      ['ll.List2CSV(ll.List2ListStrided(l, -100, -1, 1)) .. " / " .. ll.List2CSV(ll.List2ListStrided(l, -5, -1, 1)) .. " / " .. ll.List2CSV(ll.List2ListStrided(l, 1, -100, 1))', '1, 2, 3, 4 / 1, 2, 3, 4 / 1, 2, 3, 4'],
    ], 'local l = {1, 2, 3, 4}')
    // In-world (LSL): llListFindStrided([1, 2, 3, 4], [3], start, -1, 1) for -1, -2, -4, -5, -100, 0x80000000 ->
    // -1, 2, 2, -1, -1, -1; (…, 0, -5, 1), (…, 0, -100, 1), (…, 10, -1, 1), (…, 0, 10, 1) -> -1, -1, -1, 2
    const s = await loadScript({
      source: `default { state_entry() { list l = [1, 2, 3, 4];
        llSay(7777, llList2CSV([llListFindStrided(l, [3], -1, -1, 1), llListFindStrided(l, [3], -2, -1, 1), llListFindStrided(l, [3], -4, -1, 1),
          llListFindStrided(l, [3], -5, -1, 1), llListFindStrided(l, [3], -100, -1, 1), llListFindStrided(l, [3], (integer)0x80000000, -1, 1),
          llListFindStrided(l, [3], 0, -5, 1), llListFindStrided(l, [3], 0, -100, 1), llListFindStrided(l, [3], 10, -1, 1), llListFindStrided(l, [3], 0, 10, 1)])); } }`,
    })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['-1, 2, 2, -1, -1, -1, -1, -1, -1, 2'])
  })

  it('reads and resets the script clock', async () => {
    // In-world: after 1.5 s, llcompat.GetAndResetTime() -> a number above 1, and ll.GetTime() and os.clock() are
    // below 1 afterwards; after another 1.5 s llcompat.ResetTime() returns nothing and both are below 1 again
    expect(
      await run(
        `LLTimers:once(1.5, function()
          local r = llcompat.GetAndResetTime()
          ll.Say(7777, typeof(r) .. " " .. tostring(r > 1) .. " " .. tostring(ll.GetTime() < 1) .. " " .. tostring(os.clock() < 1))
          LLTimers:once(1.5, function()
            ll.Say(7777, select("#", llcompat.ResetTime()) .. " " .. tostring(ll.GetTime() < 1) .. " " .. tostring(os.clock() < 1))
          end)
        end)`,
        4000,
      ),
    ).toEqual(['number true true true', '0 true true'])
  })

  /** Run `arm` with a `timer` handler and an LLTimers callback `cb` logging when they ran; return both logs after `ms`. */
  const timeline = async (arm: string, ms: number, extra: (s: Script) => object = () => ({})) => {
    const s = await loadScript({
      source: `ticks, lt = {}, {}
        local function stamp() return math.floor(ll.GetTime() * 100 + 0.5) / 100 end
        local function cb() lt[#lt + 1] = stamp() end
        LLEvents:on("timer", function(...) ticks[#ticks + 1] = stamp(); args = select("#", ...) end)
        ${arm}`,
      language: 'slua',
    })
    s.start()
    s.advanceTime(ms)
    // The timer can wake a moment before a callback is due and be set again, in-world and here: count a time once.
    return { ticks: [...new Set(s.global('ticks') as number[])], lt: s.global('lt'), args: s.global('args'), ...extra(s) }
  }

  it('fires the timer handlers from llcompat.SetTimerEvent, with no arguments', async () => {
    // In-world: llcompat.SetTimerEvent(0.5) alone -> the handler ran at 0.49, 1.00, 1.49, 2.00, 2.49, 3.00, 3.49
    // and 4.00 s, with no arguments
    expect(await timeline('llcompat.SetTimerEvent(0.5)', 4100)).toEqual({ ticks: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], lt: [], args: 0 })
  })

  it('shares one timer with LLTimers, which sets it to its own next callback', async () => {
    // In-world: llcompat.SetTimerEvent(0.5), then LLTimers:every(0.4, cb) -> cb ran at 0.40, 0.80, 1.22, 1.60, 2.02,
    // 2.42, 2.82, 3.22, 3.62, 4.02 s, and the timer handler ran then and at no multiple of 0.5 s of its own.
    // (In-world the handler also ran about 0.02 s before some callbacks, at 1.20, 2.00, 2.80 and 3.60 s: the
    // timer woke early and LLTimers set it again. LLTimers:every(0.4, cb) alone did the same.)
    const every04 = [0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4]
    expect(await timeline('llcompat.SetTimerEvent(0.5); LLTimers:every(0.4, cb)', 4100)).toEqual({ ticks: every04, lt: every04, args: 0 })
    // In-world: LLTimers:every(0.4, cb), then llcompat.SetTimerEvent(1.0) -> the handler ran at 1.00 s, and from
    // then with cb at 1.42, 1.82, 2.22, 2.62, 3.02, 3.42, 3.82 s (cb's first run was at 1.00 s, not 0.40 s)
    expect(await timeline('LLTimers:every(0.4, cb); llcompat.SetTimerEvent(1.0)', 3900)).toEqual({
      ticks: [1, 1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8],
      lt: [1, 1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8],
      args: 0,
    })
    // In-world: LLTimers:every(5, cb), then llcompat.SetTimerEvent(1.0) -> the handler ran at 1.02 s, then only
    // with cb at 5.02 and 10.02 s: a 1 s timer does not stay one
    expect(await timeline('LLTimers:every(5, cb); llcompat.SetTimerEvent(1.0)', 11000)).toEqual({ ticks: [1, 5, 10], lt: [5, 10], args: 0 })
    // In-world: llcompat.SetTimerEvent(1.0), then LLTimers:every(5, cb) -> the handler ran only with cb, at 5.02 and 10.02 s
    expect(await timeline('llcompat.SetTimerEvent(1.0); LLTimers:every(5, cb)', 11000)).toEqual({ ticks: [5, 10], lt: [5, 10], args: 0 })
  })

  it('stops LLTimers with llcompat.SetTimerEvent(0), and the timer with the last LLTimers:off', async () => {
    // In-world, counted over 3 s each: llcompat.SetTimerEvent(0.5) and LLTimers:every(0.4, cb) running, then
    // llcompat.SetTimerEvent(0) -> no handler call and no cb. llcompat.SetTimerEvent(1.0) after that -> both run
    // again. LLTimers:off on the callback -> no handler call: the SetTimerEvent timer stopped with it.
    expect(
      await timeline(
        `local every = LLTimers:every(0.4, cb)
        llcompat.SetTimerEvent(0.5)
        local step = 0
        LLEvents:on("no_sensor", function()
          step += 1
          if step == 1 then llcompat.SetTimerEvent(0); ticks, lt = {}, {}
          elseif step == 3 then stopped = #ticks + #lt; llcompat.SetTimerEvent(1.0)
          elseif step == 5 then again = #ticks > 0 and #lt > 0; LLTimers:off(every); ticks, lt = {}, {}
          end
        end)
        ll.SensorRepeat("nothing", NULL_KEY, AGENT, 0.1, 0.1, 1.03)`,
        9000,
        (s) => ({ stopped: s.global('stopped'), again: s.global('again') }),
      ),
    ).toEqual({ ticks: [], lt: [], args: 0, stopped: 0, again: 1 })
    const s = await loadScript({
      source: `local n = 0
        local every = LLTimers:every(0.4, function() n += 1 end)
        llcompat.SetTimerEvent(0)
        LLEvents:on("no_sensor", function() ll.Say(7777, tostring(n)); ll.SensorRemove() end)
        ll.SensorRepeat("nothing", NULL_KEY, AGENT, 0.1, 0.1, 3.03)`,
      language: 'slua',
    })
    s.start()
    s.advanceTime(4000)
    expect(s.chat.map((c) => c.text)).toEqual(['0'])
  })

  it('keeps the timer across llcompat.ResetTime, and puts off an LLTimers callback the timer was stopped under', async () => {
    // In-world: llcompat.SetTimerEvent(0.5), then llcompat.ResetTime() -> the handler ran 6 times in the next 3 s
    expect((await timeline('llcompat.SetTimerEvent(0.5); llcompat.ResetTime()', 3100)).ticks).toEqual([0.5, 1, 1.5, 2, 2.5, 3])
    // In-world: llcompat.SetTimerEvent(0), LLTimers:once(0.5, cb), llcompat.ResetTime() -> one handler call and no
    // cb in 2 s. Then LLTimers:once(0.5, cb), llcompat.SetTimerEvent(0) -> neither in 2 s. Then
    // LLTimers:every(0.5, …), llcompat.SetTimerEvent(2.0) -> the timer runs again and both put-off callbacks run.
    const s = await loadScript({
      source: `local ticks, once, step = 0, 0, 0
        LLEvents:on("timer", function() ticks += 1 end)
        local function counts() local r = ticks .. " " .. once; ticks, once = 0, 0; return r end
        LLEvents:on("no_sensor", function()
          step += 1
          if step == 1 then ll.Sleep(1.5); llcompat.SetTimerEvent(0); LLTimers:once(0.5, function() once += 1 end); llcompat.ResetTime()
          elseif step == 3 then ll.Say(7777, counts()); LLTimers:once(0.5, function() once += 1 end); llcompat.SetTimerEvent(0)
          elseif step == 5 then ll.Say(7777, counts()); LLTimers:every(0.5, function() end); llcompat.SetTimerEvent(2.0)
          elseif step == 9 then ll.Say(7777, tostring(once)); llcompat.SetTimerEvent(0); ll.SensorRemove()
          end
        end)
        ll.SensorRepeat("nothing", NULL_KEY, AGENT, 0.1, 0.1, 1.03)`,
      language: 'slua',
    })
    s.start()
    s.advanceTime(14000)
    expect(s.chat.map((c) => c.text)).toEqual(['1 0', '0 0', '2'])
  })
})
