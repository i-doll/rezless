import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World, type Vector } from '../src/index.js'

// Measured on Aditi (SLua Tideland, 2026-10-31) with the headless viewer as i Doll,
// answering dialogs through notifications.respond.

const OWNER = '00000000-0000-0000-0000-00000000000a'
const DEBUG_CHANNEL = 2147483647

const menu = (call: string) => `
  list heard = [];
  default {
    state_entry() { llListen(-5, "", NULL_KEY, ""); }
    touch_start(integer n) { ${call} }
    listen(integer c, string n, key id, string m) { heard += [c, n, id, m]; }
  }
`

async function load(call: string) {
  const s = await loadScript({ source: menu(call), owner: OWNER })
  s.start()
  return s
}

describe('llDialog', () => {
  it('records the menu shown to the avatar', async () => {
    const s = await load('llDialog(llGetOwner(), "Pick one", ["Red", "Blue"], -5);')
    s.linkset.touch(0)
    expect(s.dialogs).toEqual([
      {
        kind: 'dialog',
        agent: OWNER,
        message: 'Pick one',
        buttons: ['Red', 'Blue'],
        channel: -5,
        objectKey: s.host.key,
        answered: false,
      },
    ])
  })

  it('has the avatar say the chosen button on the channel', async () => {
    const s = await load('llDialog(llGetOwner(), "Pick one", ["Red", "Blue"], -5);')
    s.linkset.touch(0)
    // In-world: answering "Beta" gave listen(-149001, "i Doll", <avatar key>, "Beta").
    s.answerDialog('Blue', { name: 'Alice Resident' })
    expect(s.global('heard')).toEqual([-5, 'Alice Resident', OWNER, 'Blue'])
    expect(s.dialogs[0]!.answered).toBe(true)
  })

  it('sends button labels exactly as written', async () => {
    const s = await load('llDialog(llGetOwner(), "m", ["  pad  "], -5);')
    s.linkset.touch(0)
    // In-world: the button "  pad  " was heard as "  pad  ", length 7.
    s.answerDialog('  pad  ')
    expect(s.global('heard')).toEqual([-5, '', OWNER, '  pad  '])
  })

  it('shows a single OK button for an empty button list', async () => {
    const s = await load('llDialog(llGetOwner(), "m", [], -5);')
    s.linkset.touch(0)
    // In-world: an empty list showed one "OK" button, and answering it said "OK".
    expect(s.dialogs[0]!.buttons).toEqual(['OK'])
    s.answerDialog('OK')
    expect(s.global('heard')).toEqual([-5, '', OWNER, 'OK'])
  })

  it('refuses an answer that is not one of the buttons', async () => {
    const s = await load('llDialog(llGetOwner(), "m", ["Yes"], -5);')
    s.linkset.touch(0)
    expect(() => s.answerDialog('No')).toThrow(/not a button/)
  })

  it('answers the most recent unanswered dialog, or the one given', async () => {
    const s = await load('llDialog(llGetOwner(), "first", ["A"], -5); llDialog(llGetOwner(), "second", ["B"], -5);')
    s.linkset.touch(0)
    s.answerDialog('B')
    s.answerDialog('A', { dialog: s.dialogs[0] })
    expect(s.global('heard')).toEqual([-5, '', OWNER, 'B', -5, '', OWNER, 'A'])
    expect(() => s.answerDialog('A')).toThrow(/no unanswered dialog/)
  })

  it('sends nothing when the dialog is ignored', async () => {
    const s = await load('llDialog(llGetOwner(), "m", ["A"], -5);')
    s.linkset.touch(0)
    // In-world: pressing Ignore on the dialog sent no chat.
    s.advanceTime(60_000)
    expect(s.global('heard')).toEqual([])
  })

  it('delays the script 1 s, even when the call fails', async () => {
    const s = await loadScript({
      source: `
        float ok; float failed;
        default { state_entry() {
          float t = llGetTime(); llDialog(llGetOwner(), "m", ["A"], -5); ok = llGetTime() - t;
          t = llGetTime(); llDialog(llGetOwner(), "", ["A"], -5); failed = llGetTime() - t;
        } }
      `,
    })
    s.start()
    s.advanceTime(5_000)
    // In-world: llDialog took 1.04 s; failing calls were 1.0 s apart on DEBUG_CHANNEL.
    expect(s.global('ok')).toBeCloseTo(1, 5)
    expect(s.global('failed')).toBeCloseTo(1, 5)
  })

  it('records a dialog to any key, with no error', async () => {
    const s = await load('llDialog(NULL_KEY, "m", ["A"], -5);')
    s.linkset.touch(0)
    // In-world: NULL_KEY, the object's own key and an unknown key raised no error.
    expect(s.dialogs[0]!.agent).toBe('00000000-0000-0000-0000-000000000000')
    expect(s.chat).toEqual([])
  })

  describe('refuses bad arguments with a DEBUG_CHANNEL error and shows nothing', () => {
    const y24 = 'y'.repeat(24)
    const y25 = 'y'.repeat(25)
    const twelve = '["1","2","3","4","5","6","7","8","9","10","11","12"]'
    const thirteen = '["1","2","3","4","5","6","7","8","9","10","11","12","13"]'
    const errors = {
      message: 'llDialog: must supply a message',
      long: 'llDialog: message too long, must be less than 512 characters',
      count: 'llDialog: button list too long, must be 12 or fewer entries',
      type: 'llDialog: button list must contain only strings',
      empty: 'llDialog: all buttons must have label strings',
      label: 'llDialog: button labels must be 24 or fewer characters long',
    }
    // In-world: each failing case printed exactly this error and no dialog appeared.
    // Message checks come first, then the count, then each button in order.
    it.each([
      ['an empty message', '""', '["A"]', errors.message],
      ['a 512-byte message', `"${'a'.repeat(512)}"`, '["A"]', errors.long],
      ['a 512-byte message of 256 two-byte characters', `"${'é'.repeat(256)}"`, '["A"]', errors.long],
      ['13 buttons', '"m"', thirteen, errors.count],
      ['an integer button', '"m"', '["s", 5]', errors.type],
      ['a key button', '"m"', '[(key)"Yes"]', errors.type],
      ['an empty label', '"m"', '["ok", ""]', errors.empty],
      ['a 25-byte label', '"m"', `["${y25}"]`, errors.label],
      ['a 26-byte label of 13 two-byte characters', '"m"', `["${'é'.repeat(13)}"]`, errors.label],
      ['an empty message and 13 buttons', '""', thirteen, errors.message],
      ['an empty message and an integer button', '""', '[5]', errors.message],
      ['a 512-byte message and 13 buttons', `"${'a'.repeat(512)}"`, thirteen, errors.long],
      ['a 512-byte message and a long label', `"${'a'.repeat(512)}"`, `["${y25}"]`, errors.long],
      ['13 buttons and a long label', '"m"', `["${y25}","2","3","4","5","6","7","8","9","10","11","12","13"]`, errors.count],
      ['an empty label before a long one', '"m"', `["", "${y25}"]`, errors.empty],
      ['a long label before an empty one', '"m"', `["${y25}", ""]`, errors.label],
      ['an integer before an empty label', '"m"', '[5, ""]', errors.type],
      ['an empty label before an integer', '"m"', '["", 5]', errors.empty],
    ])('%s', async (_name, message, buttons, error) => {
      const s = await load(`llDialog(llGetOwner(), ${message}, ${buttons}, -5);`)
      s.linkset.touch(0)
      expect(s.chat).toEqual([{ channel: DEBUG_CHANNEL, text: error, type: 'say' }])
      expect(s.dialogs).toEqual([])
    })

    it.each([
      ['12 buttons', '"m"', twelve],
      ['a 24-byte label', '"m"', `["${y24}"]`],
      ['a 511-byte message', `"${'a'.repeat(511)}"`, '["A"]'],
      ['a 510-byte message of two-byte characters', `"${'é'.repeat(255)}"`, '["A"]'],
      ['a message of one space', '" "', '["A"]'],
      ['a label of one space', '"m"', '[" "]'],
      ['repeated labels', '"m"', '["Same", "Same"]'],
    ])('accepts %s', async (_name, message, buttons) => {
      const s = await load(`llDialog(llGetOwner(), ${message}, ${buttons}, -5);`)
      s.linkset.touch(0)
      expect(s.chat).toEqual([])
      expect(s.dialogs).toHaveLength(1)
    })
  })
})

