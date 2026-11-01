import { loadLinkset, type Script } from '../../src/index.js'

export const MATERIAL = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'
const watcher = { source: 'list seen; default { changed(integer c) { seen += c; } }' }

export async function changedScene(body: string, setup = '', caller: 'root' | 'child' = 'root') {
  const driver = {
    name: 'driver',
    source: { source: `string MATERIAL = "${MATERIAL}"; list seen; list out;
      default {
        state_entry() { ${setup} llSetTimerEvent(3.0); }
        timer() { llSetTimerEvent(0.0); seen = []; ${body} }
        changed(integer c) { seen += c; }
      }` },
  }
  const { scripts, linkset } = await loadLinkset({ prims: [
    { scripts: [{ name: 'root', source: watcher }, ...(caller === 'root' ? [driver] : [])] },
    { scripts: [{ name: 'child', source: watcher }, ...(caller === 'child' ? [driver] : [])] },
  ] })
  scripts.root!.start()
  scripts.child!.start()
  scripts.driver!.start()
  scripts.driver!.advanceTime(2900)
  const before = { root: events(scripts.root!).length, child: events(scripts.child!).length }
  scripts.driver!.advanceTime(10100)
  return {
    scripts, linkset,
    driver: events(scripts.driver!),
    root: events(scripts.root!).slice(before.root),
    child: events(scripts.child!).slice(before.child),
  }
}

export const events = (script: Script): unknown[] => script.global('seen') as unknown[]
