import { describe, expect, it } from 'vitest'
import { loadScript, DEBUG_CHANNEL } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Errors
//
// Measured on the Aditi beta grid, SLua Tideland, Firestorm viewer, 2026-11-23. Each probe
// script was compiled to Mono and used the value of `integer *= float` (integer i = 3, float
// f = 1.5, float g = (i *= f)) in one handler or function. The owner read what the prim said on
// DEBUG_CHANNEL, and a listener in another prim heard the same two lines. The second line named
// the method that failed, then gave an IL offset and instruction, three line breaks and the
// stack. rezless leaves out the offset and instruction, which depend on the
// compiled code: in-world they read, for example, `IL_001b: stloc.2` and `IL_006d: call 0x0a000013`.

type Loaded = Awaited<ReturnType<typeof loadScript>>

const BAD = 'integer i = 3; float f = 1.5; float g = (i *= f);'
const RUNTIME = ['Script.UserEvent (ScriptEvent e)', 'Script.Run (ScriptEvent evt)']
const text = (method: string, frames: string[]) =>
  `System.InvalidProgramException: Invalid IL code in LSL :${method}\n\n\n` +
  [...frames, ...RUNTIME].map((f) => `  at ${f} `).join('\n')

async function crash(source: string, fire?: (s: Loaded) => void) {
  const s = await loadScript({ source })
  if (fire) {
    s.start()
    expect(() => fire(s)).toThrow('System.InvalidProgramException')
  } else {
    expect(() => s.start()).toThrow('System.InvalidProgramException')
  }
  expect(s.crashed).toBe(true)
  return s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)
}

describe('a handler Mono cannot run', () => {
  it('names the handler and its parameter types, then the stack', async () => {
    // In-world: "Invalid IL code in LSL :state_entry (): IL_001b: stloc.2" then
    // "at UserScript.OnStateEntry ()", "at Script.UserEvent (ScriptEvent e)", "at Script.Run (ScriptEvent evt)".
    expect(await crash(`default { state_entry() { ${BAD} } }`)).toEqual([
      'Object [script:<inline>] Script run-time error',
      text('state_entry ()', ['UserScript.OnStateEntry ()']),
    ])
  })

  it.each([
    // In-world: a touch -> "touch_start (int): IL_00c4: stloc.2", "at UserScript.OnTouchStart (Int32 p0)".
    ['touch_start(integer n)', (s: Loaded) => s.fire('touch_start', { num_detected: 1 }),
      'touch_start (int)', 'UserScript.OnTouchStart (Int32 p0)'],
    // In-world: llMessageLinked to itself -> "link_message (int,int,string,Key)",
    // "at UserScript.OnLinkMessage (Int32 p0, Int32 p1, System.String p2, Key p3)".
    ['link_message(integer s, integer n, string m, key k)', (s: Loaded) =>
      s.fire('link_message', { sender_num: 1, num: 1, str: '', id: '' }),
    'link_message (int,int,string,Key)', 'UserScript.OnLinkMessage (Int32 p0, Int32 p1, System.String p2, Key p3)'],
    // In-world: llTarget at its own position -> "at_target (int,Vector,Vector)", "at UserScript.OnAtTarget (Int32 p0, Vector p1, Vector p2)".
    ['at_target(integer t, vector a, vector b)', (s: Loaded) => s.fire('at_target', {}),
      'at_target (int,Vector,Vector)', 'UserScript.OnAtTarget (Int32 p0, Vector p1, Vector p2)'],
    // In-world: llRotTarget at its own rotation -> "at_rot_target (int,Quaternion,Quaternion)".
    ['at_rot_target(integer t, rotation a, rotation b)', (s: Loaded) => s.fire('at_rot_target', {}),
      'at_rot_target (int,Quaternion,Quaternion)', 'UserScript.OnAtRotTarget (Int32 p0, Quaternion p1, Quaternion p2)'],
    // In-world: an llHTTPRequest answer -> "http_response (Key,int,System.Collections.ArrayList,string)".
    ['http_response(key q, integer st, list meta, string body)', (s: Loaded) => s.fire('http_response', {}),
      'http_response (Key,int,System.Collections.ArrayList,string)',
      'UserScript.OnHttpResponse (Key p0, Int32 p1, System.Collections.ArrayList p2, System.String p3)'],
  ])('names %s with its parameter types', async (handler, fire, method, frame) => {
    const said = await crash(`default { ${handler} { ${BAD} } }`, fire)
    expect(said[1]).toBe(text(method, [frame]))
  })

  it('says the same for a key print as for integer *= float', async () => {
    // In-world: touch_start(integer n) holding the value of a key print in a branch that never ran ->
    // "touch_start (int): IL_0090: call 0x0a000008", "at UserScript.OnTouchStart (Int32 p0)" and the
    // runtime's two frames, the same as integer *= float apart from the IL offset and instruction.
    // The llOwnerSay after the branch never ran (Aditi, SLua Tideland, 2026-11-23).
    const said = await crash('default { touch_start(integer n) { if (n == 99) llOwnerSay((string)((key)"x" == print((key)"k"))); llOwnerSay("ran"); } }',
      (s) => s.fire('touch_start', { num_detected: 1 }))
    expect(said).toEqual(['Object [script:<inline>] Script run-time error', text('touch_start (int)', ['UserScript.OnTouchStart (Int32 p0)'])])
  })

  it('names a handler outside the default state with the state\'s name', async () => {
    // In-world: state two's timer -> "etwotimer (): IL_006d: call 0x0a000013", "at UserScript.OnTimer ()";
    // state two's state_entry -> "etwostate_entry ()", "at UserScript.OnStateEntry ()".
    const timer = await crash(`default { state_entry() { state two; } }
      state two { state_entry() { llSetTimerEvent(1.0); } timer() { ${BAD} } }`, (s) => s.advanceTime(1000))
    expect(timer[1]).toBe(text('etwotimer ()', ['UserScript.OnTimer ()']))
    const entry = await crash(`default { state_entry() { state two; } } state two { state_entry() { ${BAD} } }`)
    expect(entry[1]).toBe(text('etwostate_entry ()', ['UserScript.OnStateEntry ()']))
  })

  it('fails on the value printed by print()', async () => {
    // In-world: print(i *= f) in state_entry -> "state_entry (): IL_0071: call 0x0a000006", and the
    // llOwnerSay after it never ran.
    expect((await crash('default { state_entry() { integer i = 3; float f = 1.5; print(i *= f); llOwnerSay("after"); } }'))[1])
      .toBe(text('state_entry ()', ['UserScript.OnStateEntry ()']))
  })

  it('still runs integer *= float used as a statement', async () => {
    const s = await loadScript({ source: 'integer i = 3; default { state_entry() { float f = 1.5; i *= f; for (i *= f; FALSE; i *= f) ; } }' })
    s.start()
    expect(s.crashed).toBe(false)
    expect(s.global('i')).toBe(6)
  })
})

