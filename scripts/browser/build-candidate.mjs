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
// These consolidated patches reproduce the exact ignored engine and Dolphin
// source trees used by the current candidate. The engine patch applies to a
// clean wasm-dolphin checkout; the vendor patch applies after patch:upstream.
const patches = ["browser-720p60-engine.patch", "browser-720p60-vendor.patch"];
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
