import { describe, expect, it } from 'vitest'
import { Experience } from '@rezless/vm'
import { loadLinkset, loadScript } from '../src/index.js'

// Fixture controls preserve the key-value dataserver format used by the builtins.
async function load(experience: Experience, body: string) {
  const s = await loadScript({
    experience,
    source: `list got; list queries; default {
      state_entry() { ${body} }
      dataserver(key q, string d) { queries += [q]; got += [d]; }
    }`,
  })
  s.start()
  return s
}

describe('Experience key-value controls', () => {
  it('rejects invalid release counts without discarding pending answers', async () => {
    const x = new Experience()
    x.hold()
    const s = await load(x, 'llKeyCountKeyValue();')
    for (const n of [-1, 0.5, NaN, Infinity]) expect(() => x.release(n)).toThrow(RangeError)
    x.release()
    s.advanceTime(0)
    expect(s.global('got')).toEqual(['1,0'])
  })

  it('requires a positive integer error code', () => {
    const x = new Experience()
    for (const n of [0, -1, 0.5, NaN, Infinity]) expect(() => x.failNext(n)).toThrow(RangeError)
  })

  it.each([
    'llCreateKeyValue("a", "new")',
    'llReadKeyValue("a")',
    'llUpdateKeyValue("a", "new", FALSE, "")',
    'llDeleteKeyValue("a")',
    'llKeyCountKeyValue()',
    'llKeysKeyValue(0, 0)',
    'llDataSizeKeyValue()',
  ])('fails only the next request: %s', async (call) => {
    const x = new Experience()
    x.seed([['a', 'old']])
    x.failNext(17)
    const s = await load(x, `${call}; llReadKeyValue("a");`)
    expect(s.global('got')).toEqual(['0,17', '1,old'])
    expect([...x.store]).toEqual([['a', 'old']])
    expect(s.global('queries')).toEqual(s.dataserverRequests.map((r) => r.key))
    expect(s.dataserverRequests.every((r) => r.fulfilled)).toBe(true)
  })

  it('keeps a matching failure until that request arrives, then consumes it once', async () => {
    const x = new Experience()
    x.failNext(1, (r) => r.source === 'create_key_value' && r.args[0] === 'b')
    x.failNext(15)
    const s = await load(x, `llCreateKeyValue("a", "one"); llReadKeyValue("a");
      llCreateKeyValue("b", "two"); llCreateKeyValue("b", "retry");`)
    expect(s.global('got')).toEqual(['0,15', '0,14', '0,1', '1,retry'])
    expect([...x.store]).toEqual([['b', 'retry']])
  })

  it('defers writes and reads, releases in order, and resumes automatic answers', async () => {
    const x = new Experience()
    x.hold()
    const s = await load(x, 'llCreateKeyValue("a", "one"); llReadKeyValue("a"); llDeleteKeyValue("a");')
    expect(s.global('got')).toEqual([])
    expect(x.store.size).toBe(0)
    expect(s.dataserverRequests.map((r) => r.fulfilled)).toEqual([false, false, false])
    s.advanceTime(100)
    x.release(1)
    expect(x.store.get('a')).toBe('one')
    expect(s.dataserverRequests.map((r) => r.fulfilled)).toEqual([true, false, false])
    s.advanceTime(0)
    expect(s.global('got')).toEqual(['1,one'])
    x.release()
    expect(x.store.size).toBe(0)
    s.advanceTime(0)
    expect(s.global('got')).toEqual(['1,one', '1,one', '1,delete'])
    expect(s.global('queries')).toEqual(s.dataserverRequests.map((r) => r.key))
    const next = await load(x, 'llKeyCountKeyValue();')
    expect(next.global('got')).toEqual(['1,0'])
  })

  it('checks competing writes from separate scripts against the store at release', async () => {
    const x = new Experience()
    x.seed([['a', 'old']])
    x.hold()
    const a = await load(x, 'llUpdateKeyValue("a", "first", TRUE, "old");')
    const b = await load(x, 'llUpdateKeyValue("a", "second", TRUE, "old");')
    expect(x.store.get('a')).toBe('old')
    x.release(1)
    a.advanceTime(0)
    expect(a.global('got')).toEqual(['1,first'])
    expect(b.global('got')).toEqual([])
    x.release()
    b.advanceTime(0)
    expect(b.global('got')).toEqual(['0,15'])
    expect(x.store.get('a')).toBe('first')
  })

  it('selects failures when requested and prevents a held failed write from changing the store', async () => {
    const x = new Experience()
    x.hold()
    x.failNext(17)
    const a = await load(x, 'llCreateKeyValue("a", "failed");')
    x.failNext(1)
    const b = await load(x, 'llCreateKeyValue("b", "failed"); llCreateKeyValue("c", "ok");')
    x.release()
    a.advanceTime(0)
    b.advanceTime(0)
    expect(a.global('got')).toEqual(['0,17'])
    expect(b.global('got')).toEqual(['0,1', '1,ok'])
    expect([...x.store]).toEqual([['c', 'ok']])
  })

  it('allows empty and zero-count releases without answering held requests', async () => {
    const x = new Experience()
    x.release()
    x.hold()
    x.release(1)
    const s = await load(x, 'llKeyCountKeyValue();')
    x.release(0)
    s.advanceTime(0)
    expect(s.global('got')).toEqual([])
    x.release()
    s.advanceTime(0)
    expect(s.global('got')).toEqual(['1,0'])
  })

  it('broadcasts released answers to every script in the requesting prim', async () => {
    const x = new Experience()
    x.hold()
    const { scripts } = await loadLinkset({ prims: [{ scripts: [
      { name: 'listener', source: { source: 'list got; default { dataserver(key q, string d) { got += [d]; } }' } },
      { name: 'writer', experience: x, source: { source: 'default { state_entry() { llCreateKeyValue("a", "value"); } }' } },
    ] }] })
    scripts.listener!.start()
    scripts.writer!.start()
    expect(scripts.listener!.global('got')).toEqual([])
    x.release()
    scripts.writer!.advanceTime(0)
    expect(scripts.listener!.global('got')).toEqual(['1,value'])
  })
})
