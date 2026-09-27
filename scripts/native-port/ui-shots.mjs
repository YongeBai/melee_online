// Development helper: drive one native-port page in headless Chrome and save
// screenshots between scripted steps.
//   node scripts/native-port/ui-shots.mjs steps.json outDir
// steps.json: {route, init?: "script run before page scripts", steps:[{wait:ms}|{eval:"expr"}|{shot:"name"}|{key:"KeyP"}]}
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const [specPath,out='dist/ui-shots']=process.argv.slice(2),spec=JSON.parse(fs.readFileSync(specPath,'utf8'));fs.mkdirSync(out,{recursive:true});
const server=createNativePortServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-shots-')),browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--disable-component-update','--autoplay-policy=no-user-gesture-required','--window-size=1280,960','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
try{
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error('Chrome did not start');await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);return;}
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type!=='debug')console.log('[console.'+m.params.type+']',m.params.args.map(a=>a.value??a.description).join(' ').slice(0,500));
  if(m.method==='Runtime.exceptionThrown')console.log('[exception]',(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,1500));});
 const cmd=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 await cmd('Runtime.enable');await cmd('Page.enable');if(spec.init)await cmd('Page.addScriptToEvaluateOnNewDocument',{source:spec.init});
 await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+spec.route});
 for(const step of spec.steps){
  if(step.wait)await delay(step.wait);
  if(step.eval){const r=await cmd('Runtime.evaluate',{expression:'JSON.stringify('+step.eval+')',returnByValue:true,awaitPromise:true});console.log('eval',r.result?.result?.value?.slice(0,4000)??JSON.stringify(r.result?.exceptionDetails??r).slice(0,1000));}
  if(step.key)for(const type of ['keyDown','keyUp']){await cmd('Input.dispatchKeyEvent',{type,code:step.key,key:step.key});await delay(step.hold??60);}
  if(step.shot){const r=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,step.shot+'.png'),Buffer.from(r.result.data,'base64'));console.log('shot',step.shot);}
 }
 ws.close();
}finally{browser.kill();await new Promise(r=>browser.once('exit',r));fs.rmSync(profile,{recursive:true,force:true});server.close();}
