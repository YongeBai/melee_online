// Cold-profile load timeline of a deployed site: time to interactive character
// select, bytes transferred and the slowest resources.
//   node scripts/netplay/measure-load.mjs [https://playmelee.com] [runs]
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const url=(process.argv[2]??'https://playmelee.com').replace(/\/+$/,'')+'/play/?interactive=1',runs=Number(process.argv[3]??1);
for(let run=0;run<runs;run++){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'melee-load-')),browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--disable-component-update','--disable-background-networking','--no-first-run','--window-size=1280,1100','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 try{
  for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error('Chrome did not start');await delay(100);}
  const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map(),requests=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);return;}
   if(m.method==='Network.requestWillBeSent')requests.set(m.params.requestId,{url:m.params.request.url.replace(/^https?:\/\/[^/]+/,''),start:m.params.timestamp});
   if(m.method==='Network.loadingFinished'){const r=requests.get(m.params.requestId);if(r){r.end=m.params.timestamp;r.bytes=m.params.encodedDataLength;}}});
  const cmd=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
  await cmd('Network.enable');await cmd('Runtime.enable');const t0=Date.now();await cmd('Page.navigate',{url});
  let ready=null;for(let i=0;i<1200&&!ready;i++){await delay(50);const r=await cmd('Runtime.evaluate',{expression:'!!globalThis.characterMenuReport?.passed',returnByValue:true});if(r?.result?.value)ready=Date.now()-t0;}
  const stages=(await cmd('Runtime.evaluate',{expression:'globalThis.characterMenuReport?.loadTimeline',returnByValue:true}))?.result?.value;
  const list=[...requests.values()].filter(r=>r.end),first=Math.min(...list.map(r=>r.start)),bytes=list.reduce((n,r)=>n+(r.bytes??0),0);
  const slow=list.map(r=>({url:r.url.slice(0,60),ms:Math.round((r.end-r.start)*1000),kb:Math.round((r.bytes??0)/1024),endMs:Math.round((r.end-first)*1000)})).sort((a,b)=>b.endMs-a.endMs).slice(0,8);
  if(process.env.MELEE_LOAD_TIMELINE)for(const r of list.sort((a,b)=>a.start-b.start))console.log(Math.round((r.start-first)*1000),Math.round((r.end-r.start)*1000),Math.round((r.bytes??0)/1024)+"K",r.url.slice(0,70));
  console.log(JSON.stringify({run,timeToCharacterSelectMs:ready,stages,requests:list.length,transferredMiB:+(bytes/1048576).toFixed(1),lastResources:slow}));ws.close();
 }finally{browser.kill();await new Promise(r=>browser.once('exit',r));fs.rmSync(profile,{recursive:true,force:true});}
}
