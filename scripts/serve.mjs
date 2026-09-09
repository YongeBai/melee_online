import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
// Production: no Vite, Wrangler, hot reload, or public disc-download endpoint.
const root = path.resolve(import.meta.dirname, "..");
if (!existsSync(path.join(root, "web/node_modules/three/build/three.module.js"))) {
  const result = spawnSync("npm", ["--prefix", "web", "ci"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const script of [
  "scripts/setup-engine.mjs",
  "scripts/native/setup-native.mjs",
  "scripts/assets/extract-menu.mjs",
]) {
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
process.env.MELEE_WEB = "1";
await import("./native/server.mjs");
