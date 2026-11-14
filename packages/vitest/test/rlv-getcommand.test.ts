import { describe, expect, it } from 'vitest'
import { loadRlvPair, getRlvCommandCoverage, getRlvCommands, World, loadLinkset } from '../src/index.js'

// RLV protocol: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI
// In-world: filter/type/empty and custom separators, invalid type -> empty reply; long replies -> one 1023-byte message
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, viewer 7.2.5.81978, API 3.4.3).
// Discovery is specific to Firestorm RLVa 2.4.2; Kokua RLV 2.09.35.00 has no query handler.
describe('RLVa implemented-command discovery', () => {
  it('filters implemented names and types without advertising unsupported force effects', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),"");
        llOwnerSay("@getcommand:sit=219101,getcommand:sit;any=219101,getcommand:sit;add=219101,getcommand:sit;force=219101,getcommand:sit;reply=219101,getcommand:sit;;##=219101,getcommand:issue219missing=219101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      expect(script.global('replies')).toEqual(profile === 'rlva'
        ? ['sit;sittp;unsit;sit;sitground;unsit;getsitid', 'sit;sittp;unsit;sit;sitground;unsit;getsitid', 'sit;sittp;unsit', 'sit;sitground;unsit', 'getsitid', 'sit##sittp##unsit##sit##sitground##unsit##getsitid', ''] : [])
      expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    }
  })

  it('preserves explicit empty separators and ignores fields after the separator', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),"");
        llOwnerSay("@getcommand:sit;any;=219101,getcommand:sit;any;ABC;ignored=219101,getcommand:sit;unknown=219101,getcommand:version;reply;##=219101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script } = pair[profile]
      script.start()
      expect(script.global('replies')).toEqual(profile === 'rlva'
        ? ['sitsittpunsitsitsitgroundunsitgetsitid', 'sitabcsittpabcunsitabcsitabcsitgroundabcunsitabcgetsitid', '', 'version##versionnew##versionnum'] : [])
    }
  })

  it('truncates a long discovery reply once through the viewer reply policy', async () => {
    const separator = '#'.repeat(600)
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),"");
        llOwnerSay("@getcommand:version;reply;${separator}=219101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    pair.rlva.script.start(); pair.rlv.script.start()
    expect(pair.rlva.script.global('replies')).toEqual(['version' + separator + 'versionnew' + '#'.repeat(406)])
    expect(pair.rlv.script.global('replies')).toEqual([])
  })


  it('distinguishes unknown names, wrong parameter kinds and unimplemented forms without wire acknowledgements', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),"");
        llOwnerSay("@issue219unknown=219101,version=force,notify:219103=n"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    for (const { script, avatar } of Object.values(pair)) {
      script.start()
      expect(script.global('replies')).toEqual([])
      expect(avatar.viewer.commandLog.map(entry => entry.status)).toEqual(['unsupported', 'unsupported', 'applied'])
      expect(avatar.viewer.commandLog.map(entry => entry.outcome)).toEqual([
        'unknown-behaviour', 'wrong-parameter-kind', undefined,
      ])
      expect(new Set(avatar.viewer.diagnostics.map(entry => entry.detail)).size).toBe(2)
    }
  })


  it('discovers only implemented forms, while metadata separates state from enforcement', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),"");
        llOwnerSay("@getcommand=219101,getcommand:;add=219101,getcommand:;reply=219101,getcommand:;force=219101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    pair.rlva.script.start(); pair.rlv.script.start()
    expect(pair.rlva.script.global('replies')).toEqual([
      'acceptpermission;accepttp;accepttp_sec;accepttprequest;accepttprequest_sec;addattach;addoutfit;allowidle;alwaysrun;attachthis;attachallthis;attachthis_except;attachallthis_except;buy;chatwhisper;chatnormal;chatshout;detach;detachthis;detachallthis;detachthis_except;detachallthis_except;edit;editattach;editobj;editworld;viewtransparent;viewwireframe;emote;fartouch;fly;interact;jump;notify;pay;permissive;recvchat;recvchat_sec;recvchatfrom;recvchatfrom_sec;recvemote;recvemote_sec;recvemotefrom;recvemotefrom_sec;recvim;recvim_sec;recvimfrom;recvimfrom_sec;redirchat;rediremote;remattach;remoutfit;rez;sendchannel;sendchannel_sec;sendchannel_except;sendchannel_except_sec;sendchat;sendim;sendim_sec;sendimto;sendimto_sec;sendgesture;setdebug;setenv;setgroup;sharedunwear;sharedwear;showhovertext;showhovertextall;showhovertexthud;showhovertextworld;showinv;showloc;showminimap;shownames;shownames_sec;shownametags;shownametags_sec;shownearby;showself;showselfhead;showworldmap;sit;sittp;standtp;startim;startim_sec;startim',
      'acceptpermission;accepttp;accepttp_sec;accepttprequest;accepttprequest_sec;addattach;addoutfit;allowidle;alwaysrun;attachthis;attachallthis;attachthis_except;attachallthis_except;buy;chatwhisper;chatnormal;chatshout;detach;detachthis;detachallthis;detachthis_except;detachallthis_except;edit;editattach;editobj;editworld;viewtransparent;viewwireframe;emote;fartouch;fly;interact;jump;notify;pay;permissive;recvchat;recvchat_sec;recvchatfrom;recvchatfrom_sec;recvemote;recvemote_sec;recvemotefrom;recvemotefrom_sec;recvim;recvim_sec;recvimfrom;recvimfrom_sec;redirchat;rediremote;remattach;remoutfit;rez;sendchannel;sendchannel_sec;sendchannel_except;sendchannel_except_sec;sendchat;sendim;sendim_sec;sendimto;sendimto_sec;sendgesture;setdebug;setenv;setgroup;sharedunwear;sharedwear;showhovertext;showhovertextall;showhovertexthud;showhovertextworld;showinv;showloc;showminimap;shownames;shownames_sec;shownametags;shownametags_sec;shownearby;showself;showselfhead;showworldmap;sit;sittp;standtp;startim;startim_sec;startim',
      'findfolder;findfolders;getaddattachnames;getaddoutfitnames;getattach;getattachnames;getcam_avdist;getcam_avdistmin;getcam_avdistmax;getcam_fov;getcam_fovmin;getcam_fovmax;getcommand;getgroup;getinv;getinvworn;getoutfit;getoutfitnames;getpath;getpathnew;getremattachnames;getremoutfitnames;getsitid;getstatus;getstatusall;version;versionnew;versionnum', 'attach;attachall;attachover;attachallover;attachthis;attachallthis;attachthisover;attachallthisover;detach;detachall;detachthis;detachallthis;remattach;remoutfit;addoutfitall;addoutfitallover;addoutfitthis;addoutfitallthis;addoutfitthisover;addoutfitallthisover;attachoverorreplace;attachalloverorreplace;attachthisoverorreplace;attachallthisoverorreplace;adjustheight;detachme;fly;setcam_eyeoffset;setcam_eyeoffsetscale;setcam_focusoffset;setcam_fov;setgroup;sit;sitground;tpto;unsit',
    ])
    expect(pair.rlv.script.global('replies')).toEqual([])
    const coverage = getRlvCommandCoverage('rlva')
    expect(coverage).toContainEqual({ behaviour: 'tplm', type: 'add', support: 'enforced', option: 'none' })
    expect(coverage).toContainEqual({ behaviour: 'sit', type: 'add', support: 'enforced', option: 'none' })
    expect(coverage).toContainEqual({ behaviour: 'sit', type: 'force', support: 'enforced', option: 'any' })
    expect(coverage).toContainEqual({ behaviour: 'getcommand', type: 'reply', support: 'enforced', option: 'any' })
    expect(Object.isFrozen(coverage)).toBe(true)
    expect(coverage.every(Object.isFrozen)).toBe(true)
    expect(getRlvCommandCoverage('rlv').some(form => form.behaviour === 'getcommand')).toBe(false)
    expect(getRlvCommands('rlv')).toBeUndefined()
    expect(getRlvCommands('rlva', 'version;wrong')).toBe('')
  })

  it('keeps unknown Kokua wire rules inspectable without adding RLVa discovery support', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),"");
        llOwnerSay("@getcommand=n,getcommand=219101,getstatus=219101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    pair.rlv.script.start(); pair.rlva.script.start()
    expect(pair.rlv.script.global('replies')).toEqual(['/getcommand'])
    expect(pair.rlv.avatar.viewer.restrictions.snapshot().map(rule => rule.support)).toEqual(['unsupported'])
    expect(pair.rlv.avatar.viewer.commandLog.slice(0, 2).map(entry => entry.outcome)).toEqual(['unknown-behaviour', 'unknown-behaviour'])
    expect(pair.rlva.script.global('replies')).toEqual([
      'acceptpermission;accepttp;accepttp_sec;accepttprequest;accepttprequest_sec;addattach;addoutfit;allowidle;alwaysrun;attachthis;attachallthis;attachthis_except;attachallthis_except;buy;chatwhisper;chatnormal;chatshout;detach;detachthis;detachallthis;detachthis_except;detachallthis_except;edit;editattach;editobj;editworld;viewtransparent;viewwireframe;emote;fartouch;fly;interact;jump;notify;pay;permissive;recvchat;recvchat_sec;recvchatfrom;recvchatfrom_sec;recvemote;recvemote_sec;recvemotefrom;recvemotefrom_sec;recvim;recvim_sec;recvimfrom;recvimfrom_sec;redirchat;rediremote;remattach;remoutfit;rez;sendchannel;sendchannel_sec;sendchannel_except;sendchannel_except_sec;sendchat;sendim;sendim_sec;sendimto;sendimto_sec;sendgesture;setdebug;setenv;setgroup;sharedunwear;sharedwear;showhovertext;showhovertextall;showhovertexthud;showhovertextworld;showinv;showloc;showminimap;shownames;shownames_sec;shownametags;shownametags_sec;shownearby;showself;showselfhead;showworldmap;sit;sittp;standtp;startim;startim_sec;startim', '',
    ])
    expect(pair.rlva.avatar.viewer.commandLog[0]).toMatchObject({ status: 'unsupported', outcome: 'wrong-parameter-kind' })
    expect(pair.rlva.avatar.viewer.restrictions.snapshot()).toEqual([])
  })

  it('rejects invalid channels and distinguishes an invalid type from a successful empty match', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),"");
        llOwnerSay("@getcommand=-219101,getcommand=0,getcommand=2147483647,getcommand:;wrong=219101,getcommand:nomatch=219101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    pair.rlva.script.start(); pair.rlv.script.start()
    expect(pair.rlva.script.global('replies')).toEqual(['', ''])
    expect(pair.rlv.script.global('replies')).toEqual([])
    expect(pair.rlva.avatar.viewer.commandLog.slice(0, 3).map(entry => entry.outcome)).toEqual([
      'invalid-channel', 'invalid-channel', 'invalid-channel',
    ])
    expect(pair.rlva.avatar.viewer.commandLog[3]).toMatchObject({ status: 'replied', outcome: 'invalid-option' })
    expect(pair.rlva.avatar.viewer.commandLog[4]).not.toHaveProperty('outcome')
  })

  it('keeps disabled viewers inert', async () => {
    const world = new World(); world.addRegion('test', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'off', region: 'test' })
    const loaded = await loadLinkset({ world, region: 'test', owner: avatar.key, prims: [{ scripts: [{ name: 'off', source: { source: `integer replies; default {
      state_entry() { llListen(219101,"",llGetOwner(),""); llOwnerSay("@getcommand=219101,unknown=force"); }
      listen(integer c,string n,key id,string m) { ++replies; }
    }` } }] }] })
    loaded.scripts.off!.start()
    expect(loaded.scripts.off!.global('replies')).toBe(0)
    expect(avatar.viewer.commandLog).toEqual([])
    expect(avatar.viewer.diagnostics).toEqual([])
  })

})