describe('llTextBox', () => {
  it('records the text box and takes any typed answer', async () => {
    const s = await load('llTextBox(llGetOwner(), "Your name?", -5);')
    s.linkset.touch(0)
    expect(s.dialogs).toEqual([
      {
        kind: 'textBox',
        agent: OWNER,
        message: 'Your name?',
        buttons: [],
        channel: -5,
        objectKey: s.host.key,
        answered: false,
      },
    ])
    // The headless viewer can only submit the box empty, so a typed answer's length
    // limit is not measured; rezless passes the text through whole.
    s.answerDialog('Bob')
    expect(s.global('heard')).toEqual([-5, '', OWNER, 'Bob'])
  })

  it('sends an empty answer as an empty message', async () => {
    const s = await load('llTextBox(llGetOwner(), "Your name?", -5);')
    s.linkset.touch(0)
    // In-world: submitting the box empty gave listen with "" (length 0).
    s.answerDialog('')
    expect(s.global('heard')).toEqual([-5, '', OWNER, ''])
  })

  it('does not delay the script', async () => {
    const s = await loadScript({
      source: `float took; default { state_entry() { float t = llGetTime(); llTextBox(llGetOwner(), "m", -5); took = llGetTime() - t; } }`,
    })
    s.start()
    // In-world: llTextBox returned after 0.04 s, one frame.
    expect(s.global('took')).toBe(0)
  })

  it.each([
    ['an empty message', '""', 'llTextBox: must supply a message'],
    ['a 512-byte message', `"${'b'.repeat(512)}"`, 'llTextBox: message too long, must be less than 512 characters'],
    ['a 512-byte message of two-byte characters', `"${'é'.repeat(256)}"`, 'llTextBox: message too long, must be less than 512 characters'],
  ])('refuses %s', async (_name, message, error) => {
    const s = await load(`llTextBox(llGetOwner(), ${message}, -5);`)
    s.linkset.touch(0)
    // In-world: each printed this error and no text box appeared; 511 bytes showed one.
    expect(s.chat).toEqual([{ channel: DEBUG_CHANNEL, text: error, type: 'say' }])
    expect(s.dialogs).toEqual([])
  })
})

