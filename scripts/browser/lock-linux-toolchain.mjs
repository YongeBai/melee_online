import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

// Record host-specific binary hashes separately from the upstream Windows
// lock. The verifier still checks the pinned compiler versions and commits.
const root = resolve(import.meta.dirname, "../..");
const dir = resolve(root, ".browser-tools");
const sdk = resolve(dir, "emsdk");
const rust = resolve(dir, "rustup/toolchains/nightly-2026-05-15-x86_64-unknown-linux-gnu/bin");
const lock = JSON.parse(readFileSync(resolve(root, "engines/wasm-dolphin/provenance/wasm-toolchain.lock.json")));
const hash = p => createHash("sha256").update(readFileSync(p)).digest("hex");
if (process.platform !== "linux" || process.arch !== "x64") throw Error("Expected Linux x64");
lock.platform = "linux-x64";
const paths = {
  node: process.execPath,
  emcc: resolve(sdk, "upstream/emscripten/emcc"),
  emcmake: resolve(sdk, "upstream/emscripten/emcmake"),
  cmake: resolve(dir, "build-venv/lib/python3.12/site-packages/cmake/data/bin/cmake"),
  ninja: resolve(dir, "build-venv/bin/ninja"),
  rustc: resolve(rust, "rustc"), cargo: resolve(rust, "cargo"),
  rustup: resolve(dir, "cargo/bin/rustup"),
};
for (const key of ["node", "cmake", "ninja"]) {
  lock[key].candidates = [paths[key]];
  lock[key].sha256 = hash(paths[key]);
}
lock.node.version = process.version.slice(1);
lock.ninja.version = execFileSync(paths.ninja, ["--version"], { encoding: "utf8" }).trim();
for (const key of ["emcc", "emcmake"]) {
  lock.emscripten[key + "Candidates"] = [paths[key]];
  lock.emscripten[key + "Sha256"] = hash(paths[key]);
}
lock.emscripten.clangxxSha256 = hash(resolve(sdk, "upstream/bin/clang++"));
lock.rust.toolchain = "nightly-2026-05-15-x86_64-unknown-linux-gnu";
for (const key of ["rustc", "cargo", "rustup"]) {
  lock.rust[key + "Candidates"] = [paths[key]];
  lock.rust[key + "Sha256"] = hash(paths[key]);
}
const lockPath = resolve(dir, "linux-toolchain.lock.json");
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
execFileSync(process.execPath, ["tools/verify-wasm-toolchain.mjs"], {
  cwd: resolve(root, "engines/wasm-dolphin"), stdio: "inherit",
  env: { ...process.env, DOLPHIN_TOOLCHAIN_LOCK: lockPath,
    RUSTUP_HOME: resolve(dir, "rustup"), CARGO_HOME: resolve(dir, "cargo") },
});
