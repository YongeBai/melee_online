// Netcode comparison loop. Every trial runs two real Chrome browsers through the
// product: one creates a room, the other joins by code, both ready up, pick a
// stage and play a rollback match of scripted combat. The browsers talk over
// WebRTC inside a network namespace whose UDP traffic passes through netem
// (scripts/netplay/netem.mjs), so loss, jitter and SCTP retransmission are real.
//
//   node scripts/netplay/netcode-lab.mjs \
//     [--variants="room,d0,w7;direct,d2,w7"] [--profiles=regional,home-wifi] \
//     [--frames=1800] [--trials=1] [--out=dist/netplay-lab] [--cpu-throttle=1:3]
//
// --cpu-throttle=seat:rate slows one browser's CPU (DevTools throttling) to
// stand in for a weaker computer.
//
// Variant syntax is native-netcode.mjs's `?netcode=` value; `default` omits the
// parameter (the product default). Results append to
// <out>/results.jsonl; <out>/summary.md ranks variants per profile and overall.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {profiles} from './netem.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const variants=arg('variants','room,d0,w7;direct,d0,w7;direct,d1,w7;direct,d2,w7;direct,d2,w10').split(';').map(s=>s.trim()).filter(Boolean);
const profileNames=arg('profiles','regional,cross-country,home-wifi,bad-wifi').split(',').filter(Boolean);
const cpuThrottle=arg('cpu-throttle','');if(cpuThrottle&&!/^[01]:[0-9.]+$/.test(cpuThrottle))throw Error('--cpu-throttle must be seat:rate');
// --noise adds real-gamepad analog jitter to the scripted inputs.
const noise=process.argv.includes('--noise');
const frames=Number(arg('frames','1800')),trials=Number(arg('trials','1')),out=path.resolve(root,arg('out','dist/netplay-lab'));
for(const p of profileNames)if(!profiles[p])throw Error('Unknown profile '+p+'; known: '+Object.keys(profiles).join(','));
if(!Number.isSafeInteger(frames)||frames<600)throw Error('--frames must be at least 600');
fs.mkdirSync(out,{recursive:true});
const resultsPath=path.join(out,'results.jsonl'),runId=new Date().toISOString();

const quantile=(values,q)=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(q*s.length))];};
const round=(x,d=1)=>x==null||!Number.isFinite(x)?x:Math.round(x*10**d)/10**d;

function trial(variant,profile,label){
 return new Promise(resolve=>{
  const args=[path.join(root,'scripts/netplay/netem.mjs'),profile,'--',process.execPath,path.join(root,'scripts/native-port/probe-native-rooms.mjs'),'--rollback','--timing','--combat','--frames='+frames,'--label='+label];
  const env={...process.env,MELEE_EXTRA_QUERY:[variant==='default'?'':'netcode='+variant,noise?'noise=1':''].filter(Boolean).join('&'),MELEE_CHROME_ARGS:'--disable-features=WebRtcHideLocalIpsWithMdns',MELEE_CPU_THROTTLE:cpuThrottle};
  const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output=(output+d).slice(-20000));child.stderr.on('data',d=>output=(output+d).slice(-20000));
  const started=Date.now(),timer=setTimeout(()=>child.kill('SIGKILL'),12*60*1000);
  child.on('exit',code=>{clearTimeout(timer);const dir=path.join(root,'dist/native-port/experiment-native-rooms-rollback-'+label);
   const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{return null;}};
   resolve({code,output,durationMs:Date.now()-started,report:read('report.json'),raw:read('raw-report.json'),timing:read('timing.json')});});
 });
}

