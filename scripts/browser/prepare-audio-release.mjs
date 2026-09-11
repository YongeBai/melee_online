import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Overlay the audio fix onto an exact, verified deployment without copying
// unfinished changes from the independently maintained hosted-game worktree.
const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw Error('Usage: node prepare-audio-release.mjs BASE OUTPUT');
const base = path.resolve(baseArg), out = path.resolve(outArg);
const root = path.resolve(import.meta.dirname, '../..');
if (!out.startsWith(path.join(root, 'dist') + '/') || fs.existsSync(out))
  throw Error('Choose a new output directory beneath dist');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const files = JSON.parse(read(base, 'files.json'));
const live = await fetch('https://playmelee.com/files.json', {cache: 'no-store'});
if (!live.ok || JSON.stringify(await live.json()) !== JSON.stringify(files))
  throw Error('Base no longer matches production; rebase the audio overlay');
for (const file of files) {
  if (path.isAbsolute(file.path) || file.path.split('/').includes('..')) throw Error('Unsafe path');
  const bytes = fs.readFileSync(path.join(base, file.path));
  if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw Error('Base mismatch: ' + file.path);
}
const write = (file, data) => {
  fs.mkdirSync(path.dirname(path.join(out, file)), {recursive: true});
  fs.writeFileSync(path.join(out, file), data);
};
for (const file of files) write(file.path, fs.readFileSync(path.join(base, file.path)));
const replace = (text, from, to) => {
  if (text.split(from).length !== 2) throw Error('Overlay requires exactly one match: ' + from);
  return text.replace(from, to);
};
const current = read(root, 'scripts/engine/melee-runtime.js');
const volume = current.slice(current.indexOf('// Start quietly,'), current.indexOf('const browserStatus = []'));
if (!volume.includes('audio.volume = volume;')) throw Error('Missing volume integration');
write('engine/src/audio.js', read(root, 'engines/wasm-dolphin/src/audio.js'));
write('play/melee-startup.js', read(root, 'scripts/engine/melee-startup.js'));
let runtime = read(base, 'play/melee-runtime.js');
runtime = replace(runtime, 'import { AudioController } from "/engine/src/audio.js";',
  `import { AudioController } from "/engine/src/audio.js?v=${hash(read(root, 'engines/wasm-dolphin/src/audio.js'))}";\nimport { characterSelectReady } from "./melee-startup.js";`);
runtime = replace(runtime, 'const audio = new AudioController();',
  'const audio = new AudioController({ outputEnabled: nativeEngine });\n' + volume);
runtime = replace(runtime, 'if (!ready) {\n        ready = true;',
  'if (!ready && (nativeEngine || characterSelectReady(state))) {\n        ready = true;\n        audio.setOutputEnabled(true);');
write('play/melee-runtime.js', runtime);
let css = read(base, 'play/melee-ui.css');
const currentCss = read(root, 'scripts/engine/melee-ui.css');
css += '\n' + currentCss.slice(currentCss.indexOf('.volume-control {'), currentCss.indexOf('#stats {'));
write('play/melee-ui.css', css);
let html = read(base, 'play/index.html');
const label = current => current.match(/      <label class="volume-control">[^\n]+/)[0];
html = replace(html, '<div id="toolbar">', '<div id="toolbar">\n' + label(read(root, 'scripts/engine/melee.html')));
html = replace(html, 'href="/play/melee-ui.css"', `href="/play/melee-ui.css?v=${hash(css)}"`);
let bootstrap = read(base, 'play/release-bootstrap.js');
bootstrap = bootstrap.replace(/melee-runtime\.js\?v=[a-f0-9]+/, 'melee-runtime.js?v=' + hash(runtime));
write('play/release-bootstrap.js', bootstrap);
html = html.replace(/release-bootstrap\.js\?v=[a-f0-9]+/, 'release-bootstrap.js?v=' + hash(bootstrap));
write('play/index.html', html);
const release = JSON.parse(read(base, 'release.json'));
release.audioStartupGate = 'initialized-character-select';
release.defaultAudioVolume = 0.25;
release.createdAt = new Date().toISOString();
write('release.json', JSON.stringify(release, null, 2));
const paths = new Set([...files.map(f => f.path), 'play/melee-startup.js']);
write('files.json', JSON.stringify([...paths].map(file => {
  const bytes = fs.readFileSync(path.join(out, file));
  return {path: file, bytes: bytes.length, sha256: hash(bytes)};
}), null, 2));
// Copy only the existing deployment association; no credentials or game data.
write('.vercel/project.json', read(base, '.vercel/project.json'));
console.log(out);
