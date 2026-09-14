import test from 'node:test';
import assert from 'node:assert/strict';
import {profileDirectBlocks, aggregateTimedBlocks} from './browser-dispatch-profile.js';

function fixture(fail = false) {
  let enabled = false;
  const commands = [];
  return {commands, host: {adapter: {request: async (type, data = {}) => {
    commands.push([type, data]);
    if (data.action === 'dispatchProfile') { enabled = data.enabled ?? enabled; return {enabled, samples: 10}; }
    if (data.action === 'frameInputStats') return {valid: true, inputChanges: [20, 20], observedActions: [[1, 2, 3], [1, 2, 3]]};
    return {};
  }}}, measure: async () => { if (fail) throw Error('image failure'); return {passed: true}; }};
}
test('profiling cannot pass acceptance and restores profiling and input after success or failure', async () => {
  for (const fail of [false, true]) {
    const f = fixture(fail);
    if (fail) await assert.rejects(profileDirectBlocks(f.host, 30, async () => ({}), {measure: f.measure}), /image failure/);
    else {
      const result = await profileDirectBlocks(f.host, 30, async () => ({}), {measure: f.measure});
      assert.equal(result.passed, false);
      assert.equal(result.diagnosticOnly, true);
      assert.equal(result.dispatchProfile.samples, 10);
    }
    assert.deepEqual(f.commands.slice(-3), [
      ['browserRollback', {action: 'dispatchProfile', enabled: false}],
      ['browserRollback', {action: 'frameInput', enabled: false}], ['start', {}],
    ]);
    assert.ok(!f.commands.some(([, data]) => data.action === 'codegen'));
  }
});
test('timed blocks respect symbol boundaries and keep unmapped samples separate', () => {
  const result = aggregateTimedBlocks({blocks: [
    {pc: 100, samples: 2, sampledUs: 10}, {pc: 103, samples: 4, sampledUs: 20},
    {pc: 104, samples: 1, sampledUs: 7}, {pc: 110, samples: 2, sampledUs: 40},
  ]}, [{start: 100, size: 4, name: 'first'}, {start: 110, size: 4, name: 'second'}]);
  assert.deepEqual(result, [
    {name: 'second', start: 110, samples: 2, sampledUs: 40, blocks: 1},
    {name: 'first', start: 100, samples: 6, sampledUs: 30, blocks: 2},
    {name: 'Unmapped block', start: 104, samples: 1, sampledUs: 7, blocks: 1},
  ]);
});
