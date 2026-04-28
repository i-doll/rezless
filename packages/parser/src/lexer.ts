import type { SourceLocation, Diagnostic } from './diagnostics.js'

export type TokenKind =
  // literals
  | 'integer'
  | 'float'
  | 'string'
  // identifiers / keywords
  | 'identifier'
  | 'keyword'
  // punctuation
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'semi'
  | 'dot'
  | 'colon'
  | 'at'
  // operators (kept as raw text so the parser can disambiguate later)
  | 'op'
  // end of input
  | 'eof'

export interface Token {
  readonly kind: TokenKind
  readonly text: string
  readonly loc: SourceLocation
  /** For 'integer'/'float'/'string' tokens, the parsed value. */
  readonly value?: number | string
}

const KEYWORDS = new Set([
  // types (also valid as identifiers in cast expressions; parser disambiguates)
  'integer',
  'float',
  'string',
  'key',
  'vector',
  'rotation',
  'quaternion',
  'list',
  // control flow + structure
  'default',
  'state',
  'if',
  'else',
  'while',
  'do',
  'for',
  'return',
  'jump',
])

const PUNCT_MAP: Record<string, TokenKind> = {
  '(': 'lparen',
  ')': 'rparen',
  '{': 'lbrace',
  '}': 'rbrace',
  '[': 'lbracket',
  ']': 'rbracket',
  ',': 'comma',
  ';': 'semi',
  '.': 'dot',
  ':': 'colon',
  '@': 'at',
}

// Multi-char operators recognised early; single-char fall back to 'op'.
const MULTI_OPS = [
  '<<=',
  '>>=',
  '<<',
  '>>',
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
] as const

const SINGLE_OPS = new Set(['+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~'])

export function lex(
  source: string,
  filename: string,
): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = []
  const diagnostics: Diagnostic[] = []
  let i = 0
  let line = 1
  let col = 1

  function loc(): SourceLocation {
    return { line, col, offset: i }
  }

  function advance(n = 1): void {
    for (let k = 0; k < n; k++) {
      const ch = source[i++]
      if (ch === '\n') {
        line++
        col = 1
      } else {
        col++
      }
    }
  }

  function pushErr(message: string, at: SourceLocation): void {
    diagnostics.push({ severity: 'error', message, filename, loc: at })
  }

  while (i < source.length) {
    const ch = source[i]!
    const start = loc()

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance()
      continue
    }

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance()
      continue
    }

    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      advance(2)
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        advance()
      }
      if (i >= source.length) {
        pushErr('unterminated block comment', start)
      } else {
        advance(2)
      }
      continue
    }

    // String literal — LSL uses double-quoted strings with `\\`, `\"`, `\n`, `\t`
    if (ch === '"') {
      advance()
      let value = ''
      while (i < source.length && source[i] !== '"') {
        const c = source[i]!
        if (c === '\\') {
          advance()
          const esc = source[i]
          if (esc === undefined) break
          if (esc === 'n') value += '\n'
          else if (esc === 't') value += '\t'
          else if (esc === '\\') value += '\\'
          else if (esc === '"') value += '"'
          else value += esc
          advance()
        } else {
          value += c
          advance()
        }
      }
      if (i >= source.length) {
        pushErr('unterminated string literal', start)
      } else {
        advance() // closing quote
      }
      tokens.push({
        kind: 'string',
        text: source.slice(start.offset, i),
        loc: start,
        value,
      })
      continue
    }

    // Number literal — integer or float
    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] ?? ''))) {
      let s = ''
      // Hex
      if (ch === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
        s += source[i] // 0
        s += source[i + 1] // x
        advance(2)
        const digitsStart = s.length
        while (i < source.length && /[0-9a-fA-F]/.test(source[i]!)) {
          s += source[i]
          advance()
        }
        // Bare `0x` with no hex digits is malformed. Emit a diagnostic and
        // emit a zero-valued token so downstream code never sees NaN.
        if (s.length === digitsStart) {
          pushErr('malformed hex literal — expected at least one hex digit after 0x', start)
          tokens.push({ kind: 'integer', text: s, loc: start, value: 0 })
        } else {
          tokens.push({ kind: 'integer', text: s, loc: start, value: Number.parseInt(s, 16) })
        }
        continue
      }
      let isFloat = false
      while (i < source.length && isDigit(source[i]!)) {
        s += source[i]
        advance()
      }
      if (source[i] === '.') {
        isFloat = true
        s += '.'
        advance()
        while (i < source.length && isDigit(source[i]!)) {
          s += source[i]
          advance()
        }
      }
      // Exponent. Peek ahead before committing — only treat `e` as an
      // exponent marker if at least one digit (with optional sign in
      // between) actually follows. `1e;` → integer 1 + identifier `e`,
      // not a malformed float with text/value disagreement.
      if (source[i] === 'e' || source[i] === 'E') {
        let j = i + 1
        if (source[j] === '+' || source[j] === '-') j++
        if (j < source.length && isDigit(source[j]!)) {
          isFloat = true
          s += source[i]
          advance()
          if (source[i] === '+' || source[i] === '-') {
            s += source[i]
            advance()
          }
          while (i < source.length && isDigit(source[i]!)) {
            s += source[i]
            advance()
          }
        }
      }
      // No `f`/`F` suffix support — the Linden Lab LSL compiler doesn't
      // accept it. A trailing `f` after a number is left for the next pass
      // to lex as an identifier (or a diagnostic if it's invalid in
      // context), matching official LSL behaviour.
      tokens.push({
        kind: isFloat ? 'float' : 'integer',
        text: s,
        loc: start,
        value: isFloat ? Number.parseFloat(s) : Number.parseInt(s, 10),
      })
      continue
    }

    // Identifier / keyword
    if (isIdStart(ch)) {
      let s = ''
      while (i < source.length && isIdCont(source[i]!)) {
        s += source[i]
        advance()
      }
      const kind: TokenKind = KEYWORDS.has(s) ? 'keyword' : 'identifier'
      tokens.push({ kind, text: s, loc: start })
      continue
    }

    // Punctuation
    if (PUNCT_MAP[ch]) {
      tokens.push({ kind: PUNCT_MAP[ch], text: ch, loc: start })
      advance()
      continue
    }

    // Operators (multi-char first)
    let matched = false
    for (const op of MULTI_OPS) {
      if (source.startsWith(op, i)) {
        tokens.push({ kind: 'op', text: op, loc: start })
        advance(op.length)
        matched = true
        break
      }
    }
    if (matched) continue
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ kind: 'op', text: ch, loc: start })
      advance()
      continue
    }

    pushErr(`unexpected character '${ch}'`, start)
    advance()
  }

  tokens.push({ kind: 'eof', text: '', loc: loc() })
  return { tokens, diagnostics }
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}
function isIdStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'
}
function isIdCont(ch: string): boolean {
  return isIdStart(ch) || isDigit(ch)
}
