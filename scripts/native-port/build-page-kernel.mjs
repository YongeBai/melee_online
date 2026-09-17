import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),source=path.join(root,'engines/browser-native/snapshot-page-kernel.wat'),output=path.join(root,'.local-tools/snapshot-page-kernel.wasm');
fs.mkdirSync(path.dirname(output),{recursive:true});
execFileSync(path.join(root,'.browser-tools/emsdk/upstream/bin/wasm-as'),[source,'--enable-multimemory','--enable-simd','--enable-bulk-memory','-o',output]);
const bytes=fs.readFileSync(output),sha=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
fs.writeFileSync(path.join(root,'engines/browser-native/snapshot-page-kernel.mjs'),`// Generated from our snapshot-page-kernel.wat by scripts/native-port/build-page-kernel.mjs.\n// No game code/data. Compares/copies one exact 64 KiB page between two memories.\nexport const pageKernelSourceSha256='${sha}';\nconst bytes=Uint8Array.from(${JSON.stringify([...bytes])});\nlet compiled;\nexport function createSnapshotPageKernel(live){\n if(!WebAssembly.validate(bytes))return null;\n compiled??=new WebAssembly.Module(bytes);\n const memory=new WebAssembly.Memory({initial:1,maximum:32768});\n const {exports}=new WebAssembly.Instance(compiled,{env:{live,pages:memory}});\n return {memory,...exports};\n}\n`);
