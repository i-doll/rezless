import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

/** Wraps statements in a state_entry so each case is a whole script. */
const inEntry = (body: string) => `default { state_entry() { ${body} } }`

describe('load-time type checking (SL compiler parity)', () => {
  it('rejects the script from issue #52', async () => {
    const source = `
      default
      {
          state_entry()
          {
              key id = NULL_KEY;
              if (!id) return 0;
          }
      }
    `
    const err = await loadScript({ source }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/Type mismatch: '!' not defined for key/)
  })

  it('rejects code even when it would never run', async () => {
    await expect(
      loadScript({ source: `default { timer() { key k; integer r = !k; } }` }),
    ).rejects.toThrow(/Type mismatch/)
  })

  const rejected: ReadonlyArray<[string, string, RegExp]> = [
    ['! on a float', inEntry('integer r = !1.0;'), /Type mismatch/],
    ['~ on a string', inEntry('integer r = ~"a";'), /Type mismatch/],
    ['- on a list', inEntry('list l = -[1];'), /Type mismatch/],
    ['key + string', inEntry('string s = "a" + llGetOwner();'), /Type mismatch/],
    ['integer + string', inEntry('string s = 1 + "a";'), /Type mismatch/],
    ['vector * string', inEntry('vector v = <1,2,3> * "a";'), /Type mismatch/],
    ['rotation * vector', inEntry('vector v = ZERO_ROTATION * <1,2,3>;'), /Type mismatch/],
    ['float % float', inEntry('float f = 1.0 % 2.0;'), /Type mismatch/],
    ['bitwise & on floats', inEntry('integer i = 1.0 & 2;'), /Type mismatch/],
    ['&& on a string', inEntry('integer i = "a" && 1;'), /Type mismatch/],
    ['< on strings', inEntry('integer i = "a" < "b";'), /Type mismatch/],
    ['== between list and integer', inEntry('integer i = [] == 0;'), /Type mismatch/],
    ['float assigned to integer', inEntry('integer i = 1.5;'), /Type mismatch/],
    ['integer assigned to string', inEntry('string s = 1;'), /Type mismatch/],
    ['integer assigned to list', inEntry('list l = 1;'), /Type mismatch/],
    ['void result used as a value', inEntry('integer i = llSay(0, "x");'), /Type mismatch/],
    ['integer += float', inEntry('integer i; i += 1.5;'), /Type mismatch/],
    ['vector *= vector', inEntry('vector v; v *= <1,1,1>;'), /Type mismatch/],
    ['string -= string', inEntry('string s; s -= "a";'), /Type mismatch/],
    ['++ on a string', inEntry('string s; s++;'), /Type mismatch/],
    ['cast key to integer', inEntry('integer i = (integer)llGetOwner();'), /Type mismatch/],
    ['cast vector to rotation', inEntry('rotation r = (rotation)<1,2,3>;'), /Type mismatch/],
    ['string vector component', inEntry('vector v = <1, "a", 3>;'), /Type mismatch/],
    ['.s on a vector', inEntry('vector v; float f = v.s;'), /incorrect type/],
    ['member access on a float', inEntry('float f; float g = f.x;'), /incorrect type/],
    ['returning a value from an event', inEntry('return 0;'), /Return statement type/],
    [
      'returning a value from a void function',
      `f() { return 1; } ${inEntry('f();')}`,
      /Return statement type/,
    ],
    [
      'bare return in a typed function',
      `integer f() { return; } ${inEntry('f();')}`,
      /Function returns a value but return statement doesn't/,
    ],
    [
      'returning the wrong type',
      `integer f() { return "a"; } ${inEntry('f();')}`,
      /Return statement type/,
    ],
    ['too few builtin arguments', inEntry('llSay(0);'), /mismatches type or number of arguments/],
    ['wrong builtin argument type', inEntry('llSay("0", "x");'), /mismatches type or number/],
    [
      'wrong user-function argument type',
      `f(integer a) {} ${inEntry('f("a");')}`,
      /mismatches type or number/,
    ],
    ['undeclared variable', inEntry('x = 1;'), /Name not defined within scope: x/],
    ['variable used outside its block', inEntry('{ integer x; } x = 1;'), /Name not defined/],
    ['unknown state', inEntry('state nowhere;'), /Name not defined within scope: state nowhere/],
    ['unknown event', `default { not_an_event() {} }`, /Unknown event 'not_an_event'/],
    ['wrong event parameters', `default { listen(integer c) {} }`, /Event 'listen' takes/],
    ['global initialiser of the wrong type', `integer g = "a"; ${inEntry('')}`, /Type mismatch/],
    ['global initialised from a call', `integer g = llGetUnixTime(); ${inEntry('')}`, /Syntax error/],
    ['global initialised from an operator', `integer g = 1 + 2; ${inEntry('')}`, /Syntax error/],
    ['global initialised from a cast', `string g = (string)1; ${inEntry('')}`, /Syntax error/],
    ['global negating a constant', `float g = -PI; ${inEntry('')}`, /Syntax error/],
    ['global list nested in a list', `list g = [[1]]; ${inEntry('')}`, /Syntax error/],
    ['global initialised from a later global', `integer a = b; integer b; ${inEntry('')}`, /Name not defined/],
    ['assignment to a constant', inEntry('PI = 0.0;'), /can't assign to constant PI/],
    ['compound assignment to a constant', inEntry('TRUE += 1;'), /can't assign to constant TRUE/],
    ['++ on a constant', inEntry('ZERO_VECTOR.x++;'), /can't assign to constant ZERO_VECTOR/],
    ['duplicate local', inEntry('integer x; string x;'), /Name previously declared within scope: x/],
    ['duplicate parameter', `f(integer a, string a) {} ${inEntry('')}`, /previously declared/],
    ['duplicate global', `integer g; float g; ${inEntry('')}`, /previously declared within scope: g/],
    ['global and function with one name', `integer g; g() {} ${inEntry('')}`, /previously declared/],
    ['typed function with no return', `integer f() {} ${inEntry('')}`, /Not all code paths return a value/],
    ['if without else', `integer f(integer a) { if (a) return 1; } ${inEntry('')}`, /Not all code paths/],
    ['return only inside a loop', `integer f() { while (TRUE) return 1; } ${inEntry('')}`, /Not all code paths/],
    ['member access on a call result', inEntry('float x = llGetPos().x;'), /only works on a variable/],
    ['member access on a literal', inEntry('float x = <1,2,3>.x;'), /only works on a variable/],
    ['reading a component of a vector constant', inEntry('float f = ZERO_VECTOR.x;'), /Syntax error: can't read a component of constant ZERO_VECTOR/],
    ['reading a component of a rotation constant', inEntry('float f = ZERO_ROTATION.s;'), /Syntax error: can't read a component of constant ZERO_ROTATION/],
    ['state change directly in a function', `f() { state two; } default { state_entry() {} } state two { state_entry() {} }`, /Global functions can't change state/],
    ['state change in an if with an else, in a function', `f(integer a) { if (a) state two; else a = 1; } default { state_entry() {} } state two { state_entry() {} }`, /Global functions can't change state/],
    ['return of a void call directly in an event', inEntry('return llSay(0, "");'), /Return statement type/],
    ['jump to a missing label', inEntry('jump nowhere;'), /Name not defined within scope: label nowhere/],
    ['jump into a nested block', inEntry('jump inner; { @inner; }'), /Name not defined within scope: label inner/],
    ['duplicate label in one handler', inEntry('@a; { @a; }'), /Duplicate label name: a/],
    ['a state before default', `state two { state_entry() {} } default { state_entry() {} }`, /default state must come first/],
    ['a global after the states', `default { state_entry() {} } integer g;`, /g must be declared before the states/],
    ['a state with no handlers', `default {}`, /state default has no event handlers/],
    ['the same event twice in a state', `default { state_entry() {} state_entry() {} }`, /previously declared within scope: state_entry/],
    ['two states with one name', `default { state_entry() {} } state two { state_entry() {} } state two { timer() {} }`, /previously declared within scope: two/],
    ['a function named after a builtin', `llSay(integer c, string m) {} ${inEntry('')}`, /previously declared within scope: llSay/],
    ['a global named after a constant', `integer PI; ${inEntry('')}`, /previously declared within scope: PI/],
    ['a local named after a constant', inEntry('integer TRUE;'), /Syntax error: TRUE is a constant/],
    ['a parameter named after a constant', `f(float PI) {} ${inEntry('')}`, /Syntax error: PI is a constant/],
    ['a script with no states', `integer g; f() {}`, /LSL compile error.*no default state/],
    ['an empty script', ``, /LSL compile error.*no default state/],
    ['a variable then a label with one name', inEntry('integer done; @done;'), /previously declared within scope: done/],
    ['a label then a variable with one name', inEntry('@done; integer done;'), /previously declared within scope: done/],
    ['a label named after a constant', inEntry('@PI;'), /Syntax error: PI is a constant/],
    ['a label hiding an outer variable', inEntry('integer done; { @done; done = 1; }'), /Name not defined within scope: done/],
    ['calling a global variable', `integer f; ${inEntry('f();')}`, /Name not defined within scope: f/],
    ['calling a constant', inEntry('PI();'), /Name not defined within scope: PI/],
    ['calling a state', `default { state_entry() { two(); } } state two { state_entry() {} }`, /Name not defined within scope: two/],
    ['statement after the return', `integer f() { return 1; f(); } ${inEntry('')}`, /Not all code paths/],
  ]

  it.each(rejected)('rejects %s', async (_name, source, message) => {
    await expect(loadScript({ source })).rejects.toThrow(message)
  })

  const accepted: ReadonlyArray<[string, string]> = [
    ['! on an integer', inEntry('integer r = !0;')],
    ['key in a condition', inEntry('key k; if (k) {} while (k) k = NULL_KEY;')],
    ['list in a condition', inEntry('if ([1]) {}')],
    ['string assigned to key and back', inEntry('key k = "a"; string s = k; k = s;')],
    ['key passed as a string argument', inEntry('llSay(0, llGetOwner());')],
    ['integer passed as a float argument', inEntry('llSetTimerEvent(1);')],
    ['integer returned from a float function', `float f() { return 1; } ${inEntry('f();')}`],
    ['string == key', inEntry('integer i = "a" == llGetOwner();')],
    ['integer == float', inEntry('integer i = 1 == 1.0;')],
    ['list == list', inEntry('integer i = [1] == [2];')],
    ['list + anything', inEntry('list l = [] + 1 + "a" + <1,2,3> + llGetOwner(); l += 2.0;')],
    ['mixed int/float arithmetic', inEntry('float f = 1 + 2.0 * 3 / 4 - 5;')],
    ['vector * float and float * vector', inEntry('vector v = <1,2,3> * 2.0; v = 2 * v;')],
    ['vector * vector (dot product)', inEntry('float f = <1,2,3> * <4,5,6>;')],
    ['vector % vector (cross product)', inEntry('vector v = <1,0,0> % <0,1,0>;')],
    ['vector * rotation', inEntry('vector v = <1,2,3> * ZERO_ROTATION; v /= ZERO_ROTATION;')],
    ['rotation arithmetic', inEntry('rotation r; r = ZERO_ROTATION * r / r + r - r;')],
    ['integer *= float (SL quirk)', inEntry('integer i = 5; i *= 0.5;')],
    ['float += integer', inEntry('float f; f += 1;')],
    ['member access and assignment', inEntry('vector v; rotation r; v.x = 1; r.s += v.y; v.z++;')],
    ['casts SL allows', inEntry('integer i = (integer)"1"; key k = (key)"a"; list l = (list)k;')],
    ['string casts from anything', inEntry('string s = (string)<1,2,3> + (string)[1] + (string)1.0;')],
    ['constants of every type', inEntry('float f = PI; vector v = ZERO_VECTOR; key k = NULL_KEY;')],
    ['calling a function declared later', `g() { f(1); } f(float x) {} ${inEntry('g();')}`],
    ['globals used in functions', `integer n; f() { n++; } ${inEntry('f();')}`],
    ['parameter shadowing a global', `integer n; f(string n) { n += "a"; } ${inEntry('f("");')}`],
    ['unknown function left to script.mock', inEntry('integer i = llNotARealFunction(1) + 1;')],
    ['unknown functions named like Object.prototype keys', inEntry('toString(); constructor(1); hasOwnProperty("a");')],
    ['script names matching Object.prototype keys', `integer constructor; toString(integer valueOf) { integer hasOwnProperty; } ${inEntry('toString(constructor);')}`],
    ['returning an unknown function inside an if', inEntry('if (TRUE) return llCustomVoid();')],
    ['state change to a declared state', `default { state_entry() { state two; } } state two { state_entry() {} }`],
    ['event parameters matching the spec', `default { listen(integer c, string n, key id, string m) {} }`],
    ['bare return from an event', inEntry('return;')],
    ['state change in an if without an else, in a function (SL quirk)', `f(integer a) { if (a) state two; } default { state_entry() {} } state two { state_entry() {} }`],
    ['state change in a loop, in a function (SL quirk)', `f(integer a) { while (a) state two; } default { state_entry() {} } state two { state_entry() {} }`],
    ['state change anywhere in an event', `default { state_entry() { state two; } } state two { state_entry() { if (TRUE) state default; else state two; } }`],
    ['return of a void call inside an if (SL quirk)', inEntry('if (TRUE) return llSay(0, "");')],
    ['jumps forward, backward and out of a block', inEntry('@top; jump bottom; { jump top; } @bottom;')],
    ['a label in an unbraced loop body', inEntry('while (FALSE) @l; jump l;')],
    ['the same label name in different handlers', `default { state_entry() { @a; jump a; } timer() { @a; jump a; } }`],
    ['a label and a variable with one name in different blocks', inEntry('integer done; { @other; } { integer x; @x2; }')],
    ['a variable used before an inner label with its name', inEntry('integer done; { done = 1; @done; }')],
    ['a local variable shadowing a callable global function', `f() {} ${inEntry('integer f; f();')}`],
    ['member access on a variable', inEntry('vector v; rotation r; float f = v.x + r.s;')],
    ['list and void elements (SL fails these at runtime)', inEntry('list x; list y = [x, llSay(0, "")];')],
    ['globals from literals, constants and earlier globals', `integer a = -1; float b = a; vector v = <a, -2.5, PI>; list l = [a, "s", v, NULL_KEY]; ${inEntry('')}`],
    ['a local shadowing a global', `integer n; ${inEntry('n = 1; { integer n = 2; }')}`],
    ['a local shadowing an outer local', inEntry('integer x; { string x; }')],
    ['a local reusing a parameter name', `f(integer a) { integer a; } ${inEntry('f(1);')}`],
    ['if/else that returns on both branches', `integer f(integer a) { if (a) return 1; else { return 2; } } ${inEntry('f(1);')}`],
    ['a typed function ending in a nested block return', `integer f() { { return 1; } } ${inEntry('f();')}`],
  ]

  it.each(accepted)('accepts %s', async (_name, source) => {
    await expect(loadScript({ source })).resolves.toBeDefined()
  })

  it('treats an unmocked toString() as an unknown LSL function at runtime', async () => {
    const s = await loadScript({ source: `default { state_entry() { toString(); } }` })
    expect(() => s.start()).toThrow(/unknown LSL function 'toString'/)
  })
})
