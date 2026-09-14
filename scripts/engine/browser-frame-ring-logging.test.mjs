import test from 'node:test';import assert from 'node:assert/strict';import {compareBrowserFrameRingLogging} from './browser-frame-ring-logging.js';
function fixture({inactive=false,fail=false}={}){let enabled=true,batches=0,rows=0,drainMs=0;const commands=[];
 return{commands,host:{adapter:{request:async(type,data={})=>{commands.push([type,data]);
  if(type==='frameRingLogging'){if(data.enabled!==undefined)enabled=data.enabled;return{enabled,batches,rows,drainMs};}
  if(data.action==='frameInputStats')return{valid:true,inputChanges:[30,30],observedActions:[[1,2,3],[1,2,3]],digests:[{frame:1200,input:10,state:20}],gaps:[]};return{};
 }}},measure:async()=>{if(fail)throw Error('capture failed');if(enabled&&!inactive){batches+=45;rows+=2700;drainMs+=12;}return{passed:true};}};
}
test('logger comparison records real activity only when enabled and restores original setting',async()=>{const f=fixture(),r=await compareBrowserFrameRingLogging(f.host,45,async()=>({}),{measure:f.measure});assert.equal(r.passed,true);assert.deepEqual(r.runs.map(r=>r.frameRingLogging.rows),[2700,2700,0,0,0,0,2700,2700]);assert.deepEqual(f.commands.slice(-2),[['frameRingLogging',{enabled:true}],['start',{}]]);});
test('inactive logging and failed capture cannot claim a win and still restore the logger',async()=>{for(const opts of[{inactive:true},{fail:true}]){const f=fixture(opts);await assert.rejects(compareBrowserFrameRingLogging(f.host,45,async()=>({}),{measure:f.measure}));assert.deepEqual(f.commands.slice(-2),[['frameRingLogging',{enabled:true}],['start',{}]]);}});
