import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{planFountainAnimation,cloneFountainAnimationProcedure,FOUNTAIN_ANIMATION_PROC as PROC,FOUNTAIN_ANIMATION_CAVE as CAVE}from'./melee-fountain-animation.js';
import{EMPTY_RENDER,BACKGROUND_RENDER}from'./melee-background.js';
// Original game bytes are read only from an optional local development fixture.
// No executable, asset or save data is copied into the repository.
function fixture(){
 const fd=fs.openSync(process.env.MELEE_TEST_ISO,'r');const read=(at,n)=>{const b=Buffer.alloc(n);fs.readSync(fd,b,0,n,at);return b;};
 const dol=read(0x420,4).readUInt32BE(),header=read(dol,256);let original;
 for(let i=0;i<18;i++){const base=header.readUInt32BE(0x48+i*4),size=header.readUInt32BE(0x90+i*4);if(PROC>=base&&PROC+0x68<=base+size)original=read(dol+header.readUInt32BE(i*4)+PROC-base,0x68);}
 fs.closeSync(fd);assert.ok(original,'Development disc has the ground function');
 const w=new Map([[0x804d782c,0x80500000],[0x80500014,0x80600000]]),b=new Map();
 for(let i=0;i<original.length;i+=4)w.set(PROC+i,original.readUInt32BE(i));
 for(let i=0;i<5;i++){
  const g=0x80600000+i*0x100,ground=g+0x40,p=g+0x80;
  w.set(g+8,i<4?g+0x100:0);w.set(g+0x2c,ground);w.set(ground+4,g);w.set(ground+0x14,i);w.set(g+0x18,p);w.set(p+0x10,g);w.set(p+0x14,PROC);w.set(g+0x1c,EMPTY_RENDER);b.set(g+1,3);b.set(ground+0x11,i===2?64:32);
 }
 return {w,b,plan:e=>planFountainAnimation(a=>w.get(a)||0,a=>b.get(a)||0,e),apply:p=>{for(const[a,v]of[...p.codeWrites,...p.writes])w.set(a,v);}};
}
const options={skip:!process.env.MELEE_TEST_ISO};
test('relocated procedure changes only joint-animation call and external call displacement',options,()=>{
 const f=fixture(),code=cloneFountainAnimationProcedure(a=>f.w.get(a)||0);
 for(let i=0;i<code.length;i++)if(![8,10].includes(i))assert.equal(code[i],f.w.get(PROC+i*4));
 assert.equal(code[8],0x60000000);assert.equal(code[10]&3,1);
 assert.equal((CAVE+40+((code[10]&0x3fffffc)<<6>>6))>>>0,0x801c9698);
 // Includes original counter update, conditional callback and callee-save tail.
 assert.equal(code.length,26);
});
test('only hidden map0/1 process callbacks change, and normal behavior restores',options,()=>{
 const f=fixture(),before=new Map(f.w),p=f.plan(false);assert.deepEqual(f.w,before);
 assert.deepEqual(p.objects.map(o=>o.mapId),[0,1]);assert.deepEqual(p.writes,[[0x80600094,CAVE],[0x80600194,CAVE]]);f.apply(p);
 assert.deepEqual(f.plan(false).writes,[]);assert.deepEqual(f.plan(false).codeWrites,[]);
 f.apply(f.plan(true));assert.equal(f.w.get(0x80600094),PROC);assert.equal(f.w.get(0x80600194),PROC);
 for(const a of[0x80600294,0x80600394,0x80600494])assert.equal(f.w.get(a),before.get(a));
});
test('foreign code, visible scenery, stale ownership and cyclic lists fail before writes',options,()=>{
 for(const change of[f=>f.w.set(PROC,0),f=>f.w.set(CAVE,0x12345678),f=>f.w.set(0x8060001c,BACKGROUND_RENDER),f=>f.w.set(0x80600090,0),f=>f.w.set(0x80600080,0x80600080)]){
  const f=fixture();change(f);const before=new Map(f.w);assert.throws(()=>f.plan(false));assert.deepEqual(f.w,before);
 }
});
