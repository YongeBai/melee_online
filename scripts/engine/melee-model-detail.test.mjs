import test from 'node:test';import assert from 'node:assert/strict';import {planFighterModelDetail} from './melee-model-detail.js';
function fixture(){
 const w=new Map(),b=new Map();const set=(a,v)=>w.set(a,v);set(0x804d782c,0x80500000);set(0x80500020,0x80600000);
 for(let i=0;i<2;i++){
  const g=0x80600000+i*0x10000,fp=g+0x100,dat=g+0x1000,desc=g+0x1100,table=g+0x1200,hi=g+0x1400,lo=g+0x1500,meshes=g+0x1800;
  b.set(g+1,4);b.set(g+2,8);set(g+0x2c,fp);set(g+8,i===0?g+0x10000:0);set(fp,g);set(fp+4,10+i);set(fp+0x10c,dat);set(dat+8,desc);set(desc,1);set(desc+4,table);set(fp+0x5ac,1);set(table,hi);set(table+4,lo);set(fp+0x5b8,hi);set(fp+0x5bc,lo);set(fp+0x5ec,2);set(fp+0x5f0,meshes);b.set(fp+0x5b0,1);
  for(const [lookup,index]of[[hi,0],[lo,1]]){set(lookup,1);set(lookup+4,lookup+0x20);set(lookup+0x20,1);set(lookup+0x24,lookup+0x40);b.set(lookup+0x40,index);}
  for(let j=0;j<2;j++){set(meshes+j*4,meshes+0x40+j*0x40);set(meshes+0x40+j*0x40+0x14,0x80);}
 }
 return {w,b,plan:high=>planFighterModelDetail(a=>w.get(a)||0,a=>b.get(a)||0,high),apply:p=>{for(const[a,v]of p.writes)w.set(a,v);for(const[a,v]of p.byteWrites)b.set(a,v);}};
}
test('model detail selects native mesh tables for both climbers and restores original tables',()=>{
 const f=fixture(),originalW=new Map(f.w),originalB=new Map(f.b);const low=f.plan(false);
 assert.deepEqual(f.w,originalW);assert.deepEqual(f.b,originalB);assert.deepEqual(low.objects.map(o=>o.kind),[10,11]);
 assert.deepEqual(low.byteWrites,[[0x806006b0,0],[0x806106b0,0]]);
 assert.ok(low.writes.every(([a,v])=>a===0x806006b8||a===0x806106b8||v===0x81));
 f.apply(low);assert.equal(f.w.get(0x806006b8),0x80601500);assert.equal(f.w.get(0x806106b8),0x80611500);assert.deepEqual(f.plan(false).writes,[]);
 const high=f.plan(true);f.apply(high);assert.equal(f.w.get(0x806006b8),0x80601400);assert.equal(f.w.get(0x806106b8),0x80611400);assert.deepEqual(f.plan(true).writes,[]);
 // Source asset descriptors, current animations and camera are never written.
 assert.equal(f.w.get(0x80601200),0x80601400);assert.equal(f.w.get(0x80601204),0x80601500);
});
test('model detail rejects unknown pointers, ownership and mesh indices without writes',()=>{
 for(const change of[
  f=>f.w.set(0x80600100,0),
  f=>f.w.set(0x806006b8,0x80003300),
  f=>f.b.set(0x80601540,2),
  f=>f.w.set(0x80610008,0x80600000),
  f=>f.w.set(0x80601500,257)
 ]){const f=fixture();change(f);const snapshot=new Map(f.w);assert.throws(()=>f.plan(false));assert.deepEqual(f.w,snapshot);}
});
