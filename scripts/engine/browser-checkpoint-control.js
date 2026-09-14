import {compareFrameInputDigests, measureBrowserNativeInput} from './browser-benchmark.js';

// Repeat unchanged executable code and one native state. No codegen setter:
// even an identical configuration can invalidate descriptors and bias warming.
export async function measureCheckpointControl(host, seconds, inspect, {
  measure, runs: count = 4, onProgress = () => {}, onResult = () => {}, beforeRun,
} = {}) {
  if (typeof measure !== 'function' || !Number.isInteger(count) || count < 2 || count > 8)
    throw Error('Checkpoint control requires image measurement and 2–8 runs');
  const command = (action, data = {}) => host.adapter.request('browserRollback', {action, ...data});
  const runs = [];
  let captured = false, failed, result;
  try {
    await command('pause');
    await command('step');
    await command('capture', {slot: 5});
    captured = true;
    for (let index = 0; index < count; index++) {
      const label = `Identical checkpoint ${index + 1}/${count}`;
      onProgress(label + ': restore and settle');
      await command('pause');
      await command('restore', {slot: 5});
      for (let frame = 0; frame < 120; frame++) await command('step');
      if (beforeRun) await beforeRun(index);
      const measured = await measureBrowserNativeInput(host, seconds, inspect, {
        measure: (h, s, i) => measure(h, s, i, {onPhase: phase => onProgress(label + ': ' + phase)}),
      });
      runs.push({...measured, repetition: index + 1});
      onResult({kind: 'unchanged-checkpoint-control', passed: false, runs});
    }
    const inputConsistency = compareFrameInputDigests(runs);
    result = {kind: 'unchanged-checkpoint-control', runs, inputConsistency,
      diagnosticOnly: Boolean(beforeRun),
      passed: !beforeRun && inputConsistency.passed && runs.every(run => run.passed),
      scope: 'Same native checkpoint and input script. Codegen, timing, rendering, and presentation settings are unchanged. Every run counts; warming may persist between runs.'};
  } catch (error) { failed = error; }
  const errors = [];
  for (const cleanup of [() => command('pause'), () => command('frameInput', {enabled: false}),
    () => captured ? command('release', {slot: 5}) : null, () => host.adapter.request('start', {})]) {
    try { await cleanup(); } catch (error) { errors.push(error.message); }
  }
  if (failed || errors.length) throw Error([failed?.message, ...errors].filter(Boolean).join('; '));
  return result;
}
