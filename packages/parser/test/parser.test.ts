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

  it('parses scientific-notation floats', () => {
    const { tokens, diagnostics } = lex(`1e3 2.5E-2 1.0e+1`, 'inline.lsl')
    expect(diagnostics).toEqual([])
    expect(tokens.slice(0, 3)).toMatchObject([
      { kind: 'float', value: 1000 },
      { kind: 'float', value: 0.025 },
      { kind: 'float', value: 10 },
    ])
  })

  it('parses floats with the trailing f suffix', () => {
    const { tokens } = lex(`3.14f 7F`, 'inline.lsl')
    // The lexer captures the parsed numeric value but does NOT include the
    // `f`/`F` suffix in `text` — pin that down so the divergence between
    // raw source and `text` doesn't drift unnoticed.
    expect(tokens[0]).toMatchObject({ kind: 'float', text: '3.14', value: 3.14 })
    expect(tokens[1]).toMatchObject({ kind: 'float', text: '7', value: 7 })
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
