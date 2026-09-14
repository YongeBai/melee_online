import test from 'node:test';
import assert from 'node:assert/strict';
import {measureCheckpointControl} from './browser-checkpoint-control.js';

function fixture(fail = false) {
  const commands = [];
  return {commands, host: {adapter: {request: async (type, data = {}) => {
    commands.push([type, data]);
    if (data.action === 'frameInputStats') return {valid: true, inputChanges: [30, 30],
      observedActions: [[1, 2, 3], [1, 2, 3]], digests: [{frame: 1200, input: 10, state: 20}], gaps: []};
    return {};
  }}}, measure: async () => { if (fail) throw Error('image failure'); return {passed: true}; }};
}
test('unchanged control restores one checkpoint and never resets code generation', async () => {
  const f = fixture();
  const result = await measureCheckpointControl(f.host, 30, async () => ({}), {measure: f.measure});
  assert.equal(result.passed, true);
  assert.equal(result.runs.length, 4);
  assert.equal(f.commands.filter(([, d]) => d.action === 'capture').length, 1);
  assert.equal(f.commands.filter(([, d]) => d.action === 'restore').length, 4);
  assert.equal(f.commands.filter(([, d]) => d.action === 'codegen').length, 0);
  assert.deepEqual(f.commands.at(-1), ['start', {}]);
});
test('failed capture releases checkpoint and controller script', async () => {
  const f = fixture(true);
  await assert.rejects(measureCheckpointControl(f.host, 30, async () => ({}), {measure: f.measure}), /image failure/);
  assert.ok(f.commands.some(([, d]) => d.action === 'release' && d.slot === 5));
  assert.deepEqual(f.commands.at(-3), ['browserRollback', {action: 'frameInput', enabled: false}]);
  assert.deepEqual(f.commands.at(-1), ['start', {}]);
});
test('manual diagnostic boundaries cannot claim acceptance', async () => {
  const f = fixture(), boundaries = [];
  const result = await measureCheckpointControl(f.host, 30, async () => ({}), {
    measure: f.measure, beforeRun: async index => { boundaries.push(index); },
  });
  assert.deepEqual(boundaries, [0, 1, 2, 3]);
  assert.equal(result.diagnosticOnly, true);
  assert.equal(result.passed, false);
  assert.ok(result.runs.every(run => run.passed));
});
