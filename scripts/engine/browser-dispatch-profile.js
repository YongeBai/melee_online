import {measureBrowserNativeInput} from './browser-benchmark.js';

export async function profileDirectBlocks(host, seconds, inspect, {measure} = {}) {
  const command = (action, data = {}) => host.adapter.request('browserRollback', {action, ...data});
  let result, failed;
  try {
    await command('pause');
    await command('dispatchProfile', {enabled: true});
    result = await measureBrowserNativeInput(host, seconds, inspect, {measure});
    await command('pause');
    result.dispatchProfile = await command('dispatchProfile', {enabled: false});
    if (!result.dispatchProfile.samples || result.dispatchProfile.enabled)
      throw Error('Direct dispatch profiler did not record compiled blocks');
  } catch (error) { failed = error; }
  const errors = [];
  for (const cleanup of [() => command('pause'), () => command('dispatchProfile', {enabled: false}),
    () => command('frameInput', {enabled: false}), () => host.adapter.request('start', {})]) {
    try { await cleanup(); } catch (error) { errors.push(error.message); }
  }
  if (failed || errors.length) throw Error([failed?.message, ...errors].filter(Boolean).join('; '));
  return {...result, kind: 'sampled-direct-block-profile', diagnosticOnly: true, passed: false,
    profileScope: 'Host wall duration around every 1024th complete compiled block in the production dispatch loop. Preserves chaining, original compiled code, timing and exception checks. Includes clock/import overhead and host preemption; excludes dispatcher bookkeeping, partial blocks and native callbacks. Periodic sampling may be biased. Not performance acceptance.'};
}

export function aggregateTimedBlocks(profile, functions) {
  const groups = new Map();
  for (const block of profile.blocks) {
    let low = 0, high = functions.length;
    while (low < high) { const mid = (low + high) >>> 1; if (functions[mid].start <= block.pc) low = mid + 1; else high = mid; }
    const fn = functions[low - 1];
    const mapped = fn && block.pc < fn.start + fn.size;
    const key = mapped ? fn.start : block.pc;
    const group = groups.get(key) || {name: mapped ? fn.name : 'Unmapped block', start: key, samples: 0, sampledUs: 0, blocks: 0};
    group.samples += block.samples; group.sampledUs += block.sampledUs; group.blocks++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.sampledUs - a.sampledUs);
}
