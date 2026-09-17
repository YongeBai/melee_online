import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createRenderReplica} from '../../engines/browser-native/render-replica.mjs';
import {instrumentSnapshotWasm,createWasmCheckpointStore} from '../../engines/browser-native/wasm-snapshot.mjs';
import {createRollbackAudio} from '../../engines/browser-native/rollback-audio.mjs';
const section=(id,b)=>[id,b.length,...b],str=s=>[s.length,...Buffer.from(s)];
const fixture=()=>Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,1,0x7f,0]),...section(3,[1,0]),...section(4,[1,0x70,1,1,1]),...section(5,[1,1,1,4]),...section(6,[1,0x7f,1,0x41,42,0x0b]),...section(7,[3,...str('memory'),2,0,...str('__indirect_function_table'),1,0,...str('write'),0,0]),...section(10,[1,9,0,0x41,0,0x20,0,0x36,2,0,0x0b])]);
async function runtime(pages=2){const original=fixture(),{bytes,audit}=instrumentSnapshotWasm(original,{memoryInitialPages:pages}),{instance}=await WebAssembly.instantiate(bytes);return {instance,audit:{...audit,wasmSha256:createHash('sha256').update(original).digest('hex')},module:{HEAPU8:new Uint8Array(instance.exports.memory.buffer),_write:instance.exports.write},health:{aborted:false}};}
test('native render stores, allocator-like bytes, globals and journals stay out of gameplay across rewind',async()=>{
 const source=await runtime(),target=await runtime(),audio=createRollbackAudio(),renderAudio=createRollbackAudio(),store=createWasmCheckpointStore({...source,host:audio}),replica=createRenderReplica(source,target,{sourceHost:audio,targetHost:renderAudio});
 source.module.HEAPU8.fill(7);audio.request({action:0,path:'game',volume:100});const first=store.capture(),initialHash=await store.hash(first);let retired=0;
 for(let i=0;i<12;i++){
  if(i%3===0)store.restore(first);source.module._write(i);source.module.HEAPU8[65537]=i+30;
  const expected=source.module.HEAPU8.slice(),globals=source.instance.exports.__checkpoint_global_0.value,journal=audio.capture();
  replica.present(module=>{assert.equal(module,target.module);assert.deepEqual(module.HEAPU8,expected);assert.deepEqual(renderAudio.capture(),journal);module.onNativeDraw=()=>{};return {dispose(){delete module.onNativeDraw;retired++;}};},()=>{target.module._write(12345);target.module.HEAPU8[65537]=255;target.instance.exports.__checkpoint_global_0.value=99;renderAudio.request({action:1});});
  assert.deepEqual(source.module.HEAPU8,expected);assert.equal(source.instance.exports.__checkpoint_global_0.value,globals);assert.deepEqual(audio.capture(),journal);
 }
 assert.equal(retired,12);assert.equal(replica.metrics().frames,12);assert.equal(replica.metrics().copiedBytes,12*131072);
 store.restore(first);const restored=store.capture();assert.deepEqual(await store.hash(restored),initialHash);replica.dispose();assert.throws(()=>replica.present(()=>{},()=>{}),/unavailable/);
});
test('replica guards reject aliased runtimes, incompatible code, live owners, table changes and growth',async()=>{
 const a=await runtime(),b=await runtime();assert.throws(()=>createRenderReplica(a,a),/independent/);assert.throws(()=>createRenderReplica(a,{...b,audit:{...b.audit,wasmSha256:'different'}}),/identity/);const replica=createRenderReplica(a,b);
 b.module.onNativeDraw=()=>{};assert.throws(()=>replica.present(()=>{},()=>{}),/detached/);delete b.module.onNativeDraw;
 b.instance.exports.__indirect_function_table.set(0,b.instance.exports.write);assert.throws(()=>replica.present(()=>{},()=>{}),/table/);b.instance.exports.__indirect_function_table.set(0,null);
 b.instance.exports.memory.grow(1);assert.throws(()=>replica.present(()=>{},()=>{}),/growth|views/);
 for(const pages of [0,5,1.5])assert.throws(()=>instrumentSnapshotWasm(fixture(),{memoryInitialPages:pages}),/initial memory/);
 assert.equal((await runtime(3)).module.HEAPU8.length,3*65536);
});
test('a failed draw disposes native receivers before another mirror overwrite',async()=>{
 const a=await runtime(),b=await runtime(),r=createRenderReplica(a,b);let disposed=0;
 const construct=m=>{m.onNativeDraw=()=>{};return {dispose(){delete m.onNativeDraw;disposed++;}};};
 assert.throws(()=>r.present(construct,()=>{throw Error('draw fault');}),/draw fault/);assert.equal(disposed,1);
 r.present(construct,()=>42);assert.equal(disposed,2);assert.equal(r.metrics().frames,1);
});
test('dirty replica copies the union of game and renderer writes and detects an unmarked host write',async()=>{
 const a=await runtime(),b=await runtime();for(const r of [a,b]){r.dirty=new Uint8Array(524288);r.audit.instrumentedSha256='test-instrumented';}
 const replica=createRenderReplica(a,b,{copyMode:'dirty',auditDirty:true}),empty=()=>({dispose(){}});
 assert.throws(()=>createRenderReplica(a,b,{copyMode:'dirty'}),/exclusive/);
 a.module.HEAPU8.fill(7);replica.present(empty,()=>{});assert.equal(replica.metrics().fullCopies,1);
 a.module.HEAPU8[5000]=19;a.dirty[1]=1;b.module.HEAPU8[9000]=33;b.dirty[2]=1;
 replica.present(empty,()=>assert.deepEqual(b.module.HEAPU8,a.module.HEAPU8));assert.equal(replica.metrics().copiedBytes,131072+8192);assert.equal(replica.metrics().dirtyPages,2);assert.equal(replica.metrics().coverageAudits,2);
 a.module.HEAPU8[18000]=91;assert.throws(()=>replica.present(empty,()=>assert.fail('Stale data reached renderer')),/Untracked presentation write/);
 replica.dispose();const next=createRenderReplica(a,b,{copyMode:'dirty',auditDirty:true});replica.dispose();assert.throws(()=>createRenderReplica(a,b,{copyMode:'dirty'}),/exclusive/);next.present(empty,()=>assert.deepEqual(a.module.HEAPU8,b.module.HEAPU8));next.dispose();
});
