import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set();
let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop(signal));
function run(command, args, cwd = root) {
  if (stopping) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    children.add(child);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      children.delete(child);
      code === 0 || stopping ? resolve() : reject(new Error(`${command} exited ${code ?? signal}`));
    });
  });
}
try {
  if (!existsSync(new URL("../web/node_modules/three/build/three.module.js", import.meta.url)))
    await run("npm", ["ci"], root + "web");
  await run(process.execPath, ["scripts/setup-engine.mjs"]);
  await run(process.execPath, ["scripts/native/setup-native.mjs"]);
  await run(process.execPath, ["scripts/assets/extract-menu.mjs"]);
  if (!stopping) {
    console.log("Melee Online: http://localhost:3000/ · local GPU · 720p60");
    await Promise.race([
      run(process.execPath, ["scripts/native/server.mjs"]),
      run(
        process.execPath,
        ["node_modules/vinext/dist/cli.js", "dev", "--host", "127.0.0.1", "--port", "3000"],
        root + "web",
      ),
    ]);
  }
} finally {
  stop();
}
