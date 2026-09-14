import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {patchGpuTaskScheduling} from './patch-gpu-task-scheduling.mjs';
test('message scheduling yields, balances runtime lifetime, closes on stop and unwind',()=>{
  for(const unwind of [false,true]){
    const queue=[];let alive=0,closed=0,runs=0,timers=0;
    const context=vm.createContext({MessageChannel:class{
      constructor(){this.port1={close(){closed++;}};this.port2={close(){closed++;},postMessage:()=>queue.push(()=>this.port1.onmessage())};}
    },runtimeKeepalivePush(){alive++;},runtimeKeepalivePop(){alive--;},
    callUserCallback:fn=>fn(),getWasmTableEntry:()=>((time,data)=>{assert.equal(time,123);assert.equal(data,99);runs++;if(runs===2&&unwind)throw Error('unwind');return runs<2;}),
    _emscripten_get_now:()=>123,setTimeout(){timers++;}});
    vm.runInContext(patchGpuTaskScheduling('var _emscripten_set_timeout_loop=(cb,msecs,userData)=>{return setTimeout(()=>{},msecs)};'),context);
    vm.runInContext('_emscripten_set_timeout_loop(1,0,99)',context);
    assert.equal(runs,0);assert.equal(alive,1);assert.equal(queue.length,1);
    queue.shift()();assert.equal(runs,1);assert.equal(alive,1);assert.equal(queue.length,1);
    if(unwind)assert.throws(()=>queue.shift()(),/unwind/);else queue.shift()();
    assert.equal(runs,2);assert.equal(alive,0);assert.equal(closed,2);assert.equal(queue.length,0);
    vm.runInContext('_emscripten_set_timeout_loop(1,10,99)',context);assert.equal(timers,1);
  }
  assert.throws(()=>patchGpuTaskScheduling('changed'),/Unexpected/);
});

test('parked GPU tasks retain lifetime and resume through a task after notification',async()=>{
  for(const race of [false,true]){
    const queue=[];let alive=0,closed=0,runs=0,wake,waits=0;
    const memory=new Int32Array(new SharedArrayBuffer(16));memory[1]=1;
    const context=vm.createContext({Module:{_meleeGpuWaitAddress:4},HEAP32:memory,
      Atomics:{load:Atomics.load,waitAsync(array,index,value,timeout){
        assert.equal(array,memory);assert.equal(index,1);assert.equal(value,1);assert.equal(timeout,100);waits++;
        return race?{async:false,value:'not-equal'}:{async:true,value:new Promise(resolve=>{wake=resolve;})};
      }},MessageChannel:class{
        constructor(){this.port1={close(){closed++;}};this.port2={close(){closed++;},postMessage:()=>queue.push(()=>this.port1.onmessage())};}
      },runtimeKeepalivePush(){alive++;},runtimeKeepalivePop(){alive--;},
      callUserCallback:fn=>fn(),getWasmTableEntry:()=>()=>{runs++;return false;},_emscripten_get_now:()=>0});
    vm.runInContext(patchGpuTaskScheduling('var _emscripten_set_timeout_loop=(cb,msecs,userData)=>{};'),context);
    vm.runInContext('_emscripten_set_timeout_loop(1,0,99)',context);
    assert.equal(waits,1);assert.equal(alive,1);assert.equal(runs,0);
    if(!race){assert.equal(queue.length,0);wake('ok');await Promise.resolve();assert.equal(runs,0);}
    assert.equal(queue.length,1);queue.shift()();
    assert.equal(runs,1);assert.equal(alive,0);assert.equal(closed,2);
  }
});
