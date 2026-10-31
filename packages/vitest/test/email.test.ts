import { describe, it, expect } from 'vitest'
import {
  loadLinkset,
  loadScript,
  World,
  TARGETED_EMAIL_OBJECT_OWNER,
  TARGETED_EMAIL_ROOT_CREATOR,
  type Vector,
} from '../src/index.js'

// The probes ran on Aditi, where an object's address ends in
// @lsl.aditi.lindenlab.com and mail to @lsl.secondlife.com never arrived.
// Rezless models the main grid, so these tests use @lsl.secondlife.com.
const SENDER_KEY = '00000000-0000-0000-0000-00000000005e'
const RECEIVER_KEY = '00000000-0000-0000-0000-00000000005f'
const FROM = `${SENDER_KEY}@lsl.secondlife.com`
const TO = `${RECEIVER_KEY}@lsl.secondlife.com`
const START = 1_793_478_520

// Sends whatever mail `body` sends when touched.
const sender = (body: string) => `default { touch_start(integer n) { ${body} } }`

// Calls llGetNextEmail with the filters in its globals on each timer event,
// and says each email it gets on channel 0.
const RECEIVER = `
  string address = "";
  string subject = "";
  default {
    timer() { llGetNextEmail(address, subject); }
    email(string time, string from, string subj, string message, integer num_left) {
      llSay(0, time + "|" + from + "|" + subj + "|" + message + "|" + (string)num_left);
    }
  }
`
// A second script in the receiving prim that only reports the email events it gets.
const BYSTANDER = `
  default {
    email(string time, string from, string subj, string message, integer num_left) {
      llSay(0, "bystander " + subj + " " + (string)num_left);
    }
  }
`

async function tideland(senderBody: string, senderPos: Vector = { x: 118, y: 46, z: 1997.5 }) {
  const world = new World({ startUnixTime: START })
  world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
  const tx = await loadLinkset({
    world,
    region: 'SLua Tideland',
    position: senderPos,
    prims: [{ name: 'probe issue-155 S', key: SENDER_KEY, scripts: [{ name: 'S', source: { source: sender(senderBody) } }] }],
  })
  const rx = await loadLinkset({
    world,
    region: 'SLua Tideland',
    position: { x: 114, y: 46, z: 1997.5 },
    prims: [
      {
        name: 'probe issue-155 R',
        key: RECEIVER_KEY,
        scripts: [
          { name: 'R1', source: { source: RECEIVER } },
          { name: 'R2', source: { source: BYSTANDER } },
        ],
      },
    ],
  })
  const s = tx.scripts['S']!
  const r = rx.scripts['R1']!
  const bystander = rx.scripts['R2']!
  s.start()
  r.start()
  bystander.start()
  const send = () => s.fire('touch_start', { num_detected: 1 })
  const fetch = (address = '', subject = '') => {
    r.setGlobal('address', address)
    r.setGlobal('subject', subject)
    const before = r.chat.length
    r.fire('timer')
    return r.chat.slice(before).map((c) => c.text)
  }
  return { s, r, bystander, send, fetch }
}

const HEADER =
  'Object-Name: probe issue-155 S\nRegion: SLua Tideland (40960, 23296)\nLocal-Position: (118, 46, 1997)\n\n'

