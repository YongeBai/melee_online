import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';

const root=path.resolve(import.meta.dirname,'../..'),output=path.join(root,'dist/native-port/experiment-result-roster');
const server=createNativePortServer({enableRooms:false}),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-result-roster-'));
const codes=['Ca','Dk','Fx','Gw','Kb','Kp','Lk','Lg','Mr','Ms','Mt','Ns','Pe','Pk','Pp','Pr','Ss','Ys','Zd','Sk','Fc','Cl','Dr','Fe','Pc','Gn'];
const internalKinds=[2,3,1,24,4,5,6,17,0,18,16,8,9,12,10,15,13,14,19,7,22,20,21,26,23,25];
const pending=new Map();let browser,ws,id=0,stderr='';
function command(method,params={}){return new Promise((resolve,reject)=>{const call=++id,timer=setTimeout(()=>{pending.delete(call);reject(Error('timeout '+method));},30000);pending.set(call,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});ws.send(JSON.stringify({id:call,method,params}));});}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',bytes=>stderr=(stderr+bytes).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data),wait=pending.get(message.id);if(wait){pending.delete(message.id);message.error?wait.reject(Error(JSON.stringify(message.error))):wait.resolve(message.result);}});
 const evaluate=async expression=>{const response=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);return response.result.value;};
 const onlyArg=process.argv.find(arg=>arg.startsWith('--pair=')),only=onlyArg===undefined?null:Number(onlyArg.slice(7));if(only!==null&&(!Number.isInteger(only)||only<0||only>12))throw Error('Invalid result roster pair');
 const rows=[];
 for(const first of only===null?Array.from({length:13},(_,i)=>i*2):[only*2]){
  const second=first+1,pair=[first,second],names=pair.map(kind=>codes[kind]),row={characters:pair,codes:names,passed:false};
  try{
   await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/result-scene.html?characters=${first},${second}`});let report;
   for(let i=0;i<240;i++){report=await evaluate('globalThis.nativeResultSceneReport');if(report)break;await delay(250);}
   if(!report?.passed)throw Error('Result page failed: '+(report?.error??'missing report')+' actors '+JSON.stringify(report?.resultFighters?.initial??null));
   const actors=report.resultFighters,portraitAddress=actors.portraitAfter?.[1],portraitDraws=actors.compositeGpu?.textureDraws?.filter(draw=>draw.textures.some(texture=>texture.address===portraitAddress))??[];
   const checks={pair:JSON.stringify(report.characterKinds)===JSON.stringify(pair),codes:JSON.stringify(report.selectedCodes)===JSON.stringify(names),internalKinds:actors.initial?.map(actor=>actor[0]).join(',')===pair.map(kind=>internalKinds[kind]).join(','),initialFinite:actors.initial?.every(actor=>actor.every(Number.isFinite)),afterFinite:actors.after60?.every(actor=>actor.every(Number.isFinite)),owners:new Set(actors.owners??[]).size===2,winnerSubmission:actors.winnerSubmission?.count>=1&&actors.winnerSubmission.passes===7,winnerDraws:actors.winnerGpu?.materialDraws?.draws>=1,winnerVertices:actors.winnerGpu?.materialDraws?.vertexChecks?.vertices>=1,winnerPixels:actors.winnerPixels?.colored>=100,captureDraws:actors.captureGpu?.materialDraws?.draws>=1,captureVertices:actors.captureGpu?.materialDraws?.vertexChecks?.vertices>=1,efb:actors.efb?.copies===1&&actors.efb.nativeCopies===1&&actors.efb.last?.width===52&&actors.efb.last?.height===74&&actors.efb.last?.format===5&&actors.efb.last?.bytes===7904,portraitBytes:actors.portraitNonzero>=100,portraitPixels:actors.portraitColored>=100,portraitBinding:portraitDraws.length===1&&portraitDraws[0].textures[0]?.width===52&&portraitDraws[0].textures[0]?.height===74&&portraitDraws[0].textures[0]?.format===5};const failed=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);if(failed.length)throw Error('Invalid result roster checks '+failed.join(',')+' capture '+JSON.stringify({initial:actors.initial,flags:actors.flags,actors:actors.captureGpu?.actors,draws:actors.captureGpu?.materialDraws,nonzero:actors.portraitNonzero,colored:actors.portraitColored,opaque:actors.portraitOpaque}));
   const cleanup=await evaluate(`(()=>{const a=nativeResultActors,m=a.module;a.preview.dispose();m._free(a.snapshot);m._free(a.cameraSnapshot);m._free(a.submissionPasses);m._free(a.portraitSnapshot);m._free(a.attachmentSnapshot);m._portResultSceneFinish();const actor={objects:m._portRuntimeObjectsUsed(),procs:m._portRuntimeProcsUsed()};const s=nativeResultScene,n=s.module;s.preview.dispose();n._free(s.slots);n._portResultSceneFinish();return {actor,panel:{objects:n._portRuntimeObjectsUsed(),procs:n._portRuntimeProcsUsed(),allocations:n._portFileAllocations()}};})()`);
   if(Object.values(cleanup.actor).some(Boolean)||Object.values(cleanup.panel).some(Boolean))throw Error('Result roster lifecycle leaked '+JSON.stringify(cleanup));
   Object.assign(row,{passed:true,internalKinds:actors.initial.map(actor=>actor[0]),winnerDraws:actors.winnerGpu.materialDraws.draws,winnerVertices:actors.winnerGpu.materialDraws.vertexChecks.vertices,winnerPixels:actors.winnerPixels.colored,captureDraws:actors.captureGpu.materialDraws.draws,captureVertices:actors.captureGpu.materialDraws.vertexChecks.vertices,portraitColored:actors.portraitColored,portraitOpaque:actors.portraitOpaque,compositeDraws:actors.compositeGpu.draws,cleanup});
  }catch(error){row.error=String(error.stack??error);}
  rows.push(row);console.log(names.join('/')+': '+(row.passed?'passed':row.error.split('\n')[0]));
 }
 const report={passed:rows.every(row=>row.passed),cases:rows.length,characters:codes.length,rows,scope:'All 26 playable result actors across original constructor, animation, winner GPU draw, loser camera/EFB RGB5A3 copy, original panel attachment, and teardown. Isolated browser result target; not live lifecycle or result-screen FPS.'};
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');if(!report.passed)throw Error('Native result roster failed '+rows.filter(row=>!row.passed).map(row=>row.codes.join('/')).join(','));
 console.log(JSON.stringify({passed:true,cases:report.cases,characters:report.characters}));
}finally{ws?.close();if(browser){browser.kill();await new Promise(resolve=>browser.once('exit',resolve));}await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
