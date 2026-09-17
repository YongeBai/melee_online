import test from 'node:test';import assert from 'node:assert/strict';import {createNativeMusic} from '../../engines/browser-native/native-music.mjs';
test('music cancels stale decodes and preserves pause/loop positions across visibility changes',async()=>{
 const names=['fetch','AudioContext','Worker','document','addEventListener'],saved=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)])),events=new Map(),workers=[],sources=[];let context,music;
 const on=(name,fn)=>events.set(name,fn);
 const audio={rate:32000,length:320000,loopStart:32000,pcm:[new Float32Array(320000)]};
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>({'menu01.hps':{}})});globalThis.document={hidden:false,addEventListener:on};globalThis.addEventListener=on;
  globalThis.Worker=class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}};
  globalThis.AudioContext=class{constructor(){context=this;this.state='suspended';this.currentTime=0;this.buffers=0;}createGain(){return {gain:{value:0},connect(){}};}createAnalyser(){return {fftSize:256,connect(){},getFloatTimeDomainData(a){a.fill(0);}};}createBuffer(ch,length,rate){this.buffers++;return {duration:length/rate,copyToChannel(){}};}createBufferSource(){const s={connect(){},disconnect(){},start:(when,offset)=>{s.offset=offset;},stop:()=>{s.stopped=true;}};sources.push(s);return s;}async resume(){this.state='running';}async close(){this.state='closed';}};
  music=await createNativeMusic();const start=()=>music.request({action:0,path:'audio/menu01.hps',volume:254});
  assert.equal(start(),true);const old=workers[0];music.request({action:1});old.onmessage({data:{audio}});assert.equal(context.buffers,0);assert.equal(music.snapshot().track,null);
  start();const replaced=workers[1];start();replaced.onmessage({data:{audio}});assert.equal(context.buffers,0);workers[2].onmessage({data:{audio}});assert.equal(music.snapshot().status,'locked');assert.equal(sources.length,0);
  await events.get('keydown')();assert.equal(sources.length,1);assert.equal(music.snapshot().status,'playing');context.currentTime=13;music.request({action:2});assert.equal(music.snapshot().offsetSeconds,4);context.currentTime=20;assert.equal(music.snapshot().offsetSeconds,4);
  music.request({action:3});assert.equal(sources.at(-1).offset,4);context.currentTime=22;document.hidden=true;events.get('visibilitychange')();assert.equal(music.snapshot().offsetSeconds,6);context.currentTime=30;document.hidden=false;events.get('visibilitychange')();assert.equal(sources.at(-1).offset,6);
  music.dispose();assert.equal(context.state,'closed');assert.equal(music.request({action:0,path:'audio/menu01.hps',volume:254}),false);
  music=await createNativeMusic({resumeAfterNavigation:true});start();await Promise.resolve();workers.at(-1).onmessage({data:{audio}});assert.equal(music.snapshot().contextState,'running');assert.equal(music.snapshot().status,'playing');
 }finally{music?.dispose();for(const [name,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
});
