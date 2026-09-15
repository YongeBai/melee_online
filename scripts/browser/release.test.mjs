import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createReleaseHandler} from './release-server.mjs';
import {packageBrowserRelease,prepareHostedGame} from './package-release.mjs';
import {gzipSync} from 'node:zlib';

test('production static server serves only packaged files, including hosted game chunks',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'melee-release-'));
 const files=[{path:'play/index.html',text:'game'},{path:'play/build/core-candidates/abc/core.wasm',text:'wasm'},{path:'game/chunk.br',text:'brotli'},{path:'game/fallback.gz',text:'gzip'},{path:'.env',text:'not-in-manifest'}];
 for(const f of files){fs.mkdirSync(path.dirname(path.join(root,f.path)),{recursive:true});fs.writeFileSync(path.join(root,f.path),f.text);}
 fs.writeFileSync(path.join(root,'files.json'),JSON.stringify(files.slice(0,4).map(f=>({path:f.path,bytes:Buffer.byteLength(f.text)}))));
 const server=createServer(createReleaseHandler(root));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
 const page=await fetch(base+'/play/');assert.equal(page.status,200);assert.equal(await page.text(),'game');
 assert.equal(page.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(page.headers.get('cross-origin-embedder-policy'),'require-corp');
 const wasm=await fetch(base+'/play/build/core-candidates/abc/core.wasm');assert.equal(wasm.headers.get('content-type'),'application/wasm');assert.match(wasm.headers.get('cache-control'),/immutable/);
 for(const [name,text] of [['chunk.br','brotli'],['fallback.gz','gzip']]){const chunk=await fetch(base+'/game/'+name);assert.equal(chunk.status,200);assert.equal(chunk.headers.get('content-type'),'application/octet-stream');assert.equal(await chunk.text(),text);}
 const head=await fetch(base+'/play/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'4');
 for(const route of ['/.env','/local-disc','/play/assets/MnMaAll.usd','/play/%2e%2e%2f.env','/engine-session','/room-session','/play/no-such-module.js'])assert.equal((await fetch(base+route)).status,404,route);
 assert.equal((await fetch(base+'/play/',{method:'POST',body:'test'})).status,405);
 assert.deepEqual(await (await fetch(base+'/health')).json(),{ok:true,engine:'browser',nativeWorkers:0});
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});
test('packager rejects an unpinned core and modified candidate before creating output',()=>{
 assert.throws(()=>packageBrowserRelease({coreId:'latest'}),/pinned/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'melee-package-')),coreId='a'.repeat(64),dir=path.join(root,'engines/wasm-dolphin/build/core-candidates',coreId),out=path.join(root,'out');
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({coreId:'sha256:'+coreId,files:[{name:'core.js',sha256:createHash('sha256').update('original').digest('hex')}]}));fs.writeFileSync(path.join(dir,'core.js'),'modified');assert.throws(()=>packageBrowserRelease({coreId,output:out,projectRoot:root}),/artifact hash mismatch/);assert.equal(fs.existsSync(out),false);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('hosted release provision validates the full disc and refuses missing or tampered chunks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'melee-hosted-'));
 try{
  const image=Buffer.alloc(32);image.write('GALE01');image[7]=2;
  const packed=gzipSync(image),sha256=createHash('sha256').update(packed).digest('hex');
  const rawSha256=createHash('sha256').update(image).digest('hex');
  const part={name:`${sha256}.gz`,bytes:packed.length,rawBytes:image.length,sha256,rawSha256};
  fs.writeFileSync(path.join(dir,part.name),packed);
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({schemaVersion:1,name:'Melee.iso',size:image.length,sha256:rawSha256,parts:[part],omittedFiles:[]}));
  assert.equal(prepareHostedGame(dir).manifest.sha256,rawSha256);
  assert.throws(()=>prepareHostedGame(),/hosted game directory is required/);
  fs.writeFileSync(path.join(dir,part.name),Buffer.from('tampered'));
  assert.throws(()=>prepareHostedGame(dir),/checksum mismatch/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
