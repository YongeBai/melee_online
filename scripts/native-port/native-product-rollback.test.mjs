import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the real bridge with isolated native/GPU dependencies: no generated
// game core or proprietary fixture is needed to test validation scheduling.
const source=fs.readFileSync(new URL('../../engines/browser-native/native-product-rollback.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','return async function');
function fixture(){
 let checks=0,fail=false,disposed=0;
 const module={HEAPU8:new Uint8Array(65536),_portTapJumpSet(){},_portControllerSample(){}},audio={beginFrame(){},confirm(){}},session={snapshot:()=>({}),dispose(){}},driver={dispose(){}},store={capture:()=>({}),restore(){},release(){},dispose(){},metrics:()=>({})};
 const dependencies={create(){},createSnapshotRuntime:async()=>({module}),createRollbackAudio:()=>audio,createPresentationCache:()=>({snapshot:()=>({}),dispose(){}}),createRenderReplica:()=>({present:(construct,draw)=>{const r=construct(module);try{return draw(r);}finally{r.dispose();}},metrics:()=>({}),dispose(){}}),createPagedWasmCheckpointStore:()=>store,createRollbackSession:()=>session,createNativeRollbackDriver:()=>driver};
 const factory=new Function(...Object.keys(dependencies),source)(...Object.values(dependencies));
 return {factory,options:{source:{module},wasmBytes:new Uint8Array(),audio,network:{active:true,seat:0},step(){},createPreview:()=>({draw:()=>({}),validateGpu(){checks++;if(fail)throw Error('GPU failure');return true;},dispose(){disposed++;}})},get checks(){return checks;},get disposed(){return disposed;},set fail(value){fail=value;}};
}
test('product GPU validation is deferred to boundaries and still propagates errors',async()=>{
 const f=fixture(),p=await f.factory(f.options);assert.equal(f.checks,1);assert.equal(f.disposed,30);
 for(let i=0;i<60;i++)p.preview.draw();assert.equal(f.checks,1);assert.equal(f.disposed,90);
 assert.equal(p.preview.validateGpu(),true);assert.equal(f.checks,2);
 f.fail=true;assert.throws(()=>p.preview.validateGpu(),/GPU failure/);p.preview.dispose();
});
test('every-frame diagnostic validation remains available',async()=>{
 const f=fixture(),p=await f.factory({...f.options,validateEveryFrame:true});assert.equal(f.checks,31);
 p.preview.draw();assert.equal(f.checks,32);f.fail=true;assert.throws(()=>p.preview.draw(),/GPU failure/);p.preview.dispose();
});
