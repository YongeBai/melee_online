import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {neutralBrowserPad} from '../engine/browser-rollback.js';
const source=readFileSync(new URL('../../engines/wasm-dolphin/src/upstream-discio-worker.js',import.meta.url),'utf8');
const marker='    case "browserRollback": {';
const start=source.indexOf(marker)+marker.length;
const end=source.indexOf('    case "validationSetCorePaused":',start);
assert.ok(start>marker.length&&end>start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const request=new AsyncFunction('api','payload','moduleInstance',source.slice(start,end).replace(/\}\s*$/,''));
function fixture() {
  const calls=[],module={HEAPU8:new Uint8Array(128),_malloc(n){calls.push(['malloc',n]);return 8;},_free(p){calls.push(['free',p]);}};
  const api={browserRollbackCapture(){},browserRollbackStep(){return 1;},
    browserRollbackSetPads(...args){calls.push(['pads',...args]);return 1;},
    getCoreStateName(){return 'Paused';},setCorePaused(value){calls.push(['pause',value]);return 1;},
    browserRollbackSetUnthrottled(value){calls.push(['speed',value]);return 1;},
  };return {calls,module,api,run(payload){return request(api,payload,module);}};
}
test('both complete pad records reach the core in one transaction',async()=>{
  const f=fixture(),a={...neutralBrowserPad(),mask:0x80000,stickX:230},b={...neutralBrowserPad(),mask:2,stickY:45};
  await f.run({action:'pads',frame:123,pads:[a,b]});
  assert.deepEqual([...new Uint32Array(f.module.HEAPU8.buffer,8,18)],[...Object.values(a),...Object.values(b)]);
  assert.deepEqual(f.calls,[['malloc',72],['pads',8,18,123],['free',8]]);
});
test('invalid second player cannot partially install first player input',async()=>{
  const f=fixture();await assert.rejects(f.run({action:'pads',frame:1,pads:[neutralBrowserPad(),{...neutralBrowserPad(),stickX:NaN}]}),/Invalid rollback pad/);
  assert.deepEqual(f.calls,[]);
});
test('a rejected core input transaction releases its allocation',async()=>{
  const f=fixture();f.api.browserRollbackSetPads=()=>0;
  await assert.rejects(f.run({action:'pads',frame:0,pads:[neutralBrowserPad(),neutralBrowserPad()]}),/paused machine/);
  assert.deepEqual(f.calls,[['malloc',72],['free',8]]);
});
test('failed unthrottled step restores normal speed and remains paused',async()=>{
  const f=fixture();f.api.browserRollbackGameStep=()=>{throw Error('step failure');};
  await assert.rejects(f.run({action:'step',unthrottled:true}),/step failure/);
  assert.deepEqual(f.calls,[['speed',1],['pause',1],['speed',0]]);
});
test('successful step reports both transition and wait duration',async()=>{
  const f=fixture(),result=await f.run({action:'step',unthrottled:true});
  assert.equal(result.state,'Paused');
  for(const key of ['milliseconds','transitionMilliseconds','waitMilliseconds'])assert.ok(Number.isFinite(result[key])&&result[key]>=0);
  assert.deepEqual(f.calls,[['speed',1],['pause',1],['speed',0]]);
});
test('release validates the slot and rejects a core without disposal support',async()=>{
  const f=fixture();
  await assert.rejects(f.run({action:'release',slot:0}),/release failed/);
  f.api.browserRollbackRelease=slot=>{f.calls.push(['release',slot]);return 1;};
  for(const slot of [-1,6,1.5,NaN])await assert.rejects(f.run({action:'release',slot}),/release failed/);
  assert.deepEqual(f.calls,[]);
  await f.run({action:'release',slot:5});
  assert.deepEqual(f.calls,[['release',5]]);
});
test('shared-memory completion wakes the actual worker step without timer polling',async()=>{
  const f=fixture();f.module.HEAPU8=new Uint8Array(new SharedArrayBuffer(128));
  const signal=new Int32Array(f.module.HEAPU8.buffer,8,1);let state='Paused';
  f.api.browserRollbackStepSignal=()=>8;f.api.getCoreStateName=()=>state;
  f.api.browserRollbackGameStep=()=>{
    state='Running';setImmediate(()=>{state='Paused';Atomics.add(signal,0,1);Atomics.notify(signal,0);});return 1;
  };
  const result=await f.run({action:'step',unthrottled:true});
  assert.equal(result.waitStrategy,'atomic-notification');assert.equal(result.waitWakeups,1);
  assert.equal(result.state,'Paused');
});
test('completion between the state check and wait cannot lose its notification',async()=>{
  const f=fixture();f.module.HEAPU8=new Uint8Array(new SharedArrayBuffer(128));
  const signal=new Int32Array(f.module.HEAPU8.buffer,8,1);let state='Paused';
  f.api.browserRollbackStepSignal=()=>8;f.api.getCoreStateName=()=>state;
  f.api.browserRollbackGameStep=()=>{state='Running';return 1;};
  f.api.pumpHostJobs=()=>{state='Paused';Atomics.add(signal,0,1);Atomics.notify(signal,0);};
  const result=await f.run({action:'step',unthrottled:true});
  assert.equal(result.waitStrategy,'atomic-notification');assert.equal(result.waitWakeups,1);
});
test('invalid completion pointer is rejected before starting execution',async()=>{
  const f=fixture();f.module.HEAPU8=new Uint8Array(new SharedArrayBuffer(128));
  f.api.browserRollbackStepSignal=()=>3;
  f.api.browserRollbackGameStep=()=>{assert.fail('must not step');};
  await assert.rejects(f.run({action:'step',unthrottled:true}),/Invalid frame completion signal/);
  assert.deepEqual(f.calls,[['speed',1],['pause',1],['speed',0]]);
});
test('cache fast-path comparison changes only its opt-in bit while paused',async()=>{
  const f=fixture();let mask=0x420000;
  f.api.getCachedInterpreterDisableMask=()=>mask;
  f.api.setCachedInterpreterDisableMask=next=>{mask=next;};
  assert.deepEqual(await f.run({action:'cacheFastPath',value:true}),{enabled:true});
  assert.equal(mask,0x1420000);
  await f.run({action:'cacheFastPath',value:false});assert.equal(mask,0x420000);
  await assert.rejects(f.run({action:'cacheFastPath',value:1}),/paused machine/);
  f.api.getCoreStateName=()=> 'Running';
  await assert.rejects(f.run({action:'cacheFastPath',value:true}),/paused machine/);
  assert.equal(mask,0x420000);
});

