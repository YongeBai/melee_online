// Netplay overlay, toggled with the backquote key. Shows the measurements that
// separate the causes of online lag: ping and its spikes, how often and how far
// the game rolls back, frames frozen waiting for the opponent, and whether the
// two computers drift apart in time. It only reads state the page already
// publishes, plus one setting: this player's input delay. [ and ] change it;
// it applies from the next character select and is remembered.
const delayKey='melee-input-delay',visibleKey='melee-net-hud';
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
export const inputDelayRange=[0,4];
export function storedInputDelay(text=read(delayKey)){const n=Number(text);return text!==null&&text!==''&&Number.isInteger(n)&&n>=inputDelayRange[0]&&n<=inputDelayRange[1]?n:null;}

// Per-second rates over the recent window from cumulative counters.
export function createRateWindow(seconds=3){
 const samples=[];
 return {add(at,totals){samples.push({at,totals});while(samples.length>1&&at-samples[0].at>seconds*1000)samples.shift();},
  rate(key){if(samples.length<2)return null;const a=samples[0],b=samples.at(-1),dt=(b.at-a.at)/1000;return dt>0?(b.totals[key]-a.totals[key])/dt:null;},
  delta(key){if(samples.length<2)return null;return samples.at(-1).totals[key]-samples[0].totals[key];},
  reset(){samples.length=0;}};
}

const fixed=(v,d=0)=>v===null||v===undefined||!Number.isFinite(v)?'–':v.toFixed(d);
export function formatMatchLines({ping,delay,peerDelay,rollback,live,window:w,path}){
 const s=rollback.session,stalls=rollback.stalls,c=live?.cadence??{};
 const corrections=w.delta('corrections'),replayed=w.delta('replayed');
 return [
  `ping ${fixed(ping?.p50)} ms · p95 ${fixed(ping?.p95)} ms${path?` · ${path}`:''}`,
  `input delay ${delay}f you · ${peerDelay??'?'}f opponent`,
  `rollbacks ${fixed(w.rate('corrections'),1)}/s · avg ${corrections?fixed(replayed/corrections,1):'0'}f · max ${s.maxReplay}f`,
  `frozen ${fixed(w.rate('frozen'),1)} frames/s (${stalls.window+stalls.transport+stalls.phase} total)`,
  `ahead of opponent ${fixed(rollback.advantage,1)}f · sync −${c.syncDroppedFrames??0} +${c.syncExtraFrames??0}`,
  `sim ${fixed(live?.frames&&live.elapsedMs?live.frames*1000/live.elapsedMs:null,1)} fps · draw p95 ${fixed(live?.drawSubmissionCpu?.p95Ms,1)} ms · step p95 ${fixed(live?.stepCpu?.p95Ms,1)} ms`,
 ];
}

export function installNetHud({window:w=globalThis,document:d=globalThis.document}={}){
 const box=d.createElement('pre');box.id='netHud';box.setAttribute('aria-live','off');
 Object.assign(box.style,{position:'fixed',left:'8px',top:'8px',zIndex:30,margin:0,padding:'6px 8px',background:'rgba(0,0,0,.72)',color:'#e8ecff',font:'12px/1.35 ui-monospace,Menlo,Consolas,monospace',pointerEvents:'none',whiteSpace:'pre',borderRadius:'4px'});
 let visible=read(visibleKey)==='1',preferred=storedInputDelay(),last=null,window=createRateWindow(),path=null,pathMatch=null,timer=0;
 box.hidden=!visible;d.body.append(box);
 const netcode=()=>w.nativeRoom?.netcode??null;
 // Never change the delay of a match in progress; the driver read it at start.
 function applyDelay(){const n=netcode(),scene=w.nativeMenuLiveState?.scene;if(!n||preferred===null||n.delay===preferred||!['characters','stages'].includes(scene))return;n.delay=preferred;n.name=n.name.replace(/,d[0-9],/,`,d${preferred},`);}
 function ping(room){const direct=room?.direct;if(direct?.rttP50Ms!=null)return {p50:direct.rttP50Ms,p95:direct.rttP95Ms};const t=w.nativeTransport?.stats?.();return t?.rttP50Ms!=null?{p50:t.rttP50Ms,p95:t.rttP95Ms}:null;}
 function render(){
  applyDelay();if(!visible)return;
  const room=w.nativeRoom?.snapshot?.()??null,scene=w.nativeMenuLiveState?.scene??'loading',n=netcode(),delay=n?.delay??'?';
  const lines=['NETPLAY  (` hides · [ ] input delay)'];
  if(!room||!w.nativeRoom?.active){lines.push(room?.offline?'offline':'no opponent connected',`input delay ${preferred??delay}f`);}
  else{
   const product=w.nativeProductRollback,live=scene==='match'?w.nativeLive?.snapshot?.():null;
   if(product&&live){
    const snap=product.snapshot(),driver=product.driver,stalls=driver.snapshot().stalls,s=snap.session;
    window.add(performance.now(),{corrections:s.corrections,replayed:s.replayedFrames,frozen:stalls.window+stalls.transport+stalls.phase});
    if(pathMatch!==product){pathMatch=product;path=null;void w.nativeTransport?.pair?.().then(p=>{if(p)path=`${p.local}↔${p.remote}${p.protocol==='tcp'?' tcp':''}`;}).catch(()=>{});}
    last={ping:ping(room),delay:snap.rollbackConfig.inputDelay,peerDelay:w.nativeRoom.peerInputDelay,rollback:{session:s,stalls,advantage:driver.frameAdvantage},live,window,path};
    lines.push(...formatMatchLines(last));
    if(preferred!==null&&preferred!==snap.rollbackConfig.inputDelay)lines.push(`next match: input delay ${preferred}f`);
   }else{
    window.reset();const p=ping(room);
    lines.push(`ping ${fixed(p?.p50)} ms · p95 ${fixed(p?.p95)} ms · ${scene}`,`input delay ${preferred??delay}f · menu buffer ${room.mode?.replace(/^peer-lockstep-/,'')??'?'}f`);
    if(last)lines.push('','last match:',...formatMatchLines(last).slice(2));
   }
  }
  box.textContent=lines.join('\n');
 }
 function key(e){
  if(e.target?.closest?.('input,textarea'))return;
  if(e.code==='Backquote'){visible=!visible;box.hidden=!visible;write(visibleKey,visible?'1':'0');render();return;}
  if(!visible||(e.code!=='BracketLeft'&&e.code!=='BracketRight'))return;
  const current=preferred??netcode()?.delay??2,next=Math.max(inputDelayRange[0],Math.min(inputDelayRange[1],current+(e.code==='BracketRight'?1:-1)));
  preferred=next;write(delayKey,String(next));render();
 }
 w.addEventListener('keydown',key);timer=w.setInterval(render,500);render();
 return {render,dispose(){w.clearInterval(timer);w.removeEventListener('keydown',key);box.remove();}};
}
