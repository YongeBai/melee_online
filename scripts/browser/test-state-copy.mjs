import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..');
const runtime = resolve(root, '.browser-tools/emsdk/upstream');
const output = resolve(root, '.browser-tools/state-copy-test');
mkdirSync(resolve(root, '.browser-tools'), { recursive: true });
execFileSync(resolve(runtime, 'emscripten/em++'), [
  resolve(import.meta.dirname, 'tests/state-copy.cpp'),
  '-I' + resolve(root, 'engines/wasm-dolphin/vendor/dolphin/Source/Core'),
  '-O3', '-msimd128', '-pthread', '-sENVIRONMENT=node',
  '-sINITIAL_MEMORY=33554432', '-sPTHREAD_POOL_SIZE=0', '-o', output + '.mjs',
], { stdio: 'inherit' });
// Emscripten's ES module exports a factory; importing alone does not run main.
const { default: create } = await import(pathToFileURL(output + '.mjs'));
await create();
execFileSync(resolve(runtime, 'bin/wasm-dis'), [output + '.wasm', '-o', output + '.wat']);
const wat = readFileSync(output + '.wat', 'utf8');
if (!wat.includes('v128.load') || !wat.includes('v128.store'))
  throw new Error('Snapshot test build lost explicit SIMD transfers');
console.log('PASS: SIMD loads and stores retained in compiled WASM');
