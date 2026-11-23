import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// In-world: one box held a remover script and six victim scripts of the source below. The
// remover sent each victim a link message, then removed it with llRemoveInventory (Aditi, SLua
// Tideland, 2026-11-23). Removal took effect at once: the remover's next line counted one script
// fewer and llGetInventoryType gave INVENTORY_NONE, and no script got a changed event.
// A victim in a loop with no delay was stopped mid-loop too. rezless runs a handler with no delay
// to its end before another script runs, so that case can't happen here.
const VICTIM = `
  default {
    link_message(integer s, integer n, string m, key k) {
      string me = llGetScriptName();
      if (m != me) return;
      string a = (string)k;
      if (a == "sleep") { llOwnerSay(me + " slp"); llSleep(4); llOwnerSay(me + " woke"); llSleep(2); llOwnerSay(me + " woke2"); }
      else if (a == "q") llOwnerSay(me + " got q");
      else if (a == "timer") { llOwnerSay(me + " timer on"); llSetTimerEvent(1.0); }
    }
    timer() { llOwnerSay(llGetScriptName() + " tick"); }
    changed(integer c) { llOwnerSay(llGetScriptName() + " changed " + (string)c); }
  }
`

const REMOVER = `
  string mode;
  msg(string who, string what) { llMessageLinked(LINK_THIS, 0, who, what); }
  rm(string name) {
    llRemoveInventory(name);
    llOwnerSay("rm " + name + " n=" + (string)llGetInventoryNumber(INVENTORY_SCRIPT) + " type=" + (string)llGetInventoryType(name));
  }
  default {
    touch_start(integer t) {
      mode = llGetObjectDesc();
      if (mode == "sleep") { msg("v-sleep", "sleep"); llSleep(1); rm("v-sleep"); }
      else if (mode == "q") { msg("v-q", "q"); rm("v-q"); }
      else if (mode == "sq") { msg("v-sq", "sleep"); llSleep(1); msg("v-sq", "q"); rm("v-sq"); }
      else if (mode == "timer") { msg("v-timer", "timer"); llSleep(2.5); rm("v-timer"); }
      else if (mode == "stop") { llSetScriptState("v-stop", FALSE); llSleep(1); llOwnerSay("v-stop running=" + (string)llGetScriptState("v-stop")); rm("v-stop"); }
    }
    changed(integer c) { llOwnerSay("remover changed " + (string)c); }
  }
`

async function removeVictim(mode: string, victim: string) {
  const made = await loadLinkset({
    prims: [{
      description: mode,
      scripts: [
        { name: 'remover', source: { source: REMOVER, filename: 'remover.lsl' } },
        { name: victim, source: { source: VICTIM, filename: 'victim.lsl' } },
      ],
    }],
  })
  for (const s of Object.values(made.scripts)) s.start()
  made.scripts.remover!.fire('touch_start', { num_detected: 1 })
  made.linkset.advanceTime(10_000)
  return Object.values(made.scripts).flatMap((s) => s.chat.map((c) => c.text))
}

describe('a script removing another script', () => {
  it('stops a sleeping script before it wakes', async () => {
    // In-world: v-sleep said "slp" and never "woke".
    expect(await removeVictim('sleep', 'v-sleep')).toEqual(['rm v-sleep n=1 type=-1', 'v-sleep slp'])
  })

  it('drops an event sent to the script just before', async () => {
    // In-world: a link message sent in the same handler as the removal never reached v-q.
    expect(await removeVictim('q', 'v-q')).toEqual(['rm v-q n=1 type=-1'])
  })

  it('drops an event queued while the script sleeps', async () => {
    // In-world: v-sq, asleep with a second link message queued, neither woke nor ran it.
    expect(await removeVictim('sq', 'v-sq')).toEqual(['rm v-sq n=1 type=-1', 'v-sq slp'])
  })

  it('stops its timer', async () => {
    // In-world: v-timer ticked twice before the removal and never after.
    expect(await removeVictim('timer', 'v-timer')).toEqual(['rm v-timer n=1 type=-1', 'v-timer timer on', 'v-timer tick', 'v-timer tick'])
  })

  it('removes a stopped script the same way', async () => {
    // In-world: a script stopped with llSetScriptState went with no error and no changed event.
    expect(await removeVictim('stop', 'v-stop')).toEqual(['v-stop running=0', 'rm v-stop n=1 type=-1'])
  })
})
