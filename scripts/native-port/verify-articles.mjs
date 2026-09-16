import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createNativePortServer} from './serve.mjs';
const output=path.resolve(import.meta.dirname,'../../dist/native-port'),browserMode=process.argv.includes('--browser');
let result,browserVersion=null;
if(!browserMode) {
  const {default:create}=await import(pathToFileURL(path.join(output,'melee-fighter-init.mjs')));
  const {verifyArticles,verifyItemCommon}=await import(pathToFileURL(path.join(output,'verify-articles.mjs')));
  const {verifyCommandFields}=await import(pathToFileURL(path.join(output,'verify-commands.mjs')));
  const module=await create();module._portSceneInitialize();
  result={commands:verifyCommandFields(module),common:verifyItemCommon(module,fs.readFileSync(path.join(output,'fixtures/ItCo.usd'))),articles:verifyArticles(module,['PlFx.dat','PlFc.dat'].map(name=>({name,bytes:fs.readFileSync(path.join(output,'fixtures',name))}))),playable:false,performanceMeasured:false};
} else {
  const server=createNativePortServer(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'melee-articles-')),pending=new Map();let browser,socket,id=0,stderr='';
  function command(method,params={}){return new Promise((resolve,reject)=>{const token=++id,timer=setTimeout(()=>{pending.delete(token);reject(Error('CDP timeout: '+method));},5000);pending.set(token,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:token,method,params}));});}
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const chrome=process.env.CHROME||'google-chrome';browserVersion=execFileSync(chrome,['--version'],{encoding:'utf8'}).trim();
    browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
    browser.stderr.on('data',b=>{stderr=(stderr+b).slice(-8192);});
    const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile);i++){if(i===100||browser.exitCode!==null)throw Error('Chrome launch failed: '+stderr);await delay(100);}
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
    await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/articles.html'});
    for(let i=0;i<300;i++) {
      const r=await command('Runtime.evaluate',{expression:'({status:document.documentElement.dataset.result,text:document.querySelector("#result")?.textContent})',returnByValue:true});
      if(r.result.value?.status==='failed')throw Error(r.result.value.text);
      if(r.result.value?.status==='passed'){result=JSON.parse(r.result.value.text);break;}
      if(browser.exitCode!==null)throw Error('Browser exited: '+stderr);await delay(100);
    }
    if(!result)throw Error('Article browser verification timed out');
  } finally {
    socket?.close();for(const p of pending.values())p.reject(Error('Probe closed'));pending.clear();
    if(browser&&browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(3000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}
    await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});
  }
}
const build=JSON.parse(fs.readFileSync(path.join(output,'fighter-init-build.json')));
const sourceHashes=Object.fromEntries(['article-assets.mjs','item-common-assets.mjs','item-model-assets.mjs','motion-assets.mjs','verify-articles.mjs'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')]));
const report={environment:browserMode?'browser':'node',browser:browserVersion,wasmSha256:build.wasmSha256,portableRecipeSha256:build.portableSource.recipeSha256,sourceHashes,...result};
fs.writeFileSync(path.join(output,(browserMode?'browser-':'')+'article-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(!result.commands.passed||!result.common.passed||!result.articles.passed)process.exitCode=2;
