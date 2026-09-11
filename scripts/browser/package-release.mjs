import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {browserDefaults} from './release-config.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function packageBrowserRelease({coreId,output,projectRoot=root,wasmDispatch=false,sourceDir}){
  if(!/^[a-f0-9]{64}$/.test(coreId||''))throw Error('A pinned 64-character --core hash is required');
  const candidate=path.join(projectRoot,'engines/wasm-dolphin/build/core-candidates',coreId);
  const manifest=JSON.parse(fs.readFileSync(path.join(candidate,'manifest.json')));
  if(manifest.coreId!==`sha256:${coreId}`)throw Error('Candidate core ID mismatch');
  for(const file of manifest.files){
    if(path.basename(file.name)!==file.name||hash(fs.readFileSync(path.join(candidate,file.name)))!==file.sha256)throw Error('Candidate artifact hash mismatch: '+file.name);
  }
  if(hash(fs.readFileSync(path.join(candidate,'dolphin-core-upstream.wasm')))!==coreId)throw Error('WASM hash does not match selected core');
  const destination=path.resolve(output||path.join(projectRoot,'dist/browser',coreId));
  if(fs.existsSync(destination))throw Error('Output already exists; choose a new release directory');
  const write=(name,data)=>{const p=path.join(destination,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
  const copy=(from,to)=>write(to,fs.readFileSync(from));
  const copyTree=(from,to)=>{
    for(const entry of fs.readdirSync(from,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw Error('Symlink in release source: '+entry.name);
      if(entry.isDirectory()){if(!['test','tests','fixtures','node_modules'].includes(entry.name))copyTree(path.join(from,entry.name),path.join(to,entry.name));}
      else if(/\.(js|css|wgsl|json)$/.test(entry.name)&&!/(\.test\.|\.spec\.)/.test(entry.name))copy(path.join(from,entry.name),path.join(to,entry.name));
    }
  };
  copyTree(path.join(projectRoot,'scripts/engine'),'play');
  copyTree(path.join(projectRoot,'engines/wasm-dolphin/src'),'engine/src');
  const engineFiles=['dolphin-core-upstream.js','dolphin-core-upstream.wasm','dolphin-core-upstream.build.json','dolphin-core-abi-v1.json'];
  for(const name of engineFiles)copy(path.join(candidate,name),`play/build/core-candidates/${coreId}/${name}`);
  copy(path.join(projectRoot,'web/node_modules/three/build/three.module.js'),'play/vendor/three.module.js');
  // Recent Three releases import this sibling; copy when present.
  const core=path.join(projectRoot,'web/node_modules/three/build/three.core.js');if(fs.existsSync(core))copy(core,'play/vendor/three.core.js');
  copy(path.join(projectRoot,'web/node_modules/three/LICENSE'),'licenses/three.txt');
  copy(path.join(projectRoot,'engines/wasm-dolphin/LICENSE'),'licenses/wasm-dolphin.txt');
  copy(path.join(projectRoot,'engines/wasm-dolphin/vendor/dolphin/COPYING'),'licenses/dolphin.txt');
  let html=fs.readFileSync(path.join(projectRoot,'scripts/engine/melee.html'),'utf8')
    .replace('src="/play/melee-runtime.js"','src="/play/release-bootstrap.js"')
    .replace(/src="\/play\/assets\/([^"/]+)"/g,'data-disc-asset="$1"');
  write('404.html','<!doctype html><title>Not found</title><p>Not found</p>');
  write('play/index.html',html);write('index.html','<!doctype html><meta http-equiv="refresh" content="0;url=/play/"><a href="/play/">Play Melee</a>');
  const css=fs.readFileSync(path.join(projectRoot,'scripts/engine/melee-ui.css'),'utf8').replace(/url\("\/play\/assets\/([^"/]+)\.png"\)/g,(_,name)=>`var(--disc-${name}, none)`);
  write('play/melee-ui.css',css);
  const defaults={...browserDefaults,coreid:coreId,...(wasmDispatch?{wasmdispatch:'1'}:{})};
  write('play/release-bootstrap.js',`const params=new URLSearchParams(location.search);\nfor(const [key,value] of Object.entries(${JSON.stringify(defaults)}))params.set(key,value);\nhistory.replaceState(null,'',location.pathname+'?'+params);\ndocument.documentElement.dataset.browserRelease='true';\nawait import('./melee-runtime.js');\n`);
  const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
  write('_headers','/*\n'+Object.entries(headers).map(([k,v])=>`  ${k}: ${v}`).join('\n')+'\n/play/\n  Cache-Control: no-cache\n/play/:file\n  Cache-Control: no-cache\n/engine/src/*\n  Cache-Control: no-cache\n/play/build/core-candidates/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  write('vercel.json',JSON.stringify({headers:[{source:'/(.*)',headers:Object.entries(headers).map(([key,value])=>({key,value}))},{source:'/play/build/core-candidates/(.*)',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]}]},null,2));
  copy(path.join(projectRoot,'scripts/browser/release-server.mjs'),'server.mjs');
  write('Dockerfile','FROM node:24-alpine\nWORKDIR /app\nCOPY . .\nUSER node\nENV PORT=8080 HOST=0.0.0.0\nEXPOSE 8080\nCMD ["node", "server.mjs"]\n');
  if(sourceDir){
    const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'source-manifest.json')));
    if(source.coreId!==coreId)throw Error('Source archive belongs to another core');
    for(const part of source.parts){
      if(!/^source\.tar\.gz\.part\d{3}$/.test(part.name))throw Error('Invalid source part name');
      const bytes=fs.readFileSync(path.join(sourceDir,part.name));
      if(bytes.length!==part.bytes||hash(bytes)!==part.sha256)throw Error('Source archive part hash mismatch');
      write('source/'+part.name,bytes);
    }
    for(const name of ['source-manifest.json','README.txt','core-build.json','linux-toolchain.lock.json'])copy(path.join(sourceDir,name),'source/'+name);
    write('source/index.html','<!doctype html><title>Engine source</title><h1>Engine source</h1><p>Download all parts and join them in order as described in <a href="README.txt">README</a>. Checksums: <a href="source-manifest.json">manifest</a>.</p><ul>'+source.parts.map(p=>'<li><a href="'+p.name+'">'+p.name+'</a></li>').join('')+'</ul>');
  }
  write('release.json',JSON.stringify({schemaVersion:1,coreId,kind:'browser-only-preview',defaults,networkMultiplayer:false,performanceCertified:false,sourceIncluded:Boolean(sourceDir),discProvision:'player-local-file',createdAt:new Date().toISOString()},null,2));
  const files=[];
  const inventory=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())inventory(p);else files.push({path:path.relative(destination,p),bytes:fs.statSync(p).size,sha256:hash(fs.readFileSync(p))});}};
  inventory(destination);write('files.json',JSON.stringify(files,null,2));
  return {destination,coreId,files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0)};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const arg=name=>process.argv[process.argv.indexOf(name)+1];
  console.log(JSON.stringify(packageBrowserRelease({coreId:process.argv.includes('--core')?arg('--core'):undefined,output:process.argv.includes('--out')?arg('--out'):undefined,wasmDispatch:process.argv.includes('--wasm-dispatch'),sourceDir:process.argv.includes('--source-dir')?arg('--source-dir'):undefined}),null,2));
}
