import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectArchive} from '../../engines/browser-native/archive.mjs';
import {convertResultSceneAsset} from '../../engines/browser-native/menu-assets.mjs';
import {inspectResultMotions} from '../../engines/browser-native/result-motion-assets.mjs';
import {createNativePortServer} from './serve.mjs';

const root=path.resolve(import.meta.dirname,'../..'),output=path.join(root,'dist/native-port/experiment-result-assets');
const server=createNativePortServer({enableRooms:false});
const listen=()=>new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
try{
 await listen();const base='http://127.0.0.1:'+server.address().port;
 const get=async name=>{const response=await fetch(base+'/'+name);if(!response.ok)throw Error('Hosted result asset unavailable '+name);return new Uint8Array(await response.arrayBuffer());};
 const names=JSON.parse(new TextDecoder().decode(await get('result-fixtures.json')));if(names.length!==28||names[0]!=='GmRst.usd'||names[1]!=='SdRst.usd')throw Error('Invalid result fixture manifest');
 const sceneBytes=await get('fixtures/GmRst.usd'),scene=convertResultSceneAsset(sceneBytes);
 const expectedScenes=[['pnlsce',1],['flmsce',4]];if(JSON.stringify(scene.scenes.map(s=>[s.symbol,s.rows.length]))!==JSON.stringify(expectedScenes)||scene.models.length!==5||scene.pointerSlots.size!==4857)throw Error('Unexpected original result scene graph');
 const archives=[];
 for(const name of names.slice(1)){
  const bytes=await get('fixtures/'+name),archive=inspectArchive(bytes),publics=[...archive.publics.keys()];
  const invalidPublics=name==='SdRst.usd'?publics.length!==1||publics[0]!=='SIS_ResultData':!publics.length||publics.some(symbol=>!symbol.startsWith('ftDemoResultMotionFile'));
  if(archive.externs.size||invalidPublics)throw Error('Unexpected result archive '+name);
  const motions=name==='SdRst.usd'?null:inspectResultMotions(bytes,name);
  archives.push({name,bytes:bytes.length,publics,relocations:archive.relocations.size,...(motions?{motionPublics:motions.motions,clips:motions.clips,tracks:motions.tracks,commands:motions.commands}:{}),sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const motionRows=archives.filter(row=>row.motionPublics),motionTotals={archives:motionRows.length,publics:motionRows.reduce((n,row)=>n+row.motionPublics.length,0),clips:motionRows.reduce((n,row)=>n+row.clips,0),tracks:motionRows.reduce((n,row)=>n+row.tracks,0),commands:motionRows.reduce((n,row)=>n+row.commands,0)};
 if(motionTotals.archives!==26||motionTotals.publics!==27||motionTotals.clips<200||motionTotals.tracks<20000||motionTotals.commands<100000)throw Error('Incomplete result motion graph '+JSON.stringify(motionTotals));
 const report={passed:true,hostedNoIsoStartup:true,manifestCount:names.length,scene:{bytes:sceneBytes.length,scenes:scene.scenes.map(s=>({symbol:s.symbol,models:s.rows.length,camera:s.camera})),modelGraphs:scene.models,pointerSlots:scene.pointerSlots.size,sha256:createHash('sha256').update(sceneBytes).digest('hex')},motionTotals,archives};
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,fixtures:names.length,scenes:report.scene.scenes,models:scene.models.length,pointers:scene.pointerSlots.size,motionTotals}));
}finally{await new Promise(resolve=>server.close(resolve));}
