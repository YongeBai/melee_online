// Repeated two-browser netplay check against a deployed site (default
// https://playmelee.com). Each iteration launches two independent Chrome
// processes, creates a room in one, joins it from the other by code, plays a
// rollback match and records frame rate, cadence and latency.
//
//   node scripts/netplay/playmelee-loop.mjs [--url=https://playmelee.com]
//     [--iterations=3] [--frames=1800] [--no-latency]
//
// Protected Vercel previews: run through `vercel env run --` from a directory
// linked to the project so VERCEL_OIDC_TOKEN is available to the browsers.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'../..');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const url=arg('url','https://playmelee.com').replace(/\/+$/,''),iterations=Number(arg('iterations','1')),frames=Number(arg('frames','1800'));
const latency=!process.argv.includes('--no-latency');
// Emulated one-way WAN delays (ms, applied by both peers) cycled per iteration.
const delays=arg('delays','0').split(',').map(Number);
// Tournament stages and a rotating set of roster tiles (CSS tile indices).
const stages=[31,32,2,3,8,28],pairs=[null,'20,2','12,12','9,14','17,10','15,4'];
const outDir=path.join(root,'dist/netplay-loop');fs.mkdirSync(outDir,{recursive:true});
const log=path.join(outDir,'results.jsonl');

function probe(args,label){
 return new Promise(resolve=>{
  const child=spawn(process.execPath,[path.join(root,'scripts/native-port/probe-native-rooms.mjs'),'--remote='+url,'--rollback','--label='+label,...args],{cwd:root,stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  const timer=setTimeout(()=>child.kill('SIGTERM'),15*60*1000);
  child.on('exit',code=>{clearTimeout(timer);const dir=path.join(root,'dist/native-port/experiment-native-rooms-rollback-'+label);
   const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{return null;}};
   resolve({code,output:out.slice(-4000),report:read('report.json'),raw:read('raw-report.json'),timing:read('timing.json'),failure:read('failure.json')});});
 });
}
const round=(x,d=2)=>x==null?null:Math.round(x*10**d)/10**d;
function summarize(combat,keys){
 const r=combat.report??combat.raw,s=combat.report?.captureSummaries,net=r?.network,o=s?.find(x=>x.observation)?.observation;
 const rollback=r?.final?.map(v=>v.report?.rollback?.metrics?.session)??[];
 const input=keys?.timing?.map(t=>t.input.eventToNativeInputSubmission)??[];
 const summary={
  passed:combat.code===0&&!!combat.report?.passed,
  simulationFps:s?.map(x=>round(x.simulationFps)),
  capturedFps:round(o?.cadence?.fps),captureP95Ms:round(o?.cadence?.p95Ms),captureMaxMs:round(o?.cadence?.maxMs),gapsOver25Ms:o?.cadence?.gapsOver25Ms,
  distinctFrames:o?`${o.distinctSampledImages}/${o.requested}`:null,
  drawP95Ms:s?.map(x=>round(x.drawSubmissionCpu?.p95Ms)),
  corrections:rollback.map(m=>m?.corrections??null),replayedFrames:rollback.map(m=>m?.replayedFrames??null),
  candidatePair:net?.link?.map(l=>l?.pair&&`${l.pair.local}->${l.pair.remote}/${l.pair.protocol}`),
  rttP50Ms:net?.link?.map(l=>round(l?.stats?.rttP50Ms)),
  oneWayP50Ms:net?.oneWayInputTransit?.map(x=>round(x.p50Ms)),oneWayP95Ms:net?.oneWayInputTransit?.map(x=>round(x.p95Ms)),
  localInputMeanMs:input.map(x=>round(x.meanMs)),localInputP95Ms:input.map(x=>round(x.p95Ms)),
  sfxStarts:r?.final?.map(v=>v.sfx?.starts??null),sfxMissing:r?.final?.map(v=>v.sfx?.missingSamples??null),
  latencyRunPassed:keys?keys.code===0:null,
  error:combat.code===0?null:(combat.failure?.error??combat.output).split('\n')[0].slice(0,500),
 };
 // Targets: 720-line (960x720 4:3) native picture at 60 FPS, and an estimated
 // key-to-remote-simulation latency (local sample + one-way transit + one
 // display frame) under 100 ms. This is a browser-canvas estimate, not a
 // physical input-to-photon measurement.
 const transitP95=Math.max(...(summary.oneWayP95Ms??[Infinity])),inputP95=Math.max(...(summary.localInputP95Ms?.length?summary.localInputP95Ms:[NaN]));
 summary.estimatedRemoteLatencyP95Ms=Number.isFinite(inputP95)?round(inputP95+transitP95+1000/60):null;
 summary.meetsTargets=summary.passed&&summary.simulationFps?.every(f=>f>=59.5)&&summary.capturedFps>=59.5&&(summary.estimatedRemoteLatencyP95Ms??Infinity)<100;
 return summary;
}
for(let i=0;i<iterations;i++){
 const stage=stages[i%stages.length],pair=pairs[i%pairs.length],stamp=new Date().toISOString().replace(/[:.]/g,'-').toLowerCase();
 const delay=delays[i%delays.length],common=['--stage='+stage,...(pair?['--pair='+pair]:[]),...(delay?['--p2p-delay='+delay+','+Math.round(delay/4)]:[])];
 console.error(`[${i+1}/${iterations}] ${url} stage ${stage} pair ${pair??'default'} delay ${delay}ms`);
 const combat=await probe(['--frames='+frames,'--capture-seat='+(i%2),'--combat','--timing',...common],'loop-'+stamp+'-combat');
 const keys=latency?await probe(['--frames='+Math.max(1800,frames),'--timing','--latency',...common],'loop-'+stamp+'-latency'):null;
 const entry={at:new Date().toISOString(),url,iteration:i,stage,pair,frames,emulatedOneWayMs:delay,...summarize(combat,keys)};
 fs.appendFileSync(log,JSON.stringify(entry)+'\n');console.log(JSON.stringify(entry));
}