it('discovers the force aliases used for child UUID and point-group removal once each', async () => {
 const pair = await loadRlvPair({ source: `list replies; default {
  state_entry() { llListen(317101,"",NULL_KEY,""); llOwnerSay("@getcommand:detach;force=317101,getcommand:remattach;force=317101"); }
  listen(integer c,string n,key id,string m) { replies += [m]; }
 }` })
 for (const [profile, f] of Object.entries(pair)) {
  f.script.start()
  expect(f.script.global('replies'), profile).toEqual(profile === 'rlva'
   ? ['detach;detachall;detachthis;detachallthis;detachme', 'remattach'] : [])
 }
})

describe('@getcommand filter matching', () => {
  // In-world: "@getcommand:sit;force" -> sit;sitground;unsit, "@getcommand:SIT" -> the same list as
  // "@getcommand:sit", "@getcommand:density" -> "", "@getcommand:env" -> setenv;lockenv,
  // "@getcommand:debug" -> setdebug, "@getcommand:overlay" -> setoverlay;setoverlay_touch;
  // setoverlay_tween, "@getcommand:sphere" -> setsphere (Aditi, SLua Tideland, 2026-11-14, Firestorm
  // RLVa 2.4.2). RLVa matches a substring of the names in its behaviour dictionary
  // (RlvBehaviourDictionary::getCommands); environment and debug settings and the overlay and sphere
  // modifiers are handled outside it. rezless lists only what it implements.
  it('matches a substring of the dictionary names, ignoring case', async () => {
    const { rlva: { script } } = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(467102,"",llGetOwner(),"");
        llOwnerSay("@getcommand:sit;force=467102,getcommand:SIT=467102,getcommand:density=467102,getcommand:env=467102,getcommand:debug=467102,getcommand:sphere=467102"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    script.start()
    expect(script.global('replies')).toEqual(['sit;sitground;unsit', 'sit;sittp;unsit;sit;sitground;unsit;getsitid', '', 'setenv', 'setdebug', 'setsphere'])
  })

  // In-world: "@getcommand:chat;add" -> chatwhisper;chatnormal;chatshout;recvchat;recvchat_sec;
  // recvchatfrom;recvchatfrom_sec;redirchat;sendchat;touchattach;touchattachother;touchattachself,
  // and "@getcommand:getcam" -> getcam_avdist;getcam_avdistmin;getcam_avdistmax;getcam_fov;
  // getcam_fovmin;getcam_fovmax;getcam_textures: the dictionary's order, not sorted.
  it('lists matches in the dictionary\'s order', () => {
    expect(getRlvCommands('rlva', 'chat;add')).toBe('chatwhisper;chatnormal;chatshout;recvchat;recvchat_sec;recvchatfrom;recvchatfrom_sec;redirchat;sendchat;touchattach;touchattachother;touchattachself')
    expect(getRlvCommands('rlva', 'getcam_avdist')).toBe('getcam_avdist;getcam_avdistmin;getcam_avdistmax')
  })
})