describe('llEmail', () => {
  // https://wiki.secondlife.com/wiki/LlEmail
  // In-world: llEmail -> llGetTime() moved 20.0 s across each call, with a valid
  // address, with "not an address", and with an 8192-byte body (Aditi, SLua Tideland, 2026-10-31)
  it('records the mail and sleeps the script for 20 seconds', async () => {
    const s = await loadScript({
      source: `default { state_entry() { llEmail("someone@example.com", "hi", "body"); llSay(0, "after"); } }`,
      startUnixTime: START,
    })
    s.start()
    expect(s.emails).toEqual([{ address: 'someone@example.com', subject: 'hi', message: 'body', time: START }])
    expect(s.now).toBe(20_000)
    expect(s.chat.map((c) => c.text)).toEqual(['after'])
  })

  // In-world: llEmail("not an address", "bad", "x") -> no message on DEBUG_CHANNEL,
  // and the script went on after the 20 s sleep (Aditi, SLua Tideland, 2026-10-31)
  it('says no error for an address that is not one', async () => {
    const s = await loadScript({
      source: `default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); llEmail("not an address", "bad", "x"); } }`,
    })
    s.start()
    s.advanceTime(20_000)
    expect(s.chat).toEqual([])
    expect(s.emails.map((e) => e.address)).toEqual(['not an address'])
  })

  // In-world: S sent "hello one" to R's key; R's llGetNextEmail("", "") fired
  // email("1793478520", "<S key>@lsl.aditi.lindenlab.com", "alpha",
  // "Object-Name: probe issue-155 S\nRegion: SLua Tideland (40960, 23296)\nLocal-Position: (118, 46, 1997)\n\nhello one", 5)
  // with S at <118, 46, 1997.5> (Aditi, SLua Tideland, 2026-10-31)
  it("queues mail to an object's address on that prim, after a header naming the sender", async () => {
    const t = await tideland('llEmail("' + TO + '", "alpha", "hello one");')
    t.send()
    expect(t.r.inbox).toEqual([{ time: START, address: FROM, subject: 'alpha', message: HEADER + 'hello one' }])
    expect(t.fetch()).toEqual([`${START}|${FROM}|alpha|${HEADER}hello one|0`])
    expect(t.r.inbox).toEqual([])
  })

  // In-world: S at <117.7, 46.6, 1997.4> -> "Local-Position: (117, 46, 1997)" (Aditi, SLua Tideland, 2026-10-31)
  it('cuts the sender position in the header to whole metres', async () => {
    const t = await tideland('llEmail("' + TO + '", "pos", "p");', { x: 117.7, y: 46.6, z: 1997.4 })
    t.send()
    expect(t.r.inbox[0]!.message).toBe(
      'Object-Name: probe issue-155 S\nRegion: SLua Tideland (40960, 23296)\nLocal-Position: (117, 46, 1997)\n\np',
    )
  })

  // In-world: the mail sent first had time "1793478520", the second second it
  // was called, 20 s before its sleep ended (Aditi, SLua Tideland, 2026-10-31)
  it('stamps the mail with the unix time of the call', async () => {
    const t = await tideland(`llEmail("${TO}", "one", ""); llEmail("${TO}", "two", "");`)
    t.send()
    t.s.advanceTime(40_000)
    expect(t.r.inbox.map((m) => m.time)).toEqual([START, START + 20])
  })

  // In-world: subject "ümlaut" arrived as "ümlaut"; body "café x" arrived as "caf? x"
  // (Aditi, SLua Tideland, 2026-10-31)
  it('turns each non-ASCII character of the body into "?" and keeps the subject', async () => {
    const t = await tideland(`llEmail("${TO}", "ümlaut", "café x");`)
    t.send()
    expect(t.r.inbox[0]!.subject).toBe('ümlaut')
    expect(t.r.inbox[0]!.message).toBe(HEADER + 'caf? x')
  })

  // The wiki gives 4096 bytes for address, subject and message, and the email
  // event page 1000 characters for the message.
  // In-world: a 1203-character body arrived as 1304 characters with the header,
  // and an 8192-character body as 8293 (Aditi, SLua Tideland, 2026-10-31)
  it('delivers long bodies whole', async () => {
    const t = await tideland(`string b = "b"; while (llStringLength(b) < 4100) b += b; llEmail("${TO}", "huge", b);`)
    t.send()
    expect(t.r.inbox[0]!.message).toBe(HEADER + 'b'.repeat(8192))
  })

  // In-world: mail to <R key>@lsl.secondlife.com from Aditi never reached R,
  // and mail to <R key>@lsl.aditi.lindenlab.com did (Aditi, SLua Tideland, 2026-10-31)
  it("queues nothing for an address on another domain or a key no prim has", async () => {
    const t = await tideland(
      `llEmail("${RECEIVER_KEY}@lsl.aditi.lindenlab.com", "a", ""); ` +
        `llEmail("00000000-0000-0000-0000-000000000999@lsl.secondlife.com", "b", "");`,
    )
    t.send()
    t.s.advanceTime(40_000)
    expect(t.s.emails).toHaveLength(2)
    expect(t.r.inbox).toEqual([])
  })

  // In-world: child prim "probe issue-155 SC" (link 2 of root "probe issue-155 SR")
  // at region <118.6, 47.3, 1997.8>, local <0.6, 1.3, 0.3> -> "Object-Name: probe issue-155 SC" and
  // "Local-Position: (118, 47, 1997)" (Aditi, SLua Tideland, 2026-10-31)
  it("names a child prim and gives its region position in the header", async () => {
    const world = new World()
    world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
    const tx = await loadLinkset({
      world,
      region: 'SLua Tideland',
      position: { x: 118, y: 46, z: 1997.5 },
      prims: [
        { name: 'probe issue-155 SR' },
        {
          name: 'probe issue-155 SC',
          key: SENDER_KEY,
          scripts: [{ name: 'C', source: { source: sender(`llEmail("${TO}", "child", "c");`) } }],
        },
      ],
    })
    const rx = await loadLinkset({
      world,
      region: 'SLua Tideland',
      prims: [{ name: 'probe issue-155 R', key: RECEIVER_KEY, scripts: [{ name: 'R', source: { source: RECEIVER } }] }],
    })
    tx.prims[1]!.params.position = { x: 0.6, y: 1.3, z: 0.3 }
    tx.scripts['C']!.fire('touch_start', { num_detected: 1 })
    expect(rx.scripts['R']!.inbox[0]!.message).toBe(
      'Object-Name: probe issue-155 SC\nRegion: SLua Tideland (40960, 23296)\nLocal-Position: (118, 47, 1997)\n\nc',
    )
  })

  // In-world: the child prim mailed its own key and its own llGetNextEmail("", "self")
  // fired email(..., "<its key>@lsl.aditi.lindenlab.com", "self", ..., 0) (Aditi, SLua Tideland, 2026-10-31)
  it('delivers mail a prim sends to itself', async () => {
    const s = await loadScript({
      source: `default { state_entry() {
        llEmail((string)llGetKey() + "@lsl.secondlife.com", "self", "s");
        llGetNextEmail("", "self");
      }
      email(string t, string from, string subj, string m, integer left) { llSay(0, from + " " + subj); } }`,
      objectKey: RECEIVER_KEY,
    })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual([`${TO} self`])
  })

  // https://wiki.secondlife.com/wiki/Email says the queue holds 100 mails.
  // In-world: 10 scripts in one prim each sent 11 mails to R, 110 in all, rounds
  // in step; R's first llGetNextEmail gave num_left 100, one mail of the last
  // round was there and the other nine weren't (Aditi, SLua Tideland, 2026-10-31)
  it('drops mail once the prim holds 101', async () => {
    const t = await tideland(`integer i; for (i = 0; i < 110; ++i) llEmail("${TO}", (string)i, "");`)
    t.send()
    t.s.advanceTime(110 * 20_000)
    expect(t.r.inbox).toHaveLength(101)
    expect(t.r.inbox.at(-1)!.subject).toBe('100')
    expect(t.fetch()[0]!.split('|')[4]).toBe('100')
    expect(t.r.deliverEmail({ from: 'a@example.com' })).toBe(true)
    expect(t.r.deliverEmail({ from: 'b@example.com' })).toBe(false)
  })

  it('matches the domain and key without regard to case', async () => {
    const t = await tideland(`llEmail("${TO.toUpperCase()}", "a", "");`)
    t.send()
    expect(t.r.inbox).toHaveLength(1)
  })
})

