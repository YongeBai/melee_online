// Integration test: real Melee, full Dolphin saves, deliberately late inputs.
// Run separately from an occupied GPU worker: node scripts/native/verify-rollback.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { encodePNG } from "../assets/gx-textures.mjs";
import { RoomWorker } from "./room-worker.mjs";
import { RollbackSession, dolphinAdapter, neutralPad } from "./rollback.mjs";
const worker = new RoomWorker("rollback-validation");
const frameCount = Number(process.env.MELEE_VERIFY_FRAMES || 75);
assert.ok(Number.isInteger(frameCount) && frameCount >= 75 && frameCount <= 3600);
const reportName = process.env.MELEE_VERIFY_REPORT || "rollback-validation.json";
assert.match(reportName, /^[a-z0-9-]+\.json$/);
const characters = (process.env.MELEE_VERIFY_CHARACTERS || "2,20").split(",").map(Number);
assert.ok(characters.length === 2 && characters.every((n) => Number.isInteger(n) && n >= 0 && n < 26));
const frames = [];
let lastKey = 0;
worker.on("media", (data) => {
  if (data[0] === 1) {
    if (data[1] & 1) lastKey = frames.length;
    frames.push(Buffer.from(data.subarray(10)));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, timeout = 30000) {
  const end = Date.now() + timeout;
  let since = 0,
    first = 0,
    last = 0;
  while (Date.now() < end) {
    const s = await worker.request("meleeInspect");
    if (predicate(s)) {
      if (!since || s.sceneFrame < last) {
        since = Date.now();
        first = s.sceneFrame;
      }
      if (Date.now() - since > 1500 && s.sceneFrame - first >= 60) return s;
    } else since = 0;
    last = s.sceneFrame;
    await sleep(100);
  }
  throw Error(
    "Native scene did not stabilize: " + JSON.stringify(await worker.request("meleeInspect")),
  );
}
function checkVideo(name) {
  const finalGop = frames.slice(lastKey);
  const decoded = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "h264",
      "-i",
      "pipe:0",
      "-vf",
      `select=eq(n\\,${finalGop.length - 1})`,
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { input: Buffer.concat(finalGop), maxBuffer: 8e6 },
  );
  assert.equal(decoded.status, 0, decoded.stderr?.toString());
  assert.equal(decoded.stdout.length, 1280 * 720 * 3, "Final rollback video frame must decode");
  let bright = 0;
  const rgba = new Uint8Array(1280 * 720 * 4);
  for (let i = 0; i < 1280 * 720; i++) {
    const rgb = decoded.stdout.subarray(i * 3, i * 3 + 3);
    rgba.set(rgb, i * 4);
    rgba[i * 4 + 3] = 255;
    if (rgb[0] + rgb[1] + rgb[2] > 90) bright++;
  }
  const result = { receivedFrames: frames.length, decodedFrames: finalGop.length,
    nonBlackFraction: bright / (1280 * 720) };
  assert.ok(
    result.nonBlackFraction > 0.05,
    "Restored GPU must render visible Melee, not a black frame",
  );
  fs.writeFileSync(
    new URL(`../../.local-tools/${name}.png`, import.meta.url),
    encodePNG(Buffer.from(rgba), 1280, 720),
  );
  return result;
}
try {
  await worker.open();
  await worker.css();
  await worker.request("meleeControl", {
    action: "select", player: characters[0], cpu: characters[1], online: true,
  });
  // The QA selection path reloads CSS so Melee can preload fighter archives.
  // Wait for the new scene before issuing Start, just like normal readiness.
  await waitFor((s) => s.major === 2 && s.minor === 0 && s.sceneKind === 8 && s.cssReady);
  await worker.request("meleeControl", { action: "roomLayout", online: true });
  await worker.request("meleeControl", { action: "start", online: true });
  await worker.rollback("pads", { pads: [{ mask: 16 }, {}] });
  await sleep(200);
  await worker.rollback("pads", { pads: [{}, {}] });
  await waitFor((s) => s.major === 2 && s.minor === 1 && s.sceneKind === 9 && s.sceneFrame > 90);
  await worker.request("meleeControl", { action: "selectStage", stage: 31 });
  await waitFor((s) => s.match?.elapsed > 60);
  await worker.request("pause");
  await worker.rollback("stepping", { value: true });
  await worker.rollback("step");
  await worker.rollback("snapshot", { slot: 17 });
  const original = await worker.rollback("hash");
  const events = [
    { f: 0, port: 0, pad: { ...neutralPad(), stickX: 224 } },
    { f: 7, port: 1, pad: { ...neutralPad(), stickX: 32 } },
    { f: 15, port: 0, pad: { ...neutralPad(), mask: 4 } },
    { f: 22, port: 1, pad: { ...neutralPad(), mask: 1, analogA: 255 } },
    { f: 30, port: 0, pad: neutralPad() },
    { f: 40, port: 1, pad: neutralPad() },
  ];
  if (process.env.MELEE_VERIFY_STRESS) {
    events.length = 0;
    for (let base = 0; base + 65 < frameCount; base += 90) {
      const direction = (base / 90) % 2 ? 32 : 224;
      for (const [offset, port, pad] of [
        [0, 0, { stickX: direction }], [6, 1, { stickX: 256 - direction }],
        [12, 0, {}], [18, 1, {}], [24, 0, { mask: 4 }], [30, 1, { mask: 4 }],
        [40, 0, { mask: 1, analogA: 255 }], [46, 1, { mask: 2, analogB: 255 }],
        [50, 0, {}], [56, 1, {}],
      ]) events.push({ f: base + offset, port, pad: { ...neutralPad(), ...pad } });
    }
  }
  const report = {
    backend: process.env.MELEE_NATIVE_BACKEND || "OGL",
    kind: "Full Dolphin state rollback",
    resolution: [1280, 720],
    requestedCharacters: characters,
    frameCount,
    inputEvents: events.length,
    checkpointInterval: Number(process.env.MELEE_VERIFY_INTERVAL || 4),
    trials: [],
  };
  let reference;
  assert.ok(Number.isInteger(report.checkpointInterval) && report.checkpointInterval >= 1 &&
    report.checkpointInterval <= 12);
  for (const delay of [0, 1, 3, 5, 9]) {
    await worker.rollback("restore", { slot: 17 });
    assert.equal((await worker.rollback("hash")).hash, original.hash);
    const net = new RollbackSession(dolphinAdapter(worker), { checkpointInterval: report.checkpointInterval });
    const started = performance.now();
    for (let f = 0; f < frameCount; f++) {
      for (const e of events) if (e.f + delay === f) net.input(e.port, e.f, e.pad);
      await net.advance();
    }
    const elapsed = performance.now() - started,
      final = await worker.rollback("hash");
    if (delay === 0 && !process.env.MELEE_VERIFY_STRESS)
      assert.ok(
        Math.abs(final.state.fighters[1].x - original.state.fighters[1].x) > 5,
        "P2 controller must move its assigned fighter",
      );
    reference ??= final.hash;
    assert.equal(final.hash, reference, `Melee desync with ${delay} late frames`);
    if (delay) assert.ok(net.stats.rollbacks > 0 && net.stats.resimulatedFrames > 0);
    const trial = {
      delayFrames: delay,
      hash: final.hash,
      elapsedMs: elapsed,
      simulationFps: frameCount * 1000 / elapsed,
      ...net.stats,
      fighters: final.state.fighters,
    };
    report.trials.push(trial);
    console.log(JSON.stringify(trial));
  }
  await sleep(200);
  report.afterRollbackVideo = checkVideo("rollback-after");
  await worker.rollback("cachetest", { slot: 17 });
  assert.equal((await worker.rollback("hash")).hash, original.hash,
    "Code-cache fallback must restore the entire original state");
  report.codeInvalidation = "Passed: changed compiled instruction forced a cache clear before execution";
  await worker.rollback("stepping", { value: false });
  await worker.request("meleeControl", { action: "quit" });
  await worker.request("start");
  await waitFor((s) => s.major === 2 && s.minor === 4 && s.sceneFrame > 180);
  await worker.request("meleeControl", { action: "returnCss", online: true });
  await waitFor(
    (s) => s.major === 2 && s.minor === 0 && s.sceneKind === 8 && s.cssReady && s.sceneFrame > 240,
  );
  // CSS loads its native objects asynchronously; retry the actual Start press
  // until the new screen accepts it, as the room monitor does with readiness.
  for (let attempt = 0; attempt < 12; attempt++) {
    const s = await worker.request("meleeInspect");
    if (s.major === 2 && s.minor === 1) break;
    if (s.major === 2 && s.minor === 0 && s.cssReady) {
      await worker.request("meleeControl", { action: "roomLayout", online: true });
      await worker.request("meleeControl", { action: "start", online: true });
      await worker.rollback("pads", { pads: [{ mask: 16 }, {}] });
      await sleep(200);
      await worker.rollback("pads", { pads: [{}, {}] });
    }
    await sleep(1000);
  }
  await waitFor((s) => s.major === 2 && s.minor === 1 && s.sceneKind === 9 && s.sceneFrame > 90);
  await worker.request("meleeControl", { action: "selectStage", stage: 31 });
  const rematch = await waitFor((s) => s.match?.elapsed > 120);
  assert.deepEqual(
    rematch.fighters.map((f) => f.controllerIndex),
    [0, 1],
    "Owner is P1; guest is P2 in the rematch",
  );
  report.rematch = {
    stage: rematch.match.stage,
    controllers: rematch.fighters.map((f) => f.controllerIndex),
  };
  await worker.request("pause");
  await sleep(200); // Drain the final frame from the asynchronous encoder.
  report.finalVideo = checkVideo("rollback-rematch");
  if (process.env.MELEE_VERIFY_MIN_FPS) {
    const minimum = Number(process.env.MELEE_VERIFY_MIN_FPS);
    assert.ok(Number.isFinite(minimum) && minimum > 0);
    for (const trial of report.trials)
      assert.ok(trial.simulationFps >= minimum,
        `${trial.delayFrames}-frame delayed inputs: ${trial.simulationFps.toFixed(2)} FPS < ${minimum}`);
    report.minimumSimulationFps = minimum;
  }
  fs.writeFileSync(
    new URL(`../../docs/${reportName}`, import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("PASS: all delayed-input runs match the known-input Melee reference");
} finally {
  worker.close();
}
