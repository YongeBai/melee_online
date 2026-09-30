// Packages the allowlisted native-port product files as a static Vercel site
// with a small peer-signaling function. Game simulation, rendering and
// rollback stay in each browser; the function only exchanges WebRTC offers.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativePortFiles} from './serve.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const source=path.resolve(process.argv[2]??path.join(root,'dist/native-port'));
const out=path.resolve(process.argv[3]??path.join(root,'dist/playmelee-vercel'));
// A pinned host file that does not match its audit hash makes the page refuse
// to start; never package such a release.
const {dirtyHostContract}=await import(path.join(source,'dirty-host-contract.mjs'));
const unpinned=Object.entries(dirtyHostContract).filter(([name,hash])=>!fs.existsSync(path.join(source,name))||createHash('sha256').update(fs.readFileSync(path.join(source,name))).digest('hex')!==hash).map(([name])=>name);
if(unpinned.length)throw Error('Pinned host files do not match their audit hashes: '+unpinned.join(', '));
// Keep the Vercel project link: without it `vercel deploy` creates a new project.
const link=path.join(out,'.vercel/project.json'),linked=fs.existsSync(link)?fs.readFileSync(link):null;
if(fs.existsSync(out))fs.rmSync(out,{recursive:true});
if(linked){fs.mkdirSync(path.dirname(link),{recursive:true});fs.writeFileSync(link,linked);}
fs.mkdirSync(path.join(out,'public/play'),{recursive:true});
const inventory={};
for(const name of [...nativePortFiles].sort()){
 const from=path.join(source,name);if(!fs.existsSync(from))continue;
 // Diagnostic-only pages stay out of the public release.
 if(name.endsWith('.html')&&name!=='character-menu.html')continue;
 const to=path.join(out,'public/play',name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
 inventory[name]=createHash('sha256').update(fs.readFileSync(to)).digest('hex');
}
fs.copyFileSync(path.join(out,'public/play/character-menu.html'),path.join(out,'public/play/index.html'));
for(const dir of ['api'])fs.cpSync(path.join(root,'deploy/playmelee',dir),path.join(out,dir),{recursive:true});
fs.copyFileSync(path.join(root,'deploy/playmelee/package.json'),path.join(out,'package.json'));
fs.copyFileSync(path.join(root,'deploy/playmelee/vercel.json'),path.join(out,'vercel.json'));
fs.writeFileSync(path.join(out,'public/release.json'),JSON.stringify({schemaVersion:2,kind:'browser-native-wasm',dolphin:false,networkMultiplayer:'webrtc-peer-rollback',createdAt:new Date().toISOString(),files:Object.keys(inventory).length,inventorySha256:createHash('sha256').update(JSON.stringify(inventory)).digest('hex')},null,1));
fs.writeFileSync(path.join(out,'public/files.json'),JSON.stringify(inventory));
const bytes=Object.keys(inventory).reduce((n,name)=>n+fs.statSync(path.join(out,'public/play',name)).size,0);
console.log(`Packaged ${Object.keys(inventory).length} files (${(bytes/1048576).toFixed(1)} MiB) into ${out}`);
