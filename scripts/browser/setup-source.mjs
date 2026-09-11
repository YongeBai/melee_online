import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const outIndex = process.argv.indexOf('--out');
const engine = path.resolve(outIndex < 0 ? path.join(root, 'engines/wasm-dolphin') : process.argv[outIndex + 1]);
const manifest = JSON.parse(fs.readFileSync(new URL('./source-integration.json', import.meta.url)));
const run = (command, args, cwd = root) => execFileSync(command, args, {cwd, stdio:'inherit'});
// Never repatch a running/native/shared engine or silently replace local work.
if (fs.existsSync(engine)) throw Error('Output exists. Choose a new --out directory in an isolated checkout.');
for (const patch of manifest.patches) {
  const bytes = fs.readFileSync(new URL(patch.name, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== patch.sha256)
    throw Error('Source integration checksum mismatch: ' + patch.name);
}
fs.mkdirSync(path.dirname(engine), {recursive:true});
run('git', ['clone', '--no-checkout', 'https://github.com/dougchansan/wasm-dolphin.git', engine]);
run('git', ['checkout', '--detach', manifest.engineCommit], engine);
run(process.execPath, ['tools/fetch-dolphin.mjs'], engine);
run(process.execPath, ['tools/patch-upstream-wasm.mjs'], engine);
for (const patch of manifest.patches) {
  const cwd = patch.name.startsWith('dolphin-') ? path.join(engine, 'vendor/dolphin') : engine;
  const file = path.join(import.meta.dirname, patch.name);
  run('git', ['apply', '--check', file], cwd);
  run('git', ['apply', file], cwd);
}
for (const name of ['melee-memory.js', 'melee-tap-jump.js', 'melee-css-layout.js',
  'melee-foreground.js', 'melee-probe-controls.js'])
  fs.copyFileSync(path.join(root, 'scripts/engine', name), path.join(engine, 'src', name));
console.log('Browser engine source ready: ' + engine);
console.log('The integration patches replace the historical incremental patch sequence; do not apply it again.');
