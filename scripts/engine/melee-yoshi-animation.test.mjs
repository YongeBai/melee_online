import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planYoshiBackgroundAnimation,inspectYoshiGameplay} from './melee-yoshi-animation.js';
import {FOUNTAIN_ANIMATION_PROC as PROC,FOUNTAIN_ANIMATION_CAVE as CAVE} from './melee-fountain-animation.js';
import {BACKGROUND_RENDER,EMPTY_RENDER} from './melee-background.js';
function fixture(){
  const fd=fs.openSync(process.env.MELEE_TEST_ISO,'r');
  const read=(at,n)=>{const b=Buffer.alloc(n);assert.equal(fs.readSync(fd,b,0,n,at),n);return b;};
  const dol=read(0x420,4).readUInt32BE(),header=read(dol,256),w=new Map(),b=new Map();
  for(const[address,size]of[[PROC,0x68],[0x801e322c,4]]){
    let found=false;
    for(let i=0;i<18;i++){
      const base=header.readUInt32BE(0x48+i*4),length=header.readUInt32BE(0x90+i*4);
      if(address>=base&&address+size<=base+length){
        const data=read(dol+header.readUInt32BE(i*4)+address-base,size);
        for(let k=0;k<size;k+=4)w.set(address+k,data.readUInt32BE(k));found=true;break;
      }
    }
    assert.ok(found);
  }
  fs.closeSync(fd);
  w.set(0x804d782c,0x80500000);w.set(0x80500014,0x80600000);
  for(let i=0;i<4;i++){
    const g=0x80600000+i*0x200,ground=g+0x40,p=g+0x120,j=0x80610000+i*0x100;
    w.set(g+8,i===3?0:g+0x200);w.set(g+0x2c,ground);w.set(ground+4,g);w.set(ground+0x14,i);
    b.set(g+1,3);b.set(ground+0x11,i===1?0x40:0);w.set(g+0x1c,i===1?EMPTY_RENDER:BACKGROUND_RENDER);
    w.set(g+0x18,p);w.set(p+0x10,g);w.set(p+0x14,PROC);w.set(p,p+0x20);w.set(p+0x30,g);w.set(p+0x34,i===1?0x801e322c:0x801e33e0);
    w.set(g+0x28,j);
  }
  return {w,b,read:a=>w.get(a)||0,read8:a=>b.get(a)||0,plan:e=>planYoshiBackgroundAnimation(a=>w.get(a)||0,a=>b.get(a)||0,e,8)};
}
const options={skip:!process.env.MELEE_TEST_ISO};
test('only hidden map 1 joint-animation callback changes; Randall and Shy Guys remain original',options,()=>{
  const f=fixture(),before=new Map(f.w),plan=f.plan(false);
  assert.deepEqual(f.w,before);assert.deepEqual(plan.writes,[[0x80600334,CAVE]]);
  for(const[a,v]of[...plan.codeWrites,...plan.writes])f.w.set(a,v);
  assert.deepEqual(f.plan(false).writes,[]);assert.deepEqual(f.plan(false).codeWrites,[]);
  assert.deepEqual(f.plan(true).writes,[[0x80600334,PROC]]);
  for(const a of[0x80600134,0x80600534,0x80600734])assert.equal(f.w.get(a),PROC);
  assert.equal(inspectYoshiGameplay(f.read,f.read8).platforms.length,3);
});
test('wrong stage, visible scenery, bad code or ownership reject before mutation',options,()=>{
  for(const mutate of[f=>f.w.set(PROC,0),f=>f.w.set(CAVE,1),f=>f.w.set(0x801e322c,0),
    f=>f.w.set(0x8060021c,BACKGROUND_RENDER),f=>f.w.set(0x80600330,0),
    f=>f.w.set(0x80600354,0),f=>f.w.set(0x80600320,0x80600320),f=>f.b.set(0x80600251,0)]){
    const f=fixture();mutate(f);const before=new Map(f.w);assert.throws(()=>f.plan(false));assert.deepEqual(f.w,before);
  }
  const f=fixture();assert.throws(()=>planYoshiBackgroundAnimation(f.read,f.read8,false,2),/current stage/);
});
