import { expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'

// https://wiki.secondlife.com/wiki/LlGetTime
// https://wiki.secondlife.com/wiki/LlSetTimerEvent
// https://wiki.secondlife.com/wiki/On_rez
// In-world: a five-second timer, script-initiated detach, 30 seconds in inventory,
// then wear, twice -> script time pauses; on_rez precedes attach; a pending timer
// follows attach once, otherwise the remaining timer interval resumes. Detach
// times 14.156 / 26.534 became rez times 16.156 / 28.535 (the simulator's save
// delay); wall-clock gaps were 36 / 42 seconds. Timer cadence stayed at script
// times 20.179, 25.179, 30.179, 35.179. Aditi, SLua Tideland, 2026-11-01,
// Firestorm 7.3.0.83011. Fixtures save immediately, without simulator save delay.
async function fixture(onDetach = '') {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const loaded = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'probe', source: { source: `
      list events; float elapsed; float previous; integer unix;
      default {
        state_entry(){llSetTimerEvent(5);llRequestPermissions(llGetOwner(),32);}
        on_rez(integer p){events += ["rez"];}
        attach(key id){
          if(id){events += ["attach"];elapsed=llGetTime();unix=llGetUnixTime();}
          else {events += ["detach"];${onDetach}}
        }
        touch_start(integer n){llDetachFromAvatar();}
        timer(){events += ["timer"];elapsed=llGetTime();}
      }` } }] }] })
  const script = loaded.scripts.probe!
  script.start()
  script.grantPermissions()
  loaded.linkset.attachToAvatar(OWNER, 6)
  loaded.linkset.advanceTime(0)
  return { ...loaded, script, world }
}

it('pauses script time and the remaining timer interval over repeated inventory stays', async () => {
  const { script, linkset } = await fixture()
  for (let round = 0; round < 2; round++) {
    linkset.advanceTime(2000)
    linkset.touch(0)
    expect(linkset.attachment).toBeNull()
    const before = (script.global('events') as string[]).length
    linkset.advanceTime(30000)
    expect((script.global('events') as string[]).length).toBe(before)
    linkset.attachToAvatar(OWNER, 6)
    linkset.advanceTime(0)
    expect((script.global('events') as string[]).slice(before)).toEqual(['rez', 'attach'])
    expect(script.global('elapsed')).toBe(2 + round * 5)
    expect(script.global('unix')).toBe(32 + round * 35)
    linkset.advanceTime(2999)
    expect((script.global('events') as string[]).slice(before)).toEqual(['rez', 'attach'])
    linkset.advanceTime(1)
    expect((script.global('events') as string[]).slice(before)).toEqual(['rez', 'attach', 'timer'])
    expect(script.global('elapsed')).toBe(5 + round * 5)
  }
})

it('delivers one already-due timer after rez and attach while retaining its cadence', async () => {
  const { script, linkset } = await fixture()
  // Capture a saved object whose timer became due before suspension, as during
  // the simulator save delay; advance the clock without dispatching handlers.
  linkset.clock.advance(11000)
  linkset.detachFromAvatar()
  linkset.advanceTime(0)
  const before = (script.global('events') as string[]).length
  linkset.advanceTime(30000)
  linkset.attachToAvatar(OWNER, 6)
  linkset.advanceTime(0)
  expect((script.global('events') as string[]).slice(before)).toEqual(['rez', 'attach', 'timer'])
  expect(script.global('elapsed')).toBe(11)
  linkset.advanceTime(3999)
  expect((script.global('events') as string[]).slice(before)).toHaveLength(3)
  linkset.advanceTime(1)
  expect((script.global('events') as string[]).slice(before)).toEqual(['rez', 'attach', 'timer', 'timer'])
  expect(script.global('elapsed')).toBe(15)
})

it('keeps a timer cancelled by the detach handler cancelled on rewear', async () => {
  const { script, linkset } = await fixture('llSetTimerEvent(0);')
  linkset.advanceTime(2000)
  linkset.touch(0)
  linkset.advanceTime(30000)
  const before = (script.global('events') as string[]).length
  linkset.attachToAvatar(OWNER, 6)
  linkset.advanceTime(10000)
  expect((script.global('events') as string[]).slice(before)).toEqual(['rez', 'attach'])
  expect(script.global('elapsed')).toBe(2)
})

it.each(['llResetTime();', 'previous=llGetAndResetTime();'])(
  'preserves a detach-handler time reset across inventory: %s', async reset => {
    const { script, linkset } = await fixture(reset)
    linkset.advanceTime(2000)
    linkset.touch(0)
    expect(script.global('previous')).toBe(reset.startsWith('previous') ? 2 : 0)
    linkset.advanceTime(30000)
    linkset.attachToAvatar(OWNER, 6)
    linkset.advanceTime(0)
    expect(script.global('elapsed')).toBe(0)
    linkset.advanceTime(3000)
    expect(script.global('elapsed')).toBe(3)
  },
)

it('leaves another object on the shared clock running while the attachment is in inventory', async () => {
  const { script, linkset, world } = await fixture()
  const other = await loadLinkset({ world, region: 'home', prims: [{ scripts: [
    { name: 'other', source: { source: `integer ticks;float elapsed;
      default{state_entry(){llSetTimerEvent(5);}timer(){++ticks;elapsed=llGetTime();}}` } },
  ] }] })
  other.scripts.other!.start()
  linkset.advanceTime(2000)
  linkset.touch(0)
  linkset.advanceTime(30000)
  expect(other.scripts.other!.global('ticks')).toBe(6)
  expect(other.scripts.other!.global('elapsed')).toBe(30)
  linkset.attachToAvatar(OWNER, 6)
  linkset.advanceTime(0)
  expect(script.global('elapsed')).toBe(2)
})

it('does not generate a saved timer event for a stopped script', async () => {
  const { script, linkset } = await fixture()
  linkset.clock.advance(11000)
  script.running = false
  linkset.detachFromAvatar()
  linkset.advanceTime(30000)
  linkset.attachToAvatar(OWNER, 6)
  linkset.advanceTime(0)
  expect(script.parkedEvents.filter(event => event.event === 'timer')).toEqual([])
  expect((script.global('events') as string[]).filter(event => event === 'timer')).toEqual([])
})
