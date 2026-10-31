import { it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/llSetPrimMediaParams
// In-world: media validation/whitelist/bounds/fresh/types/three root/child caller,
// Aditi, SLua Tideland, 2026-10-31. Scripts and raw output: /tmp/issue160-media.
// Writes and reads were sequenced separately to avoid LSL evaluation-order effects.
it('stores media on one face and returns it through the getter', async () => {
  const { scripts, prims } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source: `
    default { state_entry() {
      llSay(0,(string)llSetPrimMediaParams(0,[PRIM_MEDIA_HOME_URL,"https://example.com/"]));
      llSay(0,llList2CSV(llGetPrimMediaParams(0,[PRIM_MEDIA_HOME_URL])));
    } }
  ` } }] }] })
  scripts.p!.start()
  scripts.p!.advanceTime(5000)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual(['0', 'https://example.com/'])
  expect(prims[0]).toHaveProperty('media')
})

const source = (body: string) => ({ name: 'p', source: { source: `default { state_entry() { ${body} } }` } })
async function run(body: string) {
  const loaded = await loadLinkset({ prims: [{ scripts: [source(body)] }] })
  loaded.scripts.p!.start()
  loaded.scripts.p!.advanceTime(100000)
  return loaded
}

// https://wiki.secondlife.com/wiki/llGetPrimMediaParams
it('distinguishes absent media from an entry created with an empty parameter list', async () => {
  const { scripts } = await run(`
    llSay(0,(string)llGetListLength(llGetPrimMediaParams(0,[3])));
    llSetPrimMediaParams(0,[]);
    llSay(0,(string)llGetListLength(llGetPrimMediaParams(0,[3])));
    llSay(0,(string)llGetListLength(llGetPrimMediaParams(1,[3])));
    llClearPrimMedia(0);
    llSay(0,(string)llGetListLength(llGetPrimMediaParams(0,[3])));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual(['0','1','0','0'])
})

// https://wiki.secondlife.com/wiki/llSetPrimMediaParams#Summary
it.each([
  ['[3]',1000], ['[99,1]',1000], ['[3,123]',1001],
  ['[5,"1"]',1001], ['[1,9]',1002], ['[9,4096]',1002],
])('rejects invalid media rules %s without replacing earlier state', async (rules, status) => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[3,"seed"]);
    llSay(0,(string)llSetPrimMediaParams(0,${rules}));
    llSay(0,llList2String(llGetPrimMediaParams(0,[3]),0));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([String(status),'https://seed'])
})

// In-world: media empty -> all zero/empty except permission masks 7; fresh
// clearSet -> absent. Aditi, SLua Tideland, 2026-10-31.
it('returns defaults in requested order with the documented list element types', async () => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[]);
    list v=llGetPrimMediaParams(0,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
    llSay(0,llList2CSV(v));
    llSay(0,(string)llGetListEntryType(v,0)+":"+(string)llGetListEntryType(v,2));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([
    '0, 0, , , 0, 0, 0, 0, 0, 0, 0, 0, , 7, 7', '1:3',
  ])
})

// In-world: media types/final types: noninteger keys are malformed, booleans
// and masks require integers, dimensions also accept floats. All failures
// leave the prior entry unchanged. Aditi, SLua Tideland, 2026-10-31.
it.each([
  ['["3","x"]',1000], ['[3.0,"x"]',1000], ['[<3,0,0>,1]',1000],
  ['[-1,1]',1000], ['[3,"changed",5]',1000], ['[3,(key)"abc"]',1001],
  ['[5,1.0]',1001], ['[5,(key)"x"]',1001], ['[3,<1,2,3>]',1001],
  ['[1,1.0]',1001], ['[1,-1]',1002], ['[9,"512"]',1001],
  ['[9,<1,2,3>]',1001], ['[13,1.0]',1001], ['[14,"3"]',1001],
  ['[12,123]',1001], ['[10,-1]',1002], ['[3,"changed",99,1]',1000],
  ['[3,"changed",1,9]',1002],
])('validates %s atomically', async (rules, status) => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[3,"https://seed"]);
    integer s=llSetPrimMediaParams(0,${rules});
    llSay(0,(string)s+":"+llList2String(llGetPrimMediaParams(0,[3]),0));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([`${status}:https://seed`])
})

// In-world: media bounds/final types -> numeric dimensions truncate then wrap
// to uint16, 0..2048 accepted; masks keep low 3 bits. Aditi, 2026-10-31.
it.each([[0,0,0],[2048,0,2048],[2049,1002,24],[-1,1002,24],[65536,0,0],[65537,0,1],[-65535,0,1],[512.75,0,512]])('validates dimension %s after conversion', async (value, status, width) => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[9,24]);
    integer s=llSetPrimMediaParams(0,[9,${value},10,${value}]);
    llSay(0,(string)s+":"+llList2CSV(llGetPrimMediaParams(0,[9,10])));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([`${status}:${width}, ${status ? 0 : width}`])
})

