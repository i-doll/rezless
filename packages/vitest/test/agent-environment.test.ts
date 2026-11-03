import { expect, it } from 'vitest'
import { Experience, InventoryType, makeInventoryItem } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LlSetAgentEnvironment and
// https://wiki.secondlife.com/wiki/LlReplaceAgentEnvironment.
// The -4 and -1 refusals were measured on Aditi in SLua Tideland. Everything
// past the experience check follows the wiki and is unmeasured: it needs an
// experience enabled on the land and an agent who accepted it, which the
// test account doesn't have.

const OWNER = '11111111-2222-3333-4444-555555555555'
const OTHER = '66666666-7777-8888-9999-000000000000'
const ABSENT = '99999999-9999-9999-9999-999999999999'
const TEXTURE = 'aaaaaaaa-0000-0000-0000-000000000001'
const SETTING = 'aaaaaaaa-0000-0000-0000-000000000002'

async function run(body: string, experience?: Experience) {
  const world = new World()
  world.addRegion('Sandbox', { x: 0, y: 0 })
  world.addAvatar({ region: 'Sandbox', key: OWNER, username: 'owner' })
  world.addAvatar({ region: 'Sandbox', key: OTHER, username: 'other' })
  const { scripts } = await loadLinkset({ world, region: 'Sandbox', owner: OWNER, prims: [{
    inventory: [
      makeInventoryItem({ name: 'stars', type: InventoryType.TEXTURE, key: TEXTURE }),
      makeInventoryItem({ name: 'dusk', type: InventoryType.SETTING, key: SETTING, environment: { environment: { 5: [9] } } }),
    ],
    scripts: [{ name: 'p', ...(experience ? { experience } : {}), source: { source: `list result; default { state_entry() { ${body} } }` } }],
  }] })
  scripts.p!.start()
  return scripts.p!
}

const xp = (options: { allowedHere?: boolean; agents?: string[] } = {}) => new Experience({ agents: [OWNER], ...options })

// In-world (Aditi, SLua Tideland, 2026-10-31 and 2026-11-04): NULL_KEY, a missing
// avatar or the prim's own key -> -4, even with a bad rule; the present owner
// without an experience -> -1, also before a bad rule or out-of-range value.
it.each([
  ['llSetAgentEnvironment(NULL_KEY, -1, [999])', -4],
  ['llSetAgentEnvironment(llGetKey(), 0, [])', -4],
  [`llSetAgentEnvironment("${ABSENT}", 0, [])`, -4],
  ['llSetAgentEnvironment(llGetOwner(), 0, [])', -1],
  ['llSetAgentEnvironment(llGetOwner(), 0, [999])', -1],
  ['llSetAgentEnvironment(llGetOwner(), 0, [SKY_GAMMA, 99.0])', -1],
  ['llReplaceAgentEnvironment(NULL_KEY, -1, "")', -4],
  ['llReplaceAgentEnvironment(llGetKey(), 0, "")', -4],
  ['llReplaceAgentEnvironment(NULL_KEY, 0, "issue157-missing")', -4],
  ['llReplaceAgentEnvironment(llGetOwner(), 0, "issue157-missing")', -1],
  ['llReplaceAgentEnvironment(llGetOwner(), 0, "")', -1],
])('%s without an experience -> %i', async (call, code) => {
  const script = await run(`result += ${call};`)
  expect(script.global('result')).toEqual([code])
  expect(script.viewerRequests).toEqual([])
})

it.each([
  ['an absent agent', ABSENT, xp(), -4],
  ['land that does not allow the experience', OWNER, xp({ allowedHere: false }), -7],
  ['an agent who has not accepted it', OTHER, xp(), -2],
])('refuses %s', async (_, agent, experience, code) => {
  const script = await run(`result += [llSetAgentEnvironment("${agent}", 1, [SKY_GAMMA, 2.0]),
    llReplaceAgentEnvironment("${agent}", 1, "dusk")];`, experience)
  expect(script.global('result')).toEqual([code, code])
  expect(script.viewerRequests).toEqual([])
})

it('tells the viewer to apply the rules, with texture names as keys', async () => {
  const script = await run(`result += llSetAgentEnvironment(llGetOwner(), 3.0,
    [SKY_GAMMA, 10, SKY_CLOUD_TEXTURE, "stars", WATER_NORMAL_SCALE, <5,5,5>]);`, xp())
  expect(script.global('result')).toEqual([1])
  expect(script.viewerRequests).toEqual([{ kind: 'agentEnvironment', agent: OWNER, transition: 3,
    params: [5, 10, 19, TEXTURE, 104, { x: 5, y: 5, z: 5 }] }])
})

// Wiki: an empty list removes what the experience applied.
it('sends an empty rule list to clear the agent environment', async () => {
  const script = await run('result += llSetAgentEnvironment(llGetOwner(), 0, []);', xp())
  expect(script.global('result')).toEqual([1])
  expect(script.viewerRequests).toEqual([{ kind: 'agentEnvironment', agent: OWNER, transition: 0, params: [] }])
})

it.each([
  ['[999]', -5], ['[SKY_GAMMA]', -5], ['[SKY_GAMMA, 21.0]', -6], ['[SKY_SUN_TEXTURE, "missing"]', -3],
])('rejects agent rules %s with %i', async (rules, code) => {
  const script = await run(`result += llSetAgentEnvironment(llGetOwner(), 0, ${rules});`, xp())
  expect(script.global('result')).toEqual([code])
  expect(script.viewerRequests).toEqual([])
})

it('tells the viewer to use a settings item by name or key, or to clear', async () => {
  const unknown = 'bbbbbbbb-0000-0000-0000-000000000003'
  const script = await run(`result += [llReplaceAgentEnvironment(llGetOwner(), 3.0, "dusk"),
    llReplaceAgentEnvironment(llGetOwner(), 0, "${unknown}"), llReplaceAgentEnvironment(llGetOwner(), 0, ""),
    llReplaceAgentEnvironment(llGetOwner(), 0, NULL_KEY), llReplaceAgentEnvironment(llGetOwner(), 0, "missing")];`, xp())
  expect(script.global('result')).toEqual([1, 1, 1, 1, -3])
  expect(script.viewerRequests).toEqual([
    { kind: 'replaceAgentEnvironment', agent: OWNER, transition: 3, environment: SETTING, asset: { environment: { 5: [9] } } },
    { kind: 'replaceAgentEnvironment', agent: OWNER, transition: 0, environment: unknown },
    { kind: 'replaceAgentEnvironment', agent: OWNER, transition: 0, environment: '00000000-0000-0000-0000-000000000000' },
    { kind: 'replaceAgentEnvironment', agent: OWNER, transition: 0, environment: '00000000-0000-0000-0000-000000000000' },
  ])
})
