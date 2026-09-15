import test from 'node:test';
import assert from 'node:assert/strict';
import {planYoshiOffscreenDecor} from './melee-scenery.js';

function fixture(){
 const parent=0x80600000;
 const joints=Array.from({length:22},()=>({parent,local:[0,0,0],world:[0,0,0],draws:[]}));
 joints[1].address=parent;
 const draws=Array.from({length:102},(_,i)=>({index:i,joint:-1,address:0x80610000+i*32,flags:8,material:0x80630000,mesh:0x80640000}));
 for(const[j,z,first]of[[13,-20,54],[14,-50,56],[15,-70,58],[16,-90,60],[18,-225,79],[20,-320,98],[21,-370,100]]){
  joints[j]={parent,local:[0,-300,z],world:[0,-210,z],draws:[first,first+1]};
  draws[first].joint=j;draws[first+1].joint=j;draws[first+1].flags=2;
 }
 const geometry={objects:[{mapId:0,joints:Array.from({length:23},()=>({})),draws:[]},
  {mapId:3,root:0x80600080,joints,draws}]};
 return geometry;
}

test('below-stage mesh mode changes only the 14 checked render flags and restores them',()=>{
 const geometry=fixture(),other=geometry.objects[1].draws[4],original=other.flags;
 const hidden=planYoshiOffscreenDecor(geometry,false);
 assert.equal(hidden.writes.length,14);assert.equal(hidden.objects[0].mapId,3);
 for(const [address,value] of hidden.writes){
  const draw=geometry.objects[1].draws.find(d=>d.address+20===address);
  assert.ok(draw);assert.equal(value,draw.flags|1);draw.flags=value;
 }
 assert.equal(other.flags,original);
 assert.equal(planYoshiOffscreenDecor(geometry,false).writes.length,0);
 assert.equal(planYoshiOffscreenDecor(geometry,true).writes.length,14);
});

test('below-stage mode refuses a mesh that rises into view or an added gameplay object',()=>{
 const geometry=fixture();geometry.objects[1].joints[13].world[1]=0;
 assert.throws(()=>planYoshiOffscreenDecor(geometry,false),/joint identity changed/);
 geometry.objects[1].joints[13].world[1]=-210;
 geometry.objects.push({mapId:2,joints:[{}],draws:[{}]});
 assert.throws(()=>planYoshiOffscreenDecor(geometry,false),/geometry/);
});