// In-world: media errors bool -> 0 false, 1/2/-1/4 true for all seven flags;
// media final types/perms -> -1 => 7, 8 => 0. Aditi, 2026-10-31.
it.each([0,1,2,-1,4])('normalizes boolean flags %s and masks permissions', async value => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[0,${value},4,${value},5,${value},6,${value},7,${value},8,${value},11,${value},13,-1,14,8]);
    llSay(0,llList2CSV(llGetPrimMediaParams(0,[0,4,5,6,7,8,11,13,14])));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([
    value === 0 ? '0, 0, 0, 0, 0, 0, 0, 7, 0' : '1, 1, 1, 1, 1, 1, 1, 7, 0',
  ])
})

// In-world: media url atomic -> prefix absent scheme, retain whitespace and
// HTTP casing; unsupported ftp/javascript schemes silently retain old URL.
it.each([
  ['example.com/path','https://example.com/path'], ['  example.com/a b  ','https://  example.com/a b  '],
  ['HTTP://EXAMPLE.COM/A','HTTP://EXAMPLE.COM/A'], ['',''],
  ['ftp://example.com/a','https://seed'], ['javascript:alert(1)','https://seed'],
])('normalizes media URL %j', async (url, want) => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[3,"https://seed"]);
    integer s=llSetPrimMediaParams(0,[3,"${url}"]);
    llSay(0,(string)s+":"+llList2String(llGetPrimMediaParams(0,[3]),0));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([`0:${want}`])
})

// In-world: exact1024 accepted, exact1025 rejected after https:// prefix;
// wl1023 accepted, wl1024 rejected. Aditi, SLua Tideland, 2026-10-31.
it.each([[1016,0,1024],[1017,1002,12]])('bounds URLs after adding the scheme (%s)', async (n, status, length) => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[3,"https://seed"]);
    integer s=llSetPrimMediaParams(0,[3,"${'x'.repeat(n)}"]);
    llSay(0,(string)s+":"+(string)llStringLength(llList2String(llGetPrimMediaParams(0,[3]),0)));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([`${status}:${length}`])
})

it.each([[1023,0],[1024,1002]])('bounds whitelist storage including its terminator (%s)', async (n, status) => {
  const { scripts } = await run(`integer s=llSetPrimMediaParams(0,[12,"${'x'.repeat(n)}"]);llSay(0,(string)s);`)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([String(status)])
})

// In-world: wl64 -> OK; wl65 -> bounds error.
it.each([[64,0],[65,1002]])('bounds whitelist count (%s)', async (count, status) => {
  const { scripts } = await run(`integer s=llSetPrimMediaParams(0,[12,"${Array(count).fill('a').join(',')}"]);llSay(0,(string)s);`)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([String(status)])
})

// In-world: whitelist settled -> exact case-insensitive authority/path match,
// query ignored, longer path rejected, absent scheme accepts http and https.
it.each([
  ['https://example.com/foo',0], ['https://EXAMPLE.COM/FOO',0],
  ['https://example.com/foo?q=1',0], ['http://example.com/foo',0],
  ['https://example.com/foobar',2001], ['https://other.com/foo',2001], ['',2001],
  ['HTTPS://EXAMPLE.COM/foo',2001],
])('checks current URL %j against the whitelist', async (url, status) => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[2,"https://example.com/foo",11,1,12,"example.com/foo"]);
    integer s=llSetPrimMediaParams(0,[2,"${url}"]);
    llSay(0,(string)s+":"+llList2String(llGetPrimMediaParams(0,[2]),0));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([`${status}:${status ? 'https://example.com/foo' : url}`])
})

