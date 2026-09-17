import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'../..'),{createNativePortServer}=await import(root+'/scripts/native-port/serve.mjs'),server=createNativePortServer(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'native-menu-'));
const matchMode=process.argv.includes('--match'),matchStage=Number(process.argv.find(a=>a.startsWith('--stage='))?.slice(8)??31);if(![31,32,28,8,2,3].includes(matchStage))throw Error('Tournament stage required');
const pairArgument=process.argv.find(a=>a.startsWith('--pair='))?.slice(7),pair=(pairArgument??'10,10').split(',').map(Number),holdA=process.argv.includes('--hold-a');
if(pair.length!==2||pair.some(n=>!Number.isInteger(n)||n<0||n>=25)||holdA&&pair[0]!==15||(!matchMode&&(pairArgument||holdA)))throw Error('Invalid menu match pair/held-A case');
const pending=new Map();let browser,ws,id=0,stderr='';
function cmd(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('timeout '+method));},30000);pending.set(n,{resolve:x=>{clearTimeout(t);resolve(x);},reject});ws.send(JSON.stringify({id:n,method,params}));});}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=spawn('google-chrome',['--headless=new','--no-sandbox','--enable-gpu','--disable-dev-shm-usage','--window-size=1280,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
 for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error(stderr);await delay(100);}
 const port=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});


 const output=path.join(root,matchMode?'dist/native-port/experiment-menu-match-'+matchStage+(pairArgument?'-pair-'+pair.join('-'):'')+(holdA?'-held-a':''):'dist/native-port/experiment-character-menu');fs.mkdirSync(output,{recursive:true});const rows=[];
 async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
 await cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/character-menu.html'});
 let initial;for(let i=0;i<160;i++){initial=await evaluate('globalThis.characterMenuReport');if(initial)break;await delay(250);}
 if(!initial?.passed)throw Error(JSON.stringify(initial));
 const cases=matchMode?[{name:pairArgument?'selected-pair':'mirror-costume',pair,costume:pair[0]===pair[1]}]:[...Array.from({length:13},(_,i)=>({name:'roster-'+i,pair:[i*2%25,(i*2+1)%25]})),{name:'mirror-costume',pair:[10,10],costume:true},{name:'cancel',cancel:true}];
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
   const stage=matchMode?matchStage:[31,32,28,8,2,3][index%6];
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
  let matchRun;
  if(matchMode){
   if(holdA)await evaluate('characterModule._portControllerSample(0,256,0,0,0,0,0,0)');
   await evaluate("void nativeCharacterMenu.startMatch({liveframes:'900',gpuerrors:'deferred'}).catch(e=>globalThis.nativeMenuMatchFailure=String(e.stack??e))");
   const transitions=[],shots=new Set();let lastMask=-1;
   async function waitFor(condition){for(let i=0;i<400;i++){
    const r=await evaluate('({live:globalThis.nativeLive?.snapshot(),result:globalThis.nativeMenuMatchReport,failure:globalThis.nativeMenuMatchFailure})');
    if(r.failure||r.result?.error)throw Error(r.failure??r.result.error);
    const intro=r.live?.match?.intro;
    if(intro&&intro.mask!==lastMask){transitions.push({frame:r.live.frames,...intro,clock:r.live.match.clock});lastMask=intro.mask;}
    if(intro?.mask&8){if(intro.blocked.some(v=>v!==1)||r.live.match.clock[0]!==0)throw Error('Native Ready input/clock gate');}
    if(intro?.mask&16&&intro.blocked.some(v=>v!==0))throw Error('Go must release input');
    const shot=intro?.mask&8?'ready':intro?.mask&16?'go':null;
    if(shot&&r.live.frames>15&&!shots.has(shot)){const data=await evaluate("document.querySelector('#native-preview').toDataURL()");fs.writeFileSync(path.join(output,shot+'.png'),Buffer.from(data.split(',')[1],'base64'));shots.add(shot);}
    if(condition(r))return r;
    if(r.result)throw Error('Match ended before expected input/phase');await delay(50);
   }throw Error('Menu-to-match phase timeout');}
   const running=await waitFor(r=>r.live?.match?.intro?.gate===1);
   if(!shots.has('ready')||!shots.has('go'))throw Error('Missing rendered Ready/Go');
   const selectedKinds=await evaluate('[0,1].map(p=>characterModule._portMenuMatchRead(10,p))');
   if(!running.live.initial.every((r,p)=>r[18]===4&&r[11]===selectedKinds[p]))throw Error('Selected native fighter kinds/stocks');
   if(holdA&&(handoff.match.players[0].character!==18||selectedKinds[0]!==7))throw Error('Original held-A Sheik entry');
   const key=(code,type,key)=>cmd('Input.dispatchKeyEvent',{type,code,key});
   await key('ArrowRight','keyDown','ArrowRight');const moved=await waitFor(r=>r.live?.final?.[0]?.[4]>running.live.final[0][4]+4);await key('ArrowRight','keyUp','ArrowRight');
   const grounded=await waitFor(r=>r.live?.final?.[0]?.[0]===14&&r.live.final[0][3]===0);
   await key('KeyX','keyDown','x');const jumped=await waitFor(r=>r.live?.frames>grounded.live.frames&&r.live.final[0][3]===1&&[25,26,27,28,29].includes(r.live.final[0][0]));await key('KeyX','keyUp','x');
   await key('KeyZ','keyDown','z');const attacked=await waitFor(r=>r.live?.frames>jumped.live.frames&&r.live.final[0][0]>=65&&r.live.final[0][0]<=69);await key('KeyZ','keyUp','z');
   const complete=await waitFor(r=>r.result);if(!complete.result.constructorCompleted||!complete.result.menuHandoff?.sameRuntime)throw Error('Match construction did not consume same runtime');
   if(complete.result.fighterForms.some(f=>f.costume!==handoff.match.players[f.slot].costume))throw Error('Costume handoff mismatch');
   if(complete.result.menuHandoff.selectedStage!==matchStage)throw Error('Stage handoff mismatch');
   matchRun={transitions,input:{moved:moved.live.frames,jumped:jumped.live.frames,jumpState:jumped.live.final[0][0],attacked:attacked.live.frames,attackState:attacked.live.final[0][0]},report:complete.result};
   const data=await evaluate("document.querySelector('#native-preview').toDataURL()");fs.writeFileSync(path.join(output,'match.png'),Buffer.from(data.split(',')[1],'base64'));
  }
  rows.push({...entry,proof,finished,handoff,matchRun});console.log(JSON.stringify({name:entry.name,frames:proof.final.frames,characters:proof.final.players.slice(0,2).map(p=>p.character),finished}));
 }
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,build:JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/fighter-init-build.json'))),initial,rows},null,2));
}finally{ws?.close();if(browser){browser.kill();await new Promise(r=>browser.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