test('all optimization comparison gates preserve unrelated bits and require paused state',async()=>{
  for(const [action,bit] of [['cacheLoopBatch',25],['inlineDispatch',26],['wasmDispatch',27]]) {
    const f=fixture();let mask=0x1420000;
    f.api.getCachedInterpreterDisableMask=()=>mask;
    f.api.setCachedInterpreterDisableMask=next=>{mask=next;};
    assert.deepEqual(await f.run({action,value:true}),{enabled:true});
    assert.equal(mask,0x1420000|(1<<bit));
    await f.run({action,value:false});assert.equal(mask,0x1420000);
    await assert.rejects(f.run({action,value:'true'}),/paused machine/);
    f.api.getCoreStateName=()=> 'Running';
    await assert.rejects(f.run({action,value:true}),/paused machine/);
    assert.equal(mask,0x1420000);
  }
});

test('codegen comparison validates both flags before invoking the guarded core',async()=>{
  const f=fixture();f.api.browserRollbackConfigureCodegen=flags=>{f.calls.push(flags);return 1;};
  for(const regcache of [false,true])for(const fastmem of [false,true]){
    assert.deepEqual(await f.run({action:'codegen',regcache,fastmem}),{regcache,fastmem});
    assert.equal(f.calls.at(-1),(regcache?1:0)|(fastmem?2:0));
  }
  await assert.rejects(f.run({action:'codegen',regcache:1,fastmem:true}),/paused/);
  assert.equal(f.calls.length,4);
  f.api.browserRollbackConfigureCodegen=()=>0;
  await assert.rejects(f.run({action:'codegen',regcache:true,fastmem:false}),/paused/);
});
