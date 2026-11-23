import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetStatus documents one STATUS_* flag per call
// and says nothing about masks.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-23): two linked 0.5 m boxes, an LSL script in each and an SLua
// script in the root. A command set the flags from the root, then every script read
// llGetStatus for each value in MASKS. The root, the child and SLua read the same
// results every time; SLua returns booleans.
//
// In-world: llGetStatus with several flags does not test any or all of them. The
// region walks the flags in a fixed order and returns the state of the first one that
// is in the mask: DIE_AT_NO_ENTRY, BLOCK_GRAB_OBJECT, DIE_AT_EDGE, RETURN_AT_EDGE,
// BLOCK_GRAB, SANDBOX, ROTATE_Z, ROTATE_Y, ROTATE_X, PHANTOM, PHYSICS. Other bits
// (CAST_SHADOWS, DIE_ON_NO_REZZER, 0x2000 and up, the sign bit) are ignored, so a mask
// holding none of the eleven reads 0.

const MASKS = ['0', '1', '2', '4', '8', '16', '32', '64', '128', '256', '512', '1024', '2048', '4096', '8192',
  '3', '6', '14', '15', '18', '48', '80', '0xFFFF', '-1', '-2', '0x7FFFFFFF', '0x80000000', '0x1FFF', '0x10000']
const LIST = `[${MASKS.join(',')}]`
const NULL = '00000000-0000-0000-0000-000000000000'

const ROOT = `list read;
default { link_message(integer s, integer n, string m, key id) {
  if (n != 1) return;
  list a = llParseString2List(m, [" "], []);
  if (llList2String(a, 0) == "set") llSetStatus((integer)llList2String(a, 1), (integer)llList2String(a, 2));
  list M = ${LIST}; read = []; integer i;
  for (i = 0; i < llGetListLength(M); ++i) read += [llGetStatus(llList2Integer(M, i))];
} }`
const CHILD = `list read;
default { link_message(integer s, integer n, string m, key id) {
  if (n != 2) return;
  list M = ${LIST}; read = []; integer i;
  for (i = 0; i < llGetListLength(M); ++i) read += [llGetStatus(llList2Integer(M, i))];
} }`
const SLUA = `local M = {${MASKS.join(',').replace('0x80000000', '-2147483648')}}
LLEvents:on("link_message", function(s, n, m, id)
  if n ~= 3 then return end
  local o = {}
  for i, v in M do o[i] = tostring(ll.GetStatus(v)) end
  ll.OwnerSay(table.concat(o, ","))
end)`

async function object() {
  const o = await loadLinkset({ prims: [
    { scripts: [{ name: 'root', source: { source: ROOT } }, { name: 'slua', language: 'slua', source: { source: SLUA } }] },
    { scripts: [{ name: 'child', source: { source: CHILD } }] },
  ] })
  for (const script of Object.values(o.scripts)) script.start()
  const fire = (name: string, num: number, str = '') =>
    o.scripts[name]!.fire('link_message', { sender_num: 1, num, str, id: NULL })
  return (command = 'read') => {
    fire('root', 1, command)
    fire('child', 2)
    fire('slua', 3)
    const slua = o.scripts['slua']!.chat.at(-1)!.text.split(',').map((b) => (b === 'true' ? 1 : 0))
    return [o.scripts['root']!.global('read'), o.scripts['child']!.global('read'), slua]
  }
}

const row = (bits: string) => bits.split(',').map(Number)

