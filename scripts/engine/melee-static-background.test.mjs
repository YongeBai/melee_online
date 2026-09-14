import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planStaticBackgroundAnimation} from './melee-static-background.js';
import {FOUNTAIN_ANIMATION_PROC as PROC,FOUNTAIN_ANIMATION_CAVE as CAVE} from './melee-fountain-animation.js';
import {BACKGROUND_RENDER,EMPTY_RENDER} from './melee-background.js';

const callbacks={31:[[1,0x8021a26c],[3,0x8021a3bc]],32:[[1,0x8021a968],[2,0x8021a9a4],
  [4,0x8021ab80],[5,0x8021abd4],[6,0x8021ac28],[7,0x8021add0],[8,0x8021b28c]]};
function fixture(stage){
  const fd=fs.openSync(process.env.MELEE_TEST_ISO,'r');
  const disk=(at,n)=>{const b=Buffer.alloc(n);assert.equal(fs.readSync(fd,b,0,n,at),n);return b;};
  const dol=disk(0x420,4).readUInt32BE(),header=disk(dol,256),words=new Map(),bytes=new Map();
  for(let i=0;i<18;i++){
    const base=header.readUInt32BE(0x48+i*4),length=header.readUInt32BE(0x90+i*4);
    if(PROC>=base&&PROC+0x68<=base+length){const data=disk(dol+header.readUInt32BE(i*4)+PROC-base,0x68);for(let k=0;k<0x68;k+=4)words.set(PROC+k,data.readUInt32BE(k));break;}
  }
  fs.closeSync(fd);words.set(0x804d782c,0x80500000);words.set(0x80500014,0x80600000);
  const rows=callbacks[stage];rows.forEach(([mapId,callback],index)=>{
    const g=0x80600000+index*0x200,ground=g+0x40,p=g+0x100;
    words.set(g+8,index===rows.length-1?0:g+0x200);words.set(g+0x2c,ground);words.set(ground+4,g);words.set(ground+0x14,mapId);
    bytes.set(g+1,3);const hidden=stage===31||mapId>=4;bytes.set(ground+0x11,hidden?0x40:mapId===1?0x20:0);
    words.set(g+0x1c,hidden?EMPTY_RENDER:BACKGROUND_RENDER);words.set(g+0x18,p);
    for(const [n,proc]of [[0,callback],[1,0x801c1d38],[2,PROC]]){const q=p+n*0x20;words.set(q,n===2?0:q+0x20);words.set(q+0x10,g);words.set(q+0x14,proc);}
  });
  const read=a=>words.get(a)||0,read8=a=>bytes.get(a)||0;
  return{words,bytes,read,read8,plan:enabled=>planStaticBackgroundAnimation(read,read8,enabled,stage)};
}
const options={skip:!process.env.MELEE_TEST_ISO};
for(const stage of[31,32])test('static decorative animation changes only eligible '+stage+' processes',options,()=>{
  const f=fixture(stage),before=new Map(f.words),plan=f.plan(false);assert.deepEqual(f.words,before);
  const eligible=stage===31?1:callbacks[stage].length;
  assert.equal(plan.objects.length,eligible);assert.equal(plan.writes.length,eligible);
  assert.ok(plan.writes.every(([,value])=>value===CAVE));
  if(stage===31){
    const map3JointProcess=0x80600000+0x200+0x100+2*0x20;
    assert.equal(f.words.get(map3JointProcess+0x14),PROC);
    assert.ok(plan.preserved.some(label=>label.includes('RNG/transition')));
  }
  for(const[address,value]of[...plan.codeWrites,...plan.writes])f.words.set(address,value);
  assert.deepEqual(f.plan(false).writes,[]);assert.deepEqual(f.plan(false).codeWrites,[]);
  assert.equal(f.plan(true).writes.length,eligible);
});
test('static animation refuses visible Battlefield scenery and protects main stage maps',options,()=>{
  const f=fixture(31);f.words.set(0x80600000+0x1c,BACKGROUND_RENDER);assert.throws(()=>f.plan(false),/black-background/);
  const fd=fixture(32);fd.words.set(0x80600000+0x400+0x1c,BACKGROUND_RENDER);assert.throws(()=>fd.plan(false),/black-background/);
  assert.ok(!fixture(32).plan(false).objects.some(object=>[0,3].includes(object.mapId)));
});
