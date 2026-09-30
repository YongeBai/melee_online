import test from 'node:test';
import assert from 'node:assert/strict';
import {createActiveGamepad} from './active-gamepad.js';
const pad = (index, pressed = false, axis = 0) => ({id:`pad${index}`,index,
  buttons:[{pressed}],axes:[axis,0,0,0]});
test('an idle virtual pad cannot hide the controller being used or steal its release', () => {
  const select = createActiveGamepad();
  assert.equal(select([pad(0),pad(1)]).index,0);
  assert.equal(select([pad(0),pad(1,true)]).index,1);
  assert.equal(select([pad(0),pad(1)]).index,1);
  assert.equal(select([pad(0,false,.1),pad(1)]).index,1);
  assert.equal(select([pad(0,false,.9),pad(1)]).index,0);
  assert.equal(select([null,pad(1)]).index,1);
  assert.equal(select([]),null);
});
