import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'../..'),{createNativePortServer}=await import(root+'/scripts/native-port/serve.mjs'),server=createNativePortServer(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-menu-'));
const pending=new Map();let browser,ws,id=0,stderr='';
function cmd(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});


 const output=path.join(root,'dist/native-port/experiment-character-menu');fs.mkdirSync(output,{recursive:true});const rows=[];
 async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
 await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html'});
 let initial;for(let i=0;i<160;i++){initial=await evaluate('globalThis.characterMenuReport');if(initial)break;await delay(250);}
 if(!initial?.passed)throw Error(JSON.stringify(initial));
 const cases=[...Array.from({length:13},(_,i)=>({name:'roster-'+i,pair:[i*2%25,(i*2+1)%25]})),{name:'mirror-costume',pair:[10,10],costume:true},{name:'cancel',cancel:true}];
 for(const [index,entry]of cases.entries()){
  if(index)await evaluate('nativeCharacterMenu.restart()');
  const proof=await evaluate('('+function(entry){
   const m=nativeCharacterMenu,require=(v,s)=>{if(!v)throw Error(s);},initial=m.read(),samples=[];
   require(initial.players[2].hand===3&&initial.players[3].hand===3,'disconnected hands');
   const start=m.read();for(let i=0;i<8;i++)m.step([[0,.1,-.1]]);
   require(m.read().players[0].x===start.players[0].x&&m.read().players[0].y===start.players[0].y,'native deadzone');
   m.step([[0x1000,0,0]]);m.step();require(!m.read().exit&&!m.read().phase,'Start without selections');
   let selected,targets;
   if(entry.cancel){for(let i=0;i<45&&!m.read().exit;i++)m.step([[0x200,0,0]]);require(m.read().exit===1&&m.read().phase===2,'hold B cancel');}
   else{
    const icons=m.icons();require(icons.length===25&&icons.every(i=>i.state!==0),'full unlocked roster');targets=entry.pair.map(i=>icons[i]);
    const axis=d=>Math.abs(d)<.08?0:Math.sign(d)*Math.min(1,Math.sqrt(Math.abs(d)/.0002+200)/80);
    for(let i=0;i<120;i++){
     const s=m.read();if(s.players.slice(0,2).every((p,i)=>Math.abs(p.x-targets[i].x)<.09&&Math.abs(p.y-targets[i].y)<.09))break;
     m.step(targets.map((t,i)=>[0,axis(t.x-s.players[i].x),axis(t.y-s.players[i].y)]));
    }
    for(let i=0;i<20;i++)m.step();samples.push(m.draw());
    m.step([[0x100,0,0],[0x100,0,0]]);for(let i=0;i<40;i++)m.step();selected=m.read();samples.push(m.draw());
    selected.players.slice(0,2).forEach((p,i)=>require(p.character===targets[i].character&&p.icon===targets[i].i&&p.token===0&&p.selected===1,'original roster selection '+i));
    if(entry.costume){require(selected.players[0].costume!==selected.players[1].costume,'mirror costume collision');const before=selected.players[0].costume;m.step([[0x400,0,0]]);m.step();selected=m.read();require(selected.players[0].costume!==before&&selected.players[0].costume!==selected.players[1].costume,'X costume change');samples.push(m.draw());}
    m.step([[0x1000,0,0]]);for(let i=0;i<180&&!m.read().exit;i++)m.step();require(m.read().exit===1&&m.read().phase===1,'Start advances original scene');samples.push(m.draw());
   }
   const final=m.read();return {initial,targets,selected,final,samples};
  }+')('+JSON.stringify(entry)+')');
  const shot=await cmd('Page.captureScreenshot',{format:'png',clip:{x:8,y:8,width:960,height:720,scale:1}});fs.writeFileSync(path.join(output,entry.name+'.png'),Buffer.from(shot.data,'base64'));
  const finished=await evaluate('nativeCharacterMenu.finish()');if(finished.objects||finished.procs||finished.allocations!==4||finished.phase!==(entry.cancel?2:1))throw Error('CSS cleanup '+JSON.stringify(finished));
  let handoff;
  if(index<6||entry.costume){
   await evaluate('nativeCharacterMenu.toStage(0)');
   if(index===0){
    await evaluate('nativeStageMenu.step([[512,0,0]])');const canceled=await evaluate('nativeStageMenu.finish()');if(canceled.stage!==0||canceled.objects||canceled.procs||canceled.allocations!==4)throw Error('SSS cancel cleanup');
    const resumed=await evaluate('nativeCharacterMenu.restart(true)');
    for(let p=0;p<2;p++)if(resumed.players[p].character!==proof.final.players[p].character||resumed.players[p].costume!==proof.final.players[p].costume)throw Error('SSS cancel loses CSS selection');
    await evaluate('(()=>{const m=nativeCharacterMenu;m.step([[4096,0,0]]);for(let i=0;i<180&&!m.read().exit;i++)m.step();if(!m.read().exit)throw Error("resumed Start");return m.finish();})()');
    await evaluate('nativeCharacterMenu.toStage(0)');
   }
   const stage=[31,32,28,8,2,3][index%6];
   handoff=await evaluate('('+function(stage){
    const m=nativeStageMenu,target=m.icons().find(i=>i.stage===stage&&i.unlocked===2);if(!target)throw Error('unlocked tournament stage');
    const axis=d=>Math.abs(d)<.02?0:Math.sign(d)*Math.min(1,(Math.abs(d)/.03+30)/80);
    for(let i=0;i<100;i++){const s=m.read(),dx=target.x-s.cursor[0],dy=target.y-s.cursor[1];if(Math.abs(dx)<.025&&Math.abs(dy)<.025&&s.hover===target.i)break;m.step([[0,axis(dx),axis(dy)]]);}
    if(m.read().hover!==target.i)throw Error('native stage hit test '+JSON.stringify({target,state:m.read()}));const hover=m.draw();m.step([[256,0,0]]);for(let i=0;i<180&&!m.read().exit;i++)m.step();if(!m.read().exit)throw Error('stage confirm');const final=m.read(),render=m.draw(),finished=m.finish();return {hover,render,final,finished,match:nativeCharacterMenu.matchSelection()};
   }+')('+stage+')');
   if(handoff.finished.stage!==stage||handoff.finished.objects||handoff.finished.procs||handoff.finished.allocations!==4)throw Error('SSS handoff cleanup');
   const match=handoff.match;if(match.stage!==stage||match.seconds!==480||match.items!==-1||match.teams!==0||match.mode!==1||match.timer!==1)throw Error('Tournament rules handoff '+JSON.stringify(match));
   for(let p=0;p<2;p++)if(match.players[p].character!==proof.final.players[p].character||match.players[p].costume!==proof.final.players[p].costume||match.players[p].stocks!==4||match.players[p].kind!==0)throw Error('Player handoff '+p);
  }
  rows.push({...entry,proof,finished,handoff});console.log(JSON.stringify({name:entry.name,frames:proof.final.frames,characters:proof.final.players.slice(0,2).map(p=>p.character),finished}));
 }
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,build:JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/fighter-init-build.json'))),initial,rows},null,2));
}finally{ws?.close();if(browser){browser.kill();await new Promise(r=>browser.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
