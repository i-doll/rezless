import { expect, it } from 'vitest'
import { loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlOpenFloater
// Probe list: viewer.lsl measures experience/attachment errors, validation and delays.
it('rejects an unprivileged floater request', async () => {
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `integer result; default { state_entry() {
    result = llOpenFloater("guidebook", "https://example.com", []);
  } }` })
  s.start()
  s.advanceTime(200)
  expect(s.global('result')).toBe(-1)
})

// https://wiki.secondlife.com/wiki/LlLoadURL
it('records the URL prompt sent to the owner', async () => {
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() {
    llLoadURL(llGetOwner(), "Visit", "https://example.com");
  } }` })
  s.start()
  expect(s.viewerRequests).toEqual([{ kind: 'loadURL', agent: s.linkset.owner, message: 'Visit', url: 'https://example.com' }])
})

// https://wiki.secondlife.com/wiki/LlMapDestination
// https://wiki.secondlife.com/wiki/LlMapBeacon
it('records a map destination with its position and look direction', async () => {
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() {
    llMapDestination("SLua Tideland", <116,48,1999>, <1,2,3>);
  } }` })
  s.start()
  expect(s.viewerRequests).toEqual([{ kind: 'mapDestination', agent: s.linkset.owner,
    region: 'SLua Tideland', position: { x: 116, y: 48, z: 1999 }, lookAt: { x: 1, y: 2, z: 3 } }])
})

it('records beacon map options', async () => {
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() {
    llMapBeacon("SLua Tideland", <116,48,1999>, [BEACON_MAP, TRUE, FALSE]);
  } }` })
  s.start()
  expect(s.viewerRequests).toEqual([{ kind: 'mapBeacon', agent: s.linkset.owner,
    region: 'SLua Tideland', position: { x: 116, y: 48, z: 1999 }, options: [1, 1, 0] }])
})

it('preserves raw beacon options for request inspection', async () => {
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() {
    llMapBeacon("", <-1,999,9000>, [999]);
  } }` })
  s.start()
  expect(s.viewerRequests[0]).toMatchObject({ kind: 'mapBeacon', options: [999] })
})

// In-world: viewer.lsl / viewer2.lsl, Aditi, SLua Tideland, 2026-10-31.
// The fixture has no Linden-owned privileged experience. Floater success and the
// later attachment/experience permission errors require access to one and cannot be probed here.
it('records floater arguments and its rejection without granting experience access', async () => {
  const { Experience } = await import('../src/index.js')
  const s = await loadScript({ experience: new Experience(), source: `integer result; default { state_entry() {
    result=llOpenFloater("guidebook", "https://example.com", [1, "x"]);
  } }` })
  s.start()
  expect(s.global('result')).toBe(-1)
  expect(s.viewerRequests).toEqual([{ kind: 'openFloater', agent: s.linkset.owner, floater: 'guidebook', url: 'https://example.com', params: [1, 'x'], result: -1 }])
  expect(s.now).toBe(200)
})

it.each(['"bad"', '""', '"HTTPS://example.com"', '" https://example.com"', '"ftp://example.com"'])('rejects URL %s and retains the delay', async url => {
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() { llLoadURL(llGetOwner(), "", ${url}); } }` })
  s.start()
  expect(s.viewerRequests).toEqual([])
  expect(s.chat.map(c => c.text)).toEqual(['llLoadURL - invalid or unsupported scheme.'])
  expect(s.now).toBe(100)
})

it('accepts a supported scheme without a hostname', async () => {
  // In-world: viewer2 step 4 -> prompt payload url=https://, no error.
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() { llLoadURL(llGetOwner(), "", "https://"); } }` })
  s.start()
  expect(s.viewerRequests[0]).toMatchObject({ url: 'https://', message: '' })
})

it('checks region presence before validating the URL', async () => {
  // In-world: viewer2 step 5 -> cannot find avatar, even for an invalid URL.
  const s = await loadScript({ source: `default { state_entry() { llLoadURL("11111111-2222-3333-4444-555555555555", "", "bad"); } }` })
  s.start()
  expect(s.viewerRequests).toEqual([])
  expect(s.chat.map(c => c.text)).toEqual(['llLoadURL - cannot find avatar'])
  expect(s.now).toBe(100)
})

it.each(['a', 'é'])('truncates the URL and message at complete UTF-8 characters for %s', async letter => {
  // In-world: viewer 15 -> 255 ASCII bytes each; viewer2 1 -> message 127 é, URL 20 ASCII + 117 é.
  const text = letter.repeat(260)
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() { llLoadURL(llGetOwner(), "${text}", "https://example.com/${text}"); } }` })
  s.start()
  expect(s.viewerRequests[0]).toMatchObject({ message: letter.repeat(letter === 'a' ? 255 : 127), url: 'https://example.com/' + letter.repeat(letter === 'a' ? 235 : 117) })
})

it('allows tests to place a recipient in or out of the region', async () => {
  const key = '00000000-0000-0000-0000-00000000000b'
  const s = await loadScript({ source: `default { touch_start(integer n) { llLoadURL("${key}", "m", "https://example.com"); } }` })
  s.setAgentInRegion(key)
  s.linkset.touch(0)
  expect(s.viewerRequests[0]).toMatchObject({ agent: key })
  s.setAgentInRegion(key, false)
  s.linkset.touch(0)
  expect(s.viewerRequests).toHaveLength(1)
  expect(s.chat.at(-1)!.text).toBe('llLoadURL - cannot find avatar')
})

it.each(['llMapDestination("", <-20,999,9000>, ZERO_VECTOR)', 'llMapBeacon("", <-20,999,9000>, [BEACON_MAP])', 'llMapBeacon("", <-20,999,9000>, [BEACON_MAP,"x","y"])'])('silently records unusual map arguments: %s', async call => {
  // In-world: viewer 6,9,10,13 -> silent; all map calls dt ~= 1 s.
  const s = await loadScript({ owner: '00000000-0000-0000-0000-00000000000a', source: `default { state_entry() { ${call}; } }` })
  s.start()
  expect(s.viewerRequests).toHaveLength(1)
  expect(s.viewerRequests[0]).toMatchObject({ region: '', position: { x: -20, y: 999, z: 9000 } })
  expect(s.chat).toEqual([])
  expect(s.now).toBe(1000)
})

it('addresses a touch map request to the toucher, and other events to the owner', async () => {
  // Foreign toucher routing follows the wiki; a second avatar is needed to measure it.
  const owner = '00000000-0000-0000-0000-00000000000a'
  const toucher = '00000000-0000-0000-0000-00000000000b'
  const s = await loadScript({ owner, source: `default {
    touch_start(integer n) { llMapDestination("r", ZERO_VECTOR, ZERO_VECTOR); }
    sensor(integer n) { llMapBeacon("r", ZERO_VECTOR, []); }
  }` })
  s.linkset.touch(0, { avatar: { key: toucher, name: 'Toucher' } })
  s.fire('sensor', { num_detected: 1, detected: [{ key: toucher, name: 'Toucher' }] })
  expect(s.viewerRequests.map(r => r.agent)).toEqual([toucher, owner])
})
