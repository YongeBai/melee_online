import test from 'node:test';import assert from 'node:assert/strict';
import {compareFountainReflection} from './browser-benchmark.js';
test('static background comparison uses both stage-specific directions and restores animation',async()=>{
 let enabled=true;const calls=[];
 const host={adapter:{request:async(_type,data)=>{calls.push(data);if(data.action==='staticBackgroundAnimation'){enabled=data.enabled;return{objects:Array.from({length:2},(_,mapId)=>({mapId:mapId?3:1})),writes:[],codeWrites:[],preserved:['main Battlefield','three platforms']};}return{};}}};
 const result=await compareFountainReflection(host,30,async()=>({match:{stage:31}}),{feature:'staticbackground',measure:async()=>({passed:true})});
 assert.equal(result.kind,'same-checkpoint-battlefield-staticbackground-abba');
 assert.deepEqual(result.runs.filter(run=>!run.warmup).map(run=>run.staticbackground),[true,false,false,true]);
 assert.ok(result.runs.every(run=>run.cosmeticCoverage.stableAtEnd));assert.equal(enabled,true);
 assert.ok(calls.some(call=>call.action==='staticBackgroundAnimation'&&call.enabled===false));
});
test('static background comparison rejects unrelated stages',async()=>{
 const host={adapter:{request:async()=>({})}};
 await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:28}}),{feature:'staticbackground',measure:async()=>({passed:true})}),/Battlefield or Final Destination/);
});
