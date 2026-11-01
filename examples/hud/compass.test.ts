import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./compass.lsl', import.meta.url))

const OWNER = '00000000-0000-0000-0000-00000000a11c'
const ATTACH_HUD_CENTER_1 = 35
const FACING_EAST = { x: 0, y: 0, z: 0, s: 1 }

describe('compass.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript({ source: await readFile(SCRIPT, 'utf8'), filename: SCRIPT, owner: OWNER })
    s.start()
  })

  it('attaches itself to the centre of the screen once allowed', () => {
    expect(s.linkset.attachment).toBeNull()
    s.grantPermissions()
    expect(s.linkset.attachment).toMatchObject({ avatar: OWNER, point: ATTACH_HUD_CENTER_1 })
  })

  it.each([
    [{ x: 100, y: 128, z: 25 }, 'Landmark straight ahead'],
    [{ x: 100, y: 100, z: 25 }, 'Landmark to the left'],
    [{ x: 100, y: 156, z: 25 }, 'Landmark to the right'],
    [{ x: 150, y: 128, z: 25 }, 'Landmark behind you'],
  ])('points at the landmark from a camera at %o', (pos, text) => {
    s.grantPermissions()
    s.setCamera({ pos, rot: FACING_EAST })
    s.advanceTime(500)
    expect(s.text?.text).toBe(text)
  })

  it('stays off the screen without permission to attach', () => {
    s.denyPermissions()
    expect(s.linkset.attachment).toBeNull()
  })

  it('takes itself off when clicked', () => {
    s.grantPermissions()
    s.linkset.touch(0)
    expect(s.linkset.attachment).toBeNull()
    expect(s.timerInterval).toBe(0)
  })
})
