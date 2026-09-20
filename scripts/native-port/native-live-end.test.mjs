import test from 'node:test';import assert from 'node:assert/strict';
import {startNativeLive} from '../../engines/browser-native/native-live.mjs';
test('live rollback retries a stalled input on the next due display tick',()=>{
 const saved=new Map();for(const key of ['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','document'])saved.set(key,globalThis[key]);
 let callback,available=false,attempts=0,draws=0;
 Object.assign(globalThis,{requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;},addEventListener(){},removeEventListener(){},document:{hidden:false,addEventListener(){},removeEventListener(){}}});
 try{
  const module={_portFighterConstructRead:()=>0,_portControllerSample(){},_Player_80031848(){}},rollback={seat:0,reconcile(){},advance(){attempts++;return available;},dispose(){}};
  const live=startNativeLive(module,{draw(){draws++;return {};}},[1],{rollback,browserInput:{samples:()=>[[0,0,0],[0,0,0]]},onError:e=>{throw e;}});
  const start=performance.now()+1;callback(start);callback(start+1000/60);assert.equal(attempts,1);assert.equal(draws,0);
  available=true;callback(start+1000/30);assert.equal(attempts,2);assert.equal(draws,1);assert.equal(live.snapshot().frames,1);live.stop();
 }finally{for(const [key,value]of saved)if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
test('disabled progress reporting skips periodic snapshots but retains final metrics',()=>{
 const saved=new Map();for(const key of ['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','document'])saved.set(key,globalThis[key]);
 let callback,result,coverageReads=0;
 Object.assign(globalThis,{requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;},addEventListener(){},removeEventListener(){},document:{hidden:false,addEventListener(){},removeEventListener(){}}});
 try{
  const module={_portFighterConstructRead:()=>0,_portControllerSample(){},_Player_80031848(){}};
  startNativeLive(module,{draw:()=>({}),shaderCoverage(){coverageReads++;return {};}},[1],{frameLimit:60,onProgress:null,step(){},inputProvider:()=>[[0,0,0]],onComplete:r=>result=r,onError:e=>{throw e;}});
  const start=performance.now()+1;callback(start);for(let frame=1;frame<=60;frame++)callback(start+frame*1000/60);
  assert.equal(coverageReads,1);assert.equal(result.frames,60);assert.equal(result.draws,60);assert.equal(result.drawSubmissionCpu.samples,60);
 }finally{for(const [key,value]of saved)if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
test('native exit stops before another draw; frame limits never impersonate results',()=>{
 const saved=new Map();for(const key of ['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','document'])saved.set(key,globalThis[key]);
 let callback;Object.assign(globalThis,{requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;},addEventListener(){},removeEventListener(){},document:{hidden:false,addEventListener(){},removeEventListener(){}}});
 try{
  for(const ended of [true,false]){
   let steps=0,draws=0,observed=0,result;
   const module={_portFighterConstructRead:()=>0,_portControllerSample(){},_Player_80031848(){}};
   startNativeLive(module,{draw(){draws++;return {};}},[1],{frameLimit:1,step(){steps++;},inputProvider:()=>[[0,0,0]],shouldFinish:()=>ended&&steps===1,onDraw:event=>{observed++;assert.equal(event.frame,1);assert.equal(event.draw,1);},onComplete:r=>result=r,onError:e=>{throw e;}});
   const start=performance.now()+1;callback(start);callback(start+17);
   assert.equal(steps,1);assert.equal(result.completionReason,ended?'match-end':'frame-limit');assert.equal(draws,ended?0:1);assert.equal(observed,draws);assert.equal(callback,null);
  }
 }finally{for(const [key,value] of saved)if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});

test('rollback live reconciles a speculative ending and only publishes a confirmed replacement',()=>{
 const saved=new Map();for(const key of ['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','document'])saved.set(key,globalThis[key]);
 let callback,confirmed=false,correct=false,ended=false,draws=0,result,advances=0,disposed=0;Object.assign(globalThis,{requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;},addEventListener(){},removeEventListener(){},document:{hidden:false,addEventListener(){},removeEventListener(){}}});
 try{
  const state=[14,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,1,60,4],module={_portFighterConstructRead:(_o,i)=>state[i],_portControllerSample(){},_Player_80031848(){}},rollback={seat:0,advance(){advances++;if(advances===1)ended=true;return true;},canFinish:()=>confirmed,reconcile(){if(correct){ended=false;correct=false;}},dispose(){disposed++;}};
  startNativeLive(module,{draw(){draws++;return {};}},[1],{rollback,browserInput:{samples:()=>[[0,0,0],[0,0,0]]},shouldFinish:()=>ended,onComplete:r=>result=r,onError:e=>{throw e;}});
  const start=performance.now()+1;callback(start);callback(start+100);assert.equal(advances,1);assert.equal(draws,1);assert.equal(result,undefined);
  correct=true;callback(start+117);assert.equal(advances,1);callback(start+134);assert.equal(advances,2);assert.equal(draws,2);assert.equal(result,undefined);
  ended=true;callback(start+151);assert.equal(advances,2);assert.equal(result,undefined);confirmed=true;callback(start+168);assert.equal(result.completionReason,'match-end');assert.equal(result.frames,2);assert.equal(draws,2);assert.equal(disposed,1);assert.equal(callback,null);
 }finally{for(const [key,value] of saved)if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});

test('rollback frame limits drain correction and confirmation before completing',()=>{
 const saved=new Map();for(const key of ['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','document'])saved.set(key,globalThis[key]);let callback,confirmed=false,result,advances=0;
 Object.assign(globalThis,{requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;},addEventListener(){},removeEventListener(){},document:{hidden:false,addEventListener(){},removeEventListener(){}}});
 try{const state=Array(19).fill(0),module={_portFighterConstructRead:(_o,i)=>state[i],_portControllerSample(){},_Player_80031848(){}},rollback={seat:0,advance(){advances++;return true;},canFinish(){if(confirmed)state[4]=42;return confirmed;},reconcile(){},dispose(){}};
  startNativeLive(module,{draw:()=>({})},[1],{frameLimit:1,rollback,browserInput:{samples:()=>[[0,0,0],[0,0,0]]},onComplete:r=>result=r,onError:e=>{throw e;}});const start=performance.now()+1;callback(start);callback(start+17);assert.equal(advances,1);assert.equal(result,undefined);confirmed=true;callback(start+34);assert.equal(result.completionReason,'frame-limit');assert.equal(result.frames,1);assert.equal(callback,null);
  assert.equal(result.final[0][4],42);
 }finally{for(const [key,value] of saved)if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
