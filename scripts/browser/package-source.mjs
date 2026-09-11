import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),coreId=process.argv[2],out=path.resolve(process.argv[3]||'dist/browser-source');
if(!/^[a-f0-9]{64}$/.test(coreId||''))throw Error('Usage: node scripts/browser/package-source.mjs CORE_HASH OUTPUT_DIRECTORY');
const engine=path.join(root,'engines/wasm-dolphin'),candidate=path.join(engine,'build/core-candidates',coreId),info=JSON.parse(fs.readFileSync(path.join(candidate,'dolphin-core-upstream.build.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const f of info.source.localInputs){const content=fs.readFileSync(path.join(engine,f.path),'utf8').replace(/\r\n/g,'\n');if(hash(content)!==f.sha256)throw Error('Core source changed since build: '+f.path);}
for(const p of info.source.additionalPatches)if(hash(fs.readFileSync(path.join(root,'scripts/browser',p.name)))!==p.sha256)throw Error('Patch changed since core build: '+p.name);
if(fs.existsSync(out))throw Error('Output already exists; choose a new directory');fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(path.join(candidate,'dolphin-core-upstream.build.json'),path.join(out,'core-build.json'));
fs.copyFileSync(path.join(candidate,'wasm-toolchain.lock.json'),path.join(out,'linux-toolchain.lock.json'));
fs.writeFileSync(path.join(out,'README.txt'),`Browser Melee source for core ${coreId}\n\nThe archive includes the patched Dolphin source, shim, browser runtime, patch\nseries, licenses and build tools. Game discs and extracted game assets are absent.\nThe host-specific compiler lock is recorded separately; its absolute paths must\nbe recreated or relocked on a new machine. See docs/BROWSER-ENGINE.md and\nscripts/browser/lock-linux-toolchain.mjs. Source is already patched: do not apply\nthe patches a second time. Build requires the pinned Emscripten 5.0.7, Rust\nnightly-2026-05-15, CMake and Ninja toolchain. After configuring those tools,\nrun node scripts/browser/build-candidate.mjs. The build metadata identifies the\nexact flags and versions used for the distributed binary. Binary-identical\nreproduction on another machine has not been verified.\n\nJoin the archive parts in order with:\ncat source.tar.gz.part* > source.tar.gz\nsha256sum source.tar.gz\ntar -xzf source.tar.gz\n\nThe full archive hash and per-part hashes are in source-manifest.json.\n`);
const archive=path.join(out,'source.tar.gz');
const payload=["web/package.json","web/package-lock.json","web/lib",'package.json','scripts/browser','scripts/engine','scripts/assets','docs/BROWSER-ENGINE.md','docs/BROWSER-DEPLOYMENT.md','engines/wasm-dolphin/LICENSE','engines/wasm-dolphin/package.json','engines/wasm-dolphin/src','engines/wasm-dolphin/core','engines/wasm-dolphin/tools','engines/wasm-dolphin/patches','engines/wasm-dolphin/provenance','engines/wasm-dolphin/vendor/dolphin'];
const excluded=['.git','node_modules','target','.env','.env.*','*.iso','*.gcm','*.sav','*.gci','*.raw',
  '*.gb','*.gbc','*.gba','*.nds','*.n64','*.z64','*/mGBA/mgba/cinema'];
const result=spawnSync('tar',['-czf',archive,...excluded.map(p=>'--exclude='+p),'-C',root,...payload],{stdio:'inherit'});if(result.status!==0)throw Error('Source archive failed');
const listing=spawnSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:16*1024*1024});
if(listing.status!==0)throw Error('Source inventory failed');
const forbidden=listing.stdout.split('\n').filter(p=>/(^|\/)(\.git|\.env(?:\.[^/]*)?)(\/|$)|\.(iso|gcm|sav|gci|raw|gb|gbc|gba|nds|n64|z64)$/i.test(p));
if(forbidden.length)throw Error('Non-source data in archive: '+forbidden.join(', '));
const fd=fs.openSync(archive,'r'),parts=[],whole=createHash('sha256'),size=20*1024*1024;let index=0;
try{for(;;){const bytes=Buffer.alloc(size),n=fs.readSync(fd,bytes,0,size,null);if(!n)break;const data=bytes.subarray(0,n),name='source.tar.gz.part'+String(index++).padStart(3,'0');fs.writeFileSync(path.join(out,name),data);whole.update(data);parts.push({name,bytes:n,sha256:hash(data)});}}finally{fs.closeSync(fd);}
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify({coreId,archiveSha256:whole.digest('hex'),archiveBytes:fs.statSync(archive).size,parts},null,2));
// The parts reconstruct the archive; keep the large original outside the site.
console.log(JSON.stringify({out,archive,parts:parts.length,bytes:fs.statSync(archive).size}));