describe('who hears a dialog answer', () => {
  const listener = (channel: number, filter = '"", NULL_KEY') => `
    list heard = [];
    default {
      state_entry() { llListen(${channel}, ${filter}, ""); }
      listen(integer c, string n, key id, string m) { heard += [m]; }
    }
  `

  let n = 0
  async function place(world: World, position: Vector, source: string) {
    const name = `p${n++}`
    const { scripts } = await loadLinkset({
      world,
      region: 'R',
      position,
      owner: OWNER,
      prims: [{ name, key: `00000000-0000-0000-0001-${String(n).padStart(12, '0')}`, scripts: [{ source: { source }, name }] }],
    })
    scripts[name]!.start()
    return scripts[name]!
  }

  it('reaches listens within 20 m of the object that showed it, wherever the avatar is', async () => {
    const world = new World()
    world.addRegion('R', { x: 0, y: 0 })
    const at = (x: number) => ({ x, y: 128, z: 20 })
    const dialog = await place(world, at(100), menu('llDialog(llGetOwner(), "m", ["Go"], -5);'))
    const near = await place(world, at(119), listener(-5))
    const far = await place(world, at(121), listener(-5))
    const behind = await place(world, at(81), listener(-5))
    dialog.linkset.touch(0)
    // In-world: with the avatar 3 m west of the dialog object, a listen 19 m east of
    // the object (22 m from the avatar) heard the answer and one 21 m west (18 m from
    // the avatar) did not. Moving the object 43 m from the avatar changed nothing.
    dialog.answerDialog('Go')
    expect(dialog.global('heard')).toEqual([-5, '', OWNER, 'Go'])
    expect(near.global('heard')).toEqual(['Go'])
    expect(behind.global('heard')).toEqual(['Go'])
    expect(far.global('heard')).toEqual([])
  })

  it.each([
    ['channel 0', 0],
    ['DEBUG_CHANNEL', DEBUG_CHANNEL],
  ])('works on %s', async (_name, channel) => {
    const s = await loadScript({
      source: `
        string heard;
        default {
          state_entry() { llListen(${channel}, "", NULL_KEY, ""); llDialog(llGetOwner(), "m", ["Go"], ${channel}); }
          listen(integer c, string n, key id, string m) { heard = m; }
        }
      `,
      owner: OWNER,
    })
    s.start()
    // In-world: answers on channel 0 and DEBUG_CHANNEL reached listens on them.
    s.answerDialog('Go')
    expect(s.global('heard')).toBe('Go')
  })

  it('matches listen filters on the avatar name, case-sensitively, and key', async () => {
    const world = new World()
    world.addRegion('R', { x: 0, y: 0 })
    const at = { x: 100, y: 128, z: 20 }
    const dialog = await place(world, at, menu('llDialog(llGetOwner(), "m", ["Go"], -5);'))
    const byName = await place(world, at, listener(-5, '"i Doll", NULL_KEY'))
    const wrongCase = await place(world, at, listener(-5, '"i doll", NULL_KEY'))
    const byKey = await place(world, at, listener(-5, `"", "${OWNER}"`))
    dialog.linkset.touch(0)
    // In-world: listens filtered on "i Doll" and on the avatar key heard the answer;
    // one filtered on "i doll" did not.
    dialog.answerDialog('Go', { name: 'i Doll' })
    expect(byName.global('heard')).toEqual(['Go'])
    expect(wrongCase.global('heard')).toEqual([])
    expect(byKey.global('heard')).toEqual(['Go'])
  })
})
