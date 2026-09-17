import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'../..'),{createNativePortServer}=await import(root+'/scripts/native-port/serve.mjs'),server=createNativePortServer(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-menu-'));
const holdA=process.argv.includes('--hold-a'),releaseA=process.argv.includes('--release-a-during-load'),pair=holdA||releaseA?[15,12]:[10,10];
const pending=new Map();let browser,ws,id=0,stderr='';
function cmd(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});


 const output=path.join(root,'dist/native-port/experiment-interactive-menu'+(holdA?'-held-a':releaseA?'-released-a':''));fs.mkdirSync(output,{recursive:true});
 async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
 const trace=[];
 async function waitFor(expression,timeout=30000){const start=Date.now();for(;;){const r=await evaluate('({value:('+expression+'),error:globalThis.nativeMenuLiveError??globalThis.nativeMenuMatchReport?.error})');if(r.error)throw Error(r.error);if(r.value)return r.value;if(Date.now()-start>timeout)throw Error('Timed out: '+expression+' state '+JSON.stringify(await evaluate('nativeMenuLiveState')));await delay(16);}}
 const held=new Set();
 async function keys(next){for(const code of held)if(!next.includes(code)){await cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code});held.delete(code);}for(const code of next)if(!held.has(code)){await cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key:code});held.add(code);}}
 async function press(code){await keys([code]);await delay(65);await keys([]);await delay(65);}
 async function seat(p){const r=await evaluate(`(()=>{const r=document.querySelector('#keyboard-p${p+1}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await cmd('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});}
 async function steer(expression,target,tolerance=.7){
  for(let i=0;i<220;i++){
   const [x,y]=await evaluate(expression),dx=target[0]-x,dy=target[1]-y;
   if(Math.abs(dx)<tolerance&&Math.abs(dy)<tolerance){await keys([]);return;}
   const next=[];if(Math.abs(dx)>=tolerance)next.push(dx>0?'ArrowRight':'ArrowLeft');if(Math.abs(dy)>=tolerance)next.push(dy>0?'ArrowUp':'ArrowDown');
   if(Math.max(Math.abs(dx),Math.abs(dy))<3)next.push('AltLeft');await keys(next);await delay(16);
  }await keys([]);throw Error('Keyboard cursor did not reach '+JSON.stringify(target)+' at '+JSON.stringify(await evaluate(expression)));
 }
 await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html?interactive=1&liveframes=900'});
 await waitFor('globalThis.characterMenuReport?.passed');await waitFor('nativeCharacterMenu.read().frames>90');
 trace.push({phase:'initial',state:await evaluate('nativeCharacterMenu.read()')});
 if(!holdA&&!releaseA){
  await keys(['KeyS']);await waitFor('nativeMenuLive.snapshot().scene==="exited"');await keys([]);
  const r=await evaluate('(()=>{const r=document.querySelector("#menu-controls button:not([data-seat])").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await cmd('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});
  await waitFor('nativeMenuLive.snapshot().scene==="characters"');await waitFor('nativeCharacterMenu.read().frames>90');
  trace.push({phase:'entry-restarted',state:await evaluate('nativeCharacterMenu.read()')});
 }
 // Every selection below enters through real browser keyboard/mouse events.
 // No manual simulation stepping, injected pad samples or game-state writes.
 for(const p of [0,1]){
  await seat(p);const target=await evaluate('nativeCharacterMenu.icons().find(i=>i.i==='+pair[p]+')');
  await steer(`(()=>{const p=nativeCharacterMenu.read().players[${p}];return [p.x,p.y];})()`,[target.x,target.y]);
  await press('KeyZ');await waitFor(`nativeCharacterMenu.read().players[${p}].selected===1`);
 }
 await seat(0);await press('KeyX');const selected=await evaluate('nativeCharacterMenu.read()');
 if(pair[0]===pair[1]&&selected.players[0].costume===selected.players[1].costume)throw Error('Mirror costume collision');
 trace.push({phase:'selected',state:selected});const cssShot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'characters.png'),Buffer.from(cssShot.data,'base64'));await press('Enter');
 await waitFor('nativeMenuLive.snapshot().scene==="stages"');await waitFor('nativeStageMenu.read().frames>120');
 await press('KeyS');await waitFor('nativeMenuLive.snapshot().scene==="characters"');await waitFor('nativeCharacterMenu.read().frames>90');
 const resumed=await evaluate('nativeCharacterMenu.read()');
 for(let p=0;p<2;p++)if(resumed.players[p].character!==selected.players[p].character||resumed.players[p].costume!==selected.players[p].costume)throw Error('Selections lost on cancel');
 trace.push({phase:'resumed',state:resumed});await press('Enter');await waitFor('nativeMenuLive.snapshot().scene==="stages"');await waitFor('nativeStageMenu.read().frames>120');
 const target=await evaluate('nativeStageMenu.icons().find(i=>i.stage===31&&i.unlocked===2)');await steer('nativeStageMenu.read().cursor',[target.x,target.y],.6);
 const stage=await evaluate('nativeStageMenu.read()');if(stage.hover!==target.i)throw Error('Native stage hit test '+JSON.stringify({target,stage}));
 trace.push({phase:'stage',state:stage});
 if(holdA||releaseA){await keys(['KeyZ']);await waitFor('nativeMenuLive.snapshot().scene==="loading-match"');trace.push({phase:'loading-input',samples:await evaluate('nativeMenuInput.samples()')});if(releaseA)await keys([]);}else await press('KeyZ');
 await waitFor('globalThis.nativeLive?.snapshot().match?.intro?.mask&8');
 const ready=await evaluate('nativeLive.snapshot()');
 if((holdA&&ready.initial[0][11]!==7)||(releaseA&&ready.initial[0][11]!==19))throw Error('Held/released-A native form mismatch '+JSON.stringify(ready.initial));await keys([]);if(ready.match.intro.blocked.some(b=>b!==1)||ready.match.clock[0]!==0)throw Error('Ready gate');
 await waitFor('nativeLive.snapshot().frames>15');
 let shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'ready.png'),Buffer.from(shot.data,'base64'));
 await waitFor('nativeLive.snapshot().match.intro.gate===1');
 const before=await evaluate('nativeLive.snapshot()');await keys(['ArrowRight']);await waitFor(`nativeLive.snapshot().final[0][4]>${before.final[0][4]+4}`);await keys([]);
 await waitFor('nativeLive.snapshot().final[0][0]===14&&nativeLive.snapshot().final[0][3]===0');
 await keys(['KeyX']);await waitFor('nativeLive.snapshot().final[0][3]===1&&nativeLive.snapshot().final[0][0]>=25&&nativeLive.snapshot().final[0][0]<=29');await keys(['KeyZ']);await waitFor('nativeLive.snapshot().final[0][0]>=65&&nativeLive.snapshot().final[0][0]<=69');await keys([]);
 shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'match.png'),Buffer.from(shot.data,'base64'));
 await seat(1);const second=await evaluate('nativeLive.snapshot().final[1][4]');await keys(['ArrowRight']);await waitFor('nativeLive.snapshot().final[1][4]>'+String(second+4));await keys([]);await seat(0);
 await waitFor('globalThis.nativeMenuMatchReport');const report=await evaluate('nativeMenuMatchReport');
 if(!report.constructorCompleted||report.live.frames!==900||!report.menuHandoff?.sameRuntime)throw Error('Incomplete interactive match');
 const flow=await evaluate('nativeMenuLive.snapshot()');
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,build:JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/fighter-init-build.json'))),trace,ready,flow,report},null,2));console.log(JSON.stringify({passed:true,flow,frames:report.live.frames}));
}finally{ws?.close();if(browser){browser.kill();await new Promise(r=>browser.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