// In-world: whitelist -> home URL is unrestricted; changing whitelist alone
// does not revalidate current URL, empty whitelist allows navigation, perms=0
// does not block script setters. Aditi, SLua Tideland, 2026-10-31.
it('applies a batch whitelist before validating navigation and stores permission masks', async () => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[2,"https://allowed.com/a",11,1,12," allowed.com/* , other.com/* ",13,0,14,0]);
    llSetPrimMediaParams(0,[3,"https://outside.com/"]);
    llSay(0,llList2CSV(llGetPrimMediaParams(0,[2,3,12,13,14])));
    llSetPrimMediaParams(0,[12,"https://other.com/a"]);
    integer s=llSetPrimMediaParams(0,[2,"http://other.com/a"]);
    llSay(0,(string)s);
    llSetPrimMediaParams(0,[12,"",2,"https://outside.com/"]);
    llSay(0,llList2String(llGetPrimMediaParams(0,[2]),0));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([
    'https://allowed.com/a, https://outside.com/, allowed.com/*,other.com/*, 0, 0', '2001', 'https://outside.com/',
  ])
})

// In-world: getfloat/getstring -> skip noninteger keys; unknown integer stops
// and returns preceding values with a DEBUG_CHANNEL error.
it('preserves requested order and stops at an unknown integer getter parameter', async () => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[3,"https://seed",5,1]);
    llSay(0,llList2CSV(llGetPrimMediaParams(0,[3.2,"3",5,3,99,5])));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual(['1, https://seed'])
  expect(scripts.p!.chat.filter(c => c.channel === 2147483647).map(c => c.text)).toEqual(["llGetPrimMediaParams error: Unknown parameter '99'"])
})

// In-world: lone face -> negative faces 1004, nonexistent positive faces
// 1003, face 5 works on a box. Clear removes nondefault media.
it.each([[-2,1004],[-1,1004],[5,0],[6,1003],[99,1003]])('handles face %s consistently', async (face, status) => {
  const { scripts } = await run(`
    integer s=llSetPrimMediaParams(${face},[3,"https://seed"]);
    llSay(0,(string)s+":"+(string)llGetListLength(llGetPrimMediaParams(${face},[3])));
    s=llClearPrimMedia(${face});
    llSay(0,(string)s+":"+(string)llGetListLength(llGetPrimMediaParams(${face},[3])));
  `)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([`${status}:${status ? 0 : 1}`,`${status}:0`])
})

// In-world: three root / child again -> negative selectors choose first OTHER
// prim, LINK_THIS chooses caller; link 0 aliases root only from a child.
it.each([
  [0,-4,0],[0,-3,1],[0,-2,1],[0,-1,1],[0,0,-1],[0,1,0],[0,2,1],[0,3,2],[0,99,-1],
  [1,-5,0],[1,-4,1],[1,-3,0],[1,-2,0],[1,-1,0],[1,0,0],[1,1,0],[1,2,1],[1,3,2],
])('selects media link %s / %s', async (caller, link, target) => {
  const primConfigs = [{}, {}, {}] as Array<{ scripts?: ReturnType<typeof source>[] }>
  primConfigs[caller] = { scripts: [source(`
    integer s=llSetLinkMedia(${link},0,[3,"https://seed"]);
    llSay(0,(string)s+":"+llList2CSV(llGetLinkMedia(${link},0,[3])));
  `)] }
  const { scripts, prims } = await loadLinkset({ prims: primConfigs })
  scripts.p!.start()
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([`0:${target < 0 ? '' : 'https://seed'}`])
  prims.forEach((p,i) => expect(p.media.get(0)?.[3]).toBe(i === target ? 'https://seed' : undefined))
})

// In-world: lone selectors -> only 0 and LINK_THIS address a lone prim.
it.each([[-4,true],[-3,false],[-2,false],[-1,false],[0,true],[1,false],[99,false]])('selects lone media link %s', async (link, exists) => {
  const { scripts } = await run(`llSetLinkMedia(${link},0,[3,"https://seed"]);llSay(0,llList2CSV(llGetPrimMediaParams(0,[3])));`)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([exists ? 'https://seed' : ''])
})

// In-world: precedence -> nonexistent links return OK before validation, even
// for malformed params and negative/nonexistent faces. Aditi, 2026-10-31.
it('does not validate media requests for a nonexistent link', async () => {
  const { scripts } = await run(`
    llSay(0,(string)llSetLinkMedia(99,-1,[3]));
    llSay(0,(string)llSetLinkMedia(99,99,[99,1]));
    llSay(0,(string)llClearLinkMedia(99,-1));
  `)
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['0','0','0'])
})

