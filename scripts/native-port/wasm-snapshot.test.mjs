import {createPagedWasmCheckpointStore} from '../../engines/browser-native/paged-snapshot.mjs';
import {pageKernelSourceSha256,createSnapshotPageKernel} from '../../engines/browser-native/snapshot-page-kernel.mjs';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {instrumentSnapshotWasm,createWasmCheckpointStore} from '../../engines/browser-native/wasm-snapshot.mjs';
import {createRollbackAudio} from '../../engines/browser-native/rollback-audio.mjs';
const str=s=>[s.length,...new TextEncoder().encode(s)],section=(id,a)=>[id,a.length,...a];
// Minimal real WASM memory/table/global fixture, with one immutable code entry.
const fixture=()=>Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,0,0]),...section(3,[1,0]),...section(4,[1,0x70,1,1,1]),...section(5,[1,1,1,4]),...section(6,[1,0x7f,1,0x41,42,0x0b]),...section(7,[3,...str('memory'),2,0,...str('__indirect_function_table'),1,0,...str('noop'),0,0]),...section(10,[1,2,0,0x0b])]);
async function runtime(){const {bytes,audit}=instrumentSnapshotWasm(fixture()),{instance}=await WebAssembly.instantiate(bytes);return {instance,audit,module:{HEAPU8:new Uint8Array(instance.exports.memory.buffer)}};}
for(const createStore of [createWasmCheckpointStore,createPagedWasmCheckpointStore]){
test('checkpoints restore every memory byte, mutable globals and journal state; hashes detect differences',async()=>{
 const r=await runtime(),audio=createRollbackAudio(),store=createStore({...r,host:audio});r.module.HEAPU8[700]=19;audio.request({action:0,path:'track',volume:200});const initial=store.capture(),hash=await store.hash(initial);
 r.module.HEAPU8[700]=77;r.instance.exports.__checkpoint_global_0.value=99;audio.request({action:1});const changed=store.capture();assert.notEqual((await store.hash(changed)).stateSha256,hash.stateSha256);assert.equal(store.compare(initial,changed).changedBytes,1);assert.equal(store.compare(initial,changed).hostChanged,true);
 store.restore(initial);assert.equal(r.module.HEAPU8[700],19);assert.equal(r.instance.exports.__checkpoint_global_0.value,42);assert.equal(audio.snapshot().state.active,true);assert.equal(audio.snapshot().presented,0);
 const restored=store.capture();assert.deepEqual(await store.hash(restored),hash);store.release(initial);assert.throws(()=>store.restore(initial),/Unknown/);store.dispose();assert.equal(store.retainedBytes,0);
});
test('live renderers, table changes, memory growth and snapshot budgets fail before memory rewind',async()=>{
 const r=await runtime(),store=createStore({...r,maxBytes:65536}),initial=store.capture();r.module.HEAPU8[100]=1;assert.throws(()=>store.capture(),/budget/);r.module.onNativeDraw=()=>{};assert.throws(()=>store.restore(initial),/detached/);delete r.module.onNativeDraw;
 r.instance.exports.__indirect_function_table.set(0,r.instance.exports.noop);assert.throws(()=>store.restore(initial),/table changed/);r.instance.exports.__indirect_function_table.set(0,null);
 r.instance.exports.memory.grow(1);r.module.HEAPU8=new Uint8Array(r.instance.exports.memory.buffer);r.module.HEAPU8[700]=45;assert.throws(()=>store.restore(initial),/growth/);assert.equal(r.module.HEAPU8[700],45);assert.throws(()=>store.restore({byteLength:65536}),/Unknown/);store.dispose();
});
test('unaudited WASM global layouts are rejected instead of silently omitted',()=>{const bytes=fixture(),index=bytes.findIndex((b,i)=>b===0x7f&&bytes[i+1]===1&&bytes[i+2]===0x41);bytes[index+1]=0;assert.throws(()=>instrumentSnapshotWasm(bytes),/global layout/);});

test("aborted runtimes cannot be rewound into apparently healthy instances",async()=>{const r=await runtime(),health={aborted:false},store=createStore({...r,health}),s=store.capture();health.aborted=true;r.module.HEAPU8[99]=7;assert.throws(()=>store.restore(s),/Aborted/);assert.equal(r.module.HEAPU8[99],7);store.dispose();});

}