describe('llGetStatus with several flags', () => {
  // Each case: the commands sent in-world, then the row every script read for MASKS.
  it.each([
    // In-world: a new object -> only the rotation flags read 1; 0xFFFF, -1 and 0x1FFF read 0.
    ['a new object', [],
      '0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0'],
    // In-world: PHANTOM, SANDBOX, BLOCK_GRAB, DIE_AT_EDGE, RETURN_AT_EDGE, BLOCK_GRAB_OBJECT and
    // DIE_AT_NO_ENTRY set one by one -> 0xFFFF, -1, -2 and 0x7FFFFFFF read 1; 0x80000000 and 0x10000 read 0.
    ['several flags set', ['set 16 1', 'set 32 1', 'set 64 1', 'set 128 1', 'set 256 1', 'set 1024 1', 'set 2048 1'],
      '0,0,1,1,1,1,1,1,1,1,0,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0'],
    // In-world: with PHYSICS also set, STATUS_PHYSICS reads 1 and the masks read as before.
    ['several flags and physics', ['set 16 1', 'set 32 1', 'set 64 1', 'set 128 1', 'set 256 1', 'set 1024 1', 'set 2048 1', 'set 1 1'],
      '0,1,1,1,1,1,1,1,1,1,0,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0'],
    // In-world: llSetStatus(PHANTOM | BLOCK_GRAB, TRUE) set both; 48 (SANDBOX | PHANTOM) read 0 and
    // 80 (BLOCK_GRAB | PHANTOM) read 1.
    ['a combined llSetStatus', ['set 80 1'],
      '0,0,1,1,1,1,0,1,0,0,0,0,0,0,0,1,1,1,1,1,0,1,0,0,0,0,0,0,0'],
    // In-world: all rotation flags cleared -> every mask read 0.
    ['no flags', ['set 14 0'],
      '0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0'],
    // In-world: only ROTATE_X set -> 3 and 18 read 1, 6, 14 and 15 read 0.
    ['only ROTATE_X', ['set 14 0', 'set 2 1'],
      '0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0'],
  ])('reads the first flag of the mask in the region\'s order: %s', async (_name, commands, expected) => {
    const read = await object()
    for (const command of commands) read(command)
    const want = row(expected)
    expect(read()).toEqual([want, want, want])
  })

  // In-world: each settable flag on its own (every other flag cleared), read with each
  // single bit added to it. A 1 in column g means flag f wins over g: g comes later in the
  // order or is ignored. CAST_SHADOWS and DIE_ON_NO_REZZER never read 1.
  const OTHERS = ['1', '2', '4', '8', '16', '32', '64', '128', '256', '512', '1024', '2048', '4096', '8192', '0x10000', '0x80000000']
  it.each([
    [1, '1,0,0,0,0,0,0,0,0,1,0,0,1,1,1,1'],
    [2, '1,1,0,0,1,0,0,0,0,1,0,0,1,1,1,1'],
    [4, '1,1,1,0,1,0,0,0,0,1,0,0,1,1,1,1'],
    [8, '1,1,1,1,1,0,0,0,0,1,0,0,1,1,1,1'],
    [16, '1,0,0,0,1,0,0,0,0,1,0,0,1,1,1,1'],
    [32, '1,1,1,1,1,1,0,0,0,1,0,0,1,1,1,1'],
    [64, '1,1,1,1,1,1,1,0,0,1,0,0,1,1,1,1'],
    [128, '1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1'],
    [256, '1,1,1,1,1,1,1,0,1,1,0,0,1,1,1,1'],
    [1024, '1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1'],
    [2048, '1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1'],
  ])('orders flag %i against every other bit', async (flag, expected) => {
    const o = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `list read;
      default { state_entry() { llSetStatus(0x0FFF, FALSE); llSetStatus(${flag}, TRUE);
        list G = [${OTHERS.join(',')}]; integer i;
        for (i = 0; i < llGetListLength(G); ++i) read += [llGetStatus(${flag} | llList2Integer(G, i))];
        read += [llGetStatus(-1), llGetStatus(0xFFFF), llGetStatus(${flag})]; } }` } }] }] })
    o.scripts['s']!.start()
    // In-world: -1 and 0xFFFF read 1 only when DIE_AT_NO_ENTRY was the flag set.
    const all = flag === 2048 ? 1 : 0
    expect(o.scripts['s']!.global('read')).toEqual([...row(expected), all, all, 1])
  })
})