it('clears only the selected link and face, sharing state between scripts', async () => {
  const { scripts, prims } = await loadLinkset({ prims: [
    { scripts: [source(`llSetLinkMedia(2,0,[3,"https://seed"]);llSetLinkMedia(2,1,[3,"https://other"]);`)] },
    { scripts: [{ name: 'child', source: { source: 'default { touch_start(integer n) { llClearPrimMedia(0); } }' } }] },
  ] })
  scripts.p!.start(); scripts.child!.start()
  scripts.child!.fire('touch_start',{total_number:1}); scripts.child!.advanceTime(2000)
  expect(prims[1]!.media.has(0)).toBe(false)
  expect(prims[1]!.media.get(1)?.[3]).toBe('https://other')
})

// In-world: exact errors -> parameter indexes count pairs, invalid rule type
// reports param=0, all setters use llSetPrimMediaParams in the error label.
it('reports validation errors without committing an earlier pair', async () => {
  const { scripts, prims } = await run('llSetPrimMediaParams(0,[3,"https://seed",5,1.0]);')
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['llSetPrimMediaParams error: Type mismatch near parameter #1, param=5.  No values have been set.'])
  expect(prims[0]!.media.size).toBe(0)
})

// In-world: sequenced links clear-4/-3/-2/-1/1/2 -> selected entry removed;
// duplicate home URL entries keep the last value. Aditi, 2026-10-31.
it('clears link media without affecting other faces or prims', async () => {
  const { scripts, prims } = await loadLinkset({ prims: [
    { scripts: [source(`
      llSetLinkMedia(1,0,[3,"https://root"]);
      llSetLinkMedia(2,0,[3,"https://first",3,"https://last"]);
      llSetLinkMedia(2,1,[3,"https://face1"]);
      llSay(0,llList2CSV(llGetLinkMedia(2,0,[3])));
      integer s=llClearLinkMedia(LINK_SET,0);
      llSay(0,(string)s+":"+llList2CSV(llGetLinkMedia(2,0,[3])));
    `)] }, {},
  ] })
  scripts.p!.start()
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['https://last','0:'])
  expect(prims[0]!.media.get(0)?.[3]).toBe('https://root')
  expect(prims[1]!.media.has(0)).toBe(false)
  expect(prims[1]!.media.get(1)?.[3]).toBe('https://face1')
})

// In-world: whitelist settled star -> arbitrary http URL allowed.
it('matches wildcard whitelist entries and keeps existing media across script resets', async () => {
  const { scripts, prims } = await run(`
    llSetPrimMediaParams(0,[12,"*",11,1,2,"http://anything.com/a"]);
    llSay(0,llList2String(llGetPrimMediaParams(0,[2]),0));
  `)
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['http://anything.com/a'])
  scripts.p!.reset()
  expect(prims[0]!.media.get(0)?.[2]).toBe('http://anything.com/a')
})

// In-world: PRIM_MEDIA_CONTROLS accepts STANDARD=0 / MINI=1; defaults remain
// unchanged on subsequent partial updates. Aditi, SLua Tideland, 2026-10-31.
it('updates controls and preserves omitted fields on an existing face', async () => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[1,1,3,"https://seed"]);
    llSetPrimMediaParams(0,[5,1]);
    llSay(0,llList2CSV(llGetPrimMediaParams(0,[1,3,5])));
    llSetPrimMediaParams(0,[1,0]);
    llSay(0,llList2CSV(llGetPrimMediaParams(0,[1,3,5])));
  `)
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['1, https://seed, 1','0, https://seed, 1'])
})

// In-world: controls wlsegments -> "a,b,"; raw empty CSV tokens are dropped
// before trimming, so a whitespace-only final entry survives as an empty entry.
// Aditi, SLua Tideland, 2026-10-31.
it('trims whitelist entries after dropping raw empty tokens', async () => {
  const { scripts } = await run(`
    llSetPrimMediaParams(0,[12,"a,, b, "]);
    llSay(0,llList2String(llGetPrimMediaParams(0,[12]),0));
  `)
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['a,b,'])
})

// In-world: unicode bytes -> https:// plus 508 UTF-8 e-acute characters is
// accepted at 1024 bytes; 509 returns bounds error. Aditi, 2026-10-31.
it.each([[508,0],[509,1002]])('measures URL limits in UTF-8 bytes (%s)', async (count, status) => {
  const { scripts } = await run(`integer s=llSetPrimMediaParams(0,[3,"https://${'é'.repeat(count)}"]);llSay(0,(string)s);`)
  expect(scripts.p!.chat.filter(c => c.channel === 0).map(c => c.text)).toEqual([String(status)])
})
