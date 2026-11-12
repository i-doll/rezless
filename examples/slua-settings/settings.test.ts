import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./settings.luau', import.meta.url))
// An object with no owner is owned by NULL_KEY, and a listen filtered to
// NULL_KEY hears everyone, so give it a real one.
const OWNER = '00000000-0000-0000-0000-0000000000aa'

describe('settings.luau', () => {
  let s: Script
  const say = (message: string) => s.deliverChat({ channel: 7, name: 'Owner', key: OWNER, message })
  const said = () => s.chat.map((c) => c.text)

  beforeEach(async () => {
    s = await loadScript({ source: await readFile(SCRIPT, 'utf8'), filename: SCRIPT, owner: OWNER })
    s.start()
  })

  it('starts from the defaults', () => {
    say('show')
    expect(said()).toEqual(['brightness = 1', 'colour = white'])
  })

  it('stores settings as JSON in linkset data', () => {
    say('set colour red')
    say('set brightness 0.5')
    expect(JSON.parse(s.linkset.linksetData.get('settings')!.value)).toEqual({ colour: 'red', brightness: 0.5 })
  })

  it('keeps settings across a reset', () => {
    say('set colour blue')
    say('reset')
    say('show')
    expect(said().slice(-2)).toEqual(['brightness = 1', 'colour = blue'])
  })

  it('only listens to its owner', () => {
    s.deliverChat({ channel: 7, name: 'Stranger', key: '00000000-0000-0000-0000-000000000bad', message: 'set colour green' })
    expect(said()).toEqual([])
  })

  it('names commands it does not know', () => {
    say('paint it black')
    expect(said()).toEqual(['unknown command: paint it black'])
  })
})
