import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { parse } from '@rezless/parser'
import { Script } from '@rezless/vm'

function tmpdir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const dir = tmpdir('rezless-cli-')
const lslFile = path.join(dir, 'a.lsl')
const sluaFile = path.join(dir, 'b.luau')
const LSL = 'default { state_entry() { llSay(0, "hi"); } }'
const SLUA = 'll.Say(0, "hi")'
fs.writeFileSync(lslFile, LSL)
fs.writeFileSync(sluaFile, SLUA)

function lslReport() {
  const s = new Script(parse(LSL, lslFile).script, { filename: lslFile, source: LSL, coverage: true })
  s.start()
  return s.coverage!
}

function sluaReport() {
  const s = Script.fromSlua(SLUA, { filename: sluaFile, source: SLUA, coverage: true })
  s.start()
  return s.coverage!
}

/** Run the rezless-coverage CLI in this process, as `node cli.js ...args` would. */
async function runCli(args: string[]): Promise<string> {
  const argv = process.argv
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try {
    process.argv = ['node', 'rezless-coverage', ...args]
    vi.resetModules()
    await import('../src/cli.js')
    return write.mock.calls.map((c) => String(c[0])).join('')
  } finally {
    process.argv = argv
    write.mockRestore()
  }
}

describe('rezless-coverage CLI', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes LSL and SLua scripts to separate directories', async () => {
    const dumps = tmpdir('rezless-cli-dumps-')
    const lsl = path.join(dir, 'out-lsl')
    const slua = path.join(dir, 'out-slua')
    fs.writeFileSync(path.join(dumps, 'w.json'), JSON.stringify([lslReport(), sluaReport()]))
    const out = await runCli(['--dump-dir', dumps, '-o', lsl, '--slua-output', slua])
    expect(fs.readFileSync(path.join(lsl, 'lcov.info'), 'utf8')).toContain('a.lsl')
    expect(fs.readFileSync(path.join(lsl, 'lcov.info'), 'utf8')).not.toContain('b.luau')
    expect(fs.readFileSync(path.join(slua, 'lcov.info'), 'utf8')).toContain('b.luau')
    expect(out).toContain(`Wrote ${path.join(slua, 'lcov.info')}`)
    // Dumps are consumed unless --keep-dumps.
    expect(fs.readdirSync(dumps)).toEqual([])
  })

  it('writes only the languages it has reports for', async () => {
    const dumps = tmpdir('rezless-cli-dumps-')
    const lsl = path.join(dir, 'only-lsl')
    const slua = path.join(dir, 'only-slua')
    fs.writeFileSync(path.join(dumps, 'w.json'), JSON.stringify([lslReport()]))
    const out = await runCli(['--dump-dir', dumps, '-o', lsl, '--slua-output', slua, '--silent'])
    expect(fs.existsSync(path.join(lsl, 'lcov.info'))).toBe(true)
    expect(fs.existsSync(slua)).toBe(false)
    expect(out).toBe('')
  })

  it('writes no LSL directory when only SLua ran', async () => {
    const dumps = tmpdir('rezless-cli-dumps-')
    const lsl = path.join(dir, 'none-lsl')
    const slua = path.join(dir, 'some-slua')
    fs.writeFileSync(path.join(dumps, 'w.json'), JSON.stringify([sluaReport()]))
    await runCli(['--dump-dir', dumps, '-o', lsl, '--slua-output', slua, '--silent'])
    expect(fs.existsSync(lsl)).toBe(false)
    expect(fs.existsSync(path.join(slua, 'lcov.info'))).toBe(true)
  })
})
