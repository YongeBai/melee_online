import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFountainReflectionState} from './browser-reflection-replay.js';
import {compareFountainReflection} from './browser-benchmark.js';
test('Yoshi replay checks items, all partners and moving Randall, restoring after mismatch',async()=>{
  for(const fault of['none','item','camera','partner','stationary']){
    let frame=400,enabled=true;const calls=[];
    const host={adapter:{request:async(t,d)=>{
      calls.push([t,d]);if(d.action==='restore')frame=400;if(d.action==='step')frame++;
      if(d.action==='yoshiBackgroundAnimation'){enabled=d.enabled;return{objects:[{mapId:1}],writes:[],codeWrites:[]};}
      if(d.action==='yoshiGameplayState')return{sceneFrame:frame,match:{stage:8},randomSeed:123,
        camera:{fov:!enabled&&fault==='camera'?31:30},fighters:[{character:14},{character:14}],
        allActors:Array.from({length:4},(_,i)=>({kind:i,x:!enabled&&fault==='partner'&&i===3?2:1})),
        platforms:[0,2,3].map(mapId=>({mapId,position:mapId===2&&fault!=='stationary'?frame:0})),
        items:[{kind:55,x:!enabled&&fault==='item'?11:10}]};return{};
    }}};
    if(fault==='stationary')await assert.rejects(verifyFountainReflectionState(host,{feature:'yoshianimation',frames:120}),/Randall did not move/);
    else{
      const result=await verifyFountainReflectionState(host,{feature:'yoshianimation',frames:120});
      assert.equal(result.passed,fault==='none');assert.equal(result.fullMachineEquivalence,false);
      if(fault==='none'){assert.equal(result.randallMoved,true);assert.deepEqual(result.observedItemKinds,[55]);}
    }
    assert.equal(enabled,true);assert.equal(calls.at(-1)[0],'start');
  }
});
test('Yoshi performance comparison checks installed procedure and restores normal animation',async()=>{
  let enabled=true,drift=false;const calls=[];
  const host={adapter:{request:async(t,d)=>{calls.push(d);if(d.action==='yoshiBackgroundAnimation'){
    enabled=d.enabled;return{objects:[{mapId:1}],writes:drift?[[1,2]]:[],codeWrites:[]};}return{};}}};
  const result=await compareFountainReflection(host,45,async()=>({match:{stage:8}}),{feature:'yoshianimation',measure:async()=>({passed:true})});
  assert.equal(result.kind,'same-checkpoint-yoshi-yoshianimation-abba');
  assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.yoshianimation),[true,false,false,true]);
  assert.ok(result.runs.every(r=>r.cosmeticCoverage.stableAtEnd));assert.equal(enabled,true);
  await assert.rejects(compareFountainReflection(host,45,async()=>({match:{stage:8}}),{feature:'yoshianimation',measure:async()=>{drift=true;return{passed:true};}}),/hook changed/);
  assert.equal(enabled,true);assert.equal(calls.at(-2).action,'release');
});
