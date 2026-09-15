import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const chrome=process.env.CHROME||'google-chrome',output=path.resolve(import.meta.dirname,'../../dist/native-port');
const scene=process.argv.includes('--scene'),prefix=scene?'scene-gpu':'gpu';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'melee-native-port-gpu-')),server=createNativePortServer();
let browser,socket,stderr='',sequence=0;const pending=new Map();
function command(method,params={}) {
  return new Promise((resolve,reject)=>{const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},90000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));});
}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  // Use real time: virtual-time CLI screenshots can interrupt async GPU readback.
  browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--window-size=1100,1080','about:blank'],{stdio:['ignore','ignore','pipe']});
  browser.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;!fs.existsSync(portFile);i++){if(i===100||browser.exitCode!==null)throw Error('Chrome failed to launch: '+stderr);await delay(100);}
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0],tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const tab=tabs.find(t=>t.type==='page');if(!tab)throw Error('Chrome test page unavailable');
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(waiter){pending.delete(message.id);if(message.error)waiter.reject(Error(JSON.stringify(message.error)));else waiter.resolve(message.result);}});
  await command('Page.enable');
  await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/gpu-preview.html?verify=1'+(scene?'&scene=1':'')});
  // Wait for the new document before installing a completion promise in it.
  let ready=false;
  for(let i=0;i<100;i++) {
    try {ready=(await command('Runtime.evaluate',{expression:"location.pathname==='/gpu-preview.html' && !!document.querySelector('#result')",returnByValue:true})).result.value;}catch{}
    if(ready)break;await delay(100);
  }
  if(!ready)throw Error('GPU page failed to load');
  const evaluated=await command('Runtime.evaluate',{expression:`new Promise(resolve=>{
    const timer=setInterval(()=>{if(document.documentElement.dataset.result){clearInterval(timer);
      resolve({status:document.documentElement.dataset.result,text:document.querySelector('#result').textContent});}},50);
  })`,awaitPromise:true,returnByValue:true,timeout:80000});
  if(evaluated.exceptionDetails)throw Error('GPU page execution failed: '+JSON.stringify(evaluated.exceptionDetails));
  const page=evaluated.result.value;
  const screenshot=await command('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(output,prefix+'-diagnostic.png'),Buffer.from(screenshot.data,'base64'));
  if(page.status!=='passed')throw Error('GPU verification failed: '+page.text);
  const verification=JSON.parse(page.text);
  fs.writeFileSync(path.join(output,prefix+'-check-output.json'),JSON.stringify(verification,null,2)+'\n');
  if(!verification.passed||verification.models.length!==27||verification.resolution.join(',')!=='960,720')throw Error('Incomplete GPU coverage');
  if(verification.models.some(m=>!m.distinctImages))throw Error('Animated output did not change: '+verification.models.filter(m=>!m.distinctImages).map(m=>m.name).join(', '));
  if(verification.originalHsdObjects!==scene)throw Error('Wrong native object path tested');
  const report={browser:execFileSync(chrome,['--version'],{encoding:'utf8'}).trim(),
    build:JSON.parse(fs.readFileSync(path.join(output,scene?'scene-build.json':'build.json'))),softwareGpu:true,verification};
  fs.writeFileSync(path.join(output,prefix+'-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,models:verification.models.length,resolution:verification.resolution,
    maxVertexError:Math.max(...verification.models.map(m=>m.maxError)),softwareGpu:true,playable:false,performanceMeasured:false}));
} finally {
  for(const waiter of pending.values())waiter.reject(Error('Chrome test closed'));pending.clear();socket?.close();
  if(browser&&browser.exitCode===null){const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill('SIGKILL');await exited;}
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,prefix+'-chrome.log'),stderr);fs.rmSync(profile,{recursive:true,force:true});
}
