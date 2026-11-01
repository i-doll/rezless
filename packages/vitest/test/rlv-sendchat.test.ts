import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, getRlvCommandCoverage } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Chat
const source = `string command; string heard; integer count;
 default {
  state_entry() { llListen(0,"",llGetOwner(),""); llListen(42,"",llGetOwner(),""); }
  touch_start(integer n) { llOwnerSay(command); }
  listen(integer c,string n,key id,string m) { heard=m; ++count; }
 }`
const cases = [
  ['empty input', '', '', ''],
  ['Unicode period offset', '/me é. more', '/me é.', '/me é. '],
  ['partial UTF-8 byte limit', '/me ' + 'é'.repeat(7) + '€', '/me ' + 'é'.repeat(7) + '�', '/me ' + 'é'.repeat(7) + '€'],
  ['ordinary speech', 'hello', '...', '...'],
  ['OOC', '((hello))', '((hello))', '((hello))'],
  ['short gesture', '/ao off', '/ao off', '/ao off'],
  ['long gesture', '/longgesture', '...', '...'],
  ['short emote', '/me waves.', '/me waves.', '/me waves.'],
  ['long emote', '/me waves slowly and smiles.', '/me waves slowly and', '/me waves slowly and'],
  ['sentence', '/me nods. Then waves', '/me nods.', '/me nods.'],
  ['quote', '/me says "hi"', '...', '...'],
  ['question mark', '/me wonders?', '/me wonders?', '...'],
  ['empty emote', '/me ', '/me ', '/me '],
  ['embedded emote', 'hello /me waves', '/me waves', '...'],
  ['colon pose', ':waves', ':waves', '...'],
  ['Unicode gesture', '/éééé', '...', '/éééé'],
  ['Unicode emote', '/me éééééééééééééééééééé', '/me éééééééé', '/me éééééééééééééééé'],
] as const
for (const [name, message, rlv, rlva] of cases) it(`filters ${name} per profile`, async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.script.setGlobal('command', '@sendchat=n')
    f.script.fire('touch_start', { num_detected: 1 })
    const deliveredMessage = profile === 'rlv' ? rlv : rlva
    const record = f.sendChat(0, message)
    expect(record).toMatchObject({ message, deliveredMessage, status: 'sent',
      restrictions: [{ rule: 'sendchat', support: 'enforced' }] })
    expect(record.reason).toBe(deliveredMessage !== message ? 'sendchat' : undefined)
    expect(f.script.global('heard')).toBe(deliveredMessage)
    expect(f.script.global('count')).toBe(1)
    expect(f.sendChat(42, 'private')).toMatchObject({ status: 'sent', deliveredMessage: 'private', restrictions: [] })
    expect(f.sendChat(2147483647, 'debug')).toMatchObject({ status: 'blocked', reason: 'sendchat' })
    f.script.setGlobal('command', '@sendchat=y')
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.sendChat(0, message)).toMatchObject({ status: 'sent', deliveredMessage: message, restrictions: [] })
  }
})

for (const [command, rlv, rlva] of [
  ['@sendchannel_except:42=n', false, true],
  ['@sendchannel_except=n,sendchannel_except:42=n', false, false],
  ['@sendchannel=n,sendchannel:42=add,sendchannel_except:42=n', false, true],
  ['@sendchannel=n,sendchannel:42=add,sendchannel_except=n,sendchannel_except:42=n', false, false],
  ['@sendchannel_except:42=n,sendchannel_except:42=y', true, true],
  ['@sendchannel_except:42=n,clear=sendchannel_except', true, true],
  ['@sendchannel_except=n', true, true],
  ['@sendchannel_except=n,sendchannel_except:42=n,sendchannel_except=y', false, true],
  ['@sendchannel_sec=n,sendchannel:42=add,sendchannel_except=n,sendchannel_except:42=n', false, false],
  ['@sendchannel_except=n,sendchannel_except:042x=n', true, false],
  ['@sendchannel_except:bad=n,sendchannel_except:0=n,sendchannel_except:-42=n', true, true],
] as const) it(`applies channel exclusion ${command}`, async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.script.setGlobal('command', command)
    f.script.fire('touch_start', { num_detected: 1 })
    const allowed = profile === 'rlv' ? rlv : rlva
    const record = f.sendChat(42, 'private')
    expect(record.status).toBe(allowed ? 'sent' : 'blocked')
    expect(f.script.global('count')).toBe(allowed ? 1 : 0)
    if (!allowed) expect(record.restrictions.map(r => r.behaviour)).toContain('sendchannel_except')
    expect(f.sendChat(0, 'public').status).toBe('sent')
  }
})

it('does not let another issuer remove a public lock or channel exclusion', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.script.setGlobal('command', '@sendchat=n,sendchannel_except=n,sendchannel_except:42=n')
    f.script.fire('touch_start', { num_detected: 1 })
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source: 'default { state_entry() { llOwnerSay("@sendchat=y,sendchannel:42=add,sendchannel_except:42=y"); llSay(0,"script"); } }' } }] }] })
    other.scripts.other!.start()
    expect(f.sendChat(0, 'speech')).toMatchObject({ deliveredMessage: '...' })
    expect(f.sendChat(42, 'private').status).toBe('blocked')
    f.script.setGlobal('command', '@clear')
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.sendChat(0, 'speech')).toMatchObject({ deliveredMessage: 'speech' })
    expect(f.sendChat(42, 'private').status).toBe('sent')
  }
})

it('discovers chat enforcement forms and rejects unsupported sendchat options', async () => {
  const pair = await loadRlvPair({ source: `string reply; default {
    state_entry() { llListen(43,"",llGetOwner(),""); llOwnerSay("@sendchat:bad=n,getcommand:sendchannel;add=43"); }
    listen(integer c,string n,key id,string m) { reply=m; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    expect(f.script.global('reply')).toBe(profile === 'rlva' ? 'sendchannel;sendchannel_except;sendchannel_sec' : '')
    expect(f.sendChat(0, 'normal').status).toBe('sent')
    expect(f.avatar.viewer.commandLog[0]?.status).toBe('unsupported')
    expect(getRlvCommandCoverage(profile).find(form => form.behaviour === 'sendchat')).toMatchObject({ support: 'enforced', option: 'none' })
    expect(getRlvCommandCoverage(profile).find(form => form.behaviour === 'sendchannel_except')).toMatchObject({ support: 'enforced', option: 'any' })
  }
})

// Exclusions stay separate from simulator messages and automatic viewer replies.
it('keeps script chat and automatic query replies independent of avatar chat locks', async () => {
  const pair = await loadRlvPair({ source: `integer heard; string version; default {
    state_entry() {
      llListen(0,"",NULL_KEY,""); llListen(42,"",llGetOwner(),"");
      llOwnerSay("@sendchat=n,sendchannel=n,sendchannel_except=n,sendchannel_except:42=n,versionnum=42");
    }
    listen(integer c,string n,key id,string m) { if(c == 0) ++heard; else version=m; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    const other = await loadLinkset({ world: f.world, region: f.avatar.region,
      prims: [{ scripts: [{ name: 'sender', source: { source: 'default { state_entry() { llSay(0,"speech"); llRegionSay(42,"private"); } }' } }] }] })
    other.scripts.sender!.start()
    expect(f.script.global('heard')).toBe(1)
    expect(f.script.global('version')).toBe(profile === 'rlv' ? '2093500' : '3040300')
    expect(f.sendChat(42, 'blocked').status).toBe('blocked')
  }
})
