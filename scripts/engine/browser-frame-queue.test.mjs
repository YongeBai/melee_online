import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserFrameQueue} from './browser-frame-queue.js';

function fixture() {
  let callback, next = 0;
  const shown = [], closed = [];
  const queue = new BrowserFrameQueue(b => {shown.push(b.id); b.close();}, {
    schedule: cb => {callback = cb; return ++next;}, cancel: () => {callback = null;}, period: 1000 / 60,
  });
  return {queue, shown, closed, push: id => queue.push({id, close: () => closed.push(id)}),
    tick: at => {const cb = callback; callback = null; cb?.(at);}};
}

test('buffers one frame and presents each image in order', () => {
  const f = fixture(); f.push(1); f.tick(0); assert.deepEqual(f.shown, []);
  f.push(2); f.tick(16.67); f.push(3); f.tick(33.34); f.tick(50.01);
  assert.deepEqual(f.shown, [1,2,3]); assert.deepEqual(f.closed, [1,2,3]);
});
test('120 Hz display callbacks do not double the presentation rate', () => {
  const f = fixture(); f.push(1); f.push(2); f.tick(0); f.push(3);
  f.tick(8.33); assert.deepEqual(f.shown, [1]);
  f.tick(16.67); assert.deepEqual(f.shown, [1,2]);
});
test('bounds queue latency and closes discarded resources', () => {
  const f = fixture(); for(let i=1;i<=5;i++) f.push(i);
  assert.deepEqual(f.closed, [1,2]); assert.equal(f.queue.queue.length,3);
  f.tick(0); assert.deepEqual(f.shown,[3]);
  f.queue.close(); f.push(6); f.tick(20);
  assert.deepEqual(f.closed,[1,2,3,4,5,6]); assert.deepEqual(f.shown,[3]);
});
test('re-primes after a producer stall without replaying old images', () => {
  const f = fixture(); f.push(1); f.push(2); f.tick(0); f.tick(17); f.tick(34);
  assert.equal(f.queue.stats.underruns,1);
  f.push(3); f.tick(51); assert.deepEqual(f.shown,[1,2]);
  f.push(4); f.tick(68); assert.deepEqual(f.shown,[1,2,3]);
});
