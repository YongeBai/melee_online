// Copy edited host modules (engines/browser-native) into the served build
// (dist/native-port) and refresh the audit pins of the ones that changed.
// Use after reviewing that the changes add no native (HEAP) writes or imports;
// a C change goes through rebuild-product-core.mjs instead.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),source=path.join(root,'engines/browser-native'),served=path.join(root,'dist/native-port');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const copied=[];
for(const name of fs.readdirSync(source)){
 if(!/\.(mjs|html|css)$/.test(name))continue;
 const from=path.join(source,name),to=path.join(served,name);
 if(fs.existsSync(to)&&sha(from)===sha(to))continue;
 if(!fs.existsSync(to)&&!process.argv.includes('--new'))continue;
 fs.copyFileSync(from,to);copied.push(name);
}
const {dirtyHostContract}=await import(path.join(source,'dirty-host-contract.mjs')+'?'+Date.now());
const changed=Object.entries(dirtyHostContract).filter(([name,hash])=>fs.existsSync(path.join(served,name))&&sha(path.join(served,name))!==hash).map(([name])=>name);
if(changed.length)execFileSync(process.execPath,[path.join(root,'scripts/native-port/repin-host.mjs'),...changed],{stdio:'inherit'});
fs.copyFileSync(path.join(source,'dirty-host-contract.mjs'),path.join(served,'dirty-host-contract.mjs'));
console.log(JSON.stringify({copied,repinned:changed}));
