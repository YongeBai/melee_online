import {browserCodegenConfig, compareFrameInputDigests} from './browser-benchmark.js';
import {measureBrowserHeadroom} from './browser-headroom.js';
import {measureWithJitCounters} from './browser-jit-measurement.js';

function coverage(details, feature, enabled) {
  const pattern = feature === 'matrixfast' ? /matrixfast:(\d+) compile\/run\/fallback:(\d+)\/(\d+)\/(\d+)/ : feature === 'constantaddr' ? /constantaddr:(\d+) emit-ram\/other:(\d+)\/(\d+)/ : feature === 'callfusion' ? /callfusion:(\d+) emit-blocks:(\d+)/ : feature === 'chainfusion'
    ? /chainfusion:(\d+) emit-blocks\/boundaries:(\d+)\/(\d+)/
    : /bswaprotate:(\d+) emit-sites:(\d+)/;
  const match = pattern.exec(details || '');
  if (!match || Number(match[1]) !== Number(enabled))
    throw Error('Headroom codegen coverage or mode unavailable');
  if(feature==='matrixfast'){
    const reasons=/fallback-reasons:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(details||'');
    return{enabled,sites:Number(match[2]),runs:Number(match[3]),fallbacks:Number(match[4]),fallbackReasons:['fp','stack','a','b','out','unit'].reduce((value,name,index)=>{value[name]=Number(reasons?.[index+1]||0);return value;},{})};
  }
  return {enabled, sites: Number(match[2])+(feature==='constantaddr'?Number(match[3]):0), ...(match[3] ? feature==='constantaddr'?{ramSites:Number(match[2]),otherSites:Number(match[3])}:{boundaries: Number(match[3])} : {})};
}

// Fixed native work from one checkpoint, including rendering at its current
// resolution. Temporarily uncapped; this cannot establish visible 720p60.
export async function compareBrowserHeadroomCodegen(host, inspect, {
  feature = 'chainfusion', frames = 1200, onProgress = () => {}, onResult = () => {},
  measure = measureBrowserHeadroom,
} = {}) {
  if (!['matrixfast', 'constantaddr', 'callfusion', 'chainfusion', 'bswaprotate'].includes(feature) ||
      !Number.isInteger(frames) || frames < 1200 || frames > 3600)
    throw Error('Headroom comparison requires a supported feature and 1200–3600 frames');
  const original = browserCodegenConfig(host);
  const base = feature === 'matrixfast' ? {...original, callfusion: true} : original;
  const command = (action, data = {}) => host.adapter.request('browserRollback', {action, ...data});
  const readCoverage = async enabled => coverage(
    (await host.adapter.request('rendererDiagnostics', {})).cpuDetails, feature, enabled);
  const runs = [];
  let captured = false, failed, result, current = base[feature];
  try {
    await command('pause');
    if(feature === 'matrixfast')await command('codegen', base);
    await command('step');
    await command('capture', {slot: 5}); captured = true;
    for (const [index, enabled] of [false, true, true, false].entries()) {
      await command('pause');
      // Native helper text is cached until execution/compilation advances.
      // Read the old counter before setting a new mode, then validate the
      // actual new mode after the measured workload refreshed that text.
      const before = await readCoverage(current);
      // Do not flush descriptors between two runs of the same mode.
      const changed = current !== enabled;
      if (changed) { await command('codegen', {...base, [feature]: enabled}); current = enabled; }
      for (const warmup of [true, false]) {
        const label = `${feature} ${enabled ? 'on' : 'off'} ${warmup ? 'warmup' : 'measurement'} ${index + 1}/4`;
        onProgress(label + ': restoring checkpoint');
        await command('pause');
        await command('restore', {slot: 5});
        const measured = await measureWithJitCounters(host, () => measure(host, inspect, {
          frames, onProgress: text => onProgress(label + ': ' + text),
        }));
        await command('pause');
        const after = await readCoverage(enabled);
        const matrixFallbacksAccounted=feature!=='matrixfast'||(Object.values(after.fallbackReasons).reduce((total,count)=>total+count,0)===after.fallbacks&&after.fallbackReasons.fp===after.fallbacks&&after.fallbacks<=Math.max(1,Math.ceil(after.runs/1000)));
        if (enabled && (after.sites <= 0 || (changed && warmup && after.sites <= before.sites) ||
            (feature === 'matrixfast' && (after.runs <= before.runs || !matrixFallbacksAccounted))))
          throw Error('Headroom candidate produced no new compiled coverage');
        runs.push({...measured, enabled, warmup, config: {...base, [feature]: enabled},
          coverage: after, passed: false, diagnosticOnly: true});
        onResult({kind: 'uncapped-checkpoint-codegen-abba', feature, frames,
          diagnosticOnly: true, passed: false, runs});
      }
    }
    const inputConsistency = compareFrameInputDigests(runs);
    result = {kind: 'uncapped-checkpoint-codegen-abba', feature, frames, runs,
      inputConsistency, diagnosticOnly: true, passed: false,
      limits: 'Exact native-frame count and common checkpoint, uncapped host pacing, no image verifier. Rolling fingerprints do not replace raw machine replay. Native-work FPS is not visible FPS or input-to-photon latency.'};
  } catch (error) { failed = error; }
  const errors = [];
  for (const cleanup of [() => command('pause'), () => command('unthrottled', {enabled: false}),
    () => command('frameInput', {enabled: false}), () => captured ? command('release', {slot: 5}) : null,
    () => command('codegen', original),
    () => host.adapter.request('start', {})]) {
    try { await cleanup(); } catch (error) { errors.push(error.message); }
  }
  if (failed || errors.length) throw Error([failed?.message, ...errors].filter(Boolean).join('; '));
  return result;
}
