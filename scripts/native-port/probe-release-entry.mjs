import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';

const server=createNativePortServer({productEntry:true}),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-release-entry-')),pending=new Map(),events=[];let browser,ws,id=0,stderr='';
function command(method,params={}){return new Promise((resolve,reject)=>{const request=++id,timer=setTimeout(()=>{pending.delete(request);reject(Error('CDP timeout '+method));},30000);pending.set(request,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});ws.send(JSON.stringify({id:request,method,params}));});}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;}
async function waitFor(expression){const started=Date.now();for(;;){const value=await evaluate(`({value:(${expression}),error:globalThis.nativeMenuLiveError??globalThis.characterMenuReport?.error})`);if(value.error)throw Error(value.error);if(value.value)return value.value;if(Date.now()-started>30000)throw Error('Timed out waiting for '+expression);await delay(25);}}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const redirect=await fetch(base+'/?join=ABC234',{redirect:'manual'});if(redirect.headers.get('location')!=='/play/?interactive=1&join=ABC234')throw Error('Release redirect lost its invite');
 const restricted=await fetch(base+'/play/?diagnostic-cpu=1&lockstep=1&workload=1&liveframes=60&captureframes=1',{redirect:'manual'});if(restricted.status!==302||restricted.headers.get('location')!=='/play/?interactive=1')throw Error('Release route exposed diagnostics');
 for(const route of ['/play/certification.html','/local-disc','/game.iso'])if((await fetch(base+route)).status!==404)throw Error('Release route escaped product boundary: '+route);
 const health=await (await fetch(base+'/health')).json();if(health.engine!=='browser-native-wasm'||health.dolphin!==false||health.width!==960||health.height!==720)throw Error('Invalid release health '+JSON.stringify(health));
 browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-12000));
 for(let tries=0;!fs.existsSync(profile+'/DevToolsActivePort');tries++){if(tries>100)throw Error(stderr);await delay(100);}
 const debugPort=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data),request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}else if(['Runtime.exceptionThrown','Log.entryAdded'].includes(message.method))events.push(message);});
 await command('Runtime.enable');await command('Log.enable');await command('Page.navigate',{url:base+'/play/'});await waitFor('globalThis.characterMenuReport?.passed&&globalThis.nativeCharacterMenu?.read().frames>30');
 const state=await evaluate(`(()=>{const canvas=document.querySelector('#picture'),room=nativeRoom.snapshot(),menu=nativeCharacterMenu.read();return {path:location.pathname,query:location.search,canvas:[canvas.width,canvas.height],scene:nativeMenuLive.snapshot().scene,room:{cpu:nativeRoom.cpu,active:nativeRoom.active,mode:room.mode,code:room.code},p2Kind:menu.players[1].kind,fileInputs:document.querySelectorAll('input[type=file]').length};})()`);
 if(state.path!=='/play/'||state.query!=='?interactive=1'||state.canvas[0]!==960||state.canvas[1]!==720||state.scene!=='characters'||state.room.cpu!==false||state.room.active!==false||state.room.mode!=='solo'||!state.room.code||state.p2Kind!==0||state.fileInputs)throw Error('Hosted entry invariant failed '+JSON.stringify(state));
 const failures=events.filter(event=>!event.params?.entry?.url?.endsWith('/favicon.ico'));if(failures.length)throw Error('Browser release errors '+JSON.stringify(failures));
 console.log(JSON.stringify({passed:true,health,state}));
}finally{
 try{ws?.close();}catch{}browser?.kill('SIGKILL');await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});
}
