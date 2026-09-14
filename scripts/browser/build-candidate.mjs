import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const engine = resolve(root, "engines/wasm-dolphin");
const local = resolve(root, ".browser-tools");
const outputDir = resolve(process.env.DOLPHIN_WASM_OUTPUT_DIR || resolve(engine, "build/browser-output"));
const buildDir = resolve(process.env.DOLPHIN_WASM_BUILD_DIR || resolve(engine, "build/dolphin-wasm"));
const lockPath = resolve(local, "linux-toolchain.lock.json");
const hash = p => createHash("sha256").update(readFileSync(p)).digest("hex");
Object.assign(process.env, {
  DOLPHIN_TOOLCHAIN_LOCK: lockPath,
  DOLPHIN_WASM_OUTPUT_DIR: outputDir,
  DOLPHIN_WASM_BUILD_DIR: buildDir,
  RUSTUP_HOME: resolve(local, "rustup"),
  CARGO_HOME: resolve(local, "cargo"),
});
const { verifyWasmToolchain } = await import("../../engines/wasm-dolphin/tools/wasm-toolchain.mjs");
const { paths } = verifyWasmToolchain();
const run = (exe, args) => execFileSync(exe, args, { cwd: engine, stdio: "inherit", env: process.env });
const configurePath = resolve(buildDir, "wasm-dolphin-configure.json");
if (!existsSync(configurePath) || JSON.parse(readFileSync(configurePath)).outputDir !== outputDir)
  run(process.execPath, ["tools/configure-upstream-wasm.mjs"]);
run(paths.cmake, ["--build", buildDir, "--target", "dolphin_web_core", "--parallel", process.env.BUILD_PARALLELISM || "8"]);

const { writeCoreBuildInfo, packageCoreCandidate } = await import("../../engines/wasm-dolphin/tools/core-build-info.mjs");
const built = writeCoreBuildInfo({ buildDir });
built.info.source.vendorBaseTree = built.info.source.vendorResultTree;
delete built.info.source.vendorResultTree;
built.info.source.experimental = true;
const patches = ["linux-toolchain.patch", "ogl-readback-diagnostic.patch", "ogl-draw-diagnostic.patch", "ogl-uniform-padding.patch", "browser-core-log.patch", "browser-worker-log.patch", "bitmap-dimensions.patch", "ogl-720p.patch", "browser-timing.patch", "browser-profile.patch", "jit-mode-cache.patch", "direct-wasm-dispatch.patch", "rollback-probe.patch", "rollback-size-diagnostic.patch", "jit-deferred-retry.patch", "raf-presentation.patch", "rollback-capacity.patch", "melee-os-helper-preference.patch", "rollback-state-diff.patch", "webgl-staging-readback.patch", "rollback-checked-code-cache.patch", "webgl-direct-buffer-read.patch", "bitmap-renderer.patch", "rollback-gpu-determinism.patch", "melee-logic-frame-step.patch", "melee-no-icache.patch", "gpu-resident-checkpoints.patch", "rollback-state-profile.patch", "async-gpu-wakeup.patch", "simd-state-copy.patch", "complete-gpu-textures.patch", "hw-state-profile.patch", "checkpoint-errors.patch", "lean-hot-counters.patch", "melee-idle-helper-preference.patch", "cpu-details.patch", "jit-instance-reuse.patch", "melee-idle-budget.patch", "unthrottled-replay-probe.patch", "two-port-rollback-input.patch", "rollback-stop-cleanup.patch", "step-timing.patch", "bitmap-backpressure.patch", "browser-mmu.patch", "replay-output.patch", "paused-fifo-drain.patch", "checkpoint-release.patch", "full-browser-textures.patch", "checked-bat-restore.patch", "step-completion-signal.patch", "direct-frame-counter.patch", "dcb-fast-path.patch", "remaining-hot-counters.patch", "dcb-loop-batch.patch", "inline-dispatch.patch", "codegen-comparison.patch", "gpu-wait-profile.patch", "cpu-block-profile-output.patch", "dispatch-sample-profile.patch", "wasm-dispatch-loop.patch", "bounded-readback.patch", "readback-copy-wakeup.patch", "readback-frame-identity.patch", "sync-readback-choice.patch", "gpu-task-yield.patch", "lean-swap.patch", "idle-batch-checks.patch", "idle-batch-control.patch", "gpu-task-notify.patch", "cpu-segment-sampling.patch", "integer-fifo.patch", "integer-fifo-control.patch", "single-prefix.patch", "cpu-callback-sampling.patch", "replay-tick-diagnostics.patch", "branch-only-prefix.patch", "ordinary-branch-prefix.patch", "fpr-cache.patch", "fpr-cache-control.patch", "fractional-efb.patch", "scalar-alias.patch", "compact-gpr.patch", "live-two-pad-input.patch", "paired-simd.patch", "paired-memory-simd.patch", "guest-code-invalidation.patch", "vector-fpr.patch", "paired-memory-hoist.patch", "wide-block-map.patch", "constant-state-base.patch", "frame-benchmark-input.patch", "block-msr-cache.patch", "fifo-copy.patch", "core-event-attribution.patch", "fifo-prefetch.patch", "frsqrte-correction.patch", "frsqrte-fast.patch", "frsqrte-exceptions.patch", "selective-fpr.patch", "selective-fpr-mixed.patch", "timed-block-fusion.patch", "timed-block-fusion-control.patch", "fpu-guard-hoist.patch", "fpu-guard-admission.patch", "conditional-fusion.patch", "fpu-guard-wide.patch", "dispatch-step-check.patch", "running-codegen-replay.patch", "read-only-fusion.patch", "fusion-redispatch.patch", "dispatch-counter-batch.patch", "fixed-native-work-timing.patch", "state-field-diagnostics.patch", "lean-dispatch.patch", "cp-format-reuse.patch", "paired-state-cache.patch", "paired-state-full.patch", "paired-state-fifo.patch", "headroom-worker.patch", "timing-drift-control.patch", "gpu-start-delay.patch", "gpu-scheduling-state-diagnostics.patch", "saved-event-diagnostics.patch", "rush-presentation-control.patch", "frame-ring-logging-control.patch", "direct-block-profile.patch", "bswap-rotate.patch", "chain-fusion.patch", "call-fusion.patch", "constant-address.patch", "call-fusion-fpu-guard.patch", "call-fusion-melee-hot.patch", "melee-anim-linear-hot.patch", "melee-jobj-update-hot.patch", "melee-display-list-accounting.patch", "melee-display-list-continuation.patch", "melee-display-list-flush-continuation.patch", "melee-display-list-direct-flush.patch", "release-profile-strip.patch", "release-dispatch-counters.patch"];
built.info.source.additionalPatches = patches.map(name => ({ name, sha256: hash(resolve(import.meta.dirname, name)) }));
built.info.toolchain.lockSha256 = hash(lockPath);
writeFileSync(built.destination, JSON.stringify(built.info, null, 2) + "\n");
const { destination, manifest } = packageCoreCandidate(built.destination);
copyFileSync(lockPath, resolve(destination, "wasm-toolchain.lock.json"));
for (const name of patches) {
  copyFileSync(resolve(import.meta.dirname, name), resolve(destination, name));
  manifest.files.push({ name });
}
for (const file of manifest.files) file.sha256 = hash(resolve(destination, file.name));
writeFileSync(resolve(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Candidate: http://localhost:3003/play/?engine=wasm&video=ogl&oglproxy=readback&qa=1&corelog=1&coreid=${built.info.coreId.replace("sha256:", "")}`);