describe('a user function Mono cannot run', () => {
  it('names the function with a g and its parameter types, and puts its caller in the stack', async () => {
    // In-world: fn(integer a, string b, key k, float x, vector v, rotation r, list l) called from
    // state_entry -> "gfn (int,string,Key,single,Vector,Quaternion,System.Collections.ArrayList)",
    // then "at LSL .state_entry ()" and "at UserScript.OnStateEntry ()".
    const said = await crash(`integer fn(integer a, string b, key k, float x, vector v, rotation r, list l) { ${BAD} return a; }
      default { state_entry() { fn(1, "b", "", 1.0, ZERO_VECTOR, ZERO_ROTATION, []); } }`)
    expect(said[1]).toBe(text('gfn (int,string,Key,single,Vector,Quaternion,System.Collections.ArrayList)',
      ['LSL .state_entry ()', 'UserScript.OnStateEntry ()']))
  })

  it('lists each function on the way with its parameter names', async () => {
    // In-world: state_entry called outer(string s), which called fn(integer a) -> "gfn (int)",
    // "at LSL .gouter (System.String s)", "at LSL .state_entry ()", "at UserScript.OnStateEntry ()".
    const said = await crash(`integer fn(integer a) { ${BAD} return a; }
      integer outer(string s) { return fn(2); }
      default { state_entry() { outer("x"); } }`)
    expect(said[1]).toBe(text('gfn (int)', ['LSL .gouter (System.String s)', 'LSL .state_entry ()', 'UserScript.OnStateEntry ()']))
  })

  it('names the calling handler with its state', async () => {
    // In-world: state two's timer called fn -> "gfn (int)", "at LSL .etwotimer ()", "at UserScript.OnTimer ()".
    const said = await crash(`integer fn(integer a) { ${BAD} return a; }
      default { state_entry() { state two; } }
      state two { state_entry() { llSetTimerEvent(0.5); } timer() { llSetTimerEvent(0.0); fn(3); } }`, (s) => s.advanceTime(600))
    expect(said[1]).toBe(text('gfn (int)', ['LSL .etwotimer ()', 'UserScript.OnTimer ()']))
  })

  it('lists a calling handler\'s parameters by name', async () => {
    // In-world: touch_start(integer n) calling fn -> "at LSL .touch_start (Int32 n)",
    // "at UserScript.OnTouchStart (Int32 p0)"; link_message(integer s, integer n, string m, key k)
    // calling fn -> "at LSL .link_message (Int32 s, Int32 n, System.String m, Key k)".
    const touched = await crash(`integer fn(integer a) { ${BAD} return a; }
      default { touch_start(integer n) { fn(n); } }`, (s) => s.fire('touch_start', { num_detected: 1 }))
    expect(touched[1]).toBe(text('gfn (int)', ['LSL .touch_start (Int32 n)', 'UserScript.OnTouchStart (Int32 p0)']))
    const linked = await crash(`integer fn(integer a) { ${BAD} return a; }
      default { link_message(integer s, integer n, string m, key k) { fn(n); } }`,
    (s) => s.fire('link_message', { sender_num: 1, num: 7, str: 'm', id: '' }))
    expect(linked[1]).toBe(text('gfn (int)', ['LSL .link_message (Int32 s, Int32 n, System.String m, Key k)',
      'UserScript.OnLinkMessage (Int32 p0, Int32 p1, System.String p2, Key p3)']))
  })
})
