import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBrowserHeadroomCodegen} from './browser-headroom-comparison.js';
import {browserCodegenConfig} from './browser-benchmark.js';

function fixture({feature = 'chainfusion', failure, drift = false} = {}) {
  const calls = []; let enabled = false, reportedEnabled = false, sites = 0, run = 0;
  const host = {cachedInterpreterDisableMask: (1 << 16) | (1 << 18), fpuGuardHoist: true,
    adapter: {request: async (type, data = {}) => {
      calls.push([type, data]);
      if (data.action === 'codegen') {
        enabled = data[feature];
        if (failure === 'partial setter' && enabled) throw Error('partial setter');
      }
      if (failure === 'release' && data.action === 'release') throw Error('release failed');
      if (type === 'rendererDiagnostics') return {cpuDetails:
        `modcompile:0us/max modinst:0us/max unique-instances:0/65536 reused-instances:0 ${feature}:${Number(reportedEnabled)} ` +
        (feature === 'constantaddr' ? `emit-ram/other:0/${sites}` : feature === 'callfusion' ? `emit-blocks:${sites}` : feature === 'chainfusion' ? `emit-blocks/boundaries:${sites}/${sites * 3}` : `emit-sites:${sites}`)};
      return {};
    }}};
  const measure = async (_h, _i, {frames}) => {
    run++;
    assert.equal(frames, 1200);
    if (failure === 'measurement') throw Error('measurement failed');
    if (enabled && failure !== 'stale') sites += 10;
    reportedEnabled = enabled;
    return {nativeWorkFps: 70, passed: true, controllerStress: {valid: true, startFrame: 420,
      digests: [{frame: 1200, input: 1, state: drift && run === 3 ? 5 : 2}], gaps: []}};
  };
  return {host, calls, measure};
}
test('identical fixed work preserves unrelated flags and only changes codegen at mode boundaries', async () => {
  for (const feature of ['constantaddr', 'callfusion', 'chainfusion', 'bswaprotate']) {
    const f = fixture({feature});
    const result = await compareBrowserHeadroomCodegen(f.host, () => {}, {feature, measure: f.measure});
    assert.equal(result.passed, false); assert.equal(result.diagnosticOnly, true);
    assert.equal(result.inputConsistency.passed, true);
    assert.deepEqual(result.runs.map(r => r.enabled), [false, false, true, true, true, true, false, false]);
    assert.ok(result.runs.every(r => !r.passed && r.config.fpuguard && r.config.regcache));
    assert.equal(f.calls.filter(([, d]) => d.action === 'restore').length, 8);
    assert.deepEqual(f.calls.filter(([, d]) => d.action === 'codegen').map(([, d]) => d[feature]), [true, false, false]);
    assert.deepEqual(f.calls.at(-2), ['browserRollback', {action: 'codegen', ...browserCodegenConfig(f.host)}]);
    assert.deepEqual(f.calls.at(-1), ['start', {}]);
  }
});
test('missing new coverage and failures restore pacing, input, codegen and resume', async () => {
  for (const failure of ['stale', 'measurement', 'partial setter', 'release']) {
    const f = fixture({failure});
    await assert.rejects(compareBrowserHeadroomCodegen(f.host, () => {}, {measure: f.measure}),
      failure === 'stale' ? /no new compiled coverage/ : new RegExp(failure));
    assert.deepEqual(f.calls.slice(-6).map(([t, d]) => d.action || t),
      ['pause', 'unthrottled', 'frameInput', 'release', 'codegen', 'start']);
    assert.deepEqual(f.calls.at(-2)[1], {action: 'codegen', ...browserCodegenConfig(f.host)});
  }
});
test('trajectory mismatch fails consistency even with fast native throughput', async () => {
  const f = fixture({drift: true});
  const result = await compareBrowserHeadroomCodegen(f.host, () => {}, {measure: f.measure});
  assert.equal(result.inputConsistency.passed, false); assert.equal(result.passed, false);
});
test('invalid options do not mutate the emulator', async () => {
  const f = fixture();
  for (const options of [{frames: 60}, {feature: 'unknown'}])
    await assert.rejects(compareBrowserHeadroomCodegen(f.host, () => {}, options), /requires/);
  assert.equal(f.calls.length, 0);
});
