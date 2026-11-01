import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Experience, loadScript } from '@rezless/vitest'

const source = readFileSync(new URL('./visitor-counter.lsl', import.meta.url), 'utf8')

async function fixture() {
  const experience = new Experience({ name: 'Visitor board' })
  experience.seed([['visitors', '12'], ['tours', '3']])
  const script = await loadScript({ source, experience })
  script.start()
  const visit = (counter = 'visitors') => {
    script.host.description = counter
    script.fire('touch_start', { num_detected: 1 })
  }
  return { experience, script, visit }
}

describe('Experience visitor counter', () => {
  it('reads the counter and saves a checked increment', async () => {
    const { experience, script, visit } = await fixture()
    visit()
    expect(script).toHaveSaid(0, 'visitors: read 12')
    expect(script).toHaveSaid(0, 'visitors: saved 13')
    expect(experience.store.get('visitors')).toBe('13')
    expect(script.dataserverRequests.map(request => request.source)).toEqual(['read_key_value', 'update_key_value'])
  })

  it('reports a failed read and can try again on the next touch', async () => {
    const { experience, script, visit } = await fixture()
    experience.failNext(1)
    visit()
    expect(script).toHaveSaid(0, 'visitors: exceeded throttle')
    expect(script).not.toHaveSaid(0, 'visitors: saved 13')
    expect(experience.store.get('visitors')).toBe('12')
    visit()
    expect(script).toHaveSaid(0, 'visitors: saved 13')
  })

  it('targets a failed update on tours while visitors proceeds normally', async () => {
    const { experience, script, visit } = await fixture()
    experience.failNext(15, request => request.source === 'update_key_value' && request.args[0] === 'tours')
    visit()
    expect(script).toHaveSaid(0, 'visitors: saved 13')
    visit('tours')
    expect(script).toHaveSaid(0, 'tours: read 3')
    expect(script).toHaveSaid(0, 'tours: retry update')
    expect(experience.store.get('tours')).toBe('3')
    visit('tours')
    expect(script).toHaveSaid(0, 'tours: saved 4')
  })

  it('releases the read before the update and resumes automatic answers', async () => {
    const { experience, script, visit } = await fixture()
    experience.hold()
    visit()
    expect(script.chat).toEqual([])
    expect(script.dataserverRequests.map(request => request.fulfilled)).toEqual([false])
    experience.release(1)
    script.advanceTime(0)
    expect(script).toHaveSaid(0, 'visitors: read 12')
    expect(script).not.toHaveSaid(0, 'visitors: saved 13')
    expect(experience.store.get('visitors')).toBe('12')
    expect(script.dataserverRequests.map(request => request.fulfilled)).toEqual([true, false])
    experience.release()
    script.advanceTime(0)
    expect(script.chat.map(entry => entry.text)).toEqual(['visitors: read 12', 'visitors: saved 13'])
    expect(experience.store.get('visitors')).toBe('13')
    visit()
    expect(script).toHaveSaid(0, 'visitors: saved 14')
  })
})
