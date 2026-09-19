import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const root=path.resolve(import.meta.dirname,'../..'),clients=[];
const resultsMode=process.argv.includes('--results');
const rollbackMode=process.argv.includes('--rollback'),framesArg=process.argv.find(arg=>arg.startsWith('--frames='));
const combatMode=process.argv.includes('--combat');
const pairArg=process.argv.find(arg=>arg.startsWith('--pair=')),pair=pairArg?.slice('--pair='.length).split(',').map(Number)??null;
const stageArg=process.argv.find(arg=>arg.startsWith('--stage=')),selectedStage=Number(stageArg?.slice('--stage='.length)??31),legalStages=[2,3,8,28,31,32];
const holdAArg=process.argv.find(arg=>arg.startsWith('--hold-a-seat=')),holdASeat=holdAArg===undefined?null:Number(holdAArg.slice('--hold-a-seat='.length));
const clientCpuSetsArg=process.argv.find(arg=>arg.startsWith('--client-cpu-sets=')),clientCpuSets=clientCpuSetsArg?.slice('--client-cpu-sets='.length).split(';')??null;
const relayDelaysArg=process.argv.find(arg=>arg.startsWith('--relay-delays=')),relayDelays=relayDelaysArg?.slice('--relay-delays='.length).split(',').map(Number)??null;
const clientDelaysArg=process.argv.find(arg=>arg.startsWith('--client-delays=')),clientDelays=clientDelaysArg?.slice('--client-delays='.length).split(',').map(Number)??null;
const disconnectSeatArg=process.argv.find(arg=>arg.startsWith('--disconnect-seat=')),disconnectSeat=disconnectSeatArg===undefined?null:Number(disconnectSeatArg.slice('--disconnect-seat='.length));
const disconnectFrameArg=process.argv.find(arg=>arg.startsWith('--disconnect-frame=')),disconnectFrame=Number(disconnectFrameArg?.slice('--disconnect-frame='.length)??600);
if(pair&&(pair.length!==2||pair.some(n=>!Number.isInteger(n)||n<0||n>=25)))throw Error('--pair requires two roster tile indices from 0 through 24');
if(!legalStages.includes(selectedStage))throw Error('--stage must be a tournament stage id: '+legalStages.join(','));
if(holdASeat!==null&&(![0,1].includes(holdASeat)||!pair||pair[holdASeat]!==15))throw Error('--hold-a-seat requires the Zelda roster tile (15) in that seat');
if(clientCpuSets&&(clientCpuSets.length!==2||clientCpuSets.some(set=>!set||!/^[0-9,-]+$/.test(set))))throw Error('--client-cpu-sets requires two taskset CPU lists separated by a semicolon');
if(relayDelays&&(!relayDelays.length||relayDelays.some(ms=>!Number.isSafeInteger(ms)||ms<0||ms>1000)))throw Error('--relay-delays requires comma-separated integer milliseconds from 0 through 1000');
if(clientDelays&&(!clientDelays.length||clientDelays.some(ms=>!Number.isSafeInteger(ms)||ms<0||ms>1000)))throw Error('--client-delays requires comma-separated integer milliseconds from 0 through 1000');
if(disconnectSeat!==null&&(![0,1].includes(disconnectSeat)||!rollbackMode))throw Error('--disconnect-seat requires rollback mode and seat 0 or 1');
const captureSeatArg=process.argv.find(arg=>arg.startsWith('--capture-seat=')),captureSeat=captureSeatArg===undefined?null:Number(captureSeatArg.slice('--capture-seat='.length));
if(captureSeat!==null&&![0,1].includes(captureSeat))throw Error('--capture-seat must be 0 or 1');
const captureSeats=new Set(captureSeat===null?(process.argv.includes('--capture')?[0,1]:[]):[captureSeat]),captureMode=captureSeats.size>0;
const matchFrames=framesArg?Number(framesArg.slice('--frames='.length)):rollbackMode?60:600;
if(!Number.isSafeInteger(matchFrames)||matchFrames<1)throw Error('--frames must be a positive integer');
if(disconnectSeat!==null&&(!Number.isSafeInteger(disconnectFrame)||disconnectFrame<1||disconnectFrame>=matchFrames))throw Error('--disconnect-frame must be within the requested match');
if(captureMode&&!rollbackMode)throw Error('Captured-frame room probe requires rollback mode');
if(resultsMode&&rollbackMode)throw Error('Rollback room probe uses a bounded match');
if((relayDelays||clientDelays)&&!rollbackMode)throw Error('Room delay injection requires rollback mode');
let relayDelayIndex=0,clientDelayIndex=0;const server=createNativePortServer({roomOptions:relayDelays||clientDelays?{
 deliveryDelayMs:relayDelays?(m=>m.key?.startsWith('match:')&&m.frame>=3&&['peer-input','confirmed-frame'].includes(m.type)?relayDelays[relayDelayIndex++%relayDelays.length]:null):null,
 receiveDelayMs:clientDelays?(m=>m.key?.startsWith('match:')&&m.frame>=3&&m.type==='input'?clientDelays[clientDelayIndex++%clientDelays.length]:null):null
}:undefined});
const output=path.join(root,'dist/native-port/experiment-native-rooms'+(resultsMode?'-results':rollbackMode?'-rollback':''));fs.mkdirSync(output,{recursive:true});
async function client(capture=false){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-room-')),chromeArgs=['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],cpuSet=clientCpuSets?.[clients.length],browser=spawn(cpuSet?'taskset':'google-chrome',cpuSet?['-c',cpuSet,'google-chrome',...chromeArgs]:chromeArgs,{stdio:['ignore','ignore','pipe']});let stderr='';browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
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
 await c.cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html?interactive=1'+(rollbackMode?'':'&lockstep=1')+(resultsMode?'':'&liveframes='+matchFrames+(capture?'&captureframes=1':'')+(combatMode?'&workload=1':''))});await c.wait('globalThis.characterMenuReport?.passed');return c;
}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const a=await client(captureSeats.has(0)),b=await client(captureSeats.has(1));
 await a.wait('nativeCharacterMenu.read().frames>90');const productScope=await a.eval('({cpu:nativeRoom.cpu,cpuControlHidden:document.querySelector("#cpuRoom").hidden})');if(productScope.cpu||!productScope.cpuControlHidden)throw Error('Tournament room exposed CPU mode');const code=await a.eval('nativeRoom.code');
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
 if(pair){
  for(const [seat,c] of [a,b].entries()){
   const target=await c.eval('nativeCharacterMenu.icons().find(i=>i.i==='+pair[seat]+')'),current=await c.eval('nativeCharacterMenu.read().players['+seat+']'),pickup=await c.eval('(()=>{const p=nativeCharacterMenu.read().players['+seat+'];return nativeCharacterMenu.icons().find(i=>i.character===p.character);})()');if(!target||target.state===0||!pickup)throw Error('Unavailable roster tile '+pair[seat]);if(target.character===current.character)continue;
   async function steer(point){for(let i=0;i<220;i++){
    const p=await c.eval('nativeCharacterMenu.read().players['+seat+']'),dx=point.x-p.x,dy=point.y-p.y;
    if(Math.abs(dx)<(point.i===undefined?.7:.2)&&Math.abs(dy)<(point.i===undefined?.7:.2)||point.i!==undefined&&i>100&&p.icon===point.i){await c.keys([]);return;}
    const keys=[];if(Math.abs(dx)>=.7)keys.push(dx>0?'KeyD':'KeyA');if(Math.abs(dy)>=.7)keys.push(dy>0?'KeyW':'KeyS');if(Math.max(Math.abs(dx),Math.abs(dy))<3)keys.push('ShiftLeft');await c.keys(keys);await delay(16);
   }throw Error('Could not steer player '+seat+' to roster tile '+pair[seat]);}
   await steer({x:pickup.x-3.8,y:pickup.y+2.6});await c.press('KeyP');await c.wait('nativeCharacterMenu.read().players['+seat+'].token==='+String(seat+1));
   await steer(target);await c.press('KeyP');await c.wait('nativeCharacterMenu.read().players['+seat+'].token===0&&nativeCharacterMenu.read().players['+seat+'].character==='+target.character);
  }
  const selections=await Promise.all([a,b].map(c=>c.eval('nativeCharacterMenu.read().players.slice(0,2).map(p=>({character:p.character,costume:p.costume,selected:p.selected}))')));
  if(JSON.stringify(selections[0])!==JSON.stringify(selections[1]))throw Error('Native character selections diverged '+JSON.stringify(selections));
 }
 if(resultsMode){await a.press('Space');await b.press('Space');await delay(150);}
 const selectedCostumes=await a.eval('nativeCharacterMenu.read().players.slice(0,2).map(p=>p.costume)');if(resultsMode&&selectedCostumes.some(c=>c===0))throw Error('Costume input was not exercised');
 await a.click('#readyRoom');await a.wait('nativeRoom.state.ready[0]');if(await a.eval('nativeMenuLive.snapshot().scene')!=='characters')throw Error('One Ready started match');await b.click('#readyRoom');
 await a.wait('nativeMenuLive.snapshot().scene==="stages"&&nativeStageMenu.read().frames>120');await b.wait('nativeMenuLive.snapshot().scene==="stages"&&nativeStageMenu.read().frames>120');
 const target=await a.eval('nativeStageMenu.icons().find(i=>i.stage==='+selectedStage+'&&i.unlocked===2)');
 for(let i=0;i<100;i++){const cursor=await a.eval('nativeStageMenu.read()');if(cursor.hover===target.i){await a.keys([]);break;}const [x,y]=cursor.cursor,dx=target.x-x,dy=target.y-y;const keys=[Math.abs(dx)>.7?(dx>0?'KeyD':'KeyA'):(dy>0?'KeyW':'KeyS')];if(Math.max(Math.abs(dx),Math.abs(dy))<6)keys.push('ShiftLeft');await a.keys(keys);await delay(25);await a.keys([]);await delay(100);if(i===99)throw Error('Could not steer stage cursor to '+JSON.stringify(target));}
 await delay(100);
 if(holdASeat!==null){await [a,b][holdASeat].keys(['KeyP']);if(holdASeat===1)await a.press('KeyP');}
 else await a.press('KeyP');
 const matchReady=rollbackMode?'globalThis.nativeLive?.snapshot().frames>=1||globalThis.nativeMenuMatchReport':'globalThis.nativeLive?.snapshot().match?.intro?.gate===1';await a.wait(matchReady,120000);await b.wait(matchReady,120000);if(holdASeat!==null)await [a,b][holdASeat].keys([]);
 let disconnectRecovery=null;if(disconnectSeat!==null){await a.wait('globalThis.nativeLive?.snapshot().frames>='+disconnectFrame,120000);const before=await Promise.all([a,b].map(c=>c.eval('nativeRoom.snapshot()'))),startedAt=performance.now();if(!server.nativeRoomRelay?.testDisconnectSeat(code,disconnectSeat))throw Error('Could not terminate requested room socket');await Promise.all([a,b].map(c=>c.wait('!nativeRoom.connected')));const paused=await Promise.all([a,b].map(c=>c.eval('nativeRoom.snapshot()')));await Promise.all([a,b].map(c=>c.wait('nativeRoom.connected',30000)));const resumed=await Promise.all([a,b].map(c=>c.eval('nativeRoom.snapshot()')));if(resumed.some((r,i)=>r.epoch!==before[i].epoch||r.phase!==before[i].phase||r.confirmedFrame<before[i].confirmedFrame))throw Error('Reconnect changed the live match '+JSON.stringify({before,paused,resumed}));disconnectRecovery={seat:disconnectSeat,requestedFrame:disconnectFrame,elapsedMs:performance.now()-startedAt,before,paused,resumed};}
 if(resultsMode){
  const lifecycle=[];
  async function ended(outcome){
   await Promise.all([a,b].map(c=>c.wait('globalThis.nativeMenuMatchReport?.results&&nativeRoom.state.phase==="results"',90000)));
   await Promise.all([a,b].map(c=>c.wait('nativeMusic.snapshot().track==="ff_fox.hps"&&nativeMusic.snapshot().status==="playing"&&nativeMusic.snapshot().outputPeak>0.001')));
   await Promise.all([a,b].map(c=>c.wait('document.querySelector("#nativeResults")?.dataset.ready==="true"')));
   const reports=await Promise.all([a,b].map(c=>c.eval('({results:nativeMenuMatchReport.results,selection:nativeMenuMatchReport.selection,room:nativeRoom.snapshot(),scene:nativeMenuLive.snapshot().scene})')));
   if(reports.some(r=>r.results.outcome!==outcome||r.scene!=='results'))throw Error('Wrong result outcome '+JSON.stringify(reports));
   if(JSON.stringify(reports[0].results)!==JSON.stringify(reports[1].results))throw Error('Result divergence');
   if(reports.some(r=>!r.room.pendingEnding?.sent||r.room.pendingEnding.frame>r.room.confirmedFrame))throw Error('Unconfirmed result escaped '+JSON.stringify(reports));
   const presentation=await Promise.all([a,b].map(c=>c.eval('(()=>{const d=document.querySelector("#nativeResults"),r=d.getBoundingClientRect(),audio=nativeMusic.snapshot();return {ready:d.dataset.ready,players:d.querySelectorAll(".results-player").length,temporary:d.textContent.includes("Temporary"),ratio:r.width/r.height,audio:{track:audio.track,status:audio.status,outputPeak:audio.outputPeak}};})()')));if(presentation.some(p=>p.ready!=="true"||p.players!==2||p.temporary||Math.abs(p.ratio-4/3)>.01||p.audio.track!=="ff_fox.hps"||p.audio.status!=="playing"||p.audio.outputPeak<=.001))throw Error('Invalid tournament results presentation '+JSON.stringify(presentation));
   for(const [i,c] of [a,b].entries()){const shot=await c.cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output+'/result-'+outcome+'-'+i+'.png',Buffer.from(shot.data,'base64'));}
   lifecycle.push(...reports.map((report,i)=>({...report,presentation:presentation[i]})));return reports;
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
 const final=await Promise.all([a,b].map(c=>c.eval('({room:nativeRoom.snapshot(),report:nativeMenuMatchReport})'))),transport=server.nativeRoomRelay?.deliverySnapshot()??null,receiveTransport=server.nativeRoomRelay?.receiveSnapshot()??null;
 fs.writeFileSync(output+'/raw-report.json',JSON.stringify({requested:{pair,stage:selectedStage,holdASeat,clientCpuSets,relayDelays,clientDelays,disconnectSeat,disconnectFrame},initial,disconnectRecovery,final,transport,receiveTransport},null,2));
 if(final.some(v=>v.report.live.frames!==matchFrames))throw Error('Incomplete match');
 if(final.some(v=>v.report.selection.stage!==selectedStage||pair&&v.report.selection.players.slice(0,2).some((p,i)=>p.character!==final[0].report.selection.players[i].character)))throw Error('Requested tournament selection was not retained '+JSON.stringify(final.map(v=>v.report.selection)));
 if(holdASeat!==null&&final.some(v=>v.report.live.initial[holdASeat][11]!==7))throw Error('Held-A Zelda did not start as Sheik '+JSON.stringify(final.map(v=>v.report.live.initial[holdASeat])));
 if(rollbackMode&&final.some(v=>!v.report.rollback?.enabled||!v.report.rollback.productionDefault||v.report.rollback.metrics?.session?.forwardFrames!==matchFrames||v.report.rollback.metrics?.session?.confirmed!==matchFrames-1))throw Error('Default rollback product path was not confirmed '+JSON.stringify(final.map(v=>v.report.rollback)));
 if(relayDelays&&(!transport||transport.scheduled<matchFrames||transport.delivered!==transport.scheduled||transport.configuredDelayMinMs!==Math.min(...relayDelays)||transport.configuredDelayMaxMs!==Math.max(...relayDelays)))throw Error('Relay delay injection was not exercised '+JSON.stringify(transport));
 if(clientDelays&&(!receiveTransport||receiveTransport.scheduled<matchFrames||receiveTransport.delivered!==receiveTransport.scheduled||receiveTransport.configuredDelayMinMs!==Math.min(...clientDelays)||receiveTransport.configuredDelayMaxMs!==Math.max(...clientDelays)))throw Error('Client delay injection was not exercised '+JSON.stringify(receiveTransport));
 if(combatMode&&final.some(v=>v.report.live.inputSource!=='scripted normalized controller samples'||!v.report.live.workload.framesWithAttack||!v.report.live.workload.framesWithHitlag||!v.report.live.workload.framesWithDamage||v.report.live.workload.windows.some(w=>w.frames===600&&(!w.attack||!w.hitlag))))throw Error('Combat workload did not sustain attack and contact '+JSON.stringify(final.map(v=>v.report.live.workload)));
 const captureSummaries=final.map(v=>{const live=v.report.live,o=live.observation,recoveryMs=disconnectRecovery?.elapsedMs??0,activeElapsedMs=live.elapsedMs-recoveryMs,activeCaptureElapsedMs=o?o.cadence.meanMs*o.cadence.samples-recoveryMs:null;return {frames:live.frames,draws:live.draws,simulationFps:live.frames*1000/live.elapsedMs,activeSimulationFps:live.frames*1000/activeElapsedMs,recoveryExcludedMs:recoveryMs,drawSubmissionCpu:live.drawSubmissionCpu,observation:o&&{enabled:o.enabled,mode:o.mode,sampleRegion:o.sampleRegion,requested:o.requested,captured:o.captured,estimatedUnobservedRequests:o.estimatedUnobservedRequests,distinctSampledImages:o.distinctSampledImages,repeatedSampledImages:o.repeatedSampledImages,blackFrames:o.blackFrames,wrongSize:o.wrongSize,cadence:o.cadence,activeCadenceFps:o.cadence.samples*1000/activeCaptureElapsedMs,observerWorkerCpu:o.observerWorkerCpu,error:o.error}};});
 const sustainedCapture=matchFrames>=1800;
 if(captureMode&&captureSummaries.some(v=>v.draws!==matchFrames||(sustainedCapture&&((disconnectRecovery?v.activeSimulationFps:v.simulationFps)<59.5||v.drawSubmissionCpu.p95Ms>20||v.drawSubmissionCpu.maxMs>50))))throw Error('720p60 simulation/submission gate failed '+JSON.stringify(captureSummaries));
 if([...captureSeats].some(seat=>{const o=captureSummaries[seat].observation;return !o?.enabled||o.mode!=='direct-canvas-video-frame'||o.sampleRegion!=='full-frame-downsample'||o.error||o.requested!==matchFrames||o.captured!==matchFrames||o.estimatedUnobservedRequests!==0||o.distinctSampledImages!==o.captured||o.repeatedSampledImages!==0||o.blackFrames!==0||o.wrongSize!==0||(sustainedCapture&&(disconnectRecovery?o.activeCadenceFps:o.cadence.fps)<59.5);}))throw Error('Captured-frame product gate failed '+JSON.stringify(captureSummaries));
 if(JSON.stringify(final[0].report.live.final)!==JSON.stringify(final[1].report.live.final))throw Error('Native fighter state diverged: '+JSON.stringify(final.map(v=>v.report.live.final)));
 const scope=captureMode?'Two localhost browser processes using authenticated local prediction, complete-state correction and independent WASM presentation; canvas-capture observation on seat(s) '+[...captureSeats].join(',')+(combatMode?' under scripted combat.':'.')+(relayDelays?' Ordered relay-to-client input/confirmation delay was injected.':'')+(clientDelays?' Ordered client-to-relay input delay was injected.':'')+(disconnectRecovery?' One authenticated room socket was forcibly terminated and recovered in place; raw wall cadence includes the pause, while active cadence subtracts exactly the measured recovery interval.':'')+(relayDelays||clientDelays?' This is not full WAN emulation.':'')+' Not physical presentation, WAN, input-to-photon, roster or tournament certification.':rollbackMode?'Two localhost browser processes using authenticated local prediction, complete-state correction and independent WASM presentation; bounded correctness probe, not 720p60 or WAN certification.':'Two localhost browser processes, three-frame input lockstep; not WAN latency or rollback certification.';fs.writeFileSync(output+'/report.json',JSON.stringify({passed:true,productScope,requested:{pair,stage:selectedStage,holdASeat,clientCpuSets,relayDelays,clientDelays,disconnectSeat,disconnectFrame},initial,disconnectRecovery,captureSummaries,final,transport,receiveTransport,scope},null,2));console.log(JSON.stringify({passed:true,code,frames:matchFrames,rollback:rollbackMode,combat:combatMode,productScope,pair,stage:selectedStage,holdASeat,clientCpuSets,relayDelays,clientDelays,disconnectRecovery:disconnectRecovery&&{seat:disconnectRecovery.seat,requestedFrame:disconnectRecovery.requestedFrame,elapsedMs:disconnectRecovery.elapsedMs},captureSeats:[...captureSeats],matchingFighterState:true}));
}
}catch(e){fs.writeFileSync(output+'/failure.json',JSON.stringify({error:e.stack,states:await Promise.all(clients.map(c=>c.eval?.('({room:globalThis.nativeRoom?.snapshot(),menu:globalThis.nativeMenuLive?.snapshot(),error:globalThis.nativeRoomError})').catch(e=>String(e))))},null,2));throw e;
}finally{for(const c of clients){c.ws?.close();c.browser.kill();await new Promise(r=>c.browser.once('exit',r));fs.rmSync(c.profile,{recursive:true,force:true});}await new Promise(r=>server.close(r));}
