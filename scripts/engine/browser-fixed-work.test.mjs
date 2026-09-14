import test from'node:test';import assert from'node:assert/strict';import{compareFixedNativeWork as compare}from'./browser-fixed-work.js';import{browserCodegenConfig}from'./browser-benchmark.js';
function fixture({badTiming=false,fullDifference=false,inputDifference=false,failAction=null}={}){
 const calls=[],slots=new Map();let frame=300,start=0,target=0,polls=0,trial=0,active=false,running=false,enabled=false,t=0;
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(type,d)=>{
  calls.push({type,...d});if(type==='start'){running=true;return{};}
  if(d.action===failAction)throw Error('injected failure');
  switch(d.action){
   case'pause':running=false;break;
   case'codegen':assert.equal(running,false);enabled=d.counterbatch;break;
   case'step':assert.equal(running,false);frame++;break;
   case'capture':assert.equal(running,false);slots.set(d.slot,frame);break;
   case'restore':assert.equal(running,false);assert.ok(slots.has(d.slot));frame=slots.get(d.slot);break;
   case'release':slots.delete(d.slot);break;
   case'frameInput':active=d.enabled;if(active){assert.equal(running,false);start=frame;target=0;polls=0;trial++;}break;
   case'frameInputStop':assert.equal(running,false);target=d.frames;break;
   case'frameInputStats':polls++;t+=500;frame=start+(polls===1?target/2:target);if(polls>1)running=false;return{id:calls.length,ok:true,active,valid:true,completed:polls>1,startFrame:start,lastFrame:frame,stoppedFrame:polls>1?frame:0,stopAfterFrames:target,inputChanges:[12,12],observedActions:[[1,2,3],[1,2,3]],gaps:[],digests:[{frame:1200,input:1,state:inputDifference&&trial===4?3:2}]};
   case'frameInputTiming':return{valid:true,frames:target,startFrame:start,stopFrame:frame,elapsedMs:badTiming?0:enabled?20000:22000};
   case'equal':return{equal:!fullDifference&&slots.get(d.a)===slots.get(d.b),comparison:{sizeA:100,sizeB:100}};
   default:throw Error(d.action);
  }return{};
 }}};
 return{host,calls,slots,inspect:async()=>({sceneFrame:frame}),options:{retainedFpuGuard:true,retainedBranchFusion:true,retainedReadFusion:true,sleep:async()=>{},now:()=>t},active:()=>active};
}
test('fixed native work compares identical spans, full endpoints, and never claims visible FPS acceptance',async()=>{
 const f=fixture(),r=await compare(f.host,1200,f.inspect,f.options);
 assert.equal(r.passed,false);assert.equal(r.diagnosticOnly,true);assert.equal(r.equivalencePassed,true);assert.equal(r.inputConsistency.passed,true);
 assert.deepEqual(r.runs.map(r=>r.enabled),[false,false,true,true,true,true,false,false]);
 assert.deepEqual(r.runs.map(r=>r.timing.startFrame),Array(8).fill(421));assert.ok(r.runs.every(r=>r.timing.stopFrame===1621));
 for(const run of r.runs){assert.equal(run.nativeWorkFps,run.enabled?60:1200/22);assert.ok(run.config.fpuguard&&run.config.branchfusion&&run.config.readfusion);assert.equal(run.passed,false);}
 assert.equal(f.calls.filter(c=>c.action==='equal').length,3);assert.equal(f.slots.size,0);assert.equal(f.active(),false);assert.equal(f.calls.at(-1).type,'start');
 assert.deepEqual(f.calls.filter(c=>c.action==='codegen').at(-1),{type:'browserRollback',action:'codegen',...browserCodegenConfig(f.host)});
});
for(const failure of['fullDifference','inputDifference'])test(failure+' prevents equivalence',async()=>{const f=fixture({[failure]:true});assert.equal((await compare(f.host,1200,f.inspect,f.options)).equivalencePassed,false);});
for(const config of[{badTiming:true},{failAction:'frameInputTiming'},{failAction:'equal'}])test('fixed work cleans up failed capture '+JSON.stringify(config),async()=>{const f=fixture(config);await assert.rejects(compare(f.host,1200,f.inspect,f.options));assert.equal(f.slots.size,0);assert.equal(f.active(),false);assert.equal(f.calls.at(-1).type,'start');assert.deepEqual(f.calls.filter(c=>c.action==='codegen').at(-1),{type:'browserRollback',action:'codegen',...browserCodegenConfig(f.host)});});
test('invalid fixed workload rejects before mutation',async()=>{for(const frames of[600,3601,1200.5]){const f=fixture();await assert.rejects(compare(f.host,frames,f.inspect,f.options));assert.equal(f.calls.length,0);}});
