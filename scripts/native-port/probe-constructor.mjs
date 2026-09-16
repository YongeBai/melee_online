import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const render=process.argv.includes('--render'),camera=render||process.argv.includes('--camera'),control=process.argv.includes('--combat-control'),combat=camera||control||process.argv.includes('--combat'),input=process.argv.includes('--input'),stage=combat||input||process.argv.includes('--stage'),step=stage||process.argv.includes('--step');
const chrome=process.env.CHROME||'google-chrome',output=path.resolve(import.meta.dirname,'../../dist/native-port');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'melee-constructor-probe-')),server=createNativePortServer(),pending=new Map();
let browser,socket,sequence=0,stderr='',probe=null,partial=null,crashed=false,frames=null;const diagnostics=[];
const symbols=new Map(fs.readFileSync(path.join(output,'melee-fighter-init.mjs.symbols'),'utf8').trim().split('\n').map(line=>{const split=line.indexOf(':');return [Number(line.slice(0,split)),line.slice(split+1)];}));
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},5000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=spawn(chrome,['--headless=new','--no-sandbox',...(render?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1000,900']:['--disable-gpu']),'--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  browser.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile);i++){if(i===100||browser.exitCode!==null)throw Error('Chrome launch failed: '+stderr);await delay(100);}
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data),wait=pending.get(m.id);if(wait){pending.delete(m.id);m.error?wait.reject(Error(JSON.stringify(m.error))):wait.resolve(m.result);}
    if(m.method==='Inspector.targetCrashed')crashed=true;
    if(m.method==='Debugger.paused')frames=m.params.callFrames.map(f=>({function:symbols.get(Number(/^\$func(\d+)$/.exec(f.functionName)?.[1]))||f.functionName,url:f.url,location:f.location}));
    if(m.method==='Runtime.consoleAPICalled')for(const arg of m.params.args){const value=arg.value;if(typeof value!=='string')continue;if(value.startsWith('NATIVE_CONSTRUCTOR_RESULT '))probe=JSON.parse(value.slice(26));else if(value.startsWith('NATIVE_CONSTRUCTOR_START '))partial=JSON.parse(value.slice(25));else {diagnostics.push(value);if(diagnostics.length>64)diagnostics.shift();}}
  });
  await command('Runtime.enable');await command('Debugger.enable');await command('Page.enable');
  await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/constructor.html'+(combat?'?step=1&stage=1&combat=1'+(control?'&control=1':'')+(camera?'&camera=1':'')+(render?'&render=1':''):input?'?step=1&stage=1&input=1':stage?'?step=1&stage=1':step?'?step=1':'')});
  for(let i=0;i<200&&!probe&&!crashed&&browser.exitCode===null;i++)await delay(100);
  if(!probe){if(!crashed){try{await command('Debugger.pause');for(let i=0;i<20&&!frames;i++)await delay(100);}catch(error){diagnostics.push(String(error));}}
    probe={...(partial||{}),constructorCompleted:partial?.constructorCompleted===true,error:crashed?'Browser renderer crashed':'Constructor did not finish within 20 seconds',diagnostics,pausedFrames:frames,playable:false,performanceMeasured:false};}
  if(probe.error)probe.error=probe.error.replace(/wasm-function\[(\d+)\]/g,(text,id)=>text+' '+(symbols.get(Number(id))||'unknown'));
  if(render&&probe.preview&&!probe.error) {
    for(const [id,name] of [['native-preview-settled','settled'],['native-preview','final']]) {
      const evaluated=await command('Runtime.evaluate',{expression:'(()=>{const r=document.getElementById('+JSON.stringify(id)+').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()',returnByValue:true});
      const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:evaluated.result.value});
      fs.writeFileSync(path.join(output,'native-match-'+name+'.png'),Buffer.from(shot.data,'base64'));
    }
  }
  const report={browser:execFileSync(chrome,['--version'],{encoding:'utf8'}).trim(),build:JSON.parse(fs.readFileSync(path.join(output,'fighter-init-build.json'))),probe};
  fs.writeFileSync(path.join(output,render?'constructor-render-probe.json':camera?'constructor-camera-probe.json':control?'constructor-combat-control-probe.json':combat?'constructor-combat-probe.json':input?'constructor-input-probe.json':stage?'constructor-stage-probe.json':step?'constructor-step-probe.json':'constructor-probe.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(output,'constructor-chrome.log'),stderr);
  console.log(JSON.stringify(probe,null,2));if(!probe.constructorVerified||probe.error||(step&&probe.schedulerSteps!==120)||(input&&!probe.input?.completed)||(combat&&!probe.combat?.completed))process.exitCode=2;
} finally {
  socket?.close();for(const p of pending.values())p.reject(Error('Probe closed'));pending.clear();
  if(browser&&browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(2000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}
  await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});
}
