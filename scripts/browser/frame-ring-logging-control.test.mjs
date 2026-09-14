import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('actual worker logger can stop and restart without reading or printing an accumulated backlog',()=>{
 const source=readFileSync('engines/wasm-dolphin/src/upstream-discio-worker.js','utf8'),start=source.indexOf('let frameRingDrainTimer = null;'),end=source.indexOf('\nfunction formatHex',start);assert.ok(start>=0&&end>start);
 let timer,head=0,clock=0;const logs=[],statuses=[];
 const ctx=vm.createContext({api:{getFrameRingCapacity:()=>2,getFrameRingEntrySize:()=>32,getFrameRingEntryPtr:()=>4,getFrameRingHead:()=>head},moduleInstance:{HEAPU32:new Uint32Array(17)},postStatus:s=>statuses.push(s),console:{log:s=>logs.push(s)},performance:{now:()=>clock+=.5},setInterval:f=>{assert.equal(timer,undefined);timer=f;return 1;},clearInterval:()=>{timer=undefined;}});
 vm.runInContext(source.slice(start,end)+'\nglobalThis.control=controlFrameRingLogging;',ctx);
 assert.equal(ctx.control().enabled,false);ctx.control(true);assert.equal(ctx.control().enabled,true);
 head=2;timer();assert.equal(logs.length,2);assert.equal(ctx.control().rows,2);assert.equal(ctx.control().batches,1);assert.equal(ctx.control().drainMs,.5);
 ctx.control(false);assert.equal(timer,undefined);head=20;ctx.control(true);assert.equal(logs.length,2);timer();assert.equal(logs.length,2);
 head=21;timer();assert.equal(logs.length,3);assert.equal(ctx.control().rows,3);assert.throws(()=>ctx.control('false'),/boolean/);
 head=30;timer();assert.equal(logs.length,5);assert.equal(ctx.control().rows,5);assert.ok(statuses.some(s=>s.includes('overflow')));
});
