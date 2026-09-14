import test from 'node:test';
import assert from 'node:assert/strict';
import {fountainParticleDrawCode,planFountainParticles,inspectParticleBanks,PARTICLE_DRAW_CAVE as CAVE,PARTICLE_DRAW_HOOK as HOOK,PARTICLE_DRAW_ORIGINAL as ORIGINAL} from './melee-fountain-particles.js';

function fixture(){
 const words=new Map([[HOOK,ORIGINAL],[0x803a02b4,0xc03e004c],[0x803a02bc,0xfc010040],[0x803a02c0,0x418035c8],[0x803a02c8,0x2c000000],[0x803a3888,0x827e0004],[0x803a388c,0x83de0000],[0x803a3890,0x281e0000]]);
 return {words,plan:enabled=>planFountainParticles(a=>words.get(a)||0,enabled),apply:p=>{for(const[a,v]of[...p.codeWrites,...p.writes])words.set(a,v);}};
}
test('particle hook validates before writes and restores the original instruction',()=>{
 const f=fixture(),before=new Map(f.words),off=f.plan(false);assert.deepEqual(f.words,before);
 assert.equal(off.objects[0].bank,30);f.apply(off);
 assert.equal(f.plan(false).writes.length,0);assert.equal(f.plan(false).codeWrites.length,0);
 f.apply(f.plan(true));assert.equal(f.words.get(HOOK),ORIGINAL);
 for(const change of [w=>w.set(HOOK,0),w=>w.set(CAVE,123),w=>w.set(0x803a388c,0)]){
  const b=fixture();change(b.words);const saved=new Map(b.words);assert.throws(()=>b.plan(false));assert.deepEqual(b.words,saved);
 }
});

// Independently execute the emitted integer instructions, checking both exits
// and architectural state across stage/bank guards. Memory below the original
// stack pointer is temporary hook storage; live stack words must be untouched.
test('only Fountain bank30 skips drawing; other banks/scenes preserve native registers and CR',()=>{
 const code=fountainParticleDrawCode();
 for(const bank of [0,1,2,29,30,31,255])for(const major of [1,2,3])for(const minor of [0,1,2,3])for(const stage of [2,3,8,31]){
  const r=Uint32Array.from({length:32},(_,i)=>(0xace10000+i*0x127)>>>0),memory=new Map();
  r[1]=0x81700000;r[30]=0x81000000;const initial=r.slice(),crInitial=0xbad0f00d;let cr=crInitial,pc=CAVE;
  const write=(a,v,n=4)=>{for(let i=0;i<n;i++)memory.set((a+i)>>>0,(v>>>(8*(n-i-1)))&255);};
  const read=(a,n)=>{let v=0;for(let i=0;i<n;i++)v=((v<<8)|(memory.get((a+i)>>>0)||0))>>>0;return v;};
  write(r[30]+8,bank,1);write(0x80479d30,major,1);write(0x80479d33,minor,1);write(0x8046db76,stage,2);write(r[1]+0x7a0,0x12345678);
  for(let steps=0;pc>=CAVE&&pc<CAVE+code.length*4;steps++){
   assert.ok(steps<60);const w=code[(pc-CAVE)/4],op=w>>>26,rt=w>>>21&31,ra=w>>>16&31,imm=w<<16>>16;let next=pc+4;
   const a=()=>((ra?r[ra]:0)+imm)>>>0;
   if(op===37){const at=a(),v=r[rt];write(at,v);r[ra]=at;}
   else if(op===36)write(a(),r[rt]);
   else if(op===32)r[rt]=read(a(),4);
   else if(op===34)r[rt]=read(a(),1);
   else if(op===40)r[rt]=read(a(),2);
   else if(op===15)r[rt]=((ra?r[ra]:0)+(imm<<16))>>>0;
   else if(op===14)r[rt]=a();
   else if(op===11){const x=r[ra]|0;cr=((cr&0x0fffffff)|((x<imm?8:x>imm?4:2)<<28))>>>0;}
   else if(op===16){assert.equal(w>>>16,0x4082);if(!(cr&0x20000000))next=pc+(w<<16>>16);}
   else if(op===18)next=(pc+((w&0x03fffffc)<<6>>6))>>>0;
   else if(w===0x7d800026)r[12]=cr;
   else if(w===0x7d8ff120)cr=r[12];
   else assert.fail('Unsupported emitted instruction '+w.toString(16));
   pc=next;
  }
  const skip=bank===30&&major===2&&minor===2&&stage===2;
  assert.equal(pc,skip?0x803a388c:HOOK+4);assert.equal(cr,crInitial);
  for(let i=1;i<32;i++)assert.equal(r[i],initial[i]);
  if(!skip)assert.equal(r[0],0x12345678);
  assert.equal(read(initial[1]+0x7a0,4),0x12345678);
 }
});
test('particle snapshot keeps links/banks separate and rejects invalid chains',()=>{
 const w=new Map([[0x804d0908,0x81000000],[0x81000000,0x81000100],[0x804d090c,0x81000200]]);
 const inspect=()=>inspectParticleBanks(a=>w.get(a)||0,a=>a===0x81000208?1:30,a=>a===0x8100014c?0:1);
 assert.deepEqual(inspect().banks,[{bank:1,particles:1,aboveDrawThreshold:1,links:[1]},{bank:30,particles:2,aboveDrawThreshold:1,links:[0]}]);
 w.set(0x81000100,0x81000000);assert.throws(inspect,/Invalid particle list/);
});
