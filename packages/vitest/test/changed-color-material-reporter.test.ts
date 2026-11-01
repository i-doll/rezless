// In-world: the verbatim issue-362 script produced 2, 2, 4096, 4096, 4096.
// Aditi, SLua Tideland, Firestorm 7.3.0.83011, Mono, 2026-11-01.
import {loadScript} from '../src/index.js'
import {fileURLToPath} from 'node:url'
import {expect, it} from 'vitest'

const SCRIPT = fileURLToPath(new URL('./fixtures/changed-color-material-reporter.lsl', import.meta.url))

it('changed events for colour and PBR material changes', async () => {
    const s = await loadScript(SCRIPT)
    s.start()
    s.advanceTime(60_000)

    expect(s.chat.map(c => c.text.trimEnd())).toEqual([
        'color => events 1: 2',
        'alpha => events 1: 2',
        'material set => events 1: 4096',
        'gltf override => events 1: 4096',
        'material removed => events 1: 4096',
    ])
})
