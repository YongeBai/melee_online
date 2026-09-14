import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFountainGeometry,planFountainGeometryView} from './melee-scenery.js';
function fixture(){
 const words=new Map(),bytes=new Map(),floats=new Map();
 const list=0x80500000,g=0x80500100,ground=0x80500200,root=0x80500300,child=0x80500400,d0=0x80500500,d1=0x80500600;
 for(const[a,v]of [[0x804d782c,list],[list+20,g],[g+0x2c,ground],[ground+4,g],[ground+0x14,3],[g+0x1c,0x801cd220],[0x801cd220,0x7c0802a6],[g+0x28,root],[root+16,child],[child+12,root],[root+24,d0],[child+24,d1],[d0+20,0x400],[d1+20,0x801]])words.set(a,v);
 bytes.set(g,0);bytes.set(g+1,3);
 return {words,root,child,d0,d1,read:()=>inspectFountainGeometry(a=>words.get(a)??0,a=>bytes.get(a)??0,a=>floats.get(a)??0)};
}
test('diagnostic traverses joints and only changes display visibility',()=>{
 const f=fixture(),original=f.read();assert.equal(original.objects[0].joints.length,2);assert.equal(original.objects[0].draws.length,2);
 const hidden=planFountainGeometryView(original,original,-2);assert.deepEqual(hidden.writes,[[f.d0+20,0x401]]);
 hidden.writes.forEach(([a,v])=>f.words.set(a,v));
 const restored=planFountainGeometryView(f.read(),original,-1);assert.deepEqual(restored.writes,[[f.d0+20,0x400]]);
 assert.deepEqual(planFountainGeometryView(original,original,0).writes,[]);
 assert.deepEqual(planFountainGeometryView(original,original,1).writes,[[f.d0+20,0x401]]);
 assert.equal(hidden.diagnosticOnly,true);
});
test('malformed trees and stale scene references fail before a write plan',()=>{
 for(const mutate of [f=>f.words.set(f.child+8,f.root),f=>f.words.set(f.child+12,0),f=>f.words.set(f.root+16,0x817ffff0),f=>f.words.set(f.root+20,0x1000),f=>f.words.set(f.d0+4,f.d0)]){
  const f=fixture();mutate(f);assert.throws(()=>f.read());
 }
 const f=fixture(),a=f.read();assert.throws(()=>planFountainGeometryView(a,a,2));assert.throws(()=>planFountainGeometryView(a,a,0.1));
 const b=structuredClone(a);b.objects[0].draws[0].address+=4;assert.throws(()=>planFountainGeometryView(b,a,-1));
});

import {planFountainDecorations} from './melee-scenery.js';
function decorationFixture(){
 const words=new Map(),bytes=new Map(),floats=new Map();
 const list=0x80500000,g=0x80500100,ground=0x80500200,joint=i=>0x80501000+i*0x100,draw=i=>0x80510000+i*0x20;
 for(const[a,v]of [[0x804d782c,list],[list+20,g],[g+0x2c,ground],[ground+4,g],[ground+0x14,3],[g+0x1c,0x801cd220],[0x801cd220,0x7c0802a6],[g+0x28,joint(0)],[joint(0)+16,joint(1)],[joint(1)+12,joint(0)],[joint(1)+16,joint(2)]])words.set(a,v);
 bytes.set(g+1,3);
 for(let i=2;i<56;i++){words.set(joint(i)+12,joint(1));if(i<55)words.set(joint(i)+8,joint(i+1));}
 const groups=[[2,0,31],[11,31,7],[12,38,7],[13,45,6],[14,51,23],[37,74,18],[55,92,16]];
 for(const[j,first,count]of groups){words.set(joint(j)+24,draw(first));for(let i=first;i<first+count;i++){
  words.set(draw(i)+20,i===89?4:2);words.set(draw(i)+8,0x80530000);words.set(draw(i)+12,0x80540000);if(i<first+count-1)words.set(draw(i)+4,draw(i+1));
 }}
 floats.set(joint(37)+0x40,-27);
 return {words,draw,joint,plan:enabled=>planFountainDecorations(a=>words.get(a)??0,a=>bytes.get(a)??0,a=>floats.get(a)??0,enabled)};
}
test('decoration toggle only hides the 38 identified draw objects and restores exact flags',()=>{
 const f=decorationFixture(),before=new Map(f.words),plan=f.plan(false);
 const expected=[...Array.from({length:20},(_,i)=>31+i),...Array.from({length:18},(_,i)=>74+i)];
 assert.equal(plan.drawCount,38);assert.deepEqual(plan.writes.map(([a])=>(a-20-0x80510000)/32),expected);
 for(const[a,v]of plan.writes){assert.equal(v,(before.get(a)|1));f.words.set(a,v);}
 assert.equal(f.plan(false).writes.length,0);
 for(const[a,v]of f.plan(true).writes)f.words.set(a,v);
 assert.deepEqual(f.words,before);assert.equal(f.plan(true).writes.length,0);
});
test('unknown decoration identity or display flags produce no write plan',()=>{
 const f=decorationFixture();f.words.set(f.draw(91)+20,8);assert.throws(()=>f.plan(false),/display flags/);
 const g=decorationFixture();g.words.set(g.joint(11)+24,g.draw(32));assert.throws(()=>g.plan(false));
 assert.throws(()=>decorationFixture().plan('off'),/boolean/);
});
