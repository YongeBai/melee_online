import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBrowserRun, summarizeCoreProfile, browserDeliveryCounter } from "./browser-benchmark.js";

test("delivery diagnostics use the active transport, never stale bitmap counts", () => {
  assert.equal(browserDeliveryCounter({oglSabEnabled:true, oglSabFramesDrawn:60,
    adapter:{detachedOglFramesDrawn:10}}), 60);
  assert.equal(browserDeliveryCounter({oglSabEnabled:true, adapter:{detachedOglFramesDrawn:10}}), 0);
  assert.equal(browserDeliveryCounter({oglSabEnabled:false, oglSabFramesDrawn:60,
    adapter:{detachedOglFramesDrawn:10}}), 10);
});

const before = { major: 2, minor: 2, sceneFrame: 100, renderFrame: 100 };
const after = { ...before, sceneFrame: 1900, renderFrame: 1900 };
const samples = () => Array.from({ length: 1801 }, (_, i) => ({
  at: i * 1000 / 60, hash: i, nonblack: true, sourceWidth: 960, sourceHeight: 720,
}));
test("accepts 30 seconds of changing 720p60 gameplay", () => {
  assert.equal(summarizeBrowserRun(samples(), before, after).passed, true);
});
test("rejects 60 simulation ticks with black, repeated, low-resolution, or slow frames", () => {
  for (const alter of [
    s => ({ ...s, nonblack: false, hash: 1 }),
    s => ({ ...s, hash: 1 }),
    s => ({ ...s, sourceWidth: 320, sourceHeight: 240 }),
    (s, i) => ({ ...s, hash: Math.floor(i / 2) }),
  ]) assert.equal(summarizeBrowserRun(samples().map(alter), before, after).passed, false);
});
test("rejects measurements outside a match and short runs", () => {
  assert.equal(summarizeBrowserRun(samples(), before, { ...after, minor: 0 }).passed, false);
  assert.equal(summarizeBrowserRun(samples().slice(0, 61), before, { ...after, sceneFrame: 160 }).passed, false);
});
test("rejects fast-forward simulation even if presentation is 60 FPS", () => {
  assert.equal(summarizeBrowserRun(samples(), before, { ...after, sceneFrame: 3700 }).passed, false);
});
test("rejects a game rendering at 30 FPS even if the canvas changes at 60 FPS", () => {
  assert.equal(summarizeBrowserRun(samples(), before, { ...after, renderFrame: 1000 }).passed, false);
});
test("core profiling uses interval deltas rather than boot-time totals", () => {
  const a = { enabled: true, stages: { glPresent: { count: 100, totalUs: 900000 } } };
  const b = { enabled: true, stages: { glPresent: { count: 160, totalUs: 930000 } } };
  assert.deepEqual(summarizeCoreProfile(a, b, 1).stages.glPresent,
    { count: 60, totalMs: 30, meanUs: 500, fractionOfWallTime: .03 });
  assert.equal(summarizeCoreProfile({ enabled: false }, b, 1), null);
  assert.throws(() => summarizeCoreProfile(b, a, 1), /reset/);
});
