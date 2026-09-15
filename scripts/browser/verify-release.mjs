import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const dir=path.resolve(process.argv[2]||''),files=JSON.parse(fs.readFileSync(path.join(dir,'files.json')));
const release=JSON.parse(fs.readFileSync(path.join(dir,'release.json')));
const game=JSON.parse(fs.readFileSync(path.join(dir,'game/manifest.json')));
const bootstrap=fs.readFileSync(path.join(dir,'play/release-bootstrap.js'),'utf8');
if(release.discProvision!=='hosted-automatic'||release.gameSha256!==game.sha256||
 !bootstrap.includes("dataset.hostedGame='/game/manifest.json'")||
 !fs.existsSync(path.join(dir,'play/browser-hosted-game.js'))||
 game.omittedFiles?.length||game.parts.some(p=>p.name!==`${p.sha256}.gz`||
   !files.some(f=>f.path===`game/${p.name}`&&f.bytes===p.bytes)))
 throw Error('Release lacks its complete automatic hosted game');
for(const f of files){
 if(path.isAbsolute(f.path)||f.path.split('/').includes('..'))throw Error('Unsafe release path');
 if(/\.(iso|gcm|rvz|dol|sav|raw|png|usd|dat)$/i.test(f.path)||f.path.includes('.env'))throw Error('Game data or secret in release: '+f.path);
 const bytes=fs.readFileSync(path.join(dir,f.path));if(bytes.length!==f.bytes||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Release hash mismatch: '+f.path);
 if(bytes.length>25*1024*1024)throw Error('Asset exceeds Cloudflare Pages 25 MiB limit: '+f.path);
}
for(const f of files.filter(f=>/^play\/melee-.*\.js$/.test(f.path)&&
 !/^play\/melee-(runtime|startup|probe-controls)\.js$/.test(f.path))){
 const other=files.find(entry=>entry.path===f.path.replace(/^play\//,'engine/src/'));
 if(!other||other.sha256!==f.sha256)throw Error('Packaged Melee control modules diverge: '+f.path);
}
console.log(`Verified ${files.length} release files and hosted game chunks; no uncompressed disc/save/extracted textures; every file fits the 25 MiB static-host limit.`);
