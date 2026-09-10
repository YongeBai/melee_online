import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "../..");
const source = path.join(root, "engines/dolphin-native"),
  local = path.join(root, ".local-tools");
const revision = "a2efdf1197be8132674b90fe9cf4761df39752ed";
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw Error(`${command} failed (${result.status})`);
}
if (process.platform !== "linux" || process.arch !== "x64")
  throw Error("The local native renderer currently supports Linux x64.");
if (!fs.existsSync(path.join(source, ".git"))) {
  fs.mkdirSync(source, { recursive: true });
  run("git", ["init"], source);
  run("git", ["remote", "add", "origin", "https://github.com/dolphin-emu/dolphin.git"], source);
  run("git", ["fetch", "--depth", "1", "origin", revision], source);
  run("git", ["checkout", "--detach", "FETCH_HEAD"], source);
  run("git", ["submodule", "update", "--init", "--recursive", "--depth", "1"], source);
}
const actual = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: source,
  encoding: "utf8",
}).stdout.trim();
if (actual !== revision) throw Error("Native source revision differs from the verified version");
const executable = path.join(source, "build/Binaries/dolphin-emu-nogui");
run(process.execPath, ["scripts/native/patch-native.mjs"]);
const cmake = path.join(local, "cmake-3.31.6-linux-x86_64/bin/cmake");
if (!fs.existsSync(cmake)) {
  fs.mkdirSync(local, { recursive: true });
  const name = "cmake-3.31.6-linux-x86_64.tar.gz",
    url = "https://github.com/Kitware/CMake/releases/download/v3.31.6/";
  const archive = Buffer.from(await (await fetch(url + name)).arrayBuffer());
  const checks = await (await fetch(url + "cmake-3.31.6-SHA-256.txt")).text();
  const expected = checks
    .split("\n")
    .find((l) => l.endsWith(name))
    ?.split(/\s+/)[0];
  if (createHash("sha256").update(archive).digest("hex") !== expected)
    throw Error("CMake download checksum mismatch");
  fs.writeFileSync(path.join(local, "cmake.tar.gz"), archive);
  run("tar", ["-xf", path.join(local, "cmake.tar.gz"), "-C", local]);
}
const patchHash = createHash("sha256")
  .update(fs.readFileSync(path.join(root, "scripts/native/patch-native.mjs")))
  .update(fs.readFileSync(path.join(root, "scripts/native/rollback-bridge.h")))
  .update(fs.readFileSync(path.join(root, "scripts/native/rollback-code-cache.h")))
  .update(fs.readFileSync(path.join(root, "scripts/native/menu-frame-gate.h")))
  .update(fs.readFileSync(import.meta.filename))
  .digest("hex");
const stamp = path.join(source, "build/melee-bridge-version");
if (
  !fs.existsSync(executable) ||
  !fs.existsSync(stamp) ||
  fs.readFileSync(stamp, "utf8") !== patchHash ||
  process.argv.includes("--build")
) {
  let eglInclude = "/usr/include";
  if (!fs.existsSync(path.join(eglInclude, "EGL/egl.h"))) {
    eglInclude = path.join(local, "sysroot/usr/include");
    if (!fs.existsSync(path.join(eglInclude, "EGL/egl.h"))) {
      const debs = path.join(local, "debs"),
        sysroot = path.join(local, "sysroot");
      fs.mkdirSync(debs, { recursive: true });
      fs.mkdirSync(sysroot, { recursive: true });
      // Download development headers locally; no system package installation.
      run("apt-get", ["download", "libegl-dev", "libgl-dev", "libglx-dev"], debs);
      for (const name of fs.readdirSync(debs).filter((name) => name.endsWith(".deb")))
        run("dpkg-deb", ["-x", path.join(debs, name), sysroot]);
    }
  }
  const eglLibrary = [
    "/usr/lib/x86_64-linux-gnu/libEGL.so.1",
    "/lib/x86_64-linux-gnu/libEGL.so.1",
  ].find(fs.existsSync);
  if (!eglLibrary) throw Error("Mesa EGL runtime is required for the local GPU renderer.");
  const disabled = [
    "QT",
    "X11",
    "ALSA",
    "PULSEAUDIO",
    "CUBEB",
    "LLVM",
    "TESTS",
    "SDL",
    "EVDEV",
    "HWDB",
    "ANALYTICS",
    "AUTOUPDATE",
    "CLI_TOOL",
  ].map((k) => `-DENABLE_${k}=OFF`);
  run(cmake, [
    "-S",
    source,
    "-B",
    path.join(source, "build"),
    "-DCMAKE_BUILD_TYPE=Release",
    "-DENABLE_NOGUI=ON",
    "-DENABLE_HEADLESS=ON",
    "-DENABLE_EGL=ON",
    `-DEGL_INCLUDE_DIRS=${eglInclude}`,
    `-DEGL_LIBRARIES=${eglLibrary}`,
    ...disabled,
    "-DUSE_MGBA=OFF",
    "-DUSE_UPNP=OFF",
    "-DUSE_RETRO_ACHIEVEMENTS=OFF",
    "-DUSE_DISCORD_PRESENCE=OFF",
    "-DENCODE_FRAMEDUMPS=OFF",
  ]);
  run(cmake, [
    "--build",
    path.join(source, "build"),
    "-j",
    String(Math.min(20, os.availableParallelism())),
    "--target",
    "dolphin-nogui",
  ]);
  fs.writeFileSync(stamp, patchHash);
}
console.log("Local GPU renderer ready.");