// Cross-browser latency from the shared wall clock. Local: our input's first
// transmission to our own simulation of that frame (input delay plus stalls).
// Remote: our input's transmission to the opponent simulating that frame with
// it, i.e. the later of its arrival and the opponent reaching that frame.
function latency(timing,delay){
 if(!timing?.[0]?.netTrace||!timing[1]?.netTrace)return null;
 const maps=timing.map(t=>({sent:new Map(t.netTrace.sent),received:new Map(t.netTrace.received),executed:new Map(t.netTrace.executed)}));
 const local=[],remote=[];
 for(const seat of [0,1]){
  const me=maps[seat],them=maps[1-seat];
  for(const [frame,sentAt] of me.sent){
   if(frame<3+delay+30)continue;
   const ownRun=me.executed.get(frame);if(ownRun!==undefined)local.push(ownRun-sentAt);
   const arrived=them.received.get(frame),theirRun=them.executed.get(frame);
   if(arrived!==undefined&&theirRun!==undefined)remote.push(Math.max(arrived,theirRun)-sentAt);
  }
 }
 return {localP50Ms:quantile(local,.5),localP95Ms:quantile(local,.95),remoteP50Ms:quantile(remote,.5),remoteP95Ms:quantile(remote,.95),remoteP99Ms:quantile(remote,.99),samples:remote.length};
}

// Lower is better. Freezes and stutter dominate; then the delay a player feels
// on their own inputs, how late the opponent's inputs show up, and how much
// rollback correction (visible snapping) occurs. Weights are a judgement call
// and every component is recorded separately in results.jsonl.
const weights={localP50Ms:1,remoteP95Ms:.5,stutterMsPerMin:.2,replayedFramesPerSec:3};
function summarize(variant,profile,run){
 const report=run.report,timing=run.timing,finals=report?.final??run.raw?.final??[];
 const sessions=finals.map(f=>f.report?.rollback?.metrics?.session),config=finals[0]?.report?.rollback?.metrics?.rollbackConfig;
 const minutes=frames/3600,seconds=frames/60,delay=config?.inputDelay??0;
 const stutter=timing?.map(t=>t.stutter)??[];
 const lat=latency(timing,delay);
 const passed=run.code===0&&!!report?.passed;
 const row={runId,variant,profile,netem:profiles[profile],cpuThrottle:cpuThrottle||null,frames,passed,durationMs:run.durationMs,
  netcode:config?.netcode??null,inputDelay:config?.inputDelay??null,predictionWindow:config?.predictionWindow??null,
  simulationFps:report?.captureSummaries?.map(s=>round(s.activeSimulationFps,2))??null,
  catchUpSteps:report?.captureSummaries?.map(s=>s.catchUpSteps)??null,
  stalledAdvances:timing?.map(t=>t.stalledAdvances)??null,
  stutterMsPerMin:stutter.length?round(Math.max(...stutter.map(s=>s.excessMs))/minutes):null,
  gapsOver50:stutter.map(s=>s.over50),gapsOver100:stutter.map(s=>s.over100),gapsOver250:stutter.map(s=>s.over250),maxGapMs:stutter.map(s=>round(s.maxMs)),
  corrections:sessions.map(s=>s?.corrections??null),replayedFrames:sessions.map(s=>s?.replayedFrames??null),maxReplay:sessions.map(s=>s?.maxReplay??null),
  replayedFramesPerSec:sessions.every(Boolean)?round(Math.max(...sessions.map(s=>s.replayedFrames))/seconds,2):null,
  ...Object.fromEntries(Object.entries(lat??{}).map(([k,v])=>[k,round(v)])),
  syncDroppedFrames:finals.map(f=>f.report?.live?.cadence?.syncDroppedFrames??null),syncExtraFrames:finals.map(f=>f.report?.live?.cadence?.syncExtraFrames??null),
  menuFps:report?.menuMetrics?.fps?.map(v=>round(v,1))??null,menuLocalMs:round(report?.menuMetrics?.guestLocalMs),menuRemoteMs:round(report?.menuMetrics?.ownerRemoteMs),
  direct:finals.map(f=>f.room?.direct??null),
  error:passed?null:(run.output.match(/Error: .*/)?.[0]??run.output.split('\n').filter(Boolean).at(-1)??'').slice(0,400),
 };
 row.score=passed&&lat?round(Object.entries(weights).reduce((sum,[k,w])=>sum+w*(row[k]??0),0)):null;
 return row;
}

const rows=[];let index=0;const total=profileNames.length*variants.length*trials;
for(const profile of profileNames)for(let t=0;t<trials;t++)for(const variant of variants){
 index++;const label='lab-'+(index%4);
 process.stdout.write(`[${index}/${total}] ${profile} :: ${variant} ... `);
 const run=await trial(variant,profile,label),row=summarize(variant,profile,run);rows.push(row);
 fs.appendFileSync(resultsPath,JSON.stringify(row)+'\n');
 console.log(row.passed?`score ${row.score} | local ${row.localP50Ms} ms, remote p95 ${row.remoteP95Ms} ms, stutter ${row.stutterMsPerMin} ms/min, replay ${row.replayedFramesPerSec} f/s, fps ${row.simulationFps}`:`FAILED ${row.error}`);
}

