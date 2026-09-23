// Development helper: open one native-port page in headless Chrome against a
// local server and print console output, exceptions and a final expression.
//   node scripts/native-port/debug-page.mjs '/character-menu.html?interactive=1&diagnostic-cpu=1' [waitMs] [expression]
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const [route='/character-menu.html?interactive=1&diagnostic-cpu=1',waitMs='8000',expression='({report:globalThis.characterMenuReport,sfx:globalThis.nativeSfx?.snapshot()})']=process.argv.slice(2);
const server=createNativePortServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-debug-')),browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--disable-component-update','--autoplay-policy=no-user-gesture-required','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
try{
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error('Chrome did not start');await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);return;}
  if(m.method==='Runtime.consoleAPICalled')console.log('[console.'+m.params.type+']',m.params.args.map(a=>a.value??a.description).join(' ').slice(0,800));
  if(m.method==='Runtime.exceptionThrown')console.log('[exception]',(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,1500));});
 const cmd=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 await cmd('Runtime.enable');await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+route});await delay(Number(waitMs));
 const r=await cmd('Runtime.evaluate',{expression:'JSON.stringify('+expression+')',returnByValue:true,awaitPromise:true});console.log(r.result?.result?.value?.slice(0,20000)??JSON.stringify(r));
 ws.close();
}finally{browser.kill();await new Promise(r=>browser.once('exit',r));fs.rmSync(profile,{recursive:true,force:true});server.close();}
