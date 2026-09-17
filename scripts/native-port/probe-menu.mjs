import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'../..'),{createNativePortServer}=await import(root+'/scripts/native-port/serve.mjs'),server=createNativePortServer(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-menu-'));
const pending=new Map();let browser,ws,id=0,stderr='';
function cmd(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});

 const output=path.join(root,'dist/native-port/experiment-stage-menu');fs.mkdirSync(output,{recursive:true});const rows=[];
 async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
 const cases=[['battlefield',31],['final-destination',32],['dream-land',28],['yoshis-story',8],['fountain',2],['stadium',3],['cancel',0]];
 for(const [name,stage] of cases){
  await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/menu.html?verifyvertices=1&case='+name});
  let report;for(let i=0;i<160;i++){report=await evaluate('new URLSearchParams(location.search).get("case")==='+JSON.stringify(name)+'?globalThis.menuReport:undefined');if(report)break;await delay(250);}
  if(!report?.passed)throw Error(JSON.stringify(report));
  const proof=await evaluate('('+function(stage){
   const m=globalThis.nativeMenu,require=(v,s)=>{if(!v)throw Error(s);},neutral=[0,0,0,0,0,0,0],start=m.read(),samples=[];
   for(let i=0;i<8;i++)m.step([neutral,[0,1,1,0,0,0,0]]);
   require(JSON.stringify(m.read().cursor)===JSON.stringify(start.cursor),'wrong player moves cursor');
   for(let i=0;i<8;i++)m.step([[0,.375,-.375,0,0,0,0]]);
   require(JSON.stringify(m.read().cursor)===JSON.stringify(start.cursor),'menu deadzone differs');
   if(stage){
    const icon=m.icons().find(i=>i.stage===stage&&i.unlocked===2);require(icon,'unlocked target');
    for(let f=0;f<100;f++){
     const s=m.read(),dx=icon.x-s.cursor[0],dy=icon.y-s.cursor[1];if(Math.abs(dx)<.025&&Math.abs(dy)<.025&&s.hover===icon.i)break;
     const axis=d=>Math.abs(d)<.02?0:Math.sign(d)*Math.min(1,(Math.abs(d)/.03+30)/80);
     m.step([[0,axis(dx),axis(dy),0,0,0,0]]);
    }
    require(m.read().hover===icon.i,'native icon hit test');m.step();samples.push(structuredClone(m.draw()));
    m.step([[0x100,0,0,0,0,0,0]]);require(m.read().phase===1,'native confirmation animation');
    for(let i=0;i<180&&!m.read().exit;i++){m.step();if(i%15===0)samples.push(structuredClone(m.draw()));}
    require(m.read().exit===1&&m.read().stage===stage&&m.read().phase===2,'original selected stage/scene exit');
   }else{m.step([[0x200,0,0,0,0,0,0]]);require(m.read().exit===1&&m.read().phase===0,'B cancel');}
   const final=m.read(),finished=m.finish();require(finished.stage===stage,'scene exit result');require(!finished.objects&&!finished.procs&&!finished.allocations,'menu cleanup');
   return {start,final,finished,samples};
  }.toString()+')('+stage+')');
  rows.push({name,stage,initial:report,proof});
  if(stage){const clip=await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()');const shot=await cmd('Page.captureScreenshot',{format:'png',clip});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));}
  console.log(JSON.stringify({name,stage,frames:proof.final.frames,shapeChecks:proof.samples.reduce((n,s)=>n+s.render.shapeDraws.reduce((n,d)=>n+d.reference.checks,0),0),clean:proof.finished}));
 }
 const report={passed:true,build:JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/fighter-init-build.json'))),rows};
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));

}finally{ws?.close();if(browser){browser.kill();await new Promise(r=>browser.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
