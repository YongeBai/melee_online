import test from 'node:test';
import assert from 'node:assert/strict';
import {characterSelectReady} from './melee-startup.js';
import {AudioController} from '../../engines/wasm-dolphin/src/audio.js';

function fixture() {
  const buffers = [], targets = [];
  globalThis.window = {location: {search: ''}};
  const audio = new AudioController({outputEnabled: false});
  audio.muted = false;
  audio.volume = 0.25;
  audio.gain = {gain: {setTargetAtTime: value => targets.push(value)}};
  audio.context = {
    currentTime: 0, sampleRate: 48000, state: 'running',
    createBuffer(channels, frames) {
      const data = Array.from({length: channels}, () => new Float32Array(frames));
      buffers.push(data);
      return {getChannelData: channel => data[channel]};
    },
    createBufferSource: () => ({connect() {}, start() {}}),
  };
  return {audio, buffers, targets};
}
const chunk = () => ({available: true, channels: 2, frames: 2,
  sampleRate: 48000, samples: new Int16Array([16384, -16384, 8192, -8192])});

test('startup requires initialized character select, not a scene transition or match', () => {
  const css = {major: 2, minor: 0, sceneKind: 8, sceneFrame: 60};
  assert.equal(characterSelectReady(css), true);
  for (const state of [undefined, {...css, major: 1}, {...css, minor: 2},
    {...css, sceneKind: 1}, {...css, sceneFrame: 59}])
    assert.equal(characterSelectReady(state), false);
});

test('volume and unmute updates cannot bypass startup; queued boot PCM stays silent', () => {
  const {audio, buffers, targets} = fixture();
  audio.setVolume(0.8);
  assert.equal(targets.at(-1), 0);
  audio.scheduleChunk(chunk());
  audio.setOutputEnabled(true);
  assert.equal(targets.at(-1), 0.8);
  assert.deepEqual(buffers[0].map(a => [...a]), [[0, 0], [0, 0]]);
  audio.scheduleChunk(chunk());
  assert.deepEqual(buffers[1].map(a => [...a]), [[0.5, 0.25], [-0.5, -0.25]]);
  audio.muted = true;
  audio.setOutputEnabled(true);
  assert.equal(targets.at(-1), 0);
});

test('audio requested during boot stays silent when CSS becomes ready before its reply', async () => {
  const {audio, buffers} = fixture();
  let reply, calls = 0;
  audio.source = () => ++calls === 1 ? new Promise(resolve => {reply = resolve;})
    : Promise.resolve({available: true, frames: 0, samples: new Int16Array()});
  const pending = audio.pump();
  audio.setOutputEnabled(true);
  reply(chunk());
  await pending;
  assert.deepEqual(buffers[0].map(a => [...a]), [[0, 0], [0, 0]]);
});
