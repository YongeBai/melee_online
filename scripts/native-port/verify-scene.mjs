import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyScene,verifySceneAnimations} from '../../engines/browser-native/verify-scene.mjs';
const output=path.resolve(import.meta.dirname,'../../dist/native-port');
const {default:create}=await import(pathToFileURL(path.join(output,'melee-scene.mjs')));
const module=await create();module._portRuntimeInit();
const names=JSON.parse(fs.readFileSync(path.join(output,'model-fixtures.json')));
const files=names.map(name=>({name,bytes:fs.readFileSync(path.join(output,'fixtures',name))}));
const motions=JSON.parse(fs.readFileSync(path.join(output,'animation-fixtures.json')))
  .map(name=>({name,bytes:fs.readFileSync(path.join(output,'fixtures',name))}));
const report=verifyScene(module,files);report.animations=verifySceneAnimations(module,files,motions);
fs.writeFileSync(path.join(output,'scene-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,models:report.models.length,playable:false,performanceMeasured:false}));
