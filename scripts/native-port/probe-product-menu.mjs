import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'../..'),{createNativePortServer}=await import(root+'/scripts/native-port/serve.mjs'),server=createNativePortServer({enableRooms:!process.argv.includes('--static-only')}),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-menu-'));
const tapOn=process.argv.includes('--tap-on'),holdA=process.argv.includes('--hold-a'),releaseA=process.argv.includes('--release-a-during-load'),pair=holdA||releaseA?[15,12]:[10,10];
const resultsMode=process.argv.includes('--results');
const checkMusic=process.argv.includes('--music')||process.argv.includes('--music-startup');
const stageId=Number(process.argv.find(s=>s.startsWith('--stage='))?.slice(8)??31);
if(![2,3,8,28,31,32].includes(stageId))throw Error('Illegal stage probe');
const pending=new Map(),browserEvents=[];let browser,ws,id=0,stderr='';
function cmd(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});}
try{testFlow:{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(['Runtime.exceptionThrown','Runtime.consoleAPICalled','Log.entryAdded'].includes(m.method)){browserEvents.push(m);if(browserEvents.length>32)browserEvents.shift();}});await cmd('Runtime.enable');await cmd('Log.enable');


 const output=path.join(root,'dist/native-port/experiment-product-menu'+(resultsMode?'-results':'')+(process.argv.includes('--static-only')?'-static-only':tapOn?'-tap-on':holdA?'-held-a':releaseA?'-released-a':'')+(process.argv.includes('--music-startup')?'-music-startup-stage-'+stageId:stageId===31?'':'-stage-'+stageId));fs.mkdirSync(output,{recursive:true});
 async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
 const trace=[];
 async function waitFor(expression,timeout=30000){const start=Date.now();for(;;){const r=await evaluate('({value:('+expression+'),error:globalThis.nativeMenuLiveError??globalThis.nativeMenuMatchReport?.error??globalThis.characterMenuReport?.error})');if(r.error)throw Error(r.error);if(r.value)return r.value;if(Date.now()-start>timeout)throw Error('Timed out: '+expression+' state '+JSON.stringify(await evaluate('({flow:globalThis.nativeMenuLiveState,audio:globalThis.nativeMusic?.snapshot(),music:globalThis.characterMenuReport?.music})'))+' browser '+JSON.stringify(browserEvents));await delay(16);}}
 const held=new Set();
 async function keys(next){for(const code of held)if(!next.includes(code)){await cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code});held.delete(code);}for(const code of next)if(!held.has(code)){await cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key:code});held.add(code);}}
 async function press(code){await keys([code]);await delay(65);await keys([]);await delay(65);}
 async function seat(p){const r=await evaluate(`(()=>{const r=document.querySelector('#keyboard-p${p+1}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await cmd('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});}
 async function steer(expression,target,tolerance=.7){
  for(let i=0;i<220;i++){
   const [x,y]=await evaluate(expression),dx=target[0]-x,dy=target[1]-y;
   if(Math.abs(dx)<tolerance&&Math.abs(dy)<tolerance){await keys([]);return;}
   // Half-strength diagonals fall inside the original SSS per-axis deadzone.
   // Approach one axis at a time, as a physical controller would near its target.
   const next=[Math.abs(dx)>=Math.abs(dy)?(dx>0?'KeyD':'KeyA'):(dy>0?'KeyW':'KeyS')];
   if(Math.max(Math.abs(dx),Math.abs(dy))<3)next.push('ShiftLeft');await keys(next);await delay(16);
  }await keys([]);throw Error('Keyboard cursor did not reach '+JSON.stringify(target)+' at '+JSON.stringify(await evaluate(expression)));
 }
 await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html?interactive=1'+(process.argv.includes('--lockstep')?'&lockstep=1':'')+(resultsMode?'':'&liveframes=900')});
 await waitFor('globalThis.characterMenuReport?.passed');await waitFor('nativeCharacterMenu.read().frames>90');
 const runtime=await evaluate('({same:nativeSnapshotRuntime?.module===characterModule,globals:nativeSnapshotRuntime?.audit?.globals?.length,wasmSha256:nativeSnapshotRuntime?.audit?.wasmSha256,audio:nativeRollbackAudio?.snapshot()})');
 if(!runtime.same||runtime.globals!==4||!/^[0-9a-f]{64}$/.test(runtime.wasmSha256??''))throw Error('Interactive runtime is not snapshot-instrumented '+JSON.stringify(runtime));
 if(!runtime.audio||runtime.audio.presented<1||runtime.audio.pending!==0)throw Error('Unframed menu audio did not present immediately '+JSON.stringify(runtime.audio));
 await keys(['KeyO']);await delay(800);await keys([]);if(await evaluate('nativeMenuLive.snapshot().scene')!=='characters')throw Error('Product CSS exposed another game mode');
 trace.push({phase:'initial',state:await evaluate('nativeCharacterMenu.read()'),runtime});
 if(checkMusic){
  await waitFor('nativeMusic.snapshot().status==="playing"&&nativeMusic.snapshot().outputPeak>0.001');trace.push({phase:'menu-music',audio:await evaluate('nativeMusic.snapshot()')});
  // Exercise the browser stream-device transport without changing match state.
  const paused=await evaluate('(()=>{nativeMusic.request({action:2});return nativeMusic.snapshot();})()');await delay(180);const still=await evaluate('nativeMusic.snapshot()');if(still.offsetSeconds!==paused.offsetSeconds||still.outputPeak>0.00001)throw Error('Music continued while paused');
  await evaluate('nativeMusic.request({action:3})');await waitFor('nativeMusic.snapshot().status==="playing"&&nativeMusic.snapshot().outputPeak>0.001');trace.push({phase:'music-pause-resume',paused,after:await evaluate('nativeMusic.snapshot()')});
 }
 const selected=await evaluate('nativeCharacterMenu.read()');
 if(selected.players[0].character!==20||selected.players[1].character!==2||selected.players[1].kind!==1||selected.players[1].cpuLevel!==9)throw Error('Falco / CPU9 Fox defaults '+JSON.stringify(selected));
 if(process.argv.includes('--static-only')&&!(await evaluate('nativeRoom.offline&&nativeRoom.code===""')))throw Error('Static-only CPU fallback not active');
 async function cpuPresentation(){
  await waitFor('nativeCharacterMenu.read().players[1].hand===3&&document.querySelector("#peerKeyboard").hidden');
  const proof=await evaluate(`(()=>{nativeCharacterMenu.draw();const canvas=document.querySelector('#picture'),gl=canvas.getContext('webgl2'),r=nativeMenuApertures[2],pixel=new Uint8Array(4),alpha=[];for(const u of [.2,.5,.8])for(const v of [.2,.5,.8]){gl.readPixels(Math.floor((r.left+r.width*u)*canvas.width),Math.floor((1-r.top-r.height*v)*canvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);alpha.push(pixel[3]);}return {state:nativeCharacterMenu.read(),peerDisplay:getComputedStyle(document.querySelector('#peerKeyboard')).display,keyboardVisible:!document.querySelector('#keyboardButton').hidden,alpha};})()`);
  if(proof.peerDisplay!=='none'||!proof.keyboardVisible||proof.alpha.some(a=>a!==255))throw Error('CPU hand/icon or card transparency regression '+JSON.stringify(proof));
  trace.push({phase:'cpu-presentation',...proof});
 }
 await cpuPresentation();
 if(!process.argv.includes('--static-only')){
  async function toggleCPU(){const point=await evaluate(`(()=>{const r=document.querySelector('#cpuRoom').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await cmd('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point});}
  for(let i=0;i<2;i++){
   await toggleCPU();await waitFor('!nativeRoom.cpu&&nativeCharacterMenu.read().players[1].kind===0&&nativeCharacterMenu.read().players[1].hand!==3&&!document.querySelector("#peerKeyboard").hidden');
   const human=await evaluate('nativeCharacterMenu.read()');if(human.players[1].x<10||human.players[1].x>26)throw Error('Human hand did not return to P2 card');
   await waitFor(`nativeCharacterMenu.read().frames>${human.frames+35}`);
   if(i===0){const shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'human-opponent.png'),Buffer.from(shot.data,'base64'));}
   await toggleCPU();await cpuPresentation();
   const restored=await evaluate('nativeCharacterMenu.read()');if(restored.players.slice(0,2).some((p,j)=>p.character!==selected.players[j].character||p.costume!==selected.players[j].costume))throw Error('CPU switch changed character/costume');
  }
 }
 trace.push({phase:'selected',state:selected});
 const css=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'characters.png'),Buffer.from(css.data,'base64'));
 // P1 still owns CPU character selection through the original token hit test.
 const cpuIcons=await evaluate('[2,18].map(character=>nativeCharacterMenu.icons().find(i=>i.character===character))');
 let pickup=[cpuIcons[0].x-3.8,cpuIcons[0].y+2.6];
 for(const target of [cpuIcons[1],cpuIcons[0]]){
  await steer('(()=>{const p=nativeCharacterMenu.read().players[0];return [p.x,p.y];})()',pickup,.3);await press('KeyP');await waitFor('nativeCharacterMenu.read().players[1].token===1');
  await steer('(()=>{const p=nativeCharacterMenu.read().players[0];return [p.x,p.y];})()',[target.x,target.y],.3);const drop=await evaluate('nativeCharacterMenu.read().players[0]');await press('KeyP');
  await waitFor(`nativeCharacterMenu.read().players[1].token===0&&nativeCharacterMenu.read().players[1].character===${target.character}`);pickup=[drop.x-1.1,drop.y+.6];
 }
 trace.push({phase:'p1-selected-cpu-character-and-restored-fox',state:await evaluate('nativeCharacterMenu.read()')});await cpuPresentation();
 await steer('(()=>{const p=nativeCharacterMenu.read().players[0];return [p.x,p.y];})()',[-23.5,-21.5],.4);await press('KeyP');await waitFor('document.querySelector("#controls").open');
 const controls=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'keyboard.png'),Buffer.from(controls.data,'base64'));
 await delay(100);const position=await evaluate('nativeCharacterMenu.read().players[0].x');await keys(['KeyD']);await delay(300);await keys([]);if(await evaluate('nativeCharacterMenu.read().players[0].x')!==position)throw Error('Keyboard view leaked gameplay input');
 const toggle=await evaluate('(()=>{const r=document.querySelector("#tapJump").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');await cmd('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...toggle});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...toggle});if(await evaluate('characterModule._portTapJumpGet(0)')!==0)throw Error('Tap jump toggle did not reach native control');if(tapOn){await cmd('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...toggle});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...toggle});}
 await press('KeyO');await waitFor('!document.querySelector("#controls").open');
 const readyPoint=await evaluate(`(()=>{const b=document.querySelector('#readyRoom').getBoundingClientRect(),r=document.querySelector('#picture').getBoundingClientRect(),x=(b.x+b.width/2-r.x)/r.width,y=(b.y+b.height/2-r.y)/r.height,o=nativeMenuHandPoint(0,0),a=nativeMenuHandPoint(1,0),b1=nativeMenuHandPoint(0,1),dx=x-o[0],dy=y-o[1],ax=a[0]-o[0],ay=a[1]-o[1],bx=b1[0]-o[0],by=b1[1]-o[1],d=ax*by-ay*bx;return [(dx*by-dy*bx)/d,(ax*dy-ay*dx)/d];})()`);
 await steer('(()=>{const p=nativeCharacterMenu.read().players[0];return [p.x,p.y];})()',readyPoint,.3);const foreground=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'hand-foreground.png'),Buffer.from(foreground.data,'base64'));await press('KeyP');
 await waitFor('nativeMenuLive.snapshot().scene==="stages"');await waitFor('nativeStageMenu.read().frames>120');
 const legal=await evaluate('nativeStageMenu.icons().filter(i=>i.unlocked===2).map(i=>i.stage).sort((a,b)=>a-b)');if(JSON.stringify(legal)!=='[2,3,8,28,31,32]')throw Error('Tournament-only stages '+JSON.stringify(legal));
 const stageShot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'stages.png'),Buffer.from(stageShot.data,'base64'));
 const target=await evaluate(`nativeStageMenu.icons().find(i=>i.stage===${stageId}&&i.unlocked===2)`);await steer('nativeStageMenu.read().cursor',[target.x,target.y],.6);await press('KeyP');
 await waitFor('globalThis.nativeLive?.snapshot().match?.intro?.mask&8');
 const ready=await evaluate('nativeLive.snapshot()');
 if((holdA&&ready.initial[0][11]!==7)||(releaseA&&ready.initial[0][11]!==19))throw Error('Held/released-A native form mismatch '+JSON.stringify(ready.initial));await keys([]);if(ready.match.intro.blocked.some(b=>b!==1)||ready.match.clock[0]!==0)throw Error('Ready gate');
 await waitFor('nativeLive.snapshot().frames>15');
 let shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'ready.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`(()=>{globalThis.cpuInputEvidence={samples:0,active:0,buttons:0,actions:[],lastFrame:-1};function record(){const e=cpuInputEvidence,s=nativeLive.snapshot();if(s.frames!==e.lastFrame){e.lastFrame=s.frames;const p=characterModule._Player_GetEntity(1),v=i=>characterModule._portFighterConstructRead(p,i);e.samples++;if(v(26)||v(27))e.active++;if(v(25))e.buttons++;if(!e.actions.includes(v(0)))e.actions.push(v(0));}if(s.frames<900)requestAnimationFrame(record);}requestAnimationFrame(record);})()`);
 await waitFor('nativeLive.snapshot().match.intro.gate===1');
 if(checkMusic){
  await waitFor('nativeMusic.snapshot().status==="playing"&&nativeMusic.snapshot().track!=="menu01.hps"&&nativeMusic.snapshot().outputPeak>0.001');const audio=await evaluate('nativeMusic.snapshot()');if(!({2:['izumi.hps'],3:['pstadium.hps','pokesta.hps'],8:['ystory.hps'],28:['old_kb.hps'],31:['sp_zako.hps'],32:['sp_end.hps']})[stageId].includes(audio.track))throw Error('Wrong native stage music '+audio.track);trace.push({phase:'match-music',audio});
 }
 await waitFor('nativeLive.snapshot().final[0][0]===14');
 if(process.argv.includes('--music-startup')){const music=await evaluate('nativeMusic.snapshot()'),match=await evaluate('nativeLive.snapshot().match');fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,scope:'Native menu-to-stage music startup and browser stream transport only',stage:stageId,trace,music,match},null,2));console.log(JSON.stringify({passed:true,stage:stageId,track:music.track,scope:'music startup'}));break testFlow;}
 if(resultsMode){
  const startSelection=await evaluate('nativeCharacterMenu.matchSelection()');
  await keys(['KeyD']);await waitFor('globalThis.nativeMenuMatchReport?.results',90000);await keys([]);
  const ended=await evaluate('({results:nativeMenuMatchReport.results,scene:nativeMenuLive.snapshot().scene,selection:nativeMenuMatchReport.selection})');if(ended.scene!=='results'||ended.results.outcome!==2)throw Error('CPU elimination did not reach results');
  await waitFor('globalThis.nativeResultsUI?.nativeScene?.snapshot().draws>=120&&document.querySelector("#nativeResults")?.dataset.ready==="true"');const nativeResult=await evaluate('nativeResultsUI.nativeScene.snapshot()');if(nativeResult.width!==960||nativeResult.height!==720||nativeResult.simulationFps<59||nativeResult.presentationFps<59)throw Error('Native result scene missed 720p60 '+JSON.stringify(nativeResult));
  const shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output+'/results.png',Buffer.from(shot.data,'base64'));
  await press('Enter');await waitFor('globalThis.nativeLive?.snapshot().match?.intro?.gate===1&&!globalThis.nativeMenuMatchReport',90000);
  await waitFor('nativeMusic.snapshot().status==="playing"&&nativeMusic.snapshot().outputPeak>0.001');
  const rematch=await evaluate('({selection:nativeCharacterMenu.matchSelection(),stocks:[0,1].map(p=>characterModule._portTournamentRead(10,p)),audio:nativeMusic.snapshot(),tap:characterModule._portTapJumpGet(0)})');
  if(JSON.stringify(startSelection)!==JSON.stringify(rematch.selection)||rematch.stocks.some(s=>s!==4)||rematch.tap!==0)throw Error('CPU rematch did not retain rules, selection, or tap jump');
  await keys(['KeyD']);await waitFor('globalThis.nativeMenuMatchReport?.results',90000);await keys([]);await waitFor('globalThis.nativeResultsUI?.nativeScene?.snapshot().draws>60&&document.querySelector("#nativeResults")?.dataset.ready==="true"');await press('KeyO');
  await waitFor('globalThis.nativeCharacterMenu?.read().frames>90&&nativeMenuLive.snapshot().scene==="characters"&&!globalThis.nativeMenuMatchReport',90000);
  const returned=await evaluate('({menu:nativeCharacterMenu.read(),cpu:nativeRoom.cpu,keyboardHidden:document.querySelector("#peerKeyboard").hidden})');
  if(!returned.cpu||!returned.keyboardHidden||returned.menu.players[0].character!==startSelection.players[0].character||returned.menu.players[1].character!==startSelection.players[1].character)throw Error('CPU return selection/presentation');
  fs.writeFileSync(output+'/report.json',JSON.stringify({passed:true,scope:'CPU elimination to original native result panel at 720p60, keyboard rematch with fresh rules and return to character select',ended,nativeResult,rematch,returned},null,2));console.log(JSON.stringify({passed:true,results:true,solo:true,nativeResult,audio:rematch.audio.status}));break testFlow;
 }
 const tapStart=await evaluate('nativeLive.snapshot().frames');await keys(['KeyW']);await waitFor(`nativeLive.snapshot().frames>${tapStart+12}`);await keys([]);
 const tapJumped=await evaluate(`nativeLive.snapshot().stateChanges.some(s=>s.frame>${tapStart}&&s.state>=24&&s.state<=29)`);if(tapJumped!==tapOn)throw Error('Stick jump behavior differs from toggle: '+JSON.stringify({tapOn,tapJumped}));await waitFor('nativeLive.snapshot().final[0][0]===14&&nativeLive.snapshot().final[0][3]===0');
 const before=await evaluate('nativeLive.snapshot()');await keys(['KeyD']);await waitFor(`nativeLive.snapshot().final[0][4]>${before.final[0][4]+4}`);await keys([]);
 await waitFor('nativeLive.snapshot().final[0][0]===14&&nativeLive.snapshot().final[0][3]===0');
 await keys(['Space']);await waitFor('nativeLive.snapshot().final[0][3]===1&&nativeLive.snapshot().final[0][0]>=25&&nativeLive.snapshot().final[0][0]<=29');await keys(['KeyP']);await waitFor('nativeLive.snapshot().final[0][0]>=65&&nativeLive.snapshot().final[0][0]<=69');await keys([]);
 shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'match.png'),Buffer.from(shot.data,'base64'));
 await waitFor('globalThis.nativeMenuMatchReport');const report=await evaluate('nativeMenuMatchReport');
 if(!report.live.final.some((s,i)=>Math.abs(s[4]-report.live.initial[i][4])>1)||!report.live.stateChanges.length)throw Error('CPU match did not progress');
 if(!report.constructorCompleted||report.live.frames!==900||!report.menuHandoff?.sameRuntime)throw Error('Incomplete interactive match');
 const flow=await evaluate('nativeMenuLive.snapshot()'),cpuInputEvidence=await evaluate('cpuInputEvidence');if(cpuInputEvidence.active<20||!cpuInputEvidence.buttons||cpuInputEvidence.actions.length<4||!cpuInputEvidence.actions.includes(24)||!cpuInputEvidence.actions.includes(25))throw Error('Original CPU did not produce required activity/jump coverage: '+JSON.stringify(cpuInputEvidence));
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,tapOn,cpuInputEvidence,build:JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/fighter-init-build.json'))),trace,ready,flow,report},null,2));console.log(JSON.stringify({passed:true,flow,frames:report.live.frames}));
}}finally{ws?.close();if(browser){browser.kill();await new Promise(r=>browser.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
