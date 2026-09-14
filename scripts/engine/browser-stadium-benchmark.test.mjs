import test from 'node:test';import assert from 'node:assert/strict';
import {compareFountainReflection} from './browser-benchmark.js';
test('Stadium screen comparison requires the correct stage, checks hooks and restores after drift',async()=>{
 let enabled=true,drift=false;const calls=[];
 const host={adapter:{request:async(t,d)=>{calls.push(d);if(d.action==='stadiumScreen'){enabled=d.enabled;return{objects:[{}],writes:[],codeWrites:drift?[[1,2]]:[],copySites:[1,2,3]};}return{};}}};
 await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:2}}),{feature:'stadiumscreen'}),/requires Stadium/);
 const result=await compareFountainReflection(host,30,async()=>({match:{stage:3}}),{feature:'stadiumscreen',measure:async()=>({passed:true})});
 assert.equal(result.kind,'same-checkpoint-stadium-stadiumscreen-abba');assert.equal(result.passed,true);
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.stadiumscreen),[true,false,false,true]);assert.ok(result.runs.every(r=>r.cosmeticCoverage.stableAtEnd));assert.equal(enabled,true);
 await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:3}}),{feature:'stadiumscreen',measure:async()=>{drift=true;return{passed:true};}}),/hook changed/);assert.equal(enabled,true);assert.equal(calls.at(-2).action,'release');
});
