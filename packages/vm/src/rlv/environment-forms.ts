import type { ViewerProfile } from './profiles.js'

export const scalarNames = ['densitymultiplier', 'distancemultiplier', 'dropletradius', 'hazedensity', 'hazehorizon',
  'icelevel', 'maxaltitude', 'moisturelevel', 'scenegamma', 'cloudcoverage', 'cloudscale', 'cloudvariance',
  'moonbrightness', 'moonscale', 'sunglowsize', 'sunglowfocus', 'sunscale', 'starbrightness',
  'sunazimuth', 'sunelevation', 'moonazimuth', 'moonelevation', 'eastangle', 'sunmoonposition']
export const vectorNames = ['ambient', 'bluedensity', 'bluehorizon', 'cloudcolor', 'clouddensity', 'clouddetail', 'sunlightcolor', 'cloudscroll']
export const textures = ['cloudtexture', 'moontexture', 'suntexture']
export const legacy: Record<string, string> = { ambient: 'ambient', bluedensity: 'bluedensity', bluehorizon: 'bluehorizon',
  cloudcolor: 'cloudcolor', cloud: 'clouddensity', clouddetail: 'clouddetail', sunmooncolor: 'sunlightcolor', cloudscroll: 'cloudscroll' }
export const kokuaAliases: Record<string, string> = { cloud: 'clouddensity', sunmooncolor: 'sunlightcolor', sunazim: 'sunazimuth',
  sunelev: 'sunelevation', moonazim: 'moonazimuth', moonelev: 'moonelevation', sunimage: 'suntexture',
  moonimage: 'moontexture', cloudimage: 'cloudtexture' }
function components(base: string): string[] {
  return base === 'cloudscroll' ? ['x', 'y'] : ['r', 'g', 'b', 'i', 'x', 'y', 'd']
}
export function environmentNames(profile: ViewerProfile): string[] {
  const result = [...scalarNames, ...vectorNames, ...textures, 'daytime']
  for (const base of Object.keys(legacy)) {
    const suffixes = profile === 'rlv' ? base === 'cloudscroll' ? ['x', 'y']
      : ['cloud', 'clouddetail'].includes(base) ? ['x', 'y', 'd'] : ['r', 'g', 'b', 'i'] : components(base)
    result.push(...suffixes.map(suffix => base + suffix))
  }
  if (profile === 'rlv') {
    result.push(...Object.keys(kokuaAliases))
    result.push(...['x', 'y', 'd'].map(s => 'clouddensity' + s))
    result.push(...['r', 'g', 'b', 'i'].map(s => 'sunlightcolor' + s))
  }
  return [...new Set(result)]
}
/** Explicit forms also retain aliases absent from the other profile as unsupported. */
export function environmentCommandForms(profile: 'rlv' | 'rlva') {
  const supported = new Set(environmentNames(profile))
  const all = [...new Set([...environmentNames('rlv'), ...environmentNames('rlva')])]
  return [
    { behaviour: 'setenv', type: 'add' as const, support: 'enforced' as const, option: 'none' as const },
    ...all.flatMap(name => (['force', 'reply'] as const).map(type => ({ behaviour: `${type === 'force' ? 'setenv' : 'getenv'}_${name}`,
      type, support: supported.has(name) ? 'enforced' as const : 'unsupported' as const, option: 'any' as const }))),
    ...['asset', 'preset', 'daycycle', 'reset'].flatMap(name => (['force', 'reply'] as const).map(type => ({
      behaviour: `${type === 'force' ? 'setenv' : 'getenv'}_${name}`, type,
      support: (profile === 'rlv' ? name === 'reset' ? type === 'force' : name !== 'daycycle' : type === 'force' && name !== 'reset')
        ? 'enforced' as const : 'unsupported' as const, option: 'any' as const }))),
  ]
}

export function environmentSupport(profile: ViewerProfile, behaviour: string, option: string) {
  return behaviour === 'setenv' ? profile !== 'disabled' && !option ? 'enforced' as const : 'unsupported' as const : undefined
}

