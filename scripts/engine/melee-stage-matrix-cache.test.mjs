import test from 'node:test';
import assert from 'node:assert/strict';
import {compareYoshiStageMatrixSnapshots,inspectYoshiStaticDrawObjectBytes,planYoshiStableDrawCostDiagnostic,planYoshiMinimalStage} from './melee-scenery.js';

function fixture(){
 const joints=Array.from({length:22},(_,i)=>({address:0x80600000+i*0x100,parent:i?0x80600000:0,
  flags:0,worldMatrix:[1,0,0,i,0,1,0,0,0,0,1,0]}));
 const draws=Array.from({length:102},(_,i)=>({address:0x80700000+i*0x20,
  joint:i%22,flags:8,material:0x80800000+i*0x40,mesh:0x80900000+i*0x40}));
 return {objects:[{mapId:0,root:0x80500000,joints:Array.from({length:23},()=>({})),draws:[]},
  {mapId:3,root:0x80600000,joints,draws}]};
}

test('stage matrix probe excludes rotation, hidden meshes and changed material identity',()=>{
 const a=fixture(),b=structuredClone(a);
 b.objects[1].joints[2].worldMatrix[0]=0.5;
 b.objects[1].draws[3].flags|=1;
 b.objects[1].draws[4].material+=4;
 const result=compareYoshiStageMatrixSnapshots(a,b);
 assert.equal(result.cacheSafe,false);
 assert.equal(result.observedDraws,102);
 assert.ok(!result.stableJoints.includes(2));
 assert.ok(!result.stableDraws.includes(2));
 assert.ok(!result.stableDraws.includes(3));
 assert.ok(!result.stableDraws.includes(4));
 assert.ok(result.stableDraws.includes(5));
 assert.equal(a.objects[1].draws[3].flags,8);
});

test('stage matrix probe rejects substituted stage objects',()=>{
 const a=fixture(),b=structuredClone(a);b.objects[0].draws.push({});
 assert.throws(()=>compareYoshiStageMatrixSnapshots(a,b),/Unexpected Yoshi stage geometry/);
});

test('stable-stage cost control hides only checked visual draws and restores them',()=>{
 const geometry=fixture(),stage=geometry.objects[1];
 const selected=[...Array(50).keys(),...Array.from({length:17},(_,i)=>i+62),...Array.from({length:17},(_,i)=>i+81)];
 for(const index of selected)stage.draws[index].joint=2;
 const untouched=stage.draws[50].flags;
 const hidden=planYoshiStableDrawCostDiagnostic(geometry,false);
 assert.equal(hidden.diagnosticOnly,true);assert.equal(hidden.passed,false);
 assert.equal(hidden.writes.length,84);assert.equal(hidden.dynamicDraws,18);
 for(const[address,value]of hidden.writes){
  const draw=stage.draws.find(d=>d.address+20===address);assert.ok(draw);draw.flags=value;
 }
 assert.equal(stage.draws[50].flags,untouched);
 assert.equal(planYoshiStableDrawCostDiagnostic(geometry,false).writes.length,0);
 assert.equal(planYoshiStableDrawCostDiagnostic(geometry,true).writes.length,84);
 stage.draws[0].flags=16;
 assert.throws(()=>planYoshiStableDrawCostDiagnostic(geometry,false),/identity changed/);
});

test('partial draw-object hashes detect memory changes while remaining cache-unsafe',()=>{
 const geometry=fixture(),stage=geometry.objects[1];
 const selected=[...Array(50).keys(),...Array.from({length:17},(_,i)=>i+62),...Array.from({length:17},(_,i)=>i+81)];
 for(const index of selected)stage.draws[index].joint=2;
 const bytes=new Map(),read8=address=>bytes.get(address)||0;
 const first=inspectYoshiStaticDrawObjectBytes(geometry,read8);
 bytes.set(stage.draws[0].material+17,1);
 const second=inspectYoshiStaticDrawObjectBytes(geometry,read8);
 assert.equal(first.cacheSafe,false);assert.equal(first.objects.length,84);
 assert.notEqual(first.objects[0].materialObjectHash64,second.objects[0].materialObjectHash64);
 assert.equal(first.objects[0].meshObjectHash64,second.objects[0].meshObjectHash64);
 assert.equal(first.objects[1].materialObjectHash64,second.objects[1].materialObjectHash64);
 stage.draws[0].mesh=0x81800000;
 assert.throws(()=>inspectYoshiStaticDrawObjectBytes(geometry,read8),/identity changed|Invalid Yoshi/);
});

test('minimal native Yoshi visuals retain platforms, water and Randall while restoring decorative flags',()=>{
 const geometry=fixture(),stage=geometry.objects[1];
 for(const[joint,first,count]of[[4,4,26],[5,30,20],[17,62,17],[19,81,17]]){
  stage.joints[joint].draws=Array.from({length:count},(_,k)=>first+k);
  for(const index of stage.joints[joint].draws){stage.draws[index].joint=joint;stage.draws[index].flags=2;}
 }
 for(let i=0;i<4;i++)stage.draws[i].flags=2;
 const untouched=stage.draws.filter((_,i)=>![...Array.from({length:26},(_,k)=>k+4),...Array.from({length:17},(_,k)=>k+62),...Array.from({length:17},(_,k)=>k+81)].includes(i)).map(d=>d.flags);
 const minimal=planYoshiMinimalStage(geometry,false);assert.equal(minimal.writes.length,60);
 assert.deepEqual(minimal.objects[0].retainedMainDisplays,[0,1,2,3]);
 assert.equal(minimal.objects[0].retainedFloorDraws.length,20);
 assert.equal(minimal.objects[0].randallPreserved,true);
 for(const[address,value]of minimal.writes)stage.draws.find(d=>d.address+20===address).flags=value;
 assert.equal(planYoshiMinimalStage(geometry,false).writes.length,0);
 const original=planYoshiMinimalStage(geometry,true);assert.equal(original.writes.length,60);
 for(const[address,value]of original.writes)stage.draws.find(d=>d.address+20===address).flags=value;
 assert.equal(planYoshiMinimalStage(geometry,true).writes.length,0);
 assert.deepEqual(stage.draws.filter((_,i)=>![...minimal.objects[0].hiddenDraws].includes(i)).map(d=>d.flags),untouched);
 stage.joints[4].draws.pop();assert.throws(()=>planYoshiMinimalStage(geometry,false),/identity changed/);
});
