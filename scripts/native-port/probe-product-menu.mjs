import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'../..'),{createNativePortServer}=await import(root+'/scripts/native-port/serve.mjs'),server=createNativePortServer({enableRooms:!process.argv.includes('--static-only')}),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-menu-'));
const tapOn=process.argv.includes('--tap-on'),holdA=process.argv.includes('--hold-a'),releaseA=process.argv.includes('--release-a-during-load'),pair=holdA||releaseA?[15,12]:[10,10];
const pending=new Map();let browser,ws,id=0,stderr='';
function cmd(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});


 const output=path.join(root,'dist/native-port/experiment-product-menu'+(process.argv.includes('--static-only')?'-static-only':tapOn?'-tap-on':holdA?'-held-a':releaseA?'-released-a':''));fs.mkdirSync(output,{recursive:true});
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
   const next=[];if(Math.abs(dx)>=tolerance)next.push(dx>0?'KeyD':'KeyA');if(Math.abs(dy)>=tolerance)next.push(dy>0?'KeyW':'KeyS');
   if(Math.max(Math.abs(dx),Math.abs(dy))<3)next.push('ShiftLeft');await keys(next);await delay(16);
  }await keys([]);throw Error('Keyboard cursor did not reach '+JSON.stringify(target)+' at '+JSON.stringify(await evaluate(expression)));
 }
 await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html?interactive=1&liveframes=900'});
 await waitFor('globalThis.characterMenuReport?.passed');await waitFor('nativeCharacterMenu.read().frames>90');
 await keys(['KeyO']);await delay(800);await keys([]);if(await evaluate('nativeMenuLive.snapshot().scene')!=='characters')throw Error('Product CSS exposed another game mode');
 trace.push({phase:'initial',state:await evaluate('nativeCharacterMenu.read()')});
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
 const target=await evaluate('nativeStageMenu.icons().find(i=>i.stage===31&&i.unlocked===2)');await steer('nativeStageMenu.read().cursor',[target.x,target.y],.6);await press('KeyP');
 await waitFor('globalThis.nativeLive?.snapshot().match?.intro?.mask&8');
 const ready=await evaluate('nativeLive.snapshot()');
 if((holdA&&ready.initial[0][11]!==7)||(releaseA&&ready.initial[0][11]!==19))throw Error('Held/released-A native form mismatch '+JSON.stringify(ready.initial));await keys([]);if(ready.match.intro.blocked.some(b=>b!==1)||ready.match.clock[0]!==0)throw Error('Ready gate');
 await waitFor('nativeLive.snapshot().frames>15');
 let shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'ready.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`(()=>{globalThis.cpuInputEvidence={samples:0,active:0,buttons:0,actions:[],lastFrame:-1};function record(){const e=cpuInputEvidence,s=nativeLive.snapshot();if(s.frames!==e.lastFrame){e.lastFrame=s.frames;const p=characterModule._Player_GetEntity(1),v=i=>characterModule._portFighterConstructRead(p,i);e.samples++;if(v(26)||v(27))e.active++;if(v(25))e.buttons++;if(!e.actions.includes(v(0)))e.actions.push(v(0));}if(s.frames<900)requestAnimationFrame(record);}requestAnimationFrame(record);})()`);
 await waitFor('nativeLive.snapshot().match.intro.gate===1');
 await waitFor('nativeLive.snapshot().final[0][0]===14');
 const tapStart=await evaluate('nativeLive.snapshot().frames');await keys(['KeyW']);await waitFor(`nativeLive.snapshot().frames>${tapStart+12}`);await keys([]);
 const tapJumped=await evaluate(`nativeLive.snapshot().stateChanges.some(s=>s.frame>${tapStart}&&s.state>=24&&s.state<=29)`);if(tapJumped!==tapOn)throw Error('Stick jump behavior differs from toggle: '+JSON.stringify({tapOn,tapJumped}));await waitFor('nativeLive.snapshot().final[0][0]===14&&nativeLive.snapshot().final[0][3]===0');
 const before=await evaluate('nativeLive.snapshot()');await keys(['KeyD']);await waitFor(`nativeLive.snapshot().final[0][4]>${before.final[0][4]+4}`);await keys([]);
 await waitFor('nativeLive.snapshot().final[0][0]===14&&nativeLive.snapshot().final[0][3]===0');
 await keys(['Space']);await waitFor('nativeLive.snapshot().final[0][3]===1&&nativeLive.snapshot().final[0][0]>=25&&nativeLive.snapshot().final[0][0]<=29');await keys(['KeyP']);await waitFor('nativeLive.snapshot().final[0][0]>=65&&nativeLive.snapshot().final[0][0]<=69');await keys([]);
 shot=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'match.png'),Buffer.from(shot.data,'base64'));
 await waitFor('globalThis.nativeMenuMatchReport');const report=await evaluate('nativeMenuMatchReport');
 if(!report.live.final.some((s,i)=>Math.abs(s[4]-report.live.initial[i][4])>1)||!report.live.stateChanges.length)throw Error('CPU match did not progress');
 if(!report.constructorCompleted||report.live.frames!==900||!report.menuHandoff?.sameRuntime)throw Error('Incomplete interactive match');
 const flow=await evaluate('nativeMenuLive.snapshot()'),cpuInputEvidence=await evaluate('cpuInputEvidence');if(cpuInputEvidence.active<20||!cpuInputEvidence.buttons||cpuInputEvidence.actions.length<4||!cpuInputEvidence.actions.includes(24)||!cpuInputEvidence.actions.includes(25))throw Error('Original CPU did not produce autonomous controller activity');
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,tapOn,cpuInputEvidence,build:JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/fighter-init-build.json'))),trace,ready,flow,report},null,2));console.log(JSON.stringify({passed:true,flow,frames:report.live.frames}));
}finally{ws?.close();if(browser){browser.kill();await new Promise(r=>browser.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
