import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSavedEventQueues} from './browser-saved-events.js';
const event=(name,time,order,userdata='0')=>({name,time:String(time),order:String(order),userdata});
const state=(events,extra={})=>({events,globalTimer:'9007199254740993',idleCycles:'100',nextOrder:'1000',ordersValid:true,...extra});
test('insertion-counter changes preserve a logical queue only when ordered events match exactly',()=>{
 const a=state([event('VI',100,10),event('Audio',100,12)]);
 const b=state([event('VI',100,20),event('Audio',100,30)],{nextOrder:'2000',idleCycles:'101'});
 assert.deepEqual(Object.fromEntries(Object.entries(compareSavedEventQueues(a,b)).slice(0,3)),{logicalQueueEqual:true,rawOrderCounterEqual:false,rawIdleCounterEqual:false});
 for(const change of[
  s=>s.globalTimer='9007199254740994',s=>s.events[0].time='99',s=>s.events[0].userdata='9007199254740993',s=>s.events[0].name='Different',
  s=>{s.events[0].name='Audio';s.events[1].name='VI';},s=>s.events.pop(),
 ]){const c=structuredClone(b);change(c);assert.equal(compareSavedEventQueues(a,c).logicalQueueEqual,false);}
});
test('invalid ordinals, inexact numbers and incorrectly sorted events are rejected',()=>{
 const a=state([event('VI',100,10),event('Audio',100,12)]);
 for(const change of[s=>s.ordersValid=false,s=>s.nextOrder='12',s=>s.events[0].order='12',s=>s.events.reverse(),s=>s.events[0].userdata=9007199254740992,s=>s.globalTimer='1.5']){
  const b=structuredClone(a);change(b);assert.throws(()=>compareSavedEventQueues(a,b));
 }
});