describe('llGetNextEmail', () => {
  // https://wiki.secondlife.com/wiki/LlGetNextEmail
  // In-world: R had an email handler; no email event came until R called
  // llGetNextEmail, about 2 minutes after the mail was sent (Aditi, SLua Tideland, 2026-10-31)
  it('fires email only when a script asks for it', async () => {
    const t = await tideland(`llEmail("${TO}", "alpha", "hello one");`)
    t.send()
    t.s.advanceTime(60_000)
    expect(t.r.chat).toEqual([])
    expect(t.bystander.chat).toEqual([])
  })

  // In-world: R1 called llGetNextEmail and both R1 and R2, the other script in the
  // prim, got email(..., "alpha", ..., 5) (Aditi, SLua Tideland, 2026-10-31)
  it('fires email on every script in the prim', async () => {
    const t = await tideland(`llEmail("${TO}", "alpha", "x");`)
    t.send()
    t.fetch()
    expect(t.bystander.chat.map((c) => c.text)).toEqual(['bystander alpha 0'])
  })

  // In-world, with alpha, Beta, alphabet, ümlaut, body8 and huge queued in that order:
  //   ("", "zzz") -> no event; ("", "ALPHA") -> alpha, num_left 5; ("", "alph") -> no event;
  //   ("", "beta") -> Beta, 4; ("<S KEY>@LSL.ADITI.LINDENLAB.COM", "") -> alphabet, 3;
  //   ("<S key>", "") -> no event; then ("", "") -> ümlaut 2, body8 1, huge 0, then no event
  //   (Aditi, SLua Tideland, 2026-10-31)
  it('takes the oldest mail whose address and subject match whole, ignoring case', async () => {
    const t = await tideland(
      ['alpha', 'Beta', 'alphabet', 'umlaut', 'body8', 'huge'].map((s) => `llEmail("${TO}", "${s}", "");`).join(' '),
    )
    t.send()
    t.s.advanceTime(120_000)
    const subj = (lines: string[]) => lines.map((l) => l.split('|')[2] + ' ' + l.split('|')[4])
    expect(t.fetch('', 'zzz')).toEqual([])
    expect(subj(t.fetch('', 'ALPHA'))).toEqual(['alpha 5'])
    expect(t.fetch('', 'alph')).toEqual([])
    expect(subj(t.fetch('', 'beta'))).toEqual(['Beta 4'])
    expect(subj(t.fetch(FROM.toUpperCase(), ''))).toEqual(['alphabet 3'])
    expect(t.fetch(SENDER_KEY, '')).toEqual([])
    expect(subj(t.fetch())).toEqual(['umlaut 2'])
    expect(subj(t.fetch())).toEqual(['body8 1'])
    expect(subj(t.fetch())).toEqual(['huge 0'])
    expect(t.fetch()).toEqual([])
  })
})

