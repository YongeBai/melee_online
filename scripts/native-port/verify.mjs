import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const output=path.resolve(import.meta.dirname,'../../dist/native-port');
const {default:create}=await import(pathToFileURL(path.join(output,'melee-native.mjs')));
const {verifyNative}=await import(pathToFileURL(path.join(output,'verify.mjs')));
const manifest=path.join(output,'stage-fixtures.json');
const names=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest)):[];
const fighterManifest=path.join(output,'fighter-fixtures.json');
const fighterNames=fs.existsSync(fighterManifest)?JSON.parse(fs.readFileSync(fighterManifest)):[];
const load=names=>names.map(name=>({name,bytes:new Uint8Array(fs.readFileSync(path.join(output,'fixtures',name)))}));
const animationManifest=path.join(output,'animation-fixtures.json');
const animationNames=fs.existsSync(animationManifest)?JSON.parse(fs.readFileSync(animationManifest)):[];
const modelManifest=path.join(output,'model-fixtures.json');
const modelNames=fs.existsSync(modelManifest)?JSON.parse(fs.readFileSync(modelManifest)):[];
const report=await verifyNative(await create(),load(names),load(fighterNames),load(animationNames),
  {allAnimations:process.argv.includes('--all-animations'),models:load(modelNames)});
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
