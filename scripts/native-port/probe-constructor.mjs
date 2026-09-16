import fs from 'node:fs';
import {shaderIdentityFiles,validateShaderCatalog} from '../../engines/browser-native/shader-catalog.mjs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const stageKey=process.argv.find(x=>x.startsWith('--map='))?.slice(6)??'battlefield';
if(!['battlefield','destination','dreamland'].includes(stageKey))throw Error('Unknown native map');
const stageOnly=process.argv.includes('--stage-only'),stageFrames=Number(process.argv.find(x=>x.startsWith('--stage-frames='))?.slice(15)??4500);
if(!Number.isInteger(stageFrames)||stageFrames<4500||stageFrames>27000||stageOnly&&(!process.argv.includes('--stage-callbacks')||process.argv.includes('--live')))throw Error('Stage-only requires --stage-callbacks without --live, 4500..27000 frames');
const deferredGpuErrors=process.argv.includes('--defer-gpu-errors');
const recordShaders=process.argv.includes('--record-shaders'),prewarmShaders=process.argv.includes('--prewarm-shaders');
const cpuProfile=process.argv.includes('--cpu-profile');
const character=process.argv.find(x=>x.startsWith('--character='))?.slice(12)??'Ca';
if(!/^[A-Z][a-z]$/.test(character))throw Error('Character must be a two-letter fighter archive code');
const workload=process.argv.includes('--workload'),workloadSteps=process.argv.includes('--workload-steps');
const stageCallbacks=process.argv.includes('--stage-callbacks'),intro=stageCallbacks||process.argv.includes('--intro'),damageHud=intro||process.argv.includes('--damage-hud'),hud=damageHud||process.argv.includes('--hud');
const tournament=hud||workloadSteps||process.argv.includes('--tournament')||process.argv.includes('--timeout'),hardware=process.argv.includes('--hardware'),callbacks=!process.argv.includes('--manual-draw'),input=process.argv.includes('--input'),renderSteps=process.argv.includes('--render-steps'),live=process.argv.includes('--live'),render=renderSteps||live||process.argv.includes('--render'),camera=render||process.argv.includes('--camera'),control=process.argv.includes('--combat-control'),combat=tournament||(camera&&!input)||control||process.argv.includes('--combat'),stage=combat||input||process.argv.includes('--stage'),step=stage||process.argv.includes('--step');
if(deferredGpuErrors&&!live)throw Error('Deferred GPU checks are limited to live probes; validation keeps per-frame checks');
if((recordShaders||prewarmShaders)&&!render)throw Error('Shader catalogs require a rendered fixture');
if(character!=='Ca'&&combat&&!live)throw Error('Use a non-Captain character with --input, --live or constructor/step; scripted combat/lifecycle assertions need broader validation');
if(tournament&&input)throw Error('Tournament probe requires two fighters; use --tournament alone for lifecycle checks');
if(workload&&(!live||!tournament))throw Error('Use --workload with --tournament --live');
if(live&&input)throw Error('Use --live for browser input or --input for scripted input, not both');
const projectileControl=process.argv.includes('--projectile-control'),projectileShield=process.argv.includes('--projectile-shield'),projectileReflect=process.argv.includes('--projectile-reflect'),projectileCombat=projectileReflect||projectileControl||projectileShield||process.argv.includes('--projectile-combat'),projectiles=projectileCombat||process.argv.includes('--projectiles');
if(projectiles&&(!input||!['Fx','Fc'].includes(character))||[projectileControl,projectileShield,projectileReflect].filter(Boolean).length>1)throw Error('Projectile probes require --character=Fx or Fc with --input and one contact mode');
const liveFrames=Number(process.argv.find(x=>x.startsWith('--frames='))?.slice(9)??(workloadSteps?3600:180));
if(!Number.isInteger(liveFrames)||liveFrames<180||liveFrames>3600)throw Error('Probe frame limit must be 180..3600');
if(cpuProfile&&(!live||!workload||liveFrames<1800))throw Error('CPU profile requires --live --workload --frames=1800 or longer');
const chrome=process.env.CHROME||'google-chrome',output=path.resolve(import.meta.dirname,'../../dist/native-port');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'melee-constructor-probe-')),server=createNativePortServer(),pending=new Map();
let browser,socket,sequence=0,stderr='',probe=null,partial=null,crashed=false,frames=null;const diagnostics=[];
const symbols=new Map(fs.readFileSync(path.join(output,'melee-fighter-init.mjs.symbols'),'utf8').trim().split('\n').map(line=>{const split=line.indexOf(':');return [Number(line.slice(0,split)),line.slice(split+1)];}));
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},5000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=spawn(chrome,['--headless=new','--no-sandbox',...(render?[...(hardware?['--enable-gpu']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--window-size=1000,900']:['--disable-gpu']),'--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  browser.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile);i++){if(i===100||browser.exitCode!==null)throw Error('Chrome launch failed: '+stderr);await delay(100);}
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data),wait=pending.get(m.id);if(wait){pending.delete(m.id);m.error?wait.reject(Error(JSON.stringify(m.error))):wait.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown'){const e=m.params.exceptionDetails;probe={...(partial??{}),error:e.exception?.description??e.text,diagnostics};}
    if(m.method==='Inspector.targetCrashed')crashed=true;
    if(m.method==='Debugger.paused')frames=m.params.callFrames.map(f=>({function:symbols.get(Number(/^\$func(\d+)$/.exec(f.functionName)?.[1]))||f.functionName,url:f.url,location:f.location}));
    if(m.method==='Runtime.consoleAPICalled')for(const arg of m.params.args){const value=arg.value;if(typeof value!=='string')continue;if(value.startsWith('NATIVE_CONSTRUCTOR_RESULT '))probe=JSON.parse(value.slice(26));else if(value.startsWith('NATIVE_CONSTRUCTOR_START '))partial=JSON.parse(value.slice(25));else {diagnostics.push(value);if(diagnostics.length>64)diagnostics.shift();}}
  });
  await command('Runtime.enable');await command('Debugger.enable');await command('Page.enable');
  await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/constructor.html'+(combat?'?step=1&stage=1&combat=1'+(control?'&control=1':'')+(camera?'&camera=1':'')+(render?'&render=1':'')+(callbacks?'&callbacks=1':'&callbacks=0')+(tournament?'&tournament=1':'')+(hud?'&hud=1':'')+(damageHud?'&damagehud=1':'')+(intro?'&intro=1':'')+(stageCallbacks?'&stagecallbacks=1':'')+(process.argv.includes('--timeout')?'&timeout=1':'')+(live?'&live=1&liveframes='+liveFrames:'')+(workload?'&workload=1':'')+(workloadSteps?'&workloadsteps='+liveFrames:'')+(renderSteps?'&rendersteps=1':''):input?'?step=1&stage=1&input=1'+(render?'&render=1':'')+(renderSteps?'&rendersteps=1':''):stage?'?step=1&stage=1':step?'?step=1':'?probe=1')+(projectiles?'&projectiles=1':'')+(projectileCombat?'&projectilecombat=1':'')+(projectileControl?'&projectilecontrol=1':'')+(projectileShield?'&projectileshield=1':'')+(projectileReflect?'&projectilereflect=1':'')+(stageOnly?'&stageonly=1':'')+'&stageframes='+stageFrames+(deferredGpuErrors?'&gpuerrors=deferred':'')+(recordShaders?'&recordshaders=1':'')+(prewarmShaders?'&prewarmshaders=1':'')+'&map='+stageKey+'&character='+character+(process.argv.includes('--verify-vertices')?'&verifyvertices=1':'')});
  if(cpuProfile){
    let first;
    for(let i=0;i<120;i++){
      const r=await command('Runtime.evaluate',{expression:'globalThis.nativeLive?.snapshot().frames',returnByValue:true});
      if(r.result.value>=300){first=r.result.value;break;}
      if(probe?.error)throw Error(probe.error);
      await delay(250);
    }
    if(first===undefined)throw Error('Live CPU profile never reached frame 300');
    await command('Profiler.enable');await command('Profiler.setSamplingInterval',{interval:1000});await command('Profiler.start');
    await delay(15000);
    const result=await command('Profiler.stop');
    const last=await command('Runtime.evaluate',{expression:'globalThis.nativeLive?.snapshot().frames',returnByValue:true});
    fs.writeFileSync(path.join(output,'constructor-live.cpuprofile'),JSON.stringify(result.profile));
    fs.writeFileSync(path.join(output,'constructor-profile-window.json'),JSON.stringify({firstFrame:first,lastFrame:last.result.value,intervalMicroseconds:1000,performanceSampleInstrumented:true})+'\n');
  }
  if(live&&!workload){
    async function waitFor(expression){for(let i=0;i<600;i++){if(probe?.error)throw Error(probe.error);const value=await command('Runtime.evaluate',{expression,returnByValue:true});if(value.result.value)return;await delay(50);}throw Error('Interactive probe wait: '+expression);}
    await waitFor("document.documentElement.dataset.live==='ready'");
    async function key(code,key,type){await command('Input.dispatchKeyEvent',{type,key,code});}
    await key('KeyX','x','keyDown');
    await waitFor('globalThis.nativeLive?.snapshot().jump');
    await key('KeyX','x','keyUp');
    await key('KeyZ','z','keyDown');
    await waitFor('globalThis.nativeLive?.snapshot().attack');
    await key('KeyZ','z','keyUp');
    await waitFor('globalThis.nativeLive?.snapshot().final?.[0]?.[3]===0');
    await key('ArrowRight','ArrowRight','keyDown');
    await waitFor('globalThis.nativeLive?.snapshot().movement');
    await key('ArrowRight','ArrowRight','keyUp');
  }
  for(let i=0;i<(live||renderSteps||stageOnly?900:200)&&!probe&&!crashed&&browser.exitCode===null;i++)await delay(100);
  if(!probe){if(!crashed){try{await command('Debugger.pause');for(let i=0;i<20&&!frames;i++)await delay(100);}catch(error){diagnostics.push(String(error));}}
    probe={...(partial||{}),constructorCompleted:partial?.constructorCompleted===true,error:crashed?'Browser renderer crashed':'Constructor did not finish within '+(live||renderSteps||stageOnly?90:20)+' seconds',diagnostics,pausedFrames:frames,playable:false,performanceMeasured:false};}
  if(probe.error)probe.error=probe.error.replace(/wasm-function\[(\d+)\]/g,(text,id)=>text+' '+(symbols.get(Number(id))||'unknown'));
  fs.writeFileSync(path.join(output,'last-constructor-probe.json'),JSON.stringify(probe,null,2)+'\n');
  if(intro&&!probe.error){
    if(!probe.intro?.completed)throw Error('Original Ready/Go sequence did not complete');
    if(render)for(const [name,index] of [['ready',3],['go',4]]){
      if(!probe.intro[name]?.hud?.objects.some(o=>o.name==='status '+index&&o.draws))throw Error('No original '+name+' draw evidence');
      const shot=await command('Runtime.evaluate',{expression:"document.getElementById('native-preview-"+name+"').src",returnByValue:true});
      if(!shot.result.value.startsWith('data:image/png;base64,'))throw Error('Missing '+name+' screenshot');
      fs.writeFileSync(path.join(output,'native-match-'+name+'.png'),Buffer.from(shot.result.value.split(',')[1],'base64'));
    }
  }
  if(render&&!live&&!renderSteps&&probe.preview&&!probe.error) {
    for(const [name,snapshot] of Object.entries(probe.preview))if(!snapshot.materialShaderChecks?.passed||!snapshot.materialDraws?.draws||!snapshot.materialDraws?.vertexChecks?.vertices||(callbacks&&(!intro||name!=='settled')&&snapshot.actors.filter(a=>/ P[12]$/.test(a.name)).some(a=>!a.draws)))throw Error('Incomplete native material draw verification: '+name);
    for(const [id,name] of [['native-preview-settled','settled'],['native-preview','final']]) {
      const evaluated=await command('Runtime.evaluate',{expression:'(()=>{const r=document.getElementById('+JSON.stringify(id)+').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()',returnByValue:true});
      const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:evaluated.result.value});
      fs.writeFileSync(path.join(output,'native-match-'+name+'.png'),Buffer.from(shot.data,'base64'));
    }
  }
  if(['Ms','Fe'].includes(character)&&input&&renderSteps&&!probe.error&&!probe.afterimages?.draws)throw Error('Sword input probe did not render original afterimages');
  if(process.argv.includes('--verify-vertices')&&probe.preview?.afterimage&&!probe.error&&!probe.preview.afterimage.materialDraws?.vertexChecks?.byOwner?.afterimage?.vertices)throw Error('Afterimage vertices were not GPU-verified');
  if(probe.preview?.afterimage&&!probe.error){
    const shot=await command('Runtime.evaluate',{expression:"document.getElementById('native-preview-afterimage').src",returnByValue:true});
    if(!shot.result.value?.startsWith('data:image/png;base64,'))throw Error('Missing afterimage screenshot');
    fs.writeFileSync(path.join(output,character+'-native-match-afterimage.png'),Buffer.from(shot.result.value.split(',')[1],'base64'));
  }
  if(projectiles&&!probe.error&&(!probe.projectiles?.completed||renderSteps&&!projectileControl&&!probe.preview?.projectile))throw Error('Incomplete projectile probe');
  if(probe.preview?.projectile&&!probe.error){
    const shot=await command('Runtime.evaluate',{expression:"document.getElementById('native-preview-projectile').src",returnByValue:true});
    if(!shot.result.value?.startsWith('data:image/png;base64,'))throw Error('Missing projectile screenshot');
    fs.writeFileSync(path.join(output,character+'-native-match-projectile-'+probe.projectiles.mode+'.png'),Buffer.from(shot.result.value.split(',')[1],'base64'));
  }
  if(probe.preview?.particles&&!probe.error){
    const shot=await command('Runtime.evaluate',{expression:"document.getElementById('native-preview-particles').src",returnByValue:true});
    if(!shot.result.value?.startsWith('data:image/png;base64,'))throw Error('Missing particle screenshot');
    fs.writeFileSync(path.join(output,'native-match-particles.png'),Buffer.from(shot.result.value.split(',')[1],'base64'));
  }
  if(tournament&&renderSteps&&!stageOnly&&!probe.error&&!process.argv.includes('--timeout')){
    if(!probe.preview?.respawn||!probe.respawnPlatformDrawFrames)throw Error('No rendered respawn platform evidence');
    if(damageHud&&[1,2,3,4].some(n=>!probe.hud.stockDrawCounts.includes(n)))throw Error('Stock icons did not decrement through native respawns');
    const evaluated=await command('Runtime.evaluate',{expression:"document.getElementById('native-preview-respawn').src",returnByValue:true});
    if(!evaluated.result.value.startsWith('data:image/png;base64,'))throw Error('Missing respawn screenshot');
    fs.writeFileSync(path.join(output,'native-match-respawn.png'),Buffer.from(evaluated.result.value.split(',')[1],'base64'));
  }
  if(hud&&renderSteps&&!stageOnly&&!probe.error){
    if(!probe.preview.status||!probe.hud.statusFrames)throw Error('No original HUD match-end draw evidence');
    const shot=await command('Runtime.evaluate',{expression:"document.getElementById('native-preview-status').src",returnByValue:true});
    if(!shot.result.value.startsWith('data:image/png;base64,'))throw Error('Missing status screenshot');
      fs.writeFileSync(path.join(output,'native-match-status.png'),Buffer.from(shot.result.value.split(',')[1],'base64'));
    if(process.argv.includes('--timeout')){
      if(!probe.preview.countdown||!probe.hud.countdownFrames)throw Error('No original countdown draw evidence');
      const shot=await command('Runtime.evaluate',{expression:"document.getElementById('native-preview-countdown').src",returnByValue:true});
      if(!shot.result.value.startsWith('data:image/png;base64,'))throw Error('Missing countdown screenshot');
      fs.writeFileSync(path.join(output,'native-match-countdown.png'),Buffer.from(shot.result.value.split(',')[1],'base64'));
    }
  }
  const rendererSources=Object.fromEntries(['material-gpu.mjs','native-pixel.mjs','native-match-preview.mjs','combat-workload.mjs'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')]));
  const report={stage:stageKey,character,recordShaders,prewarmShaders,deferredGpuErrors,driverShaderCacheDisabled:process.env.MESA_SHADER_CACHE_DISABLE==='true',rendererSources,cpuProfileInstrumented:cpuProfile,gpuRequested:hardware?'hardware':'software',browser:execFileSync(chrome,['--version'],{encoding:'utf8'}).trim(),build:JSON.parse(fs.readFileSync(path.join(output,'fighter-init-build.json'))),probe};
  if(recordShaders&&!probe.error){
    const result=await command('Runtime.evaluate',{expression:'globalThis.nativeShaderSources',returnByValue:true});
    const identity={wasmSha256:report.build.wasmSha256,sources:Object.fromEntries(shaderIdentityFiles.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')]))};
    const catalog=validateShaderCatalog({version:1,identity,programs:result.result.value},identity);
    catalog.recording={stage:stageKey,character,frames:probe.live?.frames??probe.input?.frames??probe.combat?.frames??0,stageCallbackFrames:probe.stage?.callbackFrames??0,workload,stageOnly,inheritedPrograms:probe.shaderPreparation?.compiled??0};
    const name='shader-record-'+stageKey+'-'+character+'-'+(stageOnly?'cycle':live?'live':input?'input':'combat')+'.json';
    fs.writeFileSync(path.join(output,name),JSON.stringify(catalog)+'\n');report.shaderRecording={file:name,programs:catalog.programs.length};
  }
  if(prewarmShaders&&!probe.error&&!probe.shaderPreparation?.fighterStateUnchanged)throw Error('Shader preparation did not complete');
  fs.writeFileSync(path.join(output,(deferredGpuErrors?'deferred-errors-':'')+(prewarmShaders?'prepared-':'')+(stageKey==='battlefield'?'':stageKey+'-')+(character==='Ca'?'':character+'-')+(projectiles?(projectileControl?'projectile-control-':projectileShield?'projectile-shield-':projectileReflect?'projectile-reflect-':projectileCombat?'projectile-contact-':'projectile-'):'')+(cpuProfile?'profiled-':'')+(hardware?'hardware-':'')+(stageCallbacks?'stage-callbacks-':'')+(stageOnly?'stage-only-':'')+(intro?'intro-':'')+(damageHud?'damage-':hud?'hud-':'')+(workload?'workload-':workloadSteps?'workload-steps-':'')+(tournament?(process.argv.includes('--timeout')?'tournament-timeout-':'tournament-'):'')+(renderSteps?(input?'constructor-input-render-probe.json':'constructor-render-steps-probe.json'):live?'constructor-live-probe.json':render?'constructor-render-probe.json':camera?'constructor-camera-probe.json':control?'constructor-combat-control-probe.json':combat?'constructor-combat-probe.json':input?'constructor-input-probe.json':stage?'constructor-stage-probe.json':step?'constructor-step-probe.json':'constructor-probe.json')),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(output,'constructor-chrome.log'),stderr);
  console.log(JSON.stringify(probe,null,2));if(!probe.constructorVerified||probe.error||(deferredGpuErrors&&!probe.finalGpuErrorCheck)||(stageOnly&&probe.stage?.callbackFrames!==stageFrames)||(step&&probe.schedulerSteps!==(intro?0:120))||(input&&!probe.input?.completed)||(combat&&!live&&!stageOnly&&!workloadSteps&&!probe.combat?.completed)||(tournament&&!live&&!stageOnly&&!(probe.lifecycle?.completed||probe.timeout?.completed||probe.simulationWorkload?.completed))||(live&&(probe.live?.frames!==liveFrames||(workload?!(probe.live?.workload.framesWithAttack>100&&probe.live?.workload.framesWithHitlag>30&&probe.live.workload.windows.every(w=>w.hitlag>0)):(!probe.live?.movement||!probe.live?.jump||!probe.live?.attack||probe.live.stateChanges.some(s=>s.state<14))))))process.exitCode=2;
} finally {
  socket?.close();for(const p of pending.values())p.reject(Error('Probe closed'));pending.clear();
  if(browser&&browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(2000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}
  await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});
}
