// Runs the selected match before first control, then restores the exact full
// machine state. Generated PPC/Wasm code and browser tiers survive the restore;
// gameplay, RNG, actors, stage, and camera return to the captured boundary.
export async function prewarmBrowserMatch(host, frames, {
  onProgress = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 45000,
} = {}) {
  if (!Number.isInteger(frames) || frames < 120 || frames > 1800) {
    throw new Error("Match prewarm requires 120–1800 native frames");
  }
  const command = (action, data = {}) =>
    host.adapter.request("browserRollback", { action, ...data });
  let captured = false;
  let unthrottled = false;
  let frameInput = false;
  let restored = false;
  const startedAt = performance.now();
  try {
    await command("pause");
    await command("step");
    await command("capture", { slot: 5 });
    captured = true;
    await command("frameInput", { enabled: true });
    frameInput = true;
    await command("frameInputStop", { frames });
    await command("unthrottled", { enabled: true });
    unthrottled = true;
    await host.adapter.request("start", {});
    for (;;) {
      await sleep(100);
      const { id, ok, ...stats } = await command("frameInputStats");
      const completedFrames = Math.max(0, stats.lastFrame - stats.startFrame);
      onProgress(`Optimizing match ${Math.min(frames, completedFrames)}/${frames} frames…`);
      if (stats.completed) break;
      if (!stats.active || !stats.valid) throw new Error("Match prewarm workload became invalid");
      if (performance.now() - startedAt > timeoutMs) throw new Error("Match prewarm timed out");
    }
    await command("pause");
    await command("frameInput", { enabled: false });
    frameInput = false;
    await command("restore", { slot: 5 });
    restored = true;
    await command("unthrottled", { enabled: false });
    unthrottled = false;
    await command("release", { slot: 5 });
    captured = false;
    host.adapter.presentationQueue?.clear?.();
    await host.adapter.request("start", {});
    return { frames, elapsedMs: performance.now() - startedAt, restored: true };
  } finally {
    if (!restored || captured || unthrottled || frameInput) {
      const cleanupErrors = [];
      for (const cleanup of [
        () => command("pause"),
        () => frameInput ? command("frameInput", { enabled: false }) : null,
        () => captured && !restored ? command("restore", { slot: 5 }) : null,
        () => unthrottled ? command("unthrottled", { enabled: false }) : null,
        () => captured ? command("release", { slot: 5 }) : null,
        () => host.adapter.request("start", {}),
      ]) {
        try { await cleanup(); } catch (error) { cleanupErrors.push(error); }
      }
      if (cleanupErrors.length) {
        throw new AggregateError(cleanupErrors, "Match prewarm cleanup failed");
      }
    }
  }
}
