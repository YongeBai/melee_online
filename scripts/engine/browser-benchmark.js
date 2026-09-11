// Sample the game canvas itself: emulation ticks and repeated black frames
// cannot establish a playable framerate. This probe is only used in QA mode.
export function summarizeCoreProfile(before, after, seconds) {
  if (!before?.enabled || !after?.enabled || !(seconds > 0)) return null;
  const stages = {};
  for (const [name, end] of Object.entries(after.stages || {})) {
    const start = before.stages?.[name];
    if (!start) continue;
    const count = end.count - start.count, us = end.totalUs - start.totalUs;
    if (count < 0 || us < 0) throw Error("Core profiler reset during measurement");
    stages[name] = { count, totalMs: us / 1000, meanUs: count ? us / count : 0,
      fractionOfWallTime: us / (seconds * 1e6) };
  }
  const { stages: ignored, ...configuration } = after;
  return { configuration, stages, timing: "Inclusive CPU wall time; overlapping scopes and threads must not be summed." };
}

export function summarizeBrowserRun(samples, before, after) {
  if (samples.length < 2) throw Error("Not enough visible frame samples");
  const seconds = (samples.at(-1).at - samples[0].at) / 1000;
  if (!(seconds > 0)) throw Error("Invalid measurement interval");
  let changes = 0, nonblack = 0, lastChange = samples[0].at;
  const gaps = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].nonblack) nonblack++;
    if (i && samples[i].hash !== samples[i - 1].hash) {
      changes++;
      gaps.push(samples[i].at - lastChange);
      lastChange = samples[i].at;
    }
  }
  gaps.push(samples.at(-1).at - lastChange);
  gaps.sort((a, b) => a - b);
  const simulationFps = (after.sceneFrame - before.sceneFrame) / seconds;
  const gameRenderFps = (after.renderFrame - before.renderFrame) / seconds;
  const visibleFps = changes / seconds;
  const minHeight = Math.min(...samples.map(s => s.sourceHeight));
  const minWidth = Math.min(...samples.map(s => s.sourceWidth));
  const sameMatch = before.major === 2 && before.minor === 2 &&
    after.major === 2 && after.minor === 2 && after.sceneFrame > before.sceneFrame;
  const p95GapMs = gaps[Math.floor((gaps.length - 1) * .95)];
  return {
    seconds, simulationFps, gameRenderFps, visibleFps, p95GapMs,
    maxGapMs: gaps.at(-1), sourceResolution: [minWidth, minHeight],
    nonblackFraction: nonblack / samples.length,
    passed: sameMatch && seconds >= 29.5 && simulationFps >= 59.5 && simulationFps <= 60.5 &&
      gameRenderFps >= 59.5 && gameRenderFps <= 60.5 &&
      visibleFps >= 59.5 && minWidth >= 960 && minHeight >= 720 &&
      nonblack / samples.length >= .99 && p95GapMs <= 20,
  };
}

export async function measureBrowserGameplay(host, seconds, inspect, {sampleWidth = 32} = {}) {
  if (document.hidden) throw Error("Keep the game tab visible during measurement");
  if (![32, 64, 96, 128].includes(sampleWidth)) throw Error("Unsupported image probe size");
  const sampleHeight = sampleWidth * 3 / 4;
  const probe = new OffscreenCanvas(sampleWidth, sampleHeight);
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  const before = await inspect();
  const deliveryBefore = browserDeliveryCounter(host);
  const samples = [], started = performance.now();
  await new Promise((resolve, reject) => {
    const sample = () => {
      try {
        if (document.hidden) throw Error("Game tab became hidden during measurement");
        ctx.drawImage(host.canvas, 0, 0, sampleWidth, sampleHeight);
        const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        let hash = 2166136261, nonblack = false;
        for (let i = 0; i < pixels.length; i += 4) {
          for (let channel = 0; channel < 3; channel++) {
            const value = pixels[i + channel];
            if (value > 8) nonblack = true;
            hash = Math.imul(hash ^ value, 16777619);
          }
        }
        samples.push({ at: performance.now(), hash: hash >>> 0, nonblack,
          sourceWidth: host.adapter.presentedWidth ?? host.adapter.width,
          sourceHeight: host.adapter.presentedHeight ?? host.adapter.height });
        if (performance.now() - started >= seconds * 1000) resolve();
        else requestAnimationFrame(sample);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(sample);
  });
  const result = summarizeBrowserRun(samples, before, await inspect());
  // Counts are diagnostics only; they cannot override the visible-image gate.
  result.imageProbe = [sampleWidth, sampleHeight];
  result.canvasSubmissionFps = (browserDeliveryCounter(host) - deliveryBefore) / result.seconds;
  result.sampleCallbackFps = (samples.length - 1) / result.seconds;
  return result;
}

// Diagnostic control run: quantify whether synchronous pixel inspection itself
// limits emulation. Delivery counters do not prove distinct rendered images.
export function browserDeliveryCounter(host) {
  return host.oglSabEnabled ? host.oglSabFramesDrawn || 0 : host.adapter.detachedOglFramesDrawn || 0;
}
export async function measureBrowserDelivery(host, seconds, inspect) {
  if (document.hidden) throw Error("Keep the game tab visible during measurement");
  const before = await inspect(), started = performance.now();
  const firstCount = browserDeliveryCounter(host);
  let lastCount = firstCount, rafCount = 0, changedTicks = 0;
  await new Promise((resolve, reject) => {
    function sample() {
      if (document.hidden) return reject(Error("Game tab became hidden during measurement"));
      rafCount++;
      const count = browserDeliveryCounter(host);
      if (count !== lastCount) changedTicks++;
      lastCount = count;
      if (performance.now() - started >= seconds * 1000) resolve();
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  const elapsed = (performance.now() - started) / 1000;
  const after = await inspect();
  return { seconds: elapsed, simulationFps: (after.sceneFrame - before.sceneFrame) / elapsed,
    deliveryFps: (lastCount - firstCount) / elapsed, rafFps: rafCount / elapsed,
    changedPresentationTicksFps: changedTicks / elapsed,
    sourceResolution: host.oglSabEnabled ? [host.oglSabWidth, host.oglSabHeight] :
      [host.adapter.presentedWidth, host.adapter.presentedHeight],
    diagnosticOnly: true, passed: false };
}
