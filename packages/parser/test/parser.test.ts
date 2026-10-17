import { describe, it, expect } from 'vitest'
import { parse, lex } from '../src/index.js'

describe('parser — Phase 1 minimum', () => {
  it('parses default { state_entry() { llSay(0, "hi"); } }', () => {
    const { script, diagnostics } = parse(
      `default { state_entry() { llSay(0, "hi"); } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    expect(script.states).toHaveLength(1)
    const s = script.states[0]!
    expect(s.name).toBe('default')
    expect(s.handlers).toHaveLength(1)
    const h = s.handlers[0]!
    expect(h.name).toBe('state_entry')
    expect(h.params).toEqual([])
    expect(h.body.kind).toBe('BlockStatement')
    expect(h.body.body).toHaveLength(1)
    const stmt = h.body.body[0]!
    expect(stmt.kind).toBe('ExpressionStatement')
    if (stmt.kind !== 'ExpressionStatement') return
    expect(stmt.expression.kind).toBe('CallExpression')
    if (stmt.expression.kind !== 'CallExpression') return
    expect(stmt.expression.callee).toBe('llSay')
    expect(stmt.expression.args).toHaveLength(2)
    expect(stmt.expression.args[0]).toMatchObject({ kind: 'IntegerLiteral', value: 0 })
    expect(stmt.expression.args[1]).toMatchObject({ kind: 'StringLiteral', value: 'hi' })
  })

  it('parses an event with typed parameters', () => {
    const { script, diagnostics } = parse(
      `default { touch_start(integer num) { llSay(0, "ouch"); } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    const h = script.states[0]!.handlers[0]!
    expect(h.params).toMatchObject([{ typeName: 'integer', name: 'num' }])
  })

  it('handles line/block comments and whitespace', () => {
    const { script, diagnostics } = parse(
      `// hello
      default { /* multi
        line */ state_entry() { llSay(0, "hi"); } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    expect(script.states).toHaveLength(1)
  })

  it('reports a diagnostic with file:line:col on missing semicolon', () => {
    const { diagnostics } = parse(
      `default { state_entry() { llSay(0, "hi") } }`,
      'inline.lsl',
    )
    expect(diagnostics.length).toBeGreaterThan(0)
    const d = diagnostics[0]!
    expect(d.severity).toBe('error')
    expect(d.filename).toBe('inline.lsl')
    expect(d.message).toMatch(/expected ';'/)
    expect(d.loc.line).toBe(1)
  })
})

describe('lexer — number literals', () => {
  it('parses hex integer literals (0x..)', () => {
    const { tokens, diagnostics } = lex(`0x1A 0XFf 0x0`, 'inline.lsl')
    expect(diagnostics).toEqual([])
    expect(tokens.slice(0, 3)).toMatchObject([
      { kind: 'integer', value: 0x1a },
      { kind: 'integer', value: 0xff },
      { kind: 'integer', value: 0 },
    ])
  })

  it('reports a diagnostic for bare 0x with no hex digits', () => {
    const { tokens, diagnostics } = lex(`0x;`, 'inline.lsl')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.message).toMatch(/malformed hex literal/)
    // Token still emitted with value 0 so the parser can keep going.
    expect(tokens[0]).toMatchObject({ kind: 'integer', text: '0x', value: 0 })
  })

  it('does not consume an incomplete exponent (1e / 1e+)', () => {
    // `1e;` must lex as integer 1 + identifier `e`, not a malformed float
    // with text "1e" and value 1 — that disagreement bit us when text was
    // used to round-trip the literal.
    const a = lex(`1e;`, 'inline.lsl')
    expect(a.diagnostics).toEqual([])
    expect(a.tokens.slice(0, 2)).toMatchObject([
      { kind: 'integer', text: '1', value: 1 },
      { kind: 'identifier', text: 'e' },
    ])

    // `1e+;` — the `+` only counts as part of the exponent if a digit
    // follows. With none, all three lex separately.
    const b = lex(`1e+;`, 'inline.lsl')
    expect(b.diagnostics).toEqual([])
    expect(b.tokens.slice(0, 3)).toMatchObject([
      { kind: 'integer', text: '1', value: 1 },
      { kind: 'identifier', text: 'e' },
      { kind: 'op', text: '+' },
    ])

    // Sanity: a well-formed exponent still works.
    const c = lex(`1e2`, 'inline.lsl')
    expect(c.tokens[0]).toMatchObject({ kind: 'float', text: '1e2', value: 100 })
  })

  it('parses scientific-notation floats', () => {
    const { tokens, diagnostics } = lex(`1e3 2.5E-2 1.0e+1`, 'inline.lsl')
    expect(diagnostics).toEqual([])
    expect(tokens.slice(0, 3)).toMatchObject([
      { kind: 'float', value: 1000 },
      { kind: 'float', value: Math.fround(0.025) },
      { kind: 'float', value: 10 },
    ])
  })

  it('accepts an f/F suffix only on floats with a decimal point', () => {
    const { tokens, diagnostics } = lex(`3.14f 2.F .5f 1e5f 7F`, 'inline.lsl')
    expect(diagnostics).toEqual([])
    expect(tokens.slice(0, 7)).toMatchObject([
      { kind: 'float', text: '3.14f', value: Math.fround(3.14) },
      { kind: 'float', text: '2.F', value: 2 },
      { kind: 'float', text: '.5f', value: 0.5 },
      // Without a decimal point the suffix isn't part of the number.
      { kind: 'float', text: '1e5', value: 100000 },
      { kind: 'identifier', text: 'f' },
      { kind: 'integer', text: '7', value: 7 },
      { kind: 'identifier', text: 'F' },
    ])
  })

  it('wraps integer literals to 32 bits and makes ones above 0xFFFFFFFF -1', () => {
    const { tokens, diagnostics } = lex(
      `3000000000 4294967295 4294967296 99999999999 0xFFFFFFFF 0x80000000 0x123456789 0x000000001`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    expect(tokens.slice(0, 8).map((t) => t.value)).toEqual([
      -1294967296, -1, -1, -1, -1, -2147483648, -1, 1,
    ])
  })

  it('rounds float literals to 32 bits', () => {
    const { tokens, diagnostics } = lex(`16777217.0 0.1`, 'inline.lsl')
    expect(diagnostics).toEqual([])
    expect(tokens.slice(0, 2).map((t) => t.value)).toEqual([
      16777216,
      Math.fround(0.1),
    ])
  })

  it('parses leading-dot floats (.5)', () => {
    const { tokens } = lex(`.25`, 'inline.lsl')
    expect(tokens[0]).toMatchObject({ kind: 'float', value: 0.25 })
  })

  it('threads number literals through the parser as globals', () => {
    const { script, diagnostics } = parse(
      `integer h = 0xFF; float e = 1e3; default { state_entry() {} }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    expect(script.globals).toHaveLength(2)
    expect(script.globals[0]!.init).toMatchObject({ kind: 'IntegerLiteral', value: 0xff })
    expect(script.globals[1]!.init).toMatchObject({ kind: 'FloatLiteral', value: 1000 })
  })
})

describe('lexer — strings & comments', () => {
  it('decodes \\n, \\t, \\\\, \\" escape sequences', () => {
    const { tokens } = lex(`"a\\nb\\tc\\\\d\\"e"`, 'inline.lsl')
    expect(tokens[0]).toMatchObject({ kind: 'string', value: 'a\nb\tc\\d"e' })
  })

  it('passes unknown escapes through verbatim', () => {
    const { tokens } = lex(`"hi\\q"`, 'inline.lsl')
    expect(tokens[0]).toMatchObject({ kind: 'string', value: 'hiq' })
  })

  it('reports an unterminated string literal', () => {
    const { diagnostics } = lex(`"oops`, 'inline.lsl')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.message).toMatch(/unterminated string/)
  })

  it('skips block comments and reports unterminated ones', () => {
    const ok = lex(`/* one *//* two */ x`, 'inline.lsl')
    expect(ok.diagnostics).toEqual([])
    expect(ok.tokens.find((t) => t.text === 'x')?.kind).toBe('identifier')

    const bad = lex(`/* never closes`, 'inline.lsl')
    expect(bad.diagnostics).toHaveLength(1)
    expect(bad.diagnostics[0]!.message).toMatch(/unterminated block comment/)
  })

  it('flags unexpected characters', () => {
    const { diagnostics } = lex(`integer x = \`;`, 'inline.lsl')
    expect(diagnostics.some((d) => /unexpected character/.test(d.message))).toBe(true)
  })
})

describe('lexer — operators & punctuation', () => {
  it('recognises multi-char operators (<<=, >>=, &&, ||, ==, !=, <=, >=)', () => {
    const { tokens } = lex(`<<= >>= && || == != <= >= ++ -- += -= *= /= %=`, 'inline.lsl')
    const opTexts = tokens.filter((t) => t.kind === 'op').map((t) => t.text)
    expect(opTexts).toEqual([
      '<<=', '>>=', '&&', '||', '==', '!=', '<=', '>=',
      '++', '--', '+=', '-=', '*=', '/=', '%=',
    ])
  })

  it('falls back to single-char operators (^, ~, !, |, &)', () => {
    const { tokens } = lex(`^ ~ ! | &`, 'inline.lsl')
    expect(tokens.filter((t) => t.kind === 'op').map((t) => t.text)).toEqual([
      '^', '~', '!', '|', '&',
    ])
  })
})

describe('parser — error recovery', () => {
  it('recovers at the next top-level declaration after a broken state', () => {
    // Garbage between `default` and `state hello`; the parser should give up
    // on the broken block and still pick up the second state.
    const { script, diagnostics } = parse(
      `default { @@@ }
       state hello { state_entry() { llSay(0, "hi"); } }`,
      'inline.lsl',
    )
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(script.states.map((s) => s.name)).toContain('hello')
  })

  it('recovers at the next semicolon inside a block and keeps later statements', () => {
    const { script, diagnostics } = parse(
      `default {
         state_entry() {
           llSay(0 "missing comma");
           llSay(0, "after");
         }
       }`,
      'inline.lsl',
    )
    expect(diagnostics.length).toBeGreaterThan(0)
    const handler = script.states[0]!.handlers[0]!
    // The recovery path consumes through the `;`, so the second llSay must
    // still parse as an ExpressionStatement.
    const lastStmt = handler.body.body[handler.body.body.length - 1]!
    expect(lastStmt.kind).toBe('ExpressionStatement')
  })
})

describe('parser — unary operators before casts', () => {
  const firstExpr = (expr: string) => {
    const { script, diagnostics } = parse(
      `default { state_entry() { string s = "0"; ${expr}; } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    const stmt = script.states[0]!.handlers[0]!.body.body[1]!
    if (stmt.kind !== 'ExpressionStatement') throw new Error(stmt.kind)
    return stmt.expression
  }

  it.each(['!', '-', '~'])('parses %s(integer)s as a unary over a cast', (op) => {
    expect(firstExpr(`${op}(integer)s`)).toMatchObject({
      kind: 'UnaryExpression',
      operator: op,
      argument: { kind: 'CastExpression', targetType: 'integer' },
    })
  })

  it.each(['+1', '+(integer)s', 'integer i = +1'])('rejects unary + in %s', (expr) => {
    const { diagnostics } = parse(
      `default { state_entry() { string s = "0"; ${expr}; } }`,
      'inline.lsl',
    )
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('parses !(float)s', () => {
    expect(firstExpr('!(float)s')).toMatchObject({
      kind: 'UnaryExpression',
      operator: '!',
      argument: { kind: 'CastExpression', targetType: 'float' },
    })
  })
})

describe('parser — cast operands', () => {
  const parseBody = (body: string) =>
    parse(
      `default { state_entry() { integer x = 1; vector v; ${body} } }`,
      'inline.lsl',
    )

  it.each([
    ['a unary minus', 'string a = (string)-x;'],
    ['a logical not', 'integer b = (integer)!x;'],
    ['a bitwise not', 'integer b = (integer)~x;'],
    ['a prefix increment', 'string a = (string)++x;'],
    ['another cast', 'string c = (string)(integer)"1";'],
    ['a minus before a non-literal', 'string a = (string)-v.x;'],
  ])('rejects %s after a cast', (_, body) => {
    expect(parseBody(body).diagnostics.length).toBeGreaterThan(0)
  })

  it.each([
    ['a negative integer literal', 'integer d = (integer)-1;'],
    ['a negative float literal', 'integer d = (integer)-3.7;'],
    ['a member access', 'string e = (string)v.x;'],
    ['a postfix increment', 'string e = (string)x++;'],
    ['a parenthesised unary', 'string a = (string)(-x);'],
    ['a parenthesised cast', 'string c = (string)((integer)"1");'],
    ['a call', 'string e = (string)llGetUnixTime();'],
    ['a list literal', 'string e = (string)[1, 2];'],
    ['a vector literal', 'string e = (string)<1, 2, 3>;'],
  ])('accepts %s after a cast', (_, body) => {
    expect(parseBody(body).diagnostics).toEqual([])
  })

  it('parses (integer)-1 as a cast of a negated literal', () => {
    const stmt = parseBody('integer d = (integer)-1;').script.states[0]!.handlers[0]!.body.body[2]!
    expect(stmt).toMatchObject({
      kind: 'VariableDeclaration',
      init: {
        kind: 'CastExpression',
        targetType: 'integer',
        argument: { kind: 'UnaryExpression', operator: '-', argument: { kind: 'IntegerLiteral', value: 1 } },
      },
    })
  })
})

describe('parser — quaternion is another name for rotation', () => {
  it('accepts quaternion wherever a type name goes and reads it as rotation', () => {
    const { script, diagnostics } = parse(
      `quaternion g;
       quaternion f(quaternion p) { return p; }
       default { state_entry() { quaternion q = (quaternion)"<0,0,0,1>"; } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
    expect(script.globals[0]).toMatchObject({ typeName: 'rotation', name: 'g' })
    expect(script.functions[0]).toMatchObject({
      returnType: 'rotation',
      params: [{ typeName: 'rotation', name: 'p' }],
    })
    expect(script.states[0]!.handlers[0]!.body.body[0]).toMatchObject({
      kind: 'VariableDeclaration',
      typeName: 'rotation',
      init: { kind: 'CastExpression', targetType: 'rotation' },
    })
  })
})

describe('parser — event names are reserved', () => {
  const cases: Array<[string, string]> = [
    ['global variable', `integer attach = 2; default { state_entry() {} }`],
    ['parameter', `f(integer changed) {} default { state_entry() {} }`],
    ['local variable', `default { state_entry() { integer timer = 1; } }`],
    ['function', `listen() {} default { state_entry() {} }`],
    ['state', `default { state_entry() {} } state link_message { state_entry() {} }`],
    ['label', `default { state_entry() { @state_entry; } }`],
    ['jump target', `default { state_entry() { jump touch_start; } }`],
    ['state change target', `default { state_entry() { state attach; } }`],
    ['variable reference', `integer x = attach; default { state_entry() {} }`],
    ['function call', `default { state_entry() { timer(); } }`],
  ]

  it.each(cases)('rejects an event name as a %s name', (_what, source) => {
    const { diagnostics } = parse(source, 'inline.lsl')
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics[0]!.message).toMatch(/is an event name/)
  })

  it('still accepts names that merely contain an event name', () => {
    const { diagnostics } = parse(
      `integer attached = 2; default { state_entry() { integer timers = attached; } }`,
      'inline.lsl',
    )
    expect(diagnostics).toEqual([])
  })
})

describe('parser — > inside vector and rotation literals', () => {
  const parseBody = (body: string) =>
    parse(
      `default { state_entry() { integer a = 1; integer b = 2; vector v; ${body} } }`,
      'inline.lsl',
    )
  const init = (body: string) => {
    const { script, diagnostics } = parseBody(body)
    expect(diagnostics).toEqual([])
    const stmt = script.states[0]!.handlers[0]!.body.body[3]!
    if (stmt.kind !== 'VariableDeclaration') throw new Error(stmt.kind)
    return stmt.init
  }
  const gt = { kind: 'BinaryExpression', operator: '>' }

  it('reads > in the last vector component as greater-than', () => {
    expect(init('vector w = <2, 2, 2 > 1>;')).toMatchObject({
      kind: 'VectorLiteral',
      z: { ...gt, left: { value: 2 }, right: { value: 1 } },
    })
  })

  it('reads > in the last rotation component as greater-than', () => {
    expect(init('rotation r = <1, 2, 3, a > b>;')).toMatchObject({ kind: 'RotationLiteral', s: gt })
  })

  it('takes full expressions before a comma', () => {
    expect(init('vector w = <2, 2 == 2, 2>;')).toMatchObject({
      kind: 'VectorLiteral',
      y: { kind: 'BinaryExpression', operator: '==' },
    })
    expect(init('rotation r = <a < b, a > b, a == b, 1>;')).toMatchObject({
      kind: 'RotationLiteral',
      x: { operator: '<' },
      y: gt,
      z: { operator: '==' },
    })
    expect(init('rotation r = <1, 2, a > b && b, 1>;')).toMatchObject({
      kind: 'RotationLiteral',
      z: { operator: '&&', left: gt },
    })
  })

  it('closes the literal at a > that no operand follows', () => {
    expect(init('vector w = <1, 2, 3> * 2;')).toMatchObject({ kind: 'BinaryExpression', operator: '*' })
    expect(init('vector w = <1, 2, 3> - v;')).toMatchObject({ kind: 'BinaryExpression', operator: '-' })
    expect(init('integer c = <1, 2, 3> == v;')).toMatchObject({ kind: 'BinaryExpression', operator: '==' })
  })

  it('closes a vector at > followed by - even where a comma comes later', () => {
    expect(init('list l = [<1, 2, 3> - v, 1];')).toMatchObject({
      kind: 'ListLiteral',
      elements: [{ kind: 'BinaryExpression', operator: '-', left: { kind: 'VectorLiteral' } }, { value: 1 }],
    })
  })

  it.each([
    ['== in the last vector component', 'vector w = <1, 1, 2 == 2>;'],
    ['== in the last rotation component', 'rotation r = <1, 1, 1, 2 == 2>;'],
    ['a comparison chain ending in ==', 'vector w = <1, 2, 3 > 4 == 5>;'],
  ])('rejects %s', (_, body) => {
    expect(parseBody(body).diagnostics.length).toBeGreaterThan(0)
  })
})
