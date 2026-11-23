import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

// Measured on the Aditi beta grid, region SLua Tideland, 2026-11-23. A probe prim with a 63-byte name said a
// 1100-byte text per chat command (1060 for "n8"), about 7 s apart. The owner's copy was read from nearby chat in the
// viewer; a second box listened on DEBUG_CHANNEL and channels 0 and 5 and repeated the length it heard with
// llOwnerSay. The owner check that guarded the listen handler is replaced by a comment.
//
// The owner's copy of a crash error is cut so the prim's name and the text come to 1151 bytes
// (slua-error-owner-text.test.ts). Chat a script says is cut to 1024 bytes first, for the owner and for listeners
// alike, so that cut never applies to it. It does apply to the owner's copy of an error the simulator says.
//
// rezless cuts that copy after the error flood cap (flood-cap tests) has had its say, so the flood notice, which is
// short, is never cut, and an error the cap drops is never shown at all.

const DEBUG_CHANNEL = 2147483647
const NAME = `probe issue-456 chat${'x'.repeat(43)}`

const PROBE = `local function body(tag, n)
  local s = tag .. string.rep("0123456789", 120)
  return string.sub(s, 1, n)
end
LLEvents:on("listen", function(ch, name, id, msg)
  -- (the probe answered only its owner here)
  if msg == "n1" then ll.Say(DEBUG_CHANNEL, body("N1:", 1100))
  elseif msg == "n2" then ll.Say(0, body("N2:", 1100))
  elseif msg == "n3" then ll.Say(5, body("N3:", 1100))
  elseif msg == "n4" then ll.OwnerSay(body("N4:", 1100))
  elseif msg == "n5" then ll.RezObject(body("N5:", 1100), ll.GetPos() + vector(0, 0, 1), ZERO_VECTOR, ZERO_ROTATION, 0)
  elseif msg == "n6" then ll.RegionSayTo(ll.GetOwner(), 0, body("N6:", 1100))
  elseif msg == "n7" then print(body("N7:", 1100))
  elseif msg == "n8" then ll.Say(DEBUG_CHANNEL, body("N8:", 1060))
  end
end)
ll.Listen(4566, "", "", "")
`

const body = (tag: string, n: number) => (tag + '0123456789'.repeat(120)).slice(0, n)

async function say(msg: string) {
  const { scripts, linkset } = await loadLinkset({
    prims: [
      { name: NAME, scripts: [{ source: { source: PROBE, filename: 'p.luau', language: 'slua' }, name: 'p', start: false }] },
      {
        name: 'listener',
        scripts: [
          {
            source: {
              source:
                'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); llListen(0, "", NULL_KEY, ""); llListen(5, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { heard += [c, m]; } }',
              filename: 'l.lsl',
            },
            name: 'l',
          },
        ],
      },
    ],
  })
  scripts.l!.start()
  const probe = scripts.p!
  probe.start()
  probe.fire('listen', { channel: 4566, name: 'owner', id: '00000000-0000-0000-0000-000000000001', msg })
  linkset.advanceTime(1000)
  const heard = scripts.l!.global('heard') as Array<number | string>
  return {
    shown: probe.chat.map((c) => ({ channel: c.channel, type: c.type, text: c.text })),
    heard: heard.flatMap((v, i) => (i % 2 === 0 ? [{ channel: v as number, text: heard[i + 1] as string }] : [])),
  }
}

describe('long chat from an SLua script under a 63-byte name', () => {
  it.each([
    // In-world: the owner saw 1024 bytes on DEBUG_CHANNEL and the listener heard 1024, not 1151 - 63 = 1088.
    ['ll.Say on DEBUG_CHANNEL', 'n1', DEBUG_CHANNEL, 'say', body('N1:', 1024)],
    // In-world: 1024 bytes again, so a 1060-byte text is cut too.
    ['ll.Say on DEBUG_CHANNEL of 1060 bytes', 'n8', DEBUG_CHANNEL, 'say', body('N8:', 1024)],
    // In-world: the owner saw 1024 bytes in nearby chat, and the listener heard 1024.
    ['ll.Say on channel 0', 'n2', 0, 'say', body('N2:', 1024)],
    // In-world: the listener heard 1024 bytes.
    ['ll.Say on channel 5', 'n3', 5, 'say', body('N3:', 1024)],
  ])('is cut to 1024 bytes for the owner and listeners: %s', async (_what, msg, channel, type, text) => {
    const { shown, heard } = await say(msg)
    expect(shown).toEqual([{ channel, type, text }])
    expect(heard).toEqual([{ channel, text }])
  })

  it.each([
    // In-world: 1024 bytes each.
    ['ll.OwnerSay', 'n4', 'ownerSay', body('N4:', 1024)],
    ['ll.RegionSayTo the owner on channel 0', 'n6', 'regionSayTo', body('N6:', 1024)],
  ])('is cut to 1024 bytes for the owner: %s', async (_what, msg, type, text) => {
    const { shown } = await say(msg)
    expect(shown.map(({ type, text }) => ({ type, text }))).toEqual([{ type, text }])
  })

  // In-world: "Could not find object '<1100 bytes>'." came to 1125 bytes; the listener heard all of them, and the
  // owner saw the first 1088, so the prim's name and the text came to 1151 bytes as for a crash error.
  it("cuts the owner's copy of a simulator error to fit the prim name", async () => {
    const { shown, heard } = await say('n5')
    const error = `Could not find object '${body('N5:', 1100)}'.`
    expect(heard).toEqual([{ channel: DEBUG_CHANNEL, text: error }])
    expect(shown).toEqual([{ channel: DEBUG_CHANNEL, type: 'say', text: error.slice(0, 1088) }])
  })

  // In-world: print showed the owner 1024 bytes as an owner-say from the prim.
  it('shows the owner what print prints, cut to 1024 bytes', async () => {
    const { shown } = await say('n7')
    expect(shown).toEqual([{ channel: 0, type: 'ownerSay', text: body('N7:', 1024) }])
  })

  it('cuts each simulator error up to the flood notice, which it leaves whole', async () => {
    const { scripts, linkset } = await loadLinkset({
      prims: [{ name: NAME, scripts: [{ source: { source: 'for i = 1, 10 do ll.RezObject(string.rep("e", 1100) .. i, ll.GetPos(), ZERO_VECTOR, ZERO_ROTATION, 0) end', filename: 'p.luau', language: 'slua' }, name: 'p', start: false }] }],
    })
    scripts.p!.start()
    linkset.advanceTime(1000)
    const shown = scripts.p!.chat.map((c) => c.text)
    expect(shown.length).toBe(9)
    expect(shown.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, i) => `Could not find object '${'e'.repeat(1100)}${i + 1}'.`.slice(0, 1088)))
    expect(shown[8]).toBe('Too many errors... dropping further messages until the flood stops')
  })
})
