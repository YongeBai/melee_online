import test from 'node:test';
import assert from 'node:assert/strict';
import {createControllerStart} from './controller-start.js';
const pad = (id, index, pressed = []) => ({id, index,
  buttons: Array.from({length:16}, (_, i) => ({pressed:pressed.includes(i)}))});

test('standard Start works on a second pad and fires once per press', () => {
  const input = createControllerStart();
  const pads = [pad('idle virtual pad',0), pad('controller',1,[9])];
  assert.equal(input.poll(pads).start,true);
  assert.equal(input.poll(pads).start,false);
  input.poll([pads[0],pad('controller',1)]);
  assert.equal(input.poll(pads).start,true);
});

test('learn Start after releasing held buttons, persist mapping, and do not start while binding', () => {
  const input = createControllerStart();
  input.learn([pad('adapter',0,[0])]);
  assert.equal(input.poll([pad('adapter',0,[0])]).learning,true);
  input.poll([pad('adapter',0)]);
  assert.deepEqual(input.poll([pad('adapter',0,[7])]),{start:false,mapped:true,learning:false});
  assert.equal(input.poll([pad('adapter',0,[7])]).start,false);
  const saved = createControllerStart(JSON.parse(JSON.stringify(input.bindings)));
  assert.equal(saved.poll([pad('adapter',0,[7])]).start,true);
  assert.equal(saved.poll([pad('adapter',0,[9])]).start,false);
});

test('disconnect clears a held Start edge', () => {
  const input = createControllerStart();
  input.poll([pad('controller',0,[9])]);
  input.poll([]);
  assert.equal(input.poll([pad('controller',0,[9])]).start,true);
});