describe('llTargetedEmail', () => {
  // https://wiki.secondlife.com/wiki/LlTargetedEmail
  // In-world: llGetTime() moved 20.0 s across llTargetedEmail with targets
  // TARGETED_EMAIL_OBJECT_OWNER, TARGETED_EMAIL_ROOT_CREATOR, 0 and 7, and none
  // said anything on DEBUG_CHANNEL (Aditi, SLua Tideland, 2026-10-31)
  it('records the mail, says no error for any target, and sleeps 20 seconds each', async () => {
    const s = await loadScript({
      source: `default { state_entry() {
        llListen(DEBUG_CHANNEL, "", NULL_KEY, "");
        llTargetedEmail(TARGETED_EMAIL_OBJECT_OWNER, "to owner", "body");
        llTargetedEmail(TARGETED_EMAIL_ROOT_CREATOR, "to creator", "");
        llTargetedEmail(7, "nobody", "");
        llSay(0, "after");
      } }`,
      startUnixTime: START,
    })
    s.start()
    expect(s.now).toBe(60_000)
    expect(s.chat.map((c) => c.text)).toEqual(['after'])
    expect(s.targetedEmails).toEqual([
      { target: TARGETED_EMAIL_OBJECT_OWNER, subject: 'to owner', message: 'body', time: START },
      { target: TARGETED_EMAIL_ROOT_CREATOR, subject: 'to creator', message: '', time: START + 20 },
      { target: 7, subject: 'nobody', message: '', time: START + 40 },
    ])
    expect(s.emails).toEqual([])
  })
})

describe('deliverEmail', () => {
  it("queues a test's mail on the prim for llGetNextEmail", async () => {
    const s = await loadScript({ source: RECEIVER, startUnixTime: START })
    s.start()
    expect(s.deliverEmail({ from: 'someone@example.com', subject: 'news', message: 'hello' })).toBe(true)
    s.deliverEmail({ from: 'other@example.com', time: 42 })
    expect(s.inbox).toEqual([
      { time: START, address: 'someone@example.com', subject: 'news', message: 'hello' },
      { time: 42, address: 'other@example.com', subject: '', message: '' },
    ])
    expect(s.chat).toEqual([])
    s.fire('timer')
    s.fire('timer')
    s.fire('timer')
    expect(s.chat.map((c) => c.text)).toEqual([
      `${START}|someone@example.com|news|hello|1`,
      '42|other@example.com|||0',
    ])
  })
})
