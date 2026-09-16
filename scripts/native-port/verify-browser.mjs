import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createNativePortServer} from './serve.mjs';
const run=promisify(execFile), chrome=process.env.CHROME||'google-chrome';
const allAnimations=process.argv.includes('--all-animations');
const scene=process.argv.includes('--scene');
if(scene&&allAnimations)throw Error('Scene verification selects its explicit 38-clip integration corpus');
const output=path.resolve(import.meta.dirname,'../../dist/native-port');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'melee-native-port-check-'));
const server=createNativePortServer();
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const {stdout}=await run(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--user-data-dir='+profile,'--virtual-time-budget=15000','--dump-dom',
    'http://127.0.0.1:'+server.address().port+'/'+(scene?'scene.html':allAnimations?'?allanimations=1':'')],{timeout:60000,maxBuffer:8*1024**2});
  const match=stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  if(!match||!stdout.includes('data-result="passed"'))throw Error('Browser verification failed: '+(match?.[1]||stdout));
  const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"'};
  const verification=JSON.parse(match[1].replace(/&(amp|lt|gt|quot);/g,x=>entities[x]));
  if(scene) {
    if(!verification.attributes?.passed||verification.attributes.rows.length!==27||verification.attributes.copies!==135)throw Error('Incomplete original character attribute coverage');
    if(!verification.lights?.passed||verification.lights.cases!==22)throw Error('Incomplete original SDK light-object coverage');
    if(!verification.passed||verification.models.length!==27||verification.animations.clips.length!==38||verification.residentFiles?.files.length!==27||!verification.residentFiles.lifecycle?.passed)throw Error('Incomplete native HSD scene coverage');
    if(!verification.shared?.passed||verification.shared.fields!==536||verification.shared.parts!==34||verification.shared.sections.length!==23)throw Error('Incomplete typed shared-data coverage');
    if(!verification.shared.colors?.passed||verification.shared.colors.entries!==129)throw Error('Incomplete original color interpreter coverage');
    if(!verification.shared.cpu?.passed||verification.shared.cpu.scripts!==61||verification.shared.cpu.choices!==8192)throw Error('Incomplete original CPU data coverage');
    if(!verification.commonInitialization?.passed||verification.commonInitialization.globals!==23||verification.commonInitialization.models.length!==3)throw Error('Incomplete original common initialization');
    if(!verification.characterCollision?.passed||verification.characterCollision.rows.length!==27||verification.characterCollision.frames!==864||verification.characterCollision.capacityChecks!==11)throw Error('Incomplete original character collision initialization');
    if(verification.characterCollision.rows.some(r=>!r.originalParts||!r.fighterMaterials))throw Error('Incomplete original part/material setup');
    if(verification.characterCollision.rows.some(r=>!r.auxiliaryDisplays||!r.visibilityChecks||!r.importedCostumes))throw Error('Incomplete auxiliary model/visibility coverage');
    if(verification.characterCollision.rows.some(r=>!r.originalCostumeLoader||!r.costumeCacheReused||!r.materialAnimation?.originalAttach))throw Error('Incomplete original costume/material initialization');
    if(verification.characterCollision.rows.some(r=>!r.originalFighterModel||!r.originalPartAllocation||!r.fighterPolygons||!r.materialAnimation.twoInstances))throw Error('Incomplete original fighter model/allocation coverage');
    if(!verification.motions?.passed||verification.motions.components.length!==27||verification.motions.rows!==8767||verification.motions.sceneClips.length!==39||verification.motions.liveOwners!==0)throw Error('Incomplete original motion loader coverage');
  } else if(!verification.passed||verification.stages.length!==6||verification.fighters.length!==27||verification.poses.models!==27||
    (allAnimations?!verification.animations.allAnimations:verification.animations.clips.length!==27))
    throw Error('Six hosted stages and 27 playable fighter components required');
  const report={browser:(await run(chrome,['--version'])).stdout.trim(),
    build:JSON.parse(fs.readFileSync(path.join(output,scene?'scene-build.json':'build.json'))),verification};
  fs.writeFileSync(path.join(output,scene?'scene-browser-verification.json':'browser-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,...(scene?{sceneModels:verification.models.length}:{stages:verification.stages.length,fighters:verification.fighters.length}),
    clips:verification.animations.clips.length,wasmBytes:report.build.wasmBytes,playable:false,performanceMeasured:false}));
} finally {
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true});
}
