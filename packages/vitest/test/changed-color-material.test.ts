import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'
import { changedScene, MATERIAL } from './helpers/changed-events.js'

// https://wiki.secondlife.com/wiki/CHANGED_COLOR
// https://wiki.secondlife.com/wiki/CHANGED_RENDER_MATERIAL
// In-world: issue-362 setter series, Aditi, SLua Tideland, 2026-11-01,
// Firestorm 7.3.0.83011, Mono. Colour writes emit 2 even for identical values
// and invalid faces. Material writes emit 4096 only when IDs or overrides change.

describe('changed colour and material events', () => {
  it.each([
    'llSetColor(<1,0,0>,0);',
    'llSetAlpha(0.5,0);',
    'llSetLinkColor(LINK_THIS,<1,0,0>,ALL_SIDES);',
    'llSetLinkAlpha(LINK_THIS,0.5,ALL_SIDES);',
    'llSetPrimitiveParams([PRIM_COLOR,0,<1,0,0>,1.0]);',
    'llSetLinkPrimitiveParams(LINK_THIS,[PRIM_COLOR,0,<1,0,0>,1.0]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_COLOR,ALL_SIDES,<1,0,0>,1.0]);',
    'llSetColor(<1,1,1>,ALL_SIDES);',
    'llSetAlpha(1.0,99);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_COLOR,99,<1,1,1>,1.0]);',
  ])('notifies the setter and sibling scripts for %s', async body => {
    const s = await changedScene(body)
    expect(s.driver).toEqual([2])
    expect(s.root).toEqual([2])
    expect(s.child).toEqual([])
  })

  // In-world: root -> child colour and material writes notify only child scripts;
  // child -> root colour writes notify only root scripts.
  it.each([
    ['llSetLinkColor(2,<1,0,0>,0);', 2],
    ['llSetLinkAlpha(2,0.5,0);', 2],
    ['llSetLinkPrimitiveParamsFast(2,[PRIM_RENDER_MATERIAL,0,MATERIAL]);', 4096],
  ] as const)('routes a remote write to its target: %s', async (body, flag) => {
    const s = await changedScene(body)
    expect(s.root).toEqual([])
    expect(s.driver).toEqual([])
    expect(s.child).toEqual([flag])
  })

  it('routes a child script colour write to the root', async () => {
    const s = await changedScene('llSetLinkColor(1,<0.8,0.7,0.6>,0);', '', 'child')
    expect(s.root).toEqual([2])
    expect(s.child).toEqual([])
    expect(s.driver).toEqual([])
  })

  it.each([
    'llSetRenderMaterial(MATERIAL,0);',
    'llSetLinkRenderMaterial(LINK_THIS,MATERIAL,ALL_SIDES);',
    'llSetPrimitiveParams([PRIM_RENDER_MATERIAL,0,MATERIAL]);',
    'llSetLinkPrimitiveParams(LINK_THIS,[PRIM_RENDER_MATERIAL,0,MATERIAL]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_RENDER_MATERIAL,ALL_SIDES,MATERIAL]);',
  ])('reports material assignment for %s', async body => {
    expect((await changedScene(body)).driver).toEqual([4096])
  })

  it('does not report identical material IDs, empty removals, or invalid faces', async () => {
    const s = await changedScene(`
      llSetRenderMaterial(MATERIAL,0);
      llSetRenderMaterial(NULL_KEY,1);
      llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_RENDER_MATERIAL,99,MATERIAL]);
    `, 'llSetRenderMaterial(MATERIAL,0);')
    expect(s.driver).toEqual([])
    expect(s.root).toEqual([])
  })

  it('reports removal and clearing overrides by reapplying the material', async () => {
    const removed = await changedScene('llSetRenderMaterial(NULL_KEY,ALL_SIDES);', 'llSetRenderMaterial(MATERIAL,0);')
    expect(removed.driver).toEqual([4096])
    const reset = await changedScene('llSetRenderMaterial(MATERIAL,0);', `
      llSetRenderMaterial(MATERIAL,0);
      llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_GLTF_EMISSIVE,0,"",<1,1,0>,ZERO_VECTOR,0.0,<0.2,0.1,0.3>]);
    `)
    expect(reset.driver).toEqual([4096])
  })

  it.each([
    'PRIM_GLTF_BASE_COLOR,0,"",<1,1,0>,ZERO_VECTOR,0.0,<1,0,0>,1.0,0,0.5,0',
    'PRIM_GLTF_NORMAL,0,"",<2,2,0>,ZERO_VECTOR,0.0',
    'PRIM_GLTF_METALLIC_ROUGHNESS,0,"",<1,1,0>,ZERO_VECTOR,0.0,0.3,0.8',
    'PRIM_GLTF_EMISSIVE,0,"",<1,1,0>,ZERO_VECTOR,0.0,<0.2,0.1,0.3>',
  ])('reports an override change once, and suppresses a repeat: %s', async rule => {
    const changed = await changedScene(`llSetLinkPrimitiveParamsFast(LINK_THIS,[${rule}]);`, 'llSetRenderMaterial(MATERIAL,0);')
    expect(changed.driver).toEqual([4096])
    const repeated = await changedScene(`llSetLinkPrimitiveParamsFast(LINK_THIS,[${rule}]);`, `
      llSetRenderMaterial(MATERIAL,0); llSetLinkPrimitiveParamsFast(LINK_THIS,[${rule}]);
    `)
    expect(repeated.driver).toEqual([])
  })

  it('does not report default normal transforms, overrides without a material, or the override shortcut', async () => {
    expect((await changedScene('llSetPrimitiveParams([PRIM_GLTF_NORMAL,0,"",<1,1,0>,ZERO_VECTOR,0.0]);', 'llSetRenderMaterial(MATERIAL,0);')).driver).toEqual([])
    expect((await changedScene('llSetPrimitiveParams([PRIM_GLTF_NORMAL,0,"",<1,1,0>,ZERO_VECTOR,0.0]);')).driver).toEqual([])
    expect((await changedScene('llSetLinkGLTFOverrides(LINK_THIS,0,[OVERRIDE_GLTF_BASE_ALPHA,0.25]);', 'llSetRenderMaterial(MATERIAL,0);')).driver).toEqual([])
  })

  // In-world: consecutive colour writes -> [2]; mixed rules/calls -> [4098].
  // With 0.3-second sleeps, three colours -> [2,2], mixed -> [2,4098] in
  // the sleeping setter while an idle sibling receives each frame's event.
  it.each([
    ['llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_COLOR,0,<1,0,0>,1.0,PRIM_COLOR,1,<0,1,0>,0.5]);', [2]],
    ['llSetColor(<1,0,0>,0);llSetLinkColor(LINK_THIS,<0,1,0>,1);llSetLinkAlpha(LINK_THIS,0.3,2);', [2]],
    ['llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_COLOR,0,<1,0,0>,1.0,PRIM_RENDER_MATERIAL,0,MATERIAL]);', [4098]],
    ['llSetColor(<1,0,0>,0);llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_RENDER_MATERIAL,0,MATERIAL]);', [4098]],
  ] as const)('coalesces changes in one handler: %s', async (body, expected) => {
    const s = await changedScene(body)
    expect(s.driver).toEqual(expected)
    expect(s.root).toEqual(expected)
  })

  it('keeps at most two queued events and ORs later bits into the second', async () => {
    const s = await changedScene(`llSetColor(<1,0,0>,0);llSleep(0.3);
      llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_RENDER_MATERIAL,0,MATERIAL]);llSleep(0.3);llSetAlpha(0.3,0);`)
    expect(s.driver).toEqual([2,4098])
    expect(s.root).toEqual([2,4096,2])
  })

  it('discards changes made while a script is stopped', async () => {
    const s = await changedScene(`llSetScriptState("root",FALSE);llSetColor(<1,0,0>,0);
      llSleep(0.3);llSetScriptState("root",TRUE);`)
    expect(s.driver).toEqual([2])
    expect(s.root).toEqual([])
  })

  it('runs the issue reproduction one step at a time', async () => {
    const s = await loadScript({ source: `string MATERIAL="${MATERIAL}";
      list names=["color","alpha","material set","gltf override","material removed"];
      list seen; integer step;
      default {
        state_entry(){llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_COLOR,0,<1,1,1>,1.0,PRIM_RENDER_MATERIAL,0,NULL_KEY]);llSetTimerEvent(3.0);}
        changed(integer c){seen+=c;}
        timer(){
          if(step>0)llOwnerSay(llList2String(names,step-1)+" => events "+(string)llGetListLength(seen)+": "+llList2CSV(seen));
          seen=[];
          if(step==5){llSetTimerEvent(0.0);return;}
          if(step==0)llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_COLOR,0,<1,0,0>,1.0]);
          else if(step==1)llSetLinkAlpha(LINK_THIS,0.5,0);
          else if(step==2)llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_RENDER_MATERIAL,0,MATERIAL]);
          else if(step==3)llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_GLTF_BASE_COLOR,0,"",<1,1,0>,ZERO_VECTOR,0.0,<1,0,0>,1.0,0,0.5,0]);
          else llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_RENDER_MATERIAL,0,NULL_KEY]);
          ++step;
        }
      }` })
    s.start()
    s.advanceTime(60000)
    expect(s.chat.map(c => c.text.trimEnd())).toEqual([
      'color => events 1: 2', 'alpha => events 1: 2', 'material set => events 1: 4096',
      'gltf override => events 1: 4096', 'material removed => events 1: 4096',
    ])
  })
})
