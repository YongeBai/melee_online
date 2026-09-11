import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Exercise the actual EM_JS compile body against real WASM modules and tables.
const cpp = readFileSync(resolve(import.meta.dirname, '../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp'), 'utf8');
const start = cpp.indexOf('EM_JS(int, DolphinWeb_CachedInterpreterCompileWasmBlock,');
const bodyStart = cpp.indexOf('), {', start) + 4;
const bodyEnd = cpp.indexOf('\n});', bodyStart);
const body = cpp.slice(bodyStart, bodyEnd);
const indices = ['read_u32','write_u32','read_u8','write_u8','read_u16','write_u16','lfs','stfs','lfd','fmr','system','fp','fctiwz','interpret','fastcheck_gpfifo','fast_os_interrupt_call','fast_melee_input_status_call','fast_melee_status_call','fast_melee_service_poll_call'].map(n=>n+'_index');
const names = ['Module','wasmMemory','wasmTable','UTF8ToString','_DolphinWeb_RecordModuleUs','_DolphinWeb_RecordCacheMiss','_DolphinWeb_RecordCacheHit','_DolphinWeb_RecordInstanceUs','_DolphinWeb_RecordInstanceReuse','_DolphinWeb_RecordUniqueInstance','bytes_ptr','bytes_len','cache_key_ptr',...indices];
const compile = new Function(...names, body);
const bytes = Uint8Array.from([0,97,115,109,1,0,0,0,1,6,1,96,1,127,1,127,3,2,1,0,7,5,1,1,102,0,0,10,9,1,7,0,32,0,65,1,106,11]);
function fixture() {
  const table = new WebAssembly.Table({initial:1,element:'anyfunc'});
  const fn = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.f;
  table.set(0,fn);
  const memory = new WebAssembly.Memory({initial:1});
  const module = { HEAPU8: bytes, _dolphinJitCache: new Map() };
  const stats = { reused:0, unique:0 };
  return {table,memory,module,stats,run(key='digest-A',mem=memory) {
    return compile(module,mem,table,x=>x,()=>{},()=>{},()=>{},()=>{},()=>stats.reused++,()=>stats.unique++,0,bytes.length,key,...indices.map(()=>0));
  }};
}
test('regenerated descriptors reuse real executable instance and table entry',()=>{
  const f=fixture(),a=f.run(),b=f.run();
  assert.equal(a,b);assert.equal(f.table.length,2);assert.equal(f.table.get(b)(41),42);
  assert.deepEqual(f.stats,{reused:1,unique:1});
});
test('different code keys, changed imports and changed memory cannot reuse instance',()=>{
  const f=fixture(),a=f.run(),b=f.run('digest-B');assert.notEqual(a,b);
  f.table.set(0,new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.f);
  const c=f.run();assert.notEqual(a,c);
  const d=f.run('digest-A',new WebAssembly.Memory({initial:1}));assert.notEqual(c,d);
  assert.equal(f.module._dolphinJitInstanceCount,4);
});
test('unique count and byte budgets reject growth but allow known callable reuse',()=>{
  const f=fixture(),a=f.run();f.module._dolphinJitInstanceCount=65536;
  assert.equal(f.run(),a);assert.equal(f.run('new'),0);
  f.module._dolphinJitInstanceCount=1;f.module._dolphinJitInstanceBytes=67108864;
  assert.equal(f.run(),a);assert.equal(f.run('new'),0);assert.equal(f.table.length,2);
});
test('changed executable bytes with a new digest produce the new behavior',()=>{
  const f=fixture(),a=f.run();const changed=bytes.slice();changed[changed.length-3]=2;
  f.module.HEAPU8=changed;const b=f.run('digest-of-changed-code');
  assert.notEqual(a,b);assert.equal(f.table.get(a)(41),42);assert.equal(f.table.get(b)(41),43);
});
test('failed digest cannot alias another executable',()=>{
  const f=fixture();assert.equal(f.run(''),0);assert.equal(f.table.length,1);
});
