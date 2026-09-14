import test from 'node:test';
import assert from 'node:assert/strict';
import {planStageBackground, BACKGROUND_RENDER, EMPTY_RENDER} from './melee-background.js';
import {controlMelee} from './melee-memory.js';
const fixture = () => {
  const words = new Map([[BACKGROUND_RENDER,0x7c0802a6],[EMPTY_RENDER,0x4e800020],[0x804d782c,0x80500000],[0x80500014,0x80600000]]), bytes = new Map();
  for (let i=0;i<4;i++) {
    const g=0x80600000+i*0x100,p=g+0x40;
    words.set(g+8,i===3?0:g+0x100);words.set(g+0x2c,p);words.set(g+0x1c,BACKGROUND_RENDER);words.set(p+4,g);words.set(p+0x14,i);
    bytes.set(g,0);bytes.set(g+1,i===3?4:3);bytes.set(p+0x11,i===0?0:0x40);
  }
  return {words,bytes,read:a=>words.get(a)??0,read8:a=>bytes.get(a)??0};
};
test('background changes touch only render pointers in validated background ground objects',()=>{
  const f=fixture(),original=new Map(f.words);
  const plan=planStageBackground(f.read,f.read8,false,31);
  assert.deepEqual(plan.writes,[[0x8060011c,EMPTY_RENDER],[0x8060021c,EMPTY_RENDER]]);
  assert.deepEqual(f.words,original,'planning is read-only');
  for(const [a,v] of plan.writes)f.words.set(a,v);
  assert.deepEqual(planStageBackground(f.read,f.read8,false,31).writes,[]);
  assert.deepEqual(planStageBackground(f.read,f.read8,true,31).writes,[[0x8060011c,BACKGROUND_RENDER],[0x8060021c,BACKGROUND_RENDER]]);
});
test('unexpected code, invalid lists and cycles reject before writes',()=>{
  for(const [address,value] of [[EMPTY_RENDER,0],[0x804d782c,0],[0x80600308,0x80600000],[0x80600008,0x817ffffc]]) {
    const f=fixture();f.words.set(address,value);const before=new Map(f.words);
    assert.throws(()=>planStageBackground(f.read,f.read8,false,31));assert.deepEqual(f.words,before);
  }
});
test('custom callbacks and mismatched object ownership are preserved',()=>{
  const f=fixture();f.words.set(0x8060011c,0x80004000);f.words.set(0x80600244,0);
  assert.deepEqual(planStageBackground(f.read,f.read8,false,31).writes,[]);
  assert.throws(()=>planStageBackground(f.read,f.read8,'false',31));
});

test('black backgrounds preserve map 2 Randall even if its render category is 2',()=>{
  const f=fixture();
  const plan=planStageBackground(f.read,f.read8,false,8);
  assert.deepEqual(plan.writes,[[0x8060011c,EMPTY_RENDER]]);
  assert.deepEqual(plan.objects.find(o=>o.mapId===2),{gobj:0x80600200,mapId:2,category:2,preservedGameplay:'Randall'});
  f.words.set(0x8060021c,EMPTY_RENDER);
  assert.deepEqual(planStageBackground(f.read,f.read8,false,8).writes,[[0x8060011c,EMPTY_RENDER],[0x8060021c,BACKGROUND_RENDER]]);
  f.bytes.set(0x80600251,0x20);
  assert.equal(planStageBackground(f.read,f.read8,false,8).objects.find(o=>o.mapId===2).category,1);
  assert.throws(()=>planStageBackground(f.read,f.read8,false),/current stage/);
  assert.throws(()=>planStageBackground(f.read,f.read8,false,NaN),/current stage/);
});

test('stage transition during pause cannot write into the previous stage objects',()=>{
  const heap=new Uint8Array(0x1800000),view=new DataView(heap.buffer),f=fixture();
  heap.set(new TextEncoder().encode('GALE01'));
  heap.set([124,8,2,166,60,96,128,76,144,1,0,4,148,33,255,40,219,225,0,208,219,193,0,200,219,161,0,192,190,225,0,156],0x37750c);
  for(const[a,v]of f.words)view.setUint32(a-0x80000000,v);
  for(const[a,v]of f.bytes)view.setUint8(a-0x80000000,v);
  view.setUint32(0x4d6720,0x80400000);
  heap[0x400000]=2;heap[0x479d30]=2;heap[0x479d33]=2;
  const pauses=[];
  const result=controlMelee({HEAPU8:heap},{setCorePaused(value){
    pauses.push(value);if(value)heap[0x479d33]=0;return 1;
  }},'stageBackground',{enabled:false});
  assert.deepEqual(result,{objects:[],writes:[]});
  assert.deepEqual(pauses,[1,0]);
  assert.equal(view.getUint32(0x60011c),BACKGROUND_RENDER);
  heap[0x479d33]=2;
  const pausedResult=controlMelee({HEAPU8:heap},{getCoreStateName:()=> 'Paused',
    setCorePaused(){throw Error('An already paused core must stay paused');}
  },'stageBackground',{enabled:false});
  assert.equal(pausedResult.writes.length,2);
  assert.equal(view.getUint32(0x60011c),EMPTY_RENDER);
  // The same major/minor can now refer to a different stage when pause lands.
  view.setUint32(0x60011c,BACKGROUND_RENDER);view.setUint32(0x60021c,BACKGROUND_RENDER);
  view.setUint16(0x46b6a0+0x24c8+14,31);
  const transitioned=controlMelee({HEAPU8:heap},{setCorePaused(value){
    if(value)view.setUint16(0x46b6a0+0x24c8+14,8);return 1;
  }},'stageBackground',{enabled:false});
  assert.equal(transitioned.writes.length,1);
  assert.equal(view.getUint32(0x60011c),EMPTY_RENDER);
  assert.equal(view.getUint32(0x60021c),BACKGROUND_RENDER);
});
