import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const root=path.resolve(import.meta.dirname,'../..'),server=createNativePortServer(),clients=[];
const resultsMode=process.argv.includes('--results');
const rollbackMode=process.argv.includes('--rollback'),framesArg=process.argv.find(arg=>arg.startsWith('--frames='));
const captureSeatArg=process.argv.find(arg=>arg.startsWith('--capture-seat=')),captureSeat=captureSeatArg===undefined?null:Number(captureSeatArg.slice('--capture-seat='.length));
if(captureSeat!==null&&![0,1].includes(captureSeat))throw Error('--capture-seat must be 0 or 1');
const captureSeats=new Set(captureSeat===null?(process.argv.includes('--capture')?[0,1]:[]):[captureSeat]),captureMode=captureSeats.size>0;
const matchFrames=framesArg?Number(framesArg.slice('--frames='.length)):rollbackMode?60:600;
if(!Number.isSafeInteger(matchFrames)||matchFrames<1)throw Error('--frames must be a positive integer');
if(captureMode&&!rollbackMode)throw Error('Captured-frame room probe requires rollback mode');
if(resultsMode&&rollbackMode)throw Error('Rollback room probe uses a bounded match');
const output=path.join(root,'dist/native-port/experiment-native-rooms'+(resultsMode?'-results':rollbackMode?'-rollback':''));fs.mkdirSync(output,{recursive:true});
async function client(capture=false){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-room-')),browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});let stderr='';browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 const c={profile,browser};clients.push(c);
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const ws=c.ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 c.cmd=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});
 c.eval=async expression=>{const r=await c.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 c.wait=async(expression,timeout=60000)=>{const start=Date.now();for(;;){let r;try{r=await c.eval('({value:('+expression+'),error:globalThis.nativeMenuLiveError??globalThis.characterMenuReport?.error??globalThis.nativeMenuMatchReport?.error??globalThis.nativeRoomError})');}catch(e){if(!/context|defined|find context|navigated/i.test(e.message))throw e;}if(r?.error)throw Error(r.error);if(r?.value)return r.value;if(Date.now()-start>timeout)throw Error('Timed out '+expression+' '+JSON.stringify(await c.eval('({room:globalThis.nativeRoom?.snapshot(),menu:globalThis.nativeMenuLive?.snapshot()})')));await delay(20);}};
 c.click=async selector=>{const pos=await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.hidden||e.disabled)throw Error('Button unavailable');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await c.cmd('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...pos});};
 const held=new Set();c.keys=async next=>{for(const code of held)if(!next.includes(code)){await c.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code});held.delete(code);}for(const code of next)if(!held.has(code)){await c.cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key:code});held.add(code);}};
 c.press=async code=>{await c.keys([code]);await delay(100);await c.keys([]);await delay(100);};
 await c.cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html?interactive=1'+(resultsMode?'':'&liveframes='+matchFrames+(rollbackMode?'&rollback=1':'')+(capture?'&captureframes=1':''))});await c.wait('globalThis.characterMenuReport?.passed');return c;
}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const a=await client(captureSeats.has(0)),b=await client(captureSeats.has(1));
 await a.wait('nativeCharacterMenu.read().frames>90');await a.click('#cpuRoom');await a.wait('!nativeRoom.cpu');const code=await a.eval('nativeRoom.code');
 await b.click('#joinCode');await b.cmd('Input.insertText',{text:code});await b.click('#joinRoom button');
 await a.wait('nativeRoom.active&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90');await b.wait('nativeRoom.active&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90');
 const beforeRefresh=await a.eval('nativeRoom.snapshot()');await b.cmd('Page.reload');await a.wait(`nativeRoom.snapshot().epoch>${beforeRefresh.epoch}&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90`);await b.wait(`nativeRoom.snapshot().epoch>${beforeRefresh.epoch}&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90`);
 const initial=await Promise.all([a,b].map(c=>c.eval('({room:nativeRoom.snapshot(),menu:nativeCharacterMenu.read(),runtime:{same:nativeSnapshotRuntime?.module===characterModule,globals:nativeSnapshotRuntime?.audit?.globals?.length,wasmSha256:nativeSnapshotRuntime?.audit?.wasmSha256},audio:nativeRollbackAudio?.snapshot()})')));
 if(initial.some(v=>!v.runtime.same||v.runtime.globals!==4||!/^[0-9a-f]{64}$/.test(v.runtime.wasmSha256??'')))throw Error('Interactive runtime is not snapshot-instrumented '+JSON.stringify(initial.map(v=>v.runtime)));
 if(initial.some(v=>!v.audio||v.audio.presented<1||v.audio.pending!==0))throw Error('Unframed menu audio did not present immediately '+JSON.stringify(initial.map(v=>v.audio)));
 if(initial.some(v=>v.room.code!==code))throw Error('Refresh changed room code');
 if(initial[0].room.seat!==0||initial[1].room.seat!==1||initial.some(v=>v.menu.players[1].kind!==0))throw Error('Incorrect human seats');
 if(initial.some(v=>v.menu.players.slice(0,2).some(p=>p.hand===3)))throw Error('Human room hand remained hidden');
 for(const c of [a,b])if(!await c.eval('["#keyboardButton","#peerKeyboard"].every(s=>getComputedStyle(document.querySelector(s)).display!=="none")'))throw Error('Human room keyboard icon remained hidden');
 // Each local keyboard controls its own native hand on both machines.
 const x=initial[0].menu.players[1].x;await b.keys(['KeyA']);await b.wait(`nativeCharacterMenu.read().players[1].x<${x-3}`);await b.keys([]);await delay(100);
 const peerX=await a.eval('nativeCharacterMenu.read().players[1].x'),guestX=await b.eval('nativeCharacterMenu.read().players[1].x');if(Math.abs(peerX-guestX)>.01)throw Error('Remote cursor differs');
 if(resultsMode){await a.press('Space');await b.press('Space');await delay(150);}
 const selectedCostumes=await a.eval('nativeCharacterMenu.read().players.slice(0,2).map(p=>p.costume)');if(resultsMode&&selectedCostumes.some(c=>c===0))throw Error('Costume input was not exercised');
 await a.click('#readyRoom');await a.wait('nativeRoom.state.ready[0]');if(await a.eval('nativeMenuLive.snapshot().scene')!=='characters')throw Error('One Ready started match');await b.click('#readyRoom');
 await a.wait('nativeMenuLive.snapshot().scene==="stages"&&nativeStageMenu.read().frames>120');await b.wait('nativeMenuLive.snapshot().scene==="stages"&&nativeStageMenu.read().frames>120');
 const target=await a.eval('nativeStageMenu.icons().find(i=>i.stage===31&&i.unlocked===2)');
 for(let i=0;i<100;i++){const cursor=await a.eval('nativeStageMenu.read()');if(cursor.hover===target.i){await a.keys([]);break;}const [x,y]=cursor.cursor,dx=target.x-x,dy=target.y-y;const keys=[Math.abs(dx)>.7?(dx>0?'KeyD':'KeyA'):(dy>0?'KeyW':'KeyS')];if(Math.max(Math.abs(dx),Math.abs(dy))<6)keys.push('ShiftLeft');await a.keys(keys);await delay(25);await a.keys([]);await delay(100);if(i===99)throw Error('Could not steer stage cursor to '+JSON.stringify(target));}
 await delay(100);await a.press('KeyP');
 const matchReady=rollbackMode?'globalThis.nativeLive?.snapshot().frames>=1||globalThis.nativeMenuMatchReport':'globalThis.nativeLive?.snapshot().match?.intro?.gate===1';await a.wait(matchReady,120000);await b.wait(matchReady,120000);
 if(resultsMode){
  const lifecycle=[];
  async function ended(outcome){
   await Promise.all([a,b].map(c=>c.wait('globalThis.nativeMenuMatchReport?.results&&nativeRoom.state.phase==="results"',90000)));
   const reports=await Promise.all([a,b].map(c=>c.eval('({results:nativeMenuMatchReport.results,selection:nativeMenuMatchReport.selection,room:nativeRoom.snapshot(),scene:nativeMenuLive.snapshot().scene})')));
   if(reports.some(r=>r.results.outcome!==outcome||r.scene!=='results'))throw Error('Wrong result outcome '+JSON.stringify(reports));
   if(JSON.stringify(reports[0].results)!==JSON.stringify(reports[1].results))throw Error('Result divergence');
   if(reports.some(r=>!r.room.pendingEnding?.sent||r.room.pendingEnding.frame>r.room.confirmedFrame))throw Error('Unconfirmed result escaped '+JSON.stringify(reports));
   for(const [i,c] of [a,b].entries()){const shot=await c.cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output+'/result-'+outcome+'-'+i+'.png',Buffer.from(shot.data,'base64'));}
   lifecycle.push(...reports);return reports;
  }
  await a.keys(['KeyD']);const elimination=await ended(2);await a.keys([]);
  if(elimination[0].results.players[0].stocks!==0||!elimination[0].results.players[1].winner)throw Error('Elimination standings');
  await a.click('#rematchButton');await delay(200);if(await a.eval('nativeMenuLive.snapshot().scene')!=='results')throw Error('One vote restarted room');await b.click('#rematchButton');
  await Promise.all([a,b].map(c=>c.wait('globalThis.nativeLive?.snapshot().match?.intro?.gate===1&&nativeRoom.snapshot().epoch>'+elimination[0].room.epoch,90000)));
  await Promise.all([a,b].map(c=>c.wait('nativeMusic.snapshot().status==="playing"&&nativeMusic.snapshot().outputPeak>0.001')));
  const restarted=await Promise.all([a,b].map(c=>c.eval('({room:nativeRoom.snapshot(),selection:nativeCharacterMenu.matchSelection(),stocks:[0,1].map(p=>characterModule._portTournamentRead(10,p)),audio:nativeMusic.snapshot(),limit:characterModule._portTournamentRead(2,0)})')));
  if(restarted.some(r=>JSON.stringify(r.selection.players.slice(0,2).map(p=>p.costume))!==JSON.stringify(selectedCostumes)||r.selection.stage!==31||r.stocks.some(n=>n!==4)||r.limit!==480||r.room.code!==code))throw Error('Fresh rematch rules/room');
  // Diagnostic acceleration executes every original simulation step. It does
  // not edit the timer/stocks/outcome and is not a presentation or latency test.
  for(const c of [a,b])await c.eval('(()=>{let n=0;while(!characterModule._portTournamentRead(25,0)&&n<30000){for(let p=0;p<2;p++)characterModule._portControllerSample(p,0,0,0,0,0,0,0);characterModule._portTournamentStep();n++;}return n;})()');
  const timeout=await ended(1);if(timeout[0].results.frames!==28800)throw Error('Timeout was not eight native minutes');
  await b.click('#charactersButton');await Promise.all([a,b].map(c=>c.wait('nativeRoom.snapshot().epoch>'+timeout[0].room.epoch+'&&nativeMenuLive.snapshot().scene==="characters"&&nativeCharacterMenu.read().frames>90')));
  const returned=await Promise.all([a,b].map(c=>c.eval('({room:nativeRoom.snapshot(),menu:nativeCharacterMenu.read()})')));
  if(returned.some(r=>r.room.code!==code||r.menu.players[0].character!==20||r.menu.players[1].character!==2)||returned[0].room.seat!==0||returned[1].room.seat!==1)throw Error('CSS restoration');
  await a.click('#readyRoom');await b.click('#readyRoom');await Promise.all([a,b].map(c=>c.wait('nativeMenuLive.snapshot().scene==="stages"&&nativeStageMenu.read().frames>90')));
  const legal=await a.eval('nativeStageMenu.icons().filter(i=>i.unlocked===2).map(i=>i.stage).sort((a,b)=>a-b)');if(JSON.stringify(legal)!=='[2,3,8,28,31,32]')throw Error('Return flow exposed non-tournament stages');
  await a.press('KeyO');await Promise.all([a,b].map(c=>c.wait('nativeMenuLive.snapshot().scene==="characters"&&nativeCharacterMenu.read().frames>90')));
  fs.writeFileSync(output+'/report.json',JSON.stringify({passed:true,initial,lifecycle,restarted,returned,legalStagesAfterReturn:legal,scope:'Elimination in real-time two-browser lockstep; timeout diagnostic executes all original simulation steps with neutral input, bypassing relay/presentation during acceleration; not FPS or latency certification.'},null,2));console.log(JSON.stringify({passed:true,results:true,elimination:elimination[0].results,timeout:timeout[0].results}));
 }else{
 await a.keys(['KeyD','KeyP']);await b.keys(['KeyA','KeyP']);await delay(400);await a.keys([]);await b.keys([]);
 await a.press('Space');await b.press('Space');await a.press('KeyO');await b.press('KeyO');
 for(const [i,c] of [a,b].entries()){const shot=await c.cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output+'/player-'+i+'.png',Buffer.from(shot.data,'base64'));}
 await a.wait('globalThis.nativeMenuMatchReport');await b.wait('globalThis.nativeMenuMatchReport');
 const final=await Promise.all([a,b].map(c=>c.eval('({room:nativeRoom.snapshot(),report:nativeMenuMatchReport})')));
 if(final.some(v=>v.report.live.frames!==matchFrames))throw Error('Incomplete match');
 if(rollbackMode&&final.some(v=>!v.report.rollback?.enabled||v.report.rollback.metrics?.session?.forwardFrames!==matchFrames||v.report.rollback.metrics?.session?.confirmed!==matchFrames-1))throw Error('Rollback product path was not confirmed '+JSON.stringify(final.map(v=>v.report.rollback)));
 const captureSummaries=final.map(v=>{const live=v.report.live,o=live.observation;return {frames:live.frames,draws:live.draws,simulationFps:live.frames*1000/live.elapsedMs,drawSubmissionCpu:live.drawSubmissionCpu,observation:o&&{enabled:o.enabled,requested:o.requested,captured:o.captured,estimatedUnobservedRequests:o.estimatedUnobservedRequests,distinctSampledImages:o.distinctSampledImages,repeatedSampledImages:o.repeatedSampledImages,blackFrames:o.blackFrames,wrongSize:o.wrongSize,cadence:o.cadence,observerWorkerCpu:o.observerWorkerCpu,error:o.error}};});
 const sustainedCapture=matchFrames>=1800;
 if(captureMode&&captureSummaries.some(v=>v.draws!==matchFrames||(sustainedCapture&&(v.simulationFps<59.5||v.drawSubmissionCpu.p95Ms>20||v.drawSubmissionCpu.maxMs>50))))throw Error('720p60 simulation/submission gate failed '+JSON.stringify(captureSummaries));
 if([...captureSeats].some(seat=>{const o=captureSummaries[seat].observation;return !o?.enabled||o.error||o.requested!==matchFrames||o.captured!==matchFrames||o.estimatedUnobservedRequests!==0||o.distinctSampledImages!==o.captured||o.repeatedSampledImages!==0||o.blackFrames!==0||o.wrongSize!==0||(sustainedCapture&&o.cadence.fps<59.5);}))throw Error('Captured-frame product gate failed '+JSON.stringify(captureSummaries));
 if(JSON.stringify(final[0].report.live.final)!==JSON.stringify(final[1].report.live.final))throw Error('Native fighter state diverged: '+JSON.stringify(final.map(v=>v.report.live.final)));
 const scope=captureMode?'Two localhost browser processes using authenticated local prediction, complete-state correction and independent WASM presentation; canvas-capture observation on seat(s) '+[...captureSeats].join(',')+'. Not physical presentation, WAN, input-to-photon, roster or tournament certification.':rollbackMode?'Two localhost browser processes using authenticated local prediction, complete-state correction and independent WASM presentation; bounded correctness probe, not 720p60 or WAN certification.':'Two localhost browser processes, three-frame input lockstep; not WAN latency or rollback certification.';fs.writeFileSync(output+'/report.json',JSON.stringify({passed:true,initial,final,scope},null,2));console.log(JSON.stringify({passed:true,code,frames:matchFrames,rollback:rollbackMode,captureSeats:[...captureSeats],matchingFighterState:true}));
}
}catch(e){fs.writeFileSync(output+'/failure.json',JSON.stringify({error:e.stack,states:await Promise.all(clients.map(c=>c.eval?.('({room:globalThis.nativeRoom?.snapshot(),menu:globalThis.nativeMenuLive?.snapshot(),error:globalThis.nativeRoomError})').catch(e=>String(e))))},null,2));throw e;
}finally{for(const c of clients){c.ws?.close();c.browser.kill();await new Promise(r=>c.browser.once('exit',r));fs.rmSync(c.profile,{recursive:true,force:true});}await new Promise(r=>server.close(r));}
