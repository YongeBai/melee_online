import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameQueue} from './frame-queue.js';

test('60 Hz video stays responsive on a 144 Hz display without refilling', () => {
  const queue = new FrameQueue();
  let nextFrame = 0, presented = 0, maxWait = 0;
  for (let tick = 0; tick < 144; tick++) {
    const at = tick * 1000 / 144;
    while (nextFrame * 1000 / 60 <= at) {
      assert.equal(queue.push({close() {}}, nextFrame++ * 1000 / 60), 0);
    }
    const entry = queue.take();
    if (entry) { presented++; maxWait = Math.max(maxWait, at - entry.at); }
  }
  assert.equal(presented, 60);
  assert.ok(maxWait < 1000 / 144 + .001);
});

test('bursts retain recent frames in order and release every discarded resource', () => {
  const queue = new FrameQueue(), closed = [];
  for (let i = 0; i < 8; i++) queue.push({id:i, close(){closed.push(i);}}, i);
  assert.deepEqual(closed, [0,1,2,3,4]);
  const entry = queue.take();
  assert.equal(entry.frame.id, 5);
  entry.frame.close();
  queue.clear();
  assert.deepEqual(closed, [0,1,2,3,4,5,6,7]);
  assert.equal(queue.take(), undefined);
  queue.push({id:8, close(){}}, 20);
  assert.equal(queue.take().frame.id, 8);
});

test('correction capacity can shrink without retaining a permanent video backlog', () => {
  const queue = new FrameQueue(8), closed = [];
  for (let i = 0; i < 8; i++) assert.equal(queue.push({close(){closed.push(i);}}, i), 0);
  queue.limit = 3;
  assert.equal(queue.push({close(){closed.push(8);}}, 8), 6);
  assert.deepEqual(closed, [0,1,2,3,4,5]);
  assert.equal(queue.take().at, 6);
});
