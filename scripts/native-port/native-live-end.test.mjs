import test from 'node:test';import assert from 'node:assert/strict';
import {startNativeLive} from '../../engines/browser-native/native-live.mjs';
test('native exit stops before another draw; frame limits never impersonate results',()=>{
 const saved=new Map();for(const key of ['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','document'])saved.set(key,globalThis[key]);
 let callback;Object.assign(globalThis,{requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;},addEventListener(){},removeEventListener(){},document:{hidden:false,addEventListener(){},removeEventListener(){}}});
 try{
  for(const ended of [true,false]){
   let steps=0,draws=0,result;
   const module={_portFighterConstructRead:()=>0,_portControllerSample(){},_Player_80031848(){}};
   startNativeLive(module,{draw(){draws++;return {};}},[1],{frameLimit:1,step(){steps++;},inputProvider:()=>[[0,0,0]],shouldFinish:()=>ended&&steps===1,onComplete:r=>result=r,onError:e=>{throw e;}});
   const start=performance.now()+1;callback(start);callback(start+17);
   assert.equal(steps,1);assert.equal(result.completionReason,ended?'match-end':'frame-limit');assert.equal(draws,ended?0:1);assert.equal(callback,null);
  }
 }finally{for(const [key,value] of saved)if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