test('shared pages remain exact after random writes, ancestor release and branching restores',async()=>{
 const r=await runtime();r.instance.exports.memory.grow(3);r.module.HEAPU8=new Uint8Array(r.instance.exports.memory.buffer);
 const full=createWasmCheckpointStore(r),paged=createPagedWasmCheckpointStore(r),history=[];let seed=17;
 for(let frame=0;frame<40;frame++){
  for(let j=0;j<12;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;r.module.HEAPU8[seed%r.module.HEAPU8.length]^=seed>>>24;}
  r.module.HEAPU8[(frame%4+1)*65536-1]^=1;r.instance.exports.__checkpoint_global_0.value=frame;
  const pair=[full.capture(),paged.capture()];history.push(pair);assert.deepEqual(await paged.hash(pair[1]),await full.hash(pair[0]));
  if(frame%4===3){const old=history[frame-2];full.release(old[0]);paged.release(old[1]);history[frame-2]=null;}
  if(frame%7===6){const old=history[frame-3]??history[0];paged.restore(old[1]);const probe=full.capture();assert.deepEqual(await full.hash(probe),await full.hash(old[0]));full.release(probe);}
 }
 const last=paged.capture(),unchanged=paged.capture();assert.equal(paged.compare(last,unchanged).changedBytes,0);
 assert(paged.metrics().sharedPages>0);assert(paged.retainedBytes<full.retainedBytes+2*r.module.HEAPU8.length);
 full.dispose();paged.dispose();assert.equal(paged.retainedBytes,0);
});

test('zero pages share one immutable allocation and failed capture returns temporary slots',async()=>{
 assert.equal(createHash('sha256').update(readFileSync(new URL('../../engines/browser-native/snapshot-page-kernel.wat',import.meta.url))).digest('hex'),pageKernelSourceSha256);
 const r=await runtime();r.instance.exports.memory.grow(3);r.module.HEAPU8=new Uint8Array(r.instance.exports.memory.buffer);
 const store=createPagedWasmCheckpointStore({...r,maxBytes:2*65536}),initial=store.capture();assert.equal(store.retainedBytes,65536);
 r.module.HEAPU8[1]=17;r.module.HEAPU8[65537]=19;
 for(let i=0;i<4;i++){assert.throws(()=>store.capture(),/budget/);assert.equal(store.retainedBytes,65536);}
 store.restore(initial);assert.equal(r.module.HEAPU8.some(Boolean),false);
 r.module.HEAPU8[1]=9;const changed=store.capture();assert.equal(store.retainedBytes,2*65536);store.release(initial);
 r.module.HEAPU8.fill(42);store.restore(changed);assert.equal(r.module.HEAPU8[1],9);assert.equal(r.module.HEAPU8[65537],0);
 store.dispose();assert.equal(store.retainedBytes,0);
});

test('SIMD page comparison checks every byte lane and the final vector',()=>{
 const live=new WebAssembly.Memory({initial:1,maximum:32768}),kernel=createSnapshotPageKernel(live);assert.ok(kernel);const bytes=new Uint8Array(live.buffer);assert.equal(kernel.equal(0,0),1);
 for(const at of [...Array.from({length:64},(_,i)=>i),...Array.from({length:64},(_,i)=>65536-64+i)]){bytes[at]=255;assert.equal(kernel.equal(0,0),0,'byte '+at);bytes[at]=0;assert.equal(kernel.equal(0,0),1);}
});

