import test from'node:test';import assert from'node:assert/strict';import{benchmarkPad,withBenchmarkInput}from'./browser-benchmark-input.js';
const state={major:2,minor:2,sceneKind:2,sceneFrame:100,fighters:[{port:0,x:-20,stocks:4},{port:1,x:15,stocks:4}]};
test('stress uses bounded ordinary controls and never sends Start or menu input',()=>{
 for(let frame=0;frame<216;frame++){const p=benchmarkPad({...state,sceneFrame:frame});assert.equal(p.mask&16,0);assert.ok(Object.values(p).every(v=>v>=0&&v<=255));}
 assert.equal(benchmarkPad({...state,minor:0}).mask,0);
 assert.equal(benchmarkPad({...state,fighters:[]}).stickX,128);
 assert.ok(benchmarkPad({...state,fighters:[{port:0,x:70,stocks:4},state.fighters[1]]}).stickX<128);
});
test('failed stress measurement releases inputs and its timer',async()=>{
 const pads=[],cancelled=[];
 await assert.rejects(withBenchmarkInput(()=>state,p=>pads.push(p),async()=>{throw Error('match ended');},{schedule:()=>42,cancel:id=>cancelled.push(id)}),/match ended/);
 assert.deepEqual(cancelled,[42]);assert.equal(pads.at(-1).mask,0);assert.equal(pads.at(-1).stickX,128);
});

test('two human tracks exercise both players without pause or frame-step requests',async()=>{
 const {withTwoPlayerBenchmarkInput}=await import('./browser-benchmark-input.js');
 const s={...state,sceneFrame:0,fighters:state.fighters.map(f=>({...f,slotType:0,controllerIndex:f.port,action:14}))},calls=[];let tick,cancelled;
 const host={setInputState:p=>calls.push(['normal',p]),adapter:{request:async(t,p)=>{calls.push([t,p]);return{};}}};
 const result=await withTwoPlayerBenchmarkInput(host,()=>s,async()=>{
  for(let i=0;i<25;i++){s.sceneFrame=i*9;s.fighters.forEach(f=>{f.action=14+i%5;});tick();await new Promise(resolve=>setImmediate(resolve));}
  return{passed:true};
 },{schedule:cb=>{tick=cb;return 9;},cancel:id=>{cancelled=id;}});
 assert.equal(cancelled,9);assert.equal(result.passed,true);assert.equal(result.controllerStress.exercisedBothPlayers,true);
 assert.ok(result.controllerStress.inputChanges.every(n=>n>=8));assert.ok(!calls.some(([,p])=>['pause','step'].includes(p.action)));
 assert.equal(calls.at(-1)[1].action,'releaseLivePads');assert.ok(calls.at(-2)[1].pads.every(p=>p.mask===0&&p.stickX===128));
});

test('two-player stress cleans up on failure and rejects CPU slots',async()=>{
 const {withTwoPlayerBenchmarkInput}=await import('./browser-benchmark-input.js'),calls=[];
 const s={...state,fighters:state.fighters.map(f=>({...f,slotType:0,controllerIndex:f.port,action:14}))};
 const host={setInputState:()=>{},adapter:{request:async(t,p)=>{calls.push(p);return{};}}};
 await assert.rejects(withTwoPlayerBenchmarkInput(host,()=>s,async()=>{throw Error('measurement failed');},{schedule:()=>1,cancel:()=>{}}),/measurement failed/);
 assert.equal(calls.at(-1).action,'releaseLivePads');assert.ok(calls.at(-2).pads.every(p=>p.mask===0));
 s.fighters[1].slotType=1;await assert.rejects(withTwoPlayerBenchmarkInput(host,()=>s,async()=>({passed:true})),/Two human/);
});
