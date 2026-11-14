import { RLV_MANIFEST, type RlvCommandForm } from './manifest.js'
import type { RlvProfile } from './profiles.js'

/** Frozen form snapshots expose support depth without claiming action enforcement. */
const coverage = new Map<RlvProfile, readonly RlvCommandForm[]>()

export function getRlvCommandCoverage(profile: RlvProfile): readonly RlvCommandForm[] {
  const cached = coverage.get(profile)
  if (cached) return cached
  const rank = { add: 0, force: 1, reply: 2 }
  const forms = Object.freeze(RLV_MANIFEST.commands.flatMap(entry => entry.profiles[profile].commandForms ?? [])
    .map(form => Object.freeze({ ...form }))
    .sort((a, b) => rank[a.type] - rank[b.type] || (a.behaviour < b.behaviour ? -1 : a.behaviour > b.behaviour ? 1 : 0)))
  coverage.set(profile, forms)
  return forms
}

// RLVa's behaviour dictionary in the order RlvBehaviourDictionary adds its entries, each strict
// restriction followed by its _sec name. Discovery lists matches in this order.
// In-world: "@getcommand:chat;add" -> chatwhisper;chatnormal;chatshout;recvchat;..., and the force,
// reply and _sec lists matched this order (Aditi, SLua Tideland, 2026-11-14, Firestorm RLVa 2.4.2).
const dictionary = new Map(([
  ['add', 'acceptpermission accepttp accepttp_sec accepttprequest accepttprequest_sec addattach addoutfit allowidle alwaysrun attachthis attachallthis attachthis_except attachallthis_except buy chatwhisper chatnormal chatshout detach detachthis detachallthis detachthis_except detachallthis_except edit editattach editobj editworld viewtransparent viewwireframe showpropertylines emote fartouch fly interact jump notify pay permissive recvchat recvchat_sec recvchatfrom recvchatfrom_sec recvemote recvemote_sec recvemotefrom recvemotefrom_sec recvim recvim_sec recvimfrom recvimfrom_sec redirchat rediremote remattach remoutfit rez sendchannel sendchannel_sec sendchannel_except sendchannel_except_sec sendchat sendim sendim_sec sendimto sendimto_sec sendgesture setdebug setenv lockenv setgroup share share_sec sharedunwear sharedwear showhovertext showhovertextall showhovertexthud showhovertextworld showinv showloc showminimap shownames shownames_sec shownametags shownametags_sec shownearby showpeople showareasearch showlookat showfavwear showcontacts showsearch worldsounds worldsounds_sec worldsound worldsound_sec soundothers soundothers_sec soundself soundself_sec showself showselfhead showworldmap sit sittp standtp startim startim_sec startimto startimto_sec temprun touchall touchattach touchattachother touchattachself touchfar touchhud touchme touchthis touchworld tplm tploc tplocal tplure tplure_sec tprequest tprequest_sec unsharedunwear unsharedwear unsit viewnote viewscript viewtexture editprofile editpicks editdisplayname editpfp setcam setcam_avdist setcam_avdistmin setcam_avdistmax setcam_origindistmin setcam_origindistmax setcam_eyeoffset setcam_eyeoffsetscale setcam_focusoffset setcam_fovmin setcam_fovmax setcam_pitchmin setcam_pitchmax setcam_yaw setcam_mouselook setcam_textures setcam_unlock camavdist camdistmin camdistmax camtextures camzoommin camzoommax camunlock setoverlay setoverlay_touch'],
  ['force', 'setoverlay_tween'],
  ['add', 'setsphere'],
  ['force', 'attach attachall attachover attachallover attachthis attachallthis attachthisover attachallthisover detach detachall detachthis detachallthis remattach remoutfit addoutfit addoutfitall addoutfitover addoutfitallover addoutfitthis addoutfitallthis addoutfitthisover addoutfitallthisover attachoverorreplace attachalloverorreplace attachthisoverorreplace attachallthisoverorreplace adjustheight detachme fly setcam_focus setcam_eyeoffset setcam_eyeoffsetscale setcam_focusoffset setcam_fov setcam_mode setgroup setprofileimage sit sitground tpto unsit blockedimmsg'],
  ['reply', 'findfolder findfolders getaddattachnames getaddoutfitnames getattach getattachnames getcam_avdist getcam_avdistmin getcam_avdistmax getcam_fov getcam_fovmin getcam_fovmax getcam_textures getcommand getgroup getheightoffset getinv getinvworn getoutfit getoutfitnames getpath getpathnew getremattachnames getremoutfitnames getsitid getstatus getstatusall version versionnew versionnum'],
] as const).flatMap(([type, names]) => names.split(' ').map(name => type + ':' + name)).map((key, index) => [key, index]))

/** Untruncated discovery text; undefined means this profile has no query handler. */
export function getRlvCommands(profile: RlvProfile, option = ''): string | undefined {
  if (profile !== 'rlva') return undefined
  const [filter = '', type = '', separator = ';'] = option.split(';')
  if (!['', 'any', 'add', 'force', 'reply'].includes(type)) return ''
  // Environment and debug settings and the overlay and sphere modifiers are parsed outside the
  // dictionary, so discovery never lists them. In-world: "@getcommand:env" -> setenv;lockenv.
  return getRlvCommandCoverage(profile)
    .filter(form => form.support !== 'unsupported' && dictionary.has(form.type + ':' + form.behaviour) &&
      form.behaviour.includes(filter) && (!type || type === 'any' || type === form.type))
    .sort((a, b) => dictionary.get(a.type + ':' + a.behaviour)! - dictionary.get(b.type + ':' + b.behaviour)!)
    .map(form => form.behaviour).join(separator)
}
