// Refresh audited host pins for the named modules after reviewing that their
// changes add no native (HEAP) writes or imports. Pass file names explicitly.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=path.resolve(import.meta.dirname,'../../engines/browser-native'),contract=path.join(dir,'dirty-host-contract.mjs');
let text=fs.readFileSync(contract,'utf8');
for(const name of process.argv.slice(2)){
 const re=new RegExp(`("${name.replace(/[.]/g,'\\.')}": ")[0-9a-f]{64}"`);if(!re.test(text))throw Error('Not a pinned host module: '+name);
 const hash=createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex');text=text.replace(re,`$1${hash}"`);console.log(name,hash);
}
fs.writeFileSync(contract,text);
