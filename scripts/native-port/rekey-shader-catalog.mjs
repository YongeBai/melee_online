// Carry the prepared shader catalog to a rebuilt core whose rendering path is
// unchanged (for example, an audio-only C change). The catalog is a compile
// cache: draw-time lookup stays exact and unseen variants still compile. The
// shader generator sources must be byte-identical; only the WASM key changes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {shaderIdentityFiles,validateShaderCatalog} from '../../engines/browser-native/shader-catalog.mjs';
const directory=path.resolve(import.meta.dirname,'../../dist/native-port'),file=path.join(directory,'native-shader-catalog.json');
const catalog=JSON.parse(fs.readFileSync(file)),build=JSON.parse(fs.readFileSync(path.join(directory,'fighter-init-build.json')));
const sources=Object.fromEntries(shaderIdentityFiles.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')]));
validateShaderCatalog(catalog,{wasmSha256:catalog.identity.wasmSha256,sources});
const previous=catalog.identity.wasmSha256;catalog.identity={...catalog.identity,wasmSha256:build.wasmSha256};catalog.rekeyedFrom=[...(catalog.rekeyedFrom??[]),previous];
validateShaderCatalog(catalog,{wasmSha256:build.wasmSha256,sources});
fs.writeFileSync(file,JSON.stringify(catalog)+'\n');
console.log(JSON.stringify({programs:catalog.programs.length,from:previous,to:build.wasmSha256}));
