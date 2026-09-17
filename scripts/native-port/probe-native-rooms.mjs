import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const root=path.resolve(import.meta.dirname,'../..'),server=createNativePortServer(),clients=[];
const output=path.join(root,'dist/native-port/experiment-native-rooms');fs.mkdirSync(output,{recursive:true});
async function client(){
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
 await c.cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html?interactive=1&liveframes=600'});await c.wait('globalThis.characterMenuReport?.passed');return c;
}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const a=await client(),b=await client();
 await a.wait('nativeCharacterMenu.read().frames>90');await a.click('#cpuRoom');await a.wait('!nativeRoom.cpu');const code=await a.eval('nativeRoom.code');
 await b.click('#joinCode');await b.cmd('Input.insertText',{text:code});await b.click('#joinRoom button');
 await a.wait('nativeRoom.active&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90');await b.wait('nativeRoom.active&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90');
 const beforeRefresh=await a.eval('nativeRoom.snapshot()');await b.cmd('Page.reload');await a.wait(`nativeRoom.snapshot().epoch>${beforeRefresh.epoch}&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90`);await b.wait(`nativeRoom.snapshot().epoch>${beforeRefresh.epoch}&&nativeRoom.snapshot().phaseReady&&nativeCharacterMenu.read().frames>90`);
 const initial=await Promise.all([a,b].map(c=>c.eval('({room:nativeRoom.snapshot(),menu:nativeCharacterMenu.read()})')));
 if(initial.some(v=>v.room.code!==code))throw Error('Refresh changed room code');
 if(initial[0].room.seat!==0||initial[1].room.seat!==1||initial.some(v=>v.menu.players[1].kind!==0))throw Error('Incorrect human seats');
 if(initial.some(v=>v.menu.players.slice(0,2).some(p=>p.hand===3)))throw Error('Human room hand remained hidden');
 for(const c of [a,b])if(!await c.eval('["#keyboardButton","#peerKeyboard"].every(s=>getComputedStyle(document.querySelector(s)).display!=="none")'))throw Error('Human room keyboard icon remained hidden');
 // Each local keyboard controls its own native hand on both machines.
 const x=initial[0].menu.players[1].x;await b.keys(['KeyA']);await b.wait(`nativeCharacterMenu.read().players[1].x<${x-3}`);await b.keys([]);await delay(100);
 const peerX=await a.eval('nativeCharacterMenu.read().players[1].x'),guestX=await b.eval('nativeCharacterMenu.read().players[1].x');if(Math.abs(peerX-guestX)>.01)throw Error('Remote cursor differs');
 await a.click('#readyRoom');await a.wait('nativeRoom.state.ready[0]');if(await a.eval('nativeMenuLive.snapshot().scene')!=='characters')throw Error('One Ready started match');await b.click('#readyRoom');
 await a.wait('nativeMenuLive.snapshot().scene==="stages"&&nativeStageMenu.read().frames>120');await b.wait('nativeMenuLive.snapshot().scene==="stages"&&nativeStageMenu.read().frames>120');
 const target=await a.eval('nativeStageMenu.icons().find(i=>i.stage===31&&i.unlocked===2)');
 for(let i=0;i<100;i++){const cursor=await a.eval('nativeStageMenu.read()');if(cursor.hover===target.i){await a.keys([]);break;}const [x,y]=cursor.cursor,dx=target.x-x,dy=target.y-y;const keys=[Math.abs(dx)>.7?(dx>0?'KeyD':'KeyA'):(dy>0?'KeyW':'KeyS')];if(Math.max(Math.abs(dx),Math.abs(dy))<6)keys.push('ShiftLeft');await a.keys(keys);await delay(25);await a.keys([]);await delay(100);if(i===99)throw Error('Could not steer stage cursor to '+JSON.stringify(target));}
 await delay(100);await a.press('KeyP');
 await a.wait('globalThis.nativeLive?.snapshot().match?.intro?.gate===1');await b.wait('globalThis.nativeLive?.snapshot().match?.intro?.gate===1');
 await a.keys(['KeyD','KeyP']);await b.keys(['KeyA','KeyP']);await delay(400);await a.keys([]);await b.keys([]);
 await a.press('Space');await b.press('Space');await a.press('KeyO');await b.press('KeyO');
 for(const [i,c] of [a,b].entries()){const shot=await c.cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output+'/player-'+i+'.png',Buffer.from(shot.data,'base64'));}
 await a.wait('globalThis.nativeMenuMatchReport');await b.wait('globalThis.nativeMenuMatchReport');
 const final=await Promise.all([a,b].map(c=>c.eval('({room:nativeRoom.snapshot(),report:nativeMenuMatchReport})')));
 if(final.some(v=>v.report.live.frames!==600))throw Error('Incomplete match');
 if(JSON.stringify(final[0].report.live.final)!==JSON.stringify(final[1].report.live.final))throw Error('Native fighter state diverged: '+JSON.stringify(final.map(v=>v.report.live.final)));
 fs.writeFileSync(output+'/report.json',JSON.stringify({passed:true,initial,final,scope:'Two localhost browser processes, three-frame input lockstep; not WAN latency or rollback certification.'},null,2));console.log(JSON.stringify({passed:true,code,frames:600,matchingFighterState:true}));
}catch(e){fs.writeFileSync(output+'/failure.json',JSON.stringify({error:e.stack,states:await Promise.all(clients.map(c=>c.eval?.('({room:globalThis.nativeRoom?.snapshot(),menu:globalThis.nativeMenuLive?.snapshot(),error:globalThis.nativeRoomError})').catch(e=>String(e))))},null,2));throw e;
}finally{for(const c of clients){c.ws?.close();c.browser.kill();await new Promise(r=>c.browser.once('exit',r));fs.rmSync(c.profile,{recursive:true,force:true});}await new Promise(r=>server.close(r));}
