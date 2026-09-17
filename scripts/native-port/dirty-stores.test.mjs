import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {instrumentDirtyStores} from './instrument-dirty-stores.mjs';
const assembler=path.resolve(import.meta.dirname,'../../.browser-tools/emsdk/upstream/bin/wasm-as');
const wrap=body=>`(module (memory $0 2 32768) (export "memory" (memory $0)) ${body})`;
async function compile(wat){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dirty-stores-'));try{fs.writeFileSync(dir+'/test.wat',wat);execFileSync(assembler,[dir+'/test.wat','--all-features','-o',dir+'/test.wasm']);return (await WebAssembly.instantiate(fs.readFileSync(dir+'/test.wasm'))).instance.exports;}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('all scalar stores, offsets, page crossings and bulk writes preserve bytes and mark every destination',{skip:!fs.existsSync(assembler)},async()=>{
 const stores=['i32.store','i32.store8','i32.store16','i64.store','i64.store8','i64.store16','i64.store32','f32.store','f64.store'];
 const wat=wrap(stores.map((op,i)=>`(func (export "s${i}") (param $p i32) (${op} offset=3 (local.get $p) (${op.split('.')[0]}.const 7)))`).join('\n')+`(func (export "copy") (param $p i32) (param $s i32) (param $n i32) (memory.copy (local.get $p) (local.get $s) (local.get $n))) (func (export "fill") (param $p i32) (param $n i32) (memory.fill (local.get $p) (i32.const 99) (local.get $n)))`);
 const {wat:tracked,counts}=instrumentDirtyStores(wat),a=await compile(wat),b=await compile(tracked),flags=new Uint8Array(b.__dirty_memory.buffer);assert.deepEqual(counts,{stores:9,copy:1,fill:1});
 for(let i=0;i<stores.length;i++){flags.fill(0);a['s'+i](4092);b['s'+i](4092);assert.equal(flags[0],1);const size=Number(stores[i].match(/store(\d+)/)?.[1]??stores[i].match(/^[if](\d+)/)[1])/8;assert.equal(flags[1],size>1?1:0);assert.deepEqual(new Uint8Array(b.memory.buffer),new Uint8Array(a.memory.buffer));}
 flags.fill(0);a.fill(8000,10000);b.fill(8000,10000);assert.deepEqual([...flags.slice(0,6)],[0,1,1,1,1,0]);
 flags.fill(0);a.copy(10000,8000,16000);b.copy(10000,8000,16000);assert.deepEqual([...flags.slice(0,8)],[0,0,1,1,1,1,1,0]);assert.deepEqual(new Uint8Array(b.memory.buffer),new Uint8Array(a.memory.buffer));
 flags.fill(0);b.fill(131072,0);assert(flags.every(v=>v===0));assert.throws(()=>b.fill(131073,0),WebAssembly.RuntimeError);assert.throws(()=>b.s0(0xffffffff),WebAssembly.RuntimeError);assert.throws(()=>a.s0(0xffffffff),WebAssembly.RuntimeError);
 b.__dirty_mark(60000,9000);assert.equal(flags[14],1);assert.equal(flags[16],1);assert.throws(()=>b.__dirty_mark(131070,4),WebAssembly.RuntimeError);
});
test('dirty transform rejects unaudited memory opcodes and explicit foreign memory operands',()=>{
 for(const op of ['memory.init','memory.grow','v128.store','i32.atomic.store'])assert.throws(()=>instrumentDirtyStores(wrap(`(func (${op} (i32.const 0)))`)),/Unaudited/);
 assert.throws(()=>instrumentDirtyStores(wrap('(func (i32.store $other (i32.const 0) (i32.const 1)))')),/Unknown/);
});
test('aliased Emscripten import namespaces mark WASI outputs without invalidating draw callbacks',{skip:!fs.existsSync(assembler)},async()=>{
 const {createSnapshotRuntime}=await import('../../engines/browser-native/wasm-snapshot.mjs'),{createHash}=await import('node:crypto');
 const wat=`(module (import "env" "portDispatchObject" (func (param i32 i32 i32 i32 i32))) (import "wasi_snapshot_preview1" "fd_write" (func (param i32 i32 i32 i32) (result i32))) (memory $0 2 32768) (export "memory" (memory $0)) (table 1 1 funcref) (export "__indirect_function_table" (table 0)) (global (mut i32) (i32.const 1)) (func (i32.store (i32.const 0) (i32.const 1))))`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dirty-imports-'));try{
  fs.writeFileSync(dir+'/test.wat',instrumentDirtyStores(wat).wat);execFileSync(assembler,[dir+'/test.wat','--all-features','-o',dir+'/test.wasm']);const bytes=new Uint8Array(fs.readFileSync(dir+'/test.wasm'));let imports,instance;
  const create=opts=>new Promise(resolve=>{const shared={portDispatchObject(){},fd_write(fd,iov,count,pnum){new DataView(instance.exports.memory.buffer).setUint32(pnum,42,true);return 0;}};imports={env:shared,wasi_snapshot_preview1:shared};opts.instantiateWasm(imports,i=>{instance=i;resolve({HEAPU8:new Uint8Array(i.exports.memory.buffer)});});});
  const runtime=await createSnapshotRuntime(create,bytes,{dirtyManifest:{instrumentedSha256:createHash('sha256').update(bytes).digest('hex'),originalSha256:'fixture'}});runtime.dirty.fill(0);imports.env.portDispatchObject(0,0,0,0,0);assert(runtime.dirty.every(x=>x===0));imports.wasi_snapshot_preview1.fd_write(0,0,0,9000);assert.equal(runtime.dirty[2],1);assert.equal(runtime.dirty.reduce((a,b)=>a+b,0),1);assert.equal(new DataView(runtime.module.HEAPU8.buffer).getUint32(9000,true),42);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('dirty runtime rejects a changed host source before loading the instrumented core',async()=>{
 const {loadDirtyCore}=await import('../../engines/browser-native/dirty-runtime.mjs');const original=globalThis.fetch,seen=[];try{globalThis.fetch=async url=>{seen.push(url);return new Response(new Uint8Array([1,2,3]));};await assert.rejects(loadDirtyCore(),/Unaudited dirty host source/);assert.equal(seen.length,1);assert(!seen.includes('./melee-dirty.wasm'));}finally{globalThis.fetch=original;}
});
