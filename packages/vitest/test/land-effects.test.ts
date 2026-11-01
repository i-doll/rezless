import { describe, it, expect } from 'vitest'
import { World, loadLinkset, NULL_KEY } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const TARGET = '33333333-3333-3333-3333-333333333333'
function fixture() {
  const world = new World()
  world.addRegion('Sandbox', { x: 0, y: 0 })
  const parcel = world.addParcel({ region: 'Sandbox', owner: OWNER, musicURL: 'old' })
  return { world, parcel }
}
async function run(world: World, body: string, owner = OWNER, extra = '') {
  const loaded = await loadLinkset({ world, region: 'Sandbox', owner,
    prims: [{ scripts: [{ name: 'probe', stubs: 'throw', source: { source: `list out; key tx; default { state_entry() { ${body} } ${extra} }` } }] }],
  })
  const s = loaded.scripts.probe!
  s.start()
  return { ...loaded, s }
}
// Docs for each case: https://wiki.secondlife.com/wiki/<function, capital Ll>.
// In-world: /tmp/issue-159-effects.lsl, Aditi, SLua Tideland, 2026-11-01.
// Foreign-land calls silently refuse music, lists, eject and media. Music/media
// sleep 2s; six list functions sleep 0.1s. Return IDs -> -4, null owner -> -3,
// sale -> 2, estate -> 0, absent transfer target -> -2. No debug errors there.
// Successful land/estate mutations, returns, ejections and ownership offers
// cannot be measured: no land/estate rights, and the session forbids effects.
// Success fixtures below follow the individual function's wiki contract.
describe('parcel effect requests', () => {
  it('records music changes on the shared parcel and exposes them to later reads', async () => {
    const { world, parcel } = fixture()
    const { s, linkset } = await run(world, 'llSetParcelMusicURL("new"); out=[llGetParcelMusicURL()];')
    expect(s.global('out')).toEqual(['new'])
    expect(linkset.clock.now).toBe(2000)
    expect(parcel.effects).toMatchObject([{ function: 'llSetParcelMusicURL', args: ['new'], accepted: true, owner: OWNER }])
    const next = await run(world, 'out=[llGetParcelMusicURL()];')
    expect(next.s.global('out')).toEqual(['new'])
  })

  it.each([
    ['llSetParcelMusicURL("new");', 2000],
    ['llAddToLandBanList(NULL_KEY,0.0);', 100],
    ['llAddToLandPassList(NULL_KEY,0.0);', 100],
    ['llRemoveFromLandBanList(NULL_KEY);', 100],
    ['llRemoveFromLandPassList(NULL_KEY);', 100],
    ['llResetLandBanList();', 100], ['llResetLandPassList();', 100],
    ['llEjectFromLand(NULL_KEY);', 0],
    ['llParcelMediaCommandList([]);', 2000],
  ])('records a refused request and preserves parcel state for %s', async (body, delay) => {
    const { world, parcel } = fixture()
    const { s, linkset } = await run(world, body, OTHER)
    expect(parcel.effects).toHaveLength(1)
    expect(parcel.effects[0]).toMatchObject({ accepted: false, owner: OTHER })
    expect(parcel.musicURL).toBe('old')
    expect(linkset.clock.now).toBe(delay)
    expect(s.chat).toEqual([])
  })

  it('records list additions, removals and resets without affecting another parcel', async () => {
    const { world, parcel } = fixture()
    const other = world.addParcel({ region: 'Sandbox', owner: OWNER,
      bounds: { min: { x: 128, y: 0 }, max: { x: 256, y: 256 } } })
    await run(world, `llAddToLandBanList("${TARGET}",1.5); llAddToLandPassList("${TARGET}",2.0);
      llRemoveFromLandBanList("${TARGET}");llRemoveFromLandPassList("${TARGET}");
      llResetLandBanList();llResetLandPassList();`)
    expect(parcel.effects.map(e => e.function)).toEqual(['llAddToLandBanList','llAddToLandPassList',
      'llRemoveFromLandBanList','llRemoveFromLandPassList','llResetLandBanList','llResetLandPassList'])
    expect(parcel.effects.every(e => e.accepted)).toBe(true)
    expect(other.effects).toEqual([])
  })

  it('matches return, sale, estate and ownership refusal codes and records arguments', async () => {
    const { world, parcel } = fixture()
    const { s } = await run(world, `out=[llReturnObjectsByID([]),llReturnObjectsByID([NULL_KEY]),
      llReturnObjectsByOwner(NULL_KEY,0),llReturnObjectsByOwner(NULL_KEY,999),
      llSetParcelForSale(FALSE,[]),llSetParcelForSale(TRUE,[1,-1]),
      llManageEstateAccess(4,NULL_KEY),llManageEstateAccess(999,"bad"),
      llTransferOwnership(NULL_KEY,0,[]),llTransferOwnership(NULL_KEY,999,[1])];`, OTHER)
    expect(s.global('out')).toEqual([-4,-4,-3,-3,2,2,0,0,-2,-2])
    expect(parcel.effects).toHaveLength(10)
    expect(parcel.effects.every(e => !e.accepted)).toBe(true)
    expect(parcel.effects.find(e => e.function === 'llReturnObjectsByID')?.args).toEqual([[]])
    expect(s.chat).toEqual([])
  })

  it('refuses media queries on foreign land after two seconds', async () => {
    const { world, parcel } = fixture()
    const { s, linkset } = await run(world, 'out=llParcelMediaQuery([5,6,7,10,11,12]);', OTHER)
    expect(s.global('out')).toEqual([])
    expect(linkset.clock.now).toBe(2000)
    expect(parcel.effects).toMatchObject([{ function: 'llParcelMediaQuery', accepted: false }])
  })

  it('lets the land owner query persisted media with LSL result types', async () => {
    const { world, parcel } = fixture()
    const { s } = await run(world, `llParcelMediaCommandList([5,"https://example.com",4,"${TARGET}",10,"text/html",11,800,600,12,"screen",13,2.5]);
      list q=llParcelMediaQuery([5,4,10,11,12,13]); out=q+[llGetListEntryType(q,1),llGetListEntryType(q,-1)];`)
    expect(s.global('out')).toEqual(['https://example.com',TARGET,'text/html',800,600,'screen',2.5,4,2])
    expect(parcel.effects).toHaveLength(2)
  })

  // Docs: https://wiki.secondlife.com/wiki/LlGiveMoney and /LlTransferLindenDollars.
  // In-world: amounts 1,0,-1 without debit: give -> 0 plus exact debug error;
  // transfer -> unique key and transaction_result(key,0,"MISSING_PERMISSION_DEBIT").
  // No forced delay or transfer debug error. Paid success is forbidden here.
  it.each([1,0,-1])('checks debit before amount/target validation for amount %i', async amount => {
    const { world, parcel } = fixture()
    const { s } = await run(world, `out=[llGiveMoney(NULL_KEY,${amount})]; tx=llTransferLindenDollars(NULL_KEY,${amount});`, OWNER,
      'transaction_result(key id,integer success,string data){out += [id==tx,success,data];}')
    s.advanceTime(0)
    expect(s.global('out')).toEqual([0,1,0,'MISSING_PERMISSION_DEBIT'])
    expect(s.global('tx')).not.toBe(NULL_KEY)
    expect(s.chat).toEqual([{ channel: 2147483647, type: 'say', text: 'Script trying to debit L$ from owner but PERMISSION_DEBIT permission not set!' }])
    expect(parcel.effects).toHaveLength(2)
    expect(parcel.effects.every(e => !e.accepted)).toBe(true)
  })

  it('records authorized payments without claiming they have completed', async () => {
    const { world, parcel } = fixture()
    const { s } = await run(world, 'llRequestPermissions(llGetOwner(),PERMISSION_DEBIT);', OWNER,
      `run_time_permissions(integer p){out=[llGiveMoney("${TARGET}",7)];tx=llTransferLindenDollars("${TARGET}",9);}`)
    s.grantPermissions()
    expect(s.global('out')).toEqual([0])
    expect(parcel.effects).toMatchObject([
      { function: 'llGiveMoney', args: [TARGET,7], accepted: true },
      { function: 'llTransferLindenDollars', args: [TARGET,9], accepted: true },
    ])
    expect(s.chat).toEqual([])
  })
  it('requires the owner to grant debit and keeps transaction IDs distinct', async () => {
    const { world, parcel } = fixture()
    const { s } = await run(world, `llRequestPermissions("${OTHER}",PERMISSION_DEBIT);`, OWNER,
      `run_time_permissions(integer p){key a=llTransferLindenDollars("${TARGET}",1);key b=llTransferLindenDollars("${TARGET}",1);out=[a!=b,llGiveMoney("${TARGET}",1)];}`)
    s.grantPermissions()
    expect(s.global('out')).toEqual([1,0])
    expect(parcel.effects.every(e => !e.accepted)).toBe(true)
  })

  it('records accepted returns and ejects without removing the target fixture', async () => {
    const { world, parcel } = fixture()
    const target = world.addObject({ region: 'Sandbox', key: TARGET, owner: OTHER })
    const { s } = await run(world, 'llRequestPermissions(llGetOwner(),PERMISSION_RETURN_OBJECTS);', OWNER,
      `run_time_permissions(integer p){out=[llReturnObjectsByID(["${TARGET}"]),llReturnObjectsByOwner("${OTHER}",OBJECT_RETURN_PARCEL)];llEjectFromLand("${OTHER}");}`)
    s.grantPermissions()
    expect(s.global('out')).toEqual([0,0])
    expect(parcel.effects).toMatchObject([{ accepted: true },{ accepted: true },{ accepted: true }])
    expect(world.objects).toContain(target)
  })

  it('refuses returns when runtime permission does not confer land rights', async () => {
    const { world, parcel } = fixture()
    const { s } = await run(world, 'llRequestPermissions(llGetOwner(),PERMISSION_RETURN_OBJECTS);', OTHER,
      `run_time_permissions(integer p){out=[llReturnObjectsByID([]),llReturnObjectsByOwner("${TARGET}",1),llReturnObjectsByOwner("${TARGET}",4)];}`)
    s.grantPermissions()
    expect(s.global('out')).toEqual([-2,-2,-2])
    expect(parcel.effects.every(e => !e.accepted)).toBe(true)
  })

  it('records estate requests only for a configured manager with a valid action and key', async () => {
    const { world, parcel } = fixture()
    world.addRegion('Sandbox', { x: 0, y: 0 }, { estateManagers: [OWNER.toUpperCase()] })
    const { s } = await run(world, `out=[llManageEstateAccess(4,"${TARGET}"),llManageEstateAccess(999,"${TARGET}"),llManageEstateAccess(4,NULL_KEY)];`)
    expect(s.global('out')).toEqual([1,0,0])
    expect(parcel.effects.map(e => e.accepted)).toEqual([true,false,false])
  })

  it('records an ownership offer without changing the object owner', async () => {
    const { world, parcel } = fixture()
    world.addAvatar({ region: 'Sandbox', key: TARGET, username: 'recipient.test' })
    const { s, linkset } = await run(world, `out=[llTransferOwnership("${TARGET}",0,[]),llTransferOwnership("${TARGET}",0,[1])];`)
    expect(s.global('out')).toEqual([0,-1])
    expect(linkset.owner).toBe(OWNER)
    expect(parcel.effects.map(e => e.accepted)).toEqual([true,false])
  })

  it.each([
    ['TRUE, [1,100,2,"'+TARGET+'",3,TRUE]',0],
    ['TRUE, [1,-1]',4], ['TRUE, [1,0]',4], ['TRUE, [99,1]',5],
    ['TRUE, [1]',5], ['TRUE, [2,"bad"]',5], ['TRUE, [3,"bad"]',5],
    ['FALSE, [99]',0],
  ])('validates parcel sale options after the owner grants privileged land access: %s', async (args, result) => {
    const { world, parcel } = fixture()
    const { s } = await run(world, 'llRequestPermissions(llGetOwner(),PERMISSION_PRIVILEGED_LAND_ACCESS);', OWNER,
      `run_time_permissions(integer p){out=[llSetParcelForSale(${args})];}`)
    s.grantPermissions()
    expect(s.global('out')).toEqual([result])
    expect(parcel.effects[0]?.accepted).toBe(result === 0)
    if (args.startsWith('TRUE') && result === 0) expect(parcel.sale).toEqual({ price: 100, agent: TARGET, objects: true })
    else expect(parcel.sale).toBeUndefined()
  })

  it('refuses to sell a parcel held in escrow', async () => {
    const { world } = fixture()
    const parcel = world.addParcel({ region: 'Sandbox', owner: OWNER, inEscrow: true })
    const { s } = await run(world, 'llRequestPermissions(llGetOwner(),PERMISSION_PRIVILEGED_LAND_ACCESS);', OWNER,
      'run_time_permissions(integer p){out=[llSetParcelForSale(TRUE,[1,100])];}')
    s.grantPermissions()
    expect(s.global('out')).toEqual([3])
    expect(parcel.sale).toBeUndefined()
  })

  it('returns no-parcel errors and does not share effects through the empty parcel', async () => {
    const world = new World(); world.addRegion('Sandbox', { x: 0, y: 0 })
    const { s } = await run(world, 'llSetParcelMusicURL("new");out=[llSetParcelForSale(FALSE,[])];')
    expect(s.global('out')).toEqual([1])
    const next = await run(world,'out=[llGetParcelMusicURL()];')
    expect(next.s.global('out')).toEqual([''])
  })

  it('keeps agent-targeted media commands out of shared parcel settings', async () => {
    const { world } = fixture()
    const { s } = await run(world, `llParcelMediaCommandList([5,"private",7,"${TARGET}"]);out=llParcelMediaQuery([5]);`)
    expect(s.global('out')).toEqual([''])
  })

  it('ignores overlong media URLs and records playback controls without a renderer', async () => {
    const { world, parcel } = fixture()
    const { s } = await run(world, `llParcelMediaCommandList([0,1,2,3,8,6,1.5,9,TRUE,5,"${'x'.repeat(255)}"]);out=llParcelMediaQuery([999,5]);`)
    expect(s.global('out')).toEqual([''])
    expect(parcel.effects[0]?.args).toHaveLength(1)
  })

  // Docs: https://wiki.secondlife.com/wiki/Transaction_result. Debit-granted
  // failures cannot be probed here because granting debit is prohibited.
  it.each([
    ['"bad",1','INVALID_DESTINATION'],
    ['"'+TARGET+'",0','INVALID_AMOUNT'],
    ['"'+TARGET+'",-1','INVALID_AMOUNT'],
  ])('reports a locally invalid authorized payment: %s', async (args, error) => {
    const { world, parcel } = fixture()
    const { s } = await run(world, 'llRequestPermissions(llGetOwner(),PERMISSION_DEBIT);', OWNER,
      `run_time_permissions(integer p){tx=llTransferLindenDollars(${args});}
       transaction_result(key id,integer success,string data){out=[id==tx,success,data];}`)
    s.grantPermissions(); s.advanceTime(0)
    expect(s.global('out')).toEqual([1,0,error])
    expect(parcel.effects[0]?.accepted).toBe(false)
  })

})
