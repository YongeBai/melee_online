import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'../..'),{createNativePortServer}=await import(root+'/scripts/native-port/serve.mjs'),server=createNativePortServer(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-sis-'));
const pending=new Map();let browser,ws,id=0,stderr='';
function cmd(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});


 const output=path.join(root,'dist/native-port/experiment-sis');fs.mkdirSync(output,{recursive:true});
 async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
 await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/sis.html'});
 let report;for(let i=0;i<160;i++){report=await evaluate('globalThis.sisReport');if(report)break;await delay(250);}
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report??null,null,2));
 if(!report?.passed)throw Error(JSON.stringify(report));
 const screenshot=async name=>{const clip=await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()');const shot=await cmd('Page.captureScreenshot',{format:'png',clip});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
 await screenshot('dynamic');await evaluate('nativeSis.show([2])');await screenshot('original-entry');
 report.cleanup=await evaluate('nativeSis.finish()');if(Object.values(report.cleanup).some(x=>x!==0))throw Error('SIS lifecycle leaked '+JSON.stringify(report.cleanup));
 report.build=JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/fighter-init-build.json')));
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,gpu:report.gpu,entries:report.entryCount,checks:report.checks.length,vertices:report.entries.reduce((n,e)=>n+e.textVertices,0),cleanup:report.cleanup}));

}finally{ws?.close();if(browser){browser.kill();await new Promise(r=>browser.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
