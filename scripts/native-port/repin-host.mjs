// Refresh audited host pins for the named modules after reviewing that their
// changes add no native (HEAP) writes or imports. Pass file names explicitly.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=path.resolve(import.meta.dirname,'../../engines/browser-native'),served=path.resolve(import.meta.dirname,'../../dist/native-port'),contract=path.join(dir,'dirty-host-contract.mjs');
let text=fs.readFileSync(contract,'utf8');
for(const name of process.argv.slice(2)){
 const re=new RegExp(`("${name.replace(/[.]/g,'\\.')}": ")[0-9a-f]{64}"`);if(!re.test(text))throw Error('Not a pinned host module: '+name);
 // Hash the served copy: generated modules and binaries exist only there.
 const file=fs.existsSync(path.join(dir,name))?path.join(dir,name):path.join(served,name);
 const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');text=text.replace(re,`$1${hash}"`);console.log(name,hash);
}
fs.writeFileSync(contract,text);