// Rank: mean score per variant within each profile; overall by mean rank.
const groups=new Map();for(const r of rows){const k=r.profile+'\u0000'+r.variant;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const table=[...groups.values()].map(rs=>{const ok=rs.filter(r=>r.passed&&r.score!==null);const m=k=>round(mean(ok.map(r=>r[k]).filter(v=>v!=null)));
 return {profile:rs[0].profile,variant:rs[0].variant,trials:rs.length,failures:rs.length-ok.length,score:ok.length===rs.length?m('score'):null,localP50Ms:m('localP50Ms'),remoteP95Ms:m('remoteP95Ms'),stutterMsPerMin:m('stutterMsPerMin'),replayedFramesPerSec:m('replayedFramesPerSec'),maxGapMs:round(mean(ok.map(r=>Math.max(...r.maxGapMs)))),simFps:round(mean(ok.map(r=>Math.min(...r.simulationFps))),2),menuFps:round(mean(ok.filter(r=>r.menuFps).map(r=>Math.min(...r.menuFps)))),menuLocalMs:m('menuLocalMs'),menuRemoteMs:m('menuRemoteMs')};});
const lines=['# Netcode lab results','',`Run ${runId}: ${frames} frames per match, ${trials} trial(s), scripted combat, two Chrome browsers over WebRTC with netem on UDP`+(cpuThrottle?`, seat ${cpuThrottle.split(':')[0]} CPU throttled ${cpuThrottle.split(':')[1]}×`:'')+'.','',`Score (lower is better) = ${Object.entries(weights).map(([k,w])=>w+'×'+k).join(' + ')}; a failed trial disqualifies the variant for that profile.`,''];
const overall=new Map();
for(const profile of profileNames){
 const p=profiles[profile],ranked=table.filter(r=>r.profile===profile).sort((a,b)=>(a.score??Infinity)-(b.score??Infinity));
 ranked.forEach((r,i)=>{const o=overall.get(r.variant)??{ranks:[],scores:[],failures:0};o.ranks.push(r.score===null?variants.length:i+1);if(r.score!==null)o.scores.push(r.score);o.failures+=r.failures;overall.set(r.variant,o);});
 lines.push(`## ${profile}: ${p.delayMs} ms ± ${p.jitterMs} ms one-way, ${p.lossPct}% loss`,'','| Rank | Variant | Score | Local p50 | Remote p95 | Stutter ms/min | Max gap | Replayed f/s | Min sim FPS | Menu FPS | Menu key→own hand | Menu key→opponent | Failures |','|---|---|---|---|---|---|---|---|---|---|---|---|---|');
 ranked.forEach((r,i)=>lines.push(`| ${i+1} | \`${r.variant}\` | ${r.score??'—'} | ${r.localP50Ms} | ${r.remoteP95Ms} | ${r.stutterMsPerMin} | ${r.maxGapMs} | ${r.replayedFramesPerSec} | ${r.simFps} | ${r.menuFps??'—'} | ${r.menuLocalMs??'—'} | ${r.menuRemoteMs??'—'} | ${r.failures}/${r.trials} |`));
 lines.push('');
}
const best=[...overall].map(([variant,o])=>({variant,meanRank:mean(o.ranks),meanScore:round(mean(o.scores)),failures:o.failures})).sort((a,b)=>a.meanRank-b.meanRank||(a.meanScore??Infinity)-(b.meanScore??Infinity));
lines.push('## Overall','','| Variant | Mean rank | Mean score | Failures |','|---|---|---|---|',...best.map(b=>`| \`${b.variant}\` | ${round(b.meanRank,2)} | ${b.meanScore} | ${b.failures} |`),'',`Best: \`${best[0]?.variant}\``,'');
fs.writeFileSync(path.join(out,'summary.md'),lines.join('\n'));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({runId,frames,trials,weights,table,overall:best},null,1));
console.log('\n'+lines.join('\n'));
