import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = join(root, "engines/wasm-dolphin");
const revision = "6ef689cf3956c3208c0966b8123d91c21d1f5ca4";
function git(args, cwd = root) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "git failed");
  return result.stdout.trim();
}
if (!existsSync(target)) {
  mkdirSync(join(root, "engines"), { recursive: true });
  git(["clone", "--no-checkout", "https://github.com/dougchansan/wasm-dolphin.git", target]);
  git(["checkout", "--detach", revision], target);
}
if (git(["rev-parse", "HEAD"], target) !== revision)
  throw new Error("Existing engine revision differs; leaving it unchanged.");
const binary = readFileSync(join(target, "cores/dolphin/dolphin-core-upstream.wasm"));
if (
  createHash("sha256").update(binary).digest("hex") !==
  "3b2ed6fe35ff1939e24bbe033edba34b9585f4f7b1f457f1e683ed8ddbd005d0"
)
  throw new Error("Engine WASM checksum differs from the verified build.");
const appPath = join(target, "src/app.js");
const app = readFileSync(appPath, "utf8");
if (!app.includes("import('./melee-probe-controls.js')")) {
  writeFileSync(
    appPath,
    app +
      `\n// Local input probe, enabled only with ?probe=1.\nif (new URLSearchParams(location.search).get('probe') === '1') {\n  await import('./melee-probe-controls.js');\n}\n`,
  );
}
copyFileSync(
  new URL("./engine/melee-probe-controls.js", import.meta.url),
  join(target, "src/melee-probe-controls.js"),
);
copyFileSync(
  new URL("./engine/melee-memory.js", import.meta.url),
  join(target, "src/melee-memory.js"),
);
copyFileSync(
  new URL("./engine/melee-tap-jump.js", import.meta.url),
  join(target, "src/melee-tap-jump.js"),
);
const workerPath = join(target, "src/upstream-discio-worker.js");
let worker = readFileSync(workerPath, "utf8");
if (!worker.includes("from './melee-memory.js'")) {
  worker = `import { inspectMelee, controlMelee } from './melee-memory.js';\n` + worker;
} else {
  worker = worker.replace(
    "import { inspectMelee } from './melee-memory.js';",
    "import { inspectMelee, controlMelee } from './melee-memory.js';",
  );
}
if (!worker.includes('type === "meleeInspect"'))
  worker = worker.replace(
    "async function handleMessage(type, payload) {",
    'async function handleMessage(type, payload) {\n  if(type === "meleeInspect")return inspectMelee(moduleInstance);',
  );
if (!worker.includes('type === "meleeControl"'))
  worker = worker.replace(
    "async function handleMessage(type, payload) {",
    'async function handleMessage(type, payload) {\n  if(type === "meleeControl")return controlMelee(moduleInstance, api, payload.action);',
  );
worker = worker.replace(
  "controlMelee(moduleInstance, api, payload.action);",
  "controlMelee(moduleInstance, api, payload.action, payload);",
);
writeFileSync(workerPath, worker);
const pausePatch = join(root, "scripts/engine/worker-pause.patch");
try {
  git(["apply", "--check", pausePatch], target);
  git(["apply", pausePatch], target);
} catch {
  // Idempotent reruns are allowed only when this exact patch is present.
  git(["apply", "--reverse", "--check", pausePatch], target);
}
console.log("Pinned Dolphin WASM engine and Melee integration ready.");
