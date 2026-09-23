// Rebuild the product core after a reviewed C change and carry its audit pins:
// fighter-init WASM -> instrumented dirty core -> dirty-runtime manifest pins ->
// served host artifact pins -> shader catalog key. Prints the store/copy/fill
// deltas so the new native writes can be reviewed before they are accepted.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'dist/native-port'),env={...process.env,PATH:path.join(root,'.browser-tools/bin')+':'+process.env.PATH};
const run=(script,...args)=>execFileSync(process.execPath,[path.join(root,'scripts/native-port',script),...args],{cwd:root,env,stdio:['ignore','pipe','inherit'],maxBuffer:1<<28}).toString();
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const replacePin=(file,from,to)=>{const p=path.join(root,file),text=fs.readFileSync(p,'utf8');if(!text.includes(from))throw Error('Pin not found in '+file+': '+from);fs.writeFileSync(p,text.split(from).join(to));};
const previous=JSON.parse(fs.readFileSync(path.join(out,'dirty-core.json')));
// Portable-source adapters invalidate the compile audit; refresh it first.
run('audit.mjs');run('audit-link.mjs');
run('build.mjs','--fighter-init');
const core=sha(path.join(out,'melee-fighter-init.wasm'));
const dirtyBuild=fs.readFileSync(path.join(root,'scripts/native-port/build-dirty-core.mjs'),'utf8'),pinned=dirtyBuild.match(/!=='([0-9a-f]{64})'\)throw Error\('Re-audit/)[1];
if(pinned!==core)replacePin('scripts/native-port/build-dirty-core.mjs',pinned,core);
run('build-dirty-core.mjs');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'dirty-core.json')));
const runtime='engines/browser-native/dirty-runtime.mjs',text=fs.readFileSync(path.join(root,runtime),'utf8');
const check=text.match(/manifest\.originalSha256!=='([0-9a-f]{64})'\|\|manifest\.pageBytes!==4096\|\|manifest\.counts\.stores!==(\d+)\|\|manifest\.counts\.copy!==(\d+)\|\|manifest\.counts\.fill!==(\d+)\|\|manifest\.counts\.tableMutations!==0/);
if(!check)throw Error('Dirty runtime manifest check changed shape');
if(manifest.counts.tableMutations!==0)throw Error('Instrumented core mutates its function table');
replacePin(runtime,check[0],`manifest.originalSha256!=='${manifest.originalSha256}'||manifest.pageBytes!==4096||manifest.counts.stores!==${manifest.counts.stores}||manifest.counts.copy!==${manifest.counts.copy}||manifest.counts.fill!==${manifest.counts.fill}||manifest.counts.tableMutations!==0`);
for(const name of fs.readdirSync(path.join(root,'engines/browser-native')))if(/\.(mjs|html|css)$/.test(name)&&fs.existsSync(path.join(out,name)))fs.copyFileSync(path.join(root,'engines/browser-native',name),path.join(out,name));
const {dirtyHostContract}=await import(path.join(root,'engines/browser-native/dirty-host-contract.mjs')+'?'+Date.now());
const changed=Object.entries(dirtyHostContract).filter(([name,hash])=>sha(path.join(out,name))!==hash).map(([name])=>name);
if(changed.length)run('repin-host.mjs',...changed);
fs.copyFileSync(path.join(root,'engines/browser-native/dirty-host-contract.mjs'),path.join(out,'dirty-host-contract.mjs'));
run('rekey-shader-catalog.mjs');
console.log(JSON.stringify({core,instrumented:manifest.instrumentedSha256,counts:manifest.counts,delta:Object.fromEntries(Object.entries(manifest.counts).map(([k,v])=>[k,v-previous.counts[k]])),repinned:changed},null,1));