async function dirtyRuntime(){
 const r=await runtime();r.instance.exports.memory.grow(3);r.module.HEAPU8=new Uint8Array(r.instance.exports.memory.buffer);r.dirty=new Uint8Array(524288);r.audit.wasmSha256='fixture';r.audit.instrumentedSha256='instrumented-fixture';
 r.module.__dirtyMark=(offset,size)=>{if(size)r.dirty.fill(1,Math.floor(offset/4096),Math.ceil((offset+size)/4096));};return r;
}
test('sparse checkpoints match full memory/globals/journal through renderer consumption, branching and releases',async()=>{
 const {createRenderReplica}=await import('../../engines/browser-native/render-replica.mjs');
 const r=await dirtyRuntime(),target=await dirtyRuntime(),audio=createRollbackAudio(),renderAudio=createRollbackAudio(),full=createWasmCheckpointStore({...r,host:audio}),sparse=createPagedWasmCheckpointStore({...r,host:audio,sparse:true,auditSparse:true}),replica=createRenderReplica(r,target,{sourceHost:audio,targetHost:renderAudio,copyMode:'dirty',auditDirty:true}),history=[];
 let seed=31;const write=(runtime,at,value)=>{runtime.module.__dirtyMark(at,1);runtime.module.HEAPU8[at]=value;};
 for(let frame=0;frame<80;frame++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;write(r,seed%r.module.HEAPU8.length,frame);write(r,65535+(frame%2),frame+1);r.instance.exports.__checkpoint_global_0.value=frame;
  audio.request({action:0,path:'track-'+frame%3,volume:frame});
  // Presentation consumes its own dirty history between checkpoint captures.
  replica.present(()=>({dispose(){}}),()=>{write(target,131073,255);target.instance.exports.__checkpoint_global_0.value=900;renderAudio.request({action:1});});
  const pair=[full.capture(),sparse.capture()];history.push(pair);assert.deepEqual(await sparse.hash(pair[1]),await full.hash(pair[0]));
  if(frame%5===4){const older=history.slice(0,frame-1).findLast(Boolean);write(r,196609,99);sparse.restore(older[1]);const actual=full.capture();assert.deepEqual(await full.hash(actual),await full.hash(older[0]));full.release(actual);replica.present(()=>({dispose(){}}),()=>assert.deepEqual(target.module.HEAPU8,r.module.HEAPU8));}
  if(frame%4===3){const released=history[frame-1];full.release(released[0]);sparse.release(released[1]);history[frame-1]=null;}
 }
 assert.ok(sparse.metrics().sparseSkippedCapturePages>0);assert.ok(sparse.metrics().sparseSkippedRestorePages>0);assert.ok(sparse.metrics().restoreAudits>0);assert.equal(audio.snapshot().presented,0);
 replica.dispose();sparse.dispose();full.dispose();
});
test('unchanged sparse restore copies no memory but restores globals/journal; releasing baseline forces full coverage',async()=>{
 const r=await dirtyRuntime(),host=createRollbackAudio(),store=createPagedWasmCheckpointStore({...r,host,sparse:true,auditSparse:true}),first=store.capture();
 r.instance.exports.__checkpoint_global_0.value=99;host.request({action:0,path:'changed',volume:10});store.restore(first);assert.equal(store.metrics().restoredBytes,0);assert.equal(r.instance.exports.__checkpoint_global_0.value,42);assert.equal(host.snapshot().journaled,0);
 r.module.__dirtyMark(65535,2);r.module.HEAPU8[65535]=3;r.module.HEAPU8[65536]=7;const second=store.capture();store.release(second);const before=store.metrics().restoredBytes;store.restore(first);assert.equal(store.metrics().restoredBytes-before,r.module.HEAPU8.length);assert.ok(r.module.HEAPU8.every(x=>x===0));store.dispose();
});
test('full audits reject untracked capture and restore writes instead of silently trusting the bitmap',async()=>{
 for(const operation of ['capture','restore']){const r=await dirtyRuntime(),store=createPagedWasmCheckpointStore({...r,sparse:true,auditSparse:true}),initial=store.capture();r.module.HEAPU8[200000]=1;
  assert.throws(()=>operation==='capture'?store.capture():store.restore(initial),/Untracked checkpoint capture|differs from full restore/);store.dispose();}
 const r=await dirtyRuntime(),store=createPagedWasmCheckpointStore({...r,sparse:true}),initial=store.capture();r.module.onNativeImmediate=()=>{};assert.throws(()=>store.restore(initial),/detached/);delete r.module.onNativeImmediate;r.instance.exports.__indirect_function_table.set(0,r.instance.exports.noop);assert.throws(()=>store.restore(initial),/table changed/);store.dispose();
 const unaudited=await runtime();assert.throws(()=>createPagedWasmCheckpointStore({...unaudited,sparse:true}),/audited/);
});

test('replica synchronization broadcasts destination writes to an independent checkpoint subscriber',async()=>{
 const {createRenderReplica}=await import('../../engines/browser-native/render-replica.mjs');
 for(const copyMode of ['full','dirty']){
  const source=await dirtyRuntime(),target=await dirtyRuntime(),reference=createWasmCheckpointStore(source),store=createPagedWasmCheckpointStore({...target,sparse:true,auditSparse:true}),replica=createRenderReplica(source,target,{copyMode});store.capture();
  for(const at of [0,65535,65536,200000]){source.module.__dirtyMark(at,1);source.module.HEAPU8[at]=17;replica.present(()=>({dispose(){}}),()=>{});const a=reference.capture(),b=store.capture();assert.deepEqual(await store.hash(b),await reference.hash(a));reference.release(a);}
  replica.dispose();store.dispose();reference.dispose();
 }
});
