import test from'node:test';import assert from'node:assert/strict';
import{planFrozenStadiumDecoration}from'./melee-stadium-decoration.js';
import{BACKGROUND_RENDER,EMPTY_RENDER}from'./melee-background.js';
import{STADIUM_TRANSFORMATION_CONTROLLER}from'./melee-stadium-freeze.js';

function fixture(){
  const w=new Map([[BACKGROUND_RENDER,0x7c0802a6],[EMPTY_RENDER,0x4e800020],
    [STADIUM_TRANSFORMATION_CONTROLLER,0x4e800020],[0x804d782c,0x80500000],[0x80500014,0x80600000]]),b=new Map();
  for(const[i,mapId]of[0,2,5].entries()){
    const g=0x80600000+i*0x100,ground=g+0x40;w.set(g+8,i<2?g+0x100:0);w.set(g+0x2c,ground);
    w.set(g+0x1c,BACKGROUND_RENDER);w.set(ground+4,g);w.set(ground+0x14,mapId);w.set(ground+0xe8,0);
    b.set(g,0);b.set(g+1,3);b.set(ground+0x11,mapId===2?0x20:0);b.set(ground+0xdc,0);b.set(ground+0xdd,0);
    b.set(ground+0xde,0);b.set(ground+0xdf,5);
  }
  return{w,b,read32:a=>w.get(a)||0,read8:a=>b.get(a)||0};
}
test('frozen Stadium hides only the idle transformation draw root',()=>{
  const f=fixture(),plan=planFrozenStadiumDecoration(f.read32,f.read8,false);
  assert.deepEqual(plan.writes,[[0x8060011c,EMPTY_RENDER]]);assert.deepEqual(plan.preserved.map(o=>o.mapId),[0,5]);
  f.w.set(...plan.writes[0]);assert.deepEqual(planFrozenStadiumDecoration(f.read32,f.read8,false).writes,[]);
  assert.deepEqual(planFrozenStadiumDecoration(f.read32,f.read8,true).writes,[[0x8060011c,BACKGROUND_RENDER]]);
});
test('decoration refuses an unfrozen or transitioning Stadium',()=>{
  const f=fixture();f.w.set(STADIUM_TRANSFORMATION_CONTROLLER,0x7c0802a6);
  assert.throws(()=>planFrozenStadiumDecoration(f.read32,f.read8,false),/only after/);
  f.w.set(STADIUM_TRANSFORMATION_CONTROLLER,0x4e800020);f.b.set(0x80600140+0xde,0);f.b.set(0x80600140+0xdf,4);
  assert.throws(()=>planFrozenStadiumDecoration(f.read32,f.read8,false),/not idle/);
});
