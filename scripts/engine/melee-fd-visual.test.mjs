import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKGROUND_RENDER,EMPTY_RENDER} from './melee-background.js';
import {planFinalDestinationBottomVisual} from './melee-scenery.js';

function fixture(){
 const object=(mapId,category,count,joints,renderCallback=BACKGROUND_RENDER)=>({
  gobj:0x80600000+mapId*0x100,mapId,category,renderCallback,
  joints:Array.from({length:joints},()=>({draws:[]})),
  draws:Array.from({length:count},(_,index)=>({index,address:0x80900000+index*0x20,joint:0,flags:index%2?2:4,
   material:0x80700000+index*0x40,mesh:0x80800000+index*0x40}))});
 const collision=object(0,0,0,2),small=object(1,1,2,2),floor=object(2,0,2,2),bottom=object(3,1,26,6);
 bottom.joints[2].draws=[0,1,2,3,4];bottom.joints[4].draws=Array.from({length:18},(_,k)=>k+6);
 for(const index of bottom.joints[2].draws)bottom.draws[index].joint=2;
 for(const index of bottom.joints[4].draws)bottom.draws[index].joint=4;
 return {objects:[collision,small,floor,bottom]};
}

test('Final Destination opaque underside plan keeps the translucent native playable floor',()=>{
 const geometry=fixture(),code=new Map([[BACKGROUND_RENDER,0x7c0802a6],[EMPTY_RENDER,0x4e800020]]);
 const read32=a=>code.get(a)||0,background=geometry.objects[3],floor=geometry.objects[2];
 const hidden=planFinalDestinationBottomVisual(read32,geometry,false);
 assert.equal(hidden.writes.length,9);
 assert.deepEqual(hidden.objects[0].retainedTopDraws,[0,1,2,3,4]);
 assert.equal(hidden.objects[0].floorMapId,2);assert.equal(hidden.objects[0].floorDraws,2);
 assert.equal(floor.renderCallback,BACKGROUND_RENDER);
 for(const[address,value]of hidden.writes)background.draws.find(d=>d.address+20===address).flags=value;
 assert.equal(planFinalDestinationBottomVisual(read32,geometry,false).writes.length,0);
 assert.equal(planFinalDestinationBottomVisual(read32,geometry,true).writes.length,9);
 assert.equal(background.draws.slice(0,5).every(d=>!(d.flags&1)),true);
 floor.renderCallback=EMPTY_RENDER;
 assert.throws(()=>planFinalDestinationBottomVisual(read32,geometry,false),/identity changed/);
});

test('Final Destination diagnostic selects checked opacity groups without changing the other meshes',()=>{
 const geometry=fixture(),code=new Map([[BACKGROUND_RENDER,0x7c0802a6],[EMPTY_RENDER,0x4e800020]]);
 const read32=a=>code.get(a)||0;
 const translucent=planFinalDestinationBottomVisual(read32,geometry,false,'translucent');
 const opaque=planFinalDestinationBottomVisual(read32,geometry,false,'opaque');
 assert.equal(translucent.objects[0].selectedDraws.length,9);
 assert.equal(opaque.objects[0].selectedDraws.length,9);
 assert.equal(translucent.writes.length+opaque.writes.length,18);
 assert.deepEqual(new Set([...translucent.objects[0].selectedDraws,...opaque.objects[0].selectedDraws]),new Set(Array.from({length:18},(_,k)=>k+6)));
 assert.throws(()=>planFinalDestinationBottomVisual(read32,geometry,false,'other'),/Unknown Final Destination/);
});
