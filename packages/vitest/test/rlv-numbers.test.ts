import { expect, it } from 'vitest'
import { NULL_KEY, type Script } from '@rezless/vm'
import { loadRlvPair } from '../src/index.js'

const source = `default {
  state_entry() { llSitTarget(<0,0,0.5>,ZERO_ROTATION); }
  link_message(integer s,integer n,string m,key id) { llOwnerSay(m); }
}`
const issue = (script: Script, str: string) => script.fire('link_message', { sender_num: 1, num: 0, str, id: NULL_KEY })

it.each([
  { option: '0x1p2tail', rlv: true, rlva: true, stored: true },
  { option: 'inf', rlv: true, rlva: true, stored: true },
  { option: '-infinity', rlv: false, rlva: true, stored: true },
  { option: 'nan(payload)', rlv: true, rlva: false, stored: true },
  { option: '1e999', rlv: true, rlva: true, stored: false },
  { option: '-1e999', rlv: false, rlva: true, stored: false },
  { option: '1e-999', rlv: false, rlva: true, stored: false },
])('parses sittp:$option with named profile results', async ({ option, rlv, rlva, stored }) => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.avatar.position = { x: 2, y: 0, z: 0 }
    issue(f.script, '@sittp:' + option + '=n')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' || stored ? 'applied' : 'unsupported')
    expect(f.userSit(f.script.host)).toBe(profile === 'rlv' ? rlv : rlva)
  }
})

it.each([
  { option: '0x10/20/40', rlv: { x: 0, y: 20, z: 40 }, rlva: { x: 16, y: 20, z: 40 } },
  { option: '0x1.8p4/20/40suffix', rlv: { x: 0, y: 20, z: 40 }, rlva: { x: 24, y: 20, z: 40 } },
  { option: '12/20/1e300', rlv: { x: 12, y: 20, z: 22.975 }, rlva: { x: 12, y: 20, z: 1e300 } },
  { option: 'nan/20/40', rlv: { x: 0, y: 20, z: 40 }, rlva: null },
  { option: '12/20/inf', rlv: { x: 12, y: 20, z: 22.975 }, rlva: null },
])('parses teleport $option with named profile results', async ({ option, rlv, rlva }) => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.avatar.position = { x: 10, y: 20, z: 30 }
    issue(f.script, '@tpto:' + option + '=force')
    expect(f.avatar.position).toEqual((profile === 'rlv' ? rlv : rlva) ?? { x: 10, y: 20, z: 30 })
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe('action')
  }
})

it.each(['0x1p0suffix', 'inf', 'nan', '1e999', '1e-999'])('parses teleport angle %s without unsupported diagnostics', async angle => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    issue(f.script, '@tpto:12/20/40;' + angle + '=force')
    const invalid = profile === 'rlva' && (angle === '1e999' || angle === '1e-999')
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', ...(invalid ? { outcome: 'invalid-option' } : {}) })
    if (!invalid) expect(f.avatar.position).toEqual({ x: 12, y: 20, z: 40 })
  }
})

it.each(['sittp', 'tplocal'])('keeps %s modifier ordering through NaN removal and finite additions', async behaviour => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.avatar.position = { x: 2, y: 0, z: 30 }
    const allowed = () => behaviour === 'sittp'
      ? f.userSit(f.script.host, { x: 0, y: 0, z: 30 })
      : f.userTeleportMap({ x: 0, y: 0, z: 30 }).status === 'applied'
    issue(f.script, '@' + behaviour + ':nan=n,' + behaviour + ':nan=y,' + behaviour + ':4=n')
    expect(allowed()).toBe(true)
    f.world.standAvatar(f.avatar)
    f.avatar.position = { x: 2, y: 0, z: 30 }
    issue(f.script, '@' + behaviour + ':nan=n')
    expect(allowed()).toBe(profile === 'rlv' || behaviour === 'tplocal')
    f.world.standAvatar(f.avatar)
    f.avatar.position = { x: 2, y: 0, z: 30 }
    issue(f.script, '@clear,' + behaviour + ':1=n')
    expect(allowed()).toBe(false)
  }
})

it.each([
  { option: '0x1p2tail', rlv: true, rlva: true },
  { option: 'inf', rlv: true, rlva: true },
  { option: '-inf', rlv: false, rlva: true },
  { option: 'nan', rlv: true, rlva: true },
  { option: '1e999', rlv: true, rlva: true },
  { option: '-1e999', rlv: false, rlva: true },
  { option: '1e-999', rlv: false, rlva: true },
])('applies tplocal:$option to user map travel', async ({ option, rlv, rlva }) => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.avatar.position = { x: 10, y: 20, z: 30 }
    issue(f.script, '@tplocal:' + option + '=n')
    expect(f.userTeleportMap({ x: 12, y: 20, z: 30 }).status).toBe((profile === 'rlv' ? rlv : rlva) ? 'applied' : 'blocked')
  }
})

it('distinguishes global double overflow, named float overflow and numeric suffixes', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    issue(f.script, '@tpto:rlv fixture/0x10/20/40tail=force')
    expect(f.avatar.position).toEqual({ x: profile === 'rlv' ? 0 : 16, y: 20, z: 40 })
    issue(f.script, '@tpto:12/20/1e999=force')
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', requested: { x: 12, y: 20, z: profile === 'rlv' ? 1 : Infinity } })
    issue(f.script, '@tpto:rlv fixture/12/20/1e300=force')
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', requested: { z: profile === 'rlv' ? 1 : Infinity } })
    issue(f.script, '@tpto:12/20/1e-999=force')
    expect(f.avatar.position).toEqual({ x: 12, y: 20, z: 22.975 })
  }
})

it('keeps overflowing Kokua integer coordinates inspectably unsupported', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    issue(f.script, '@tpto:2147483648/20/40=force')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(f.avatar.viewer.profile === 'rlv' ? 'unsupported' : 'action')
  }
})

it('parses float prefixes without turning a zero hexadecimal mantissa into infinity', async () => {
  const { rlvAtof, rlvStof, rlvScanVector } = await import('../../vm/src/rlv/numbers.js')
  expect(rlvAtof('0x0p9999')).toBe(0)
  expect(rlvStof('-0x0p9999')).toBe(-0)
  expect(rlvScanVector('nan(payload)/20/40', false)).toBeUndefined()
  expect(rlvScanVector('0x1.00000000000008p0/20/40', false)?.x).toBe(1)
  expect(rlvScanVector('0x1.000000000000081p0/20/40', false)?.x).toBe(1 + Number.EPSILON)
})
