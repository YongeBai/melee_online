import test from 'node:test';import assert from 'node:assert/strict';
import {instrumentSnapshotWasm,createWasmCheckpointStore} from '../../engines/browser-native/wasm-snapshot.mjs';
import {createRollbackAudio} from '../../engines/browser-native/rollback-audio.mjs';
const str=s=>[s.length,...new TextEncoder().encode(s)],section=(id,a)=>[id,a.length,...a];
// Minimal real WASM memory/table/global fixture, with one immutable code entry.
const fixture=()=>Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,0,0]),...section(3,[1,0]),...section(4,[1,0x70,1,1,1]),...section(5,[1,1,1,4]),...section(6,[1,0x7f,1,0x41,42,0x0b]),...section(7,[3,...str('memory'),2,0,...str('__indirect_function_table'),1,0,...str('noop'),0,0]),...section(10,[1,2,0,0x0b])]);
async function runtime(){const {bytes,audit}=instrumentSnapshotWasm(fixture()),{instance}=await WebAssembly.instantiate(bytes);return {instance,audit,module:{HEAPU8:new Uint8Array(instance.exports.memory.buffer)}};}
test('checkpoints restore every memory byte, mutable globals and journal state; hashes detect differences',async()=>{
 const r=await runtime(),audio=createRollbackAudio(),store=createWasmCheckpointStore({...r,host:audio});r.module.HEAPU8[700]=19;audio.request({action:0,path:'track',volume:200});const initial=store.capture(),hash=await store.hash(initial);
 r.module.HEAPU8[700]=77;r.instance.exports.__checkpoint_global_0.value=99;audio.request({action:1});const changed=store.capture();assert.notEqual((await store.hash(changed)).stateSha256,hash.stateSha256);assert.equal(store.compare(initial,changed).changedBytes,1);assert.equal(store.compare(initial,changed).hostChanged,true);
 store.restore(initial);assert.equal(r.module.HEAPU8[700],19);assert.equal(r.instance.exports.__checkpoint_global_0.value,42);assert.equal(audio.snapshot().state.active,true);assert.equal(audio.snapshot().presented,0);
 const restored=store.capture();assert.deepEqual(await store.hash(restored),hash);store.release(initial);assert.throws(()=>store.restore(initial),/Unknown/);store.dispose();assert.equal(store.retainedBytes,0);
});
test('live renderers, table changes, memory growth and snapshot budgets fail before memory rewind',async()=>{
 const r=await runtime(),store=createWasmCheckpointStore({...r,maxBytes:65536}),initial=store.capture();assert.throws(()=>store.capture(),/budget/);r.module.onNativeDraw=()=>{};assert.throws(()=>store.restore(initial),/detached/);delete r.module.onNativeDraw;
 r.instance.exports.__indirect_function_table.set(0,r.instance.exports.noop);assert.throws(()=>store.restore(initial),/table changed/);r.instance.exports.__indirect_function_table.set(0,null);
 r.instance.exports.memory.grow(1);r.module.HEAPU8=new Uint8Array(r.instance.exports.memory.buffer);r.module.HEAPU8[700]=45;assert.throws(()=>store.restore(initial),/growth/);assert.equal(r.module.HEAPU8[700],45);assert.throws(()=>store.restore({byteLength:65536}),/Unknown/);store.dispose();
});
test('unaudited WASM global layouts are rejected instead of silently omitted',()=>{const bytes=fixture(),index=bytes.findIndex((b,i)=>b===0x7f&&bytes[i+1]===1&&bytes[i+2]===0x41);bytes[index+1]=0;assert.throws(()=>instrumentSnapshotWasm(bytes),/global layout/);});

test("aborted runtimes cannot be rewound into apparently healthy instances",async()=>{const r=await runtime(),health={aborted:false},store=createWasmCheckpointStore({...r,health}),s=store.capture();health.aborted=true;r.module.HEAPU8[99]=7;assert.throws(()=>store.restore(s),/Aborted/);assert.equal(r.module.HEAPU8[99],7);store.dispose();});
