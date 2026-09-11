import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const dir=path.resolve(process.argv[2]||''),files=JSON.parse(fs.readFileSync(path.join(dir,'files.json')));
for(const f of files){
 if(path.isAbsolute(f.path)||f.path.split('/').includes('..'))throw Error('Unsafe release path');
 if(/\.(iso|gcm|rvz|dol|sav|raw|png|usd|dat)$/i.test(f.path)||f.path.includes('.env'))throw Error('Game data or secret in release: '+f.path);
 const bytes=fs.readFileSync(path.join(dir,f.path));if(bytes.length!==f.bytes||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Release hash mismatch: '+f.path);
 if(bytes.length>25*1024*1024)throw Error('Asset exceeds Cloudflare Pages 25 MiB limit: '+f.path);
}
console.log(`Verified ${files.length} release files; no disc/save/extracted textures; every file fits the 25 MiB static-host limit.`);
