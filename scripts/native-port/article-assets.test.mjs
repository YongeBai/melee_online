import test from 'node:test';
import assert from 'node:assert/strict';
import {convertFighterArticles,itemCommandWords,fighterArticleProfiles} from '../../engines/browser-native/article-assets.mjs';
import {readMotionScripts} from '../../engines/browser-native/motion-assets.mjs';

function fixture(code='Fx',mutate=()=>{}) {
  const body=new Uint8Array(4096),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};
  ptr(72,128);const slots=Object.keys(fighterArticleProfiles[code].articles).map(Number);
  const states=[800,900,1100],scripts=[1800,1860,1892];
  for(const [i,slot] of slots.entries()) {
    const a=160+i*24;ptr(128+slot*4,a);ptr(a,256);ptr(a+4,512+i*40);ptr(a+12,states[i]);ptr(a+16,392);
    for(let j=0;j<fighterArticleProfiles[code].articles[slot][0];j++)ptr(states[i]+j*16+12,scripts[i]);
  }
  d.setFloat32(260,1.25);d.setInt32(264,-1);d.setFloat32(352,1);body[256]=0xa5;
  ptr(392,416);d.setUint32(396,1);for(let i=0;i<3;i++)d.setFloat32(448+i*4,1);
  d.setFloat32(512,35);d.setFloat32(516,3);d.setFloat32(552,1.5);d.setFloat32(592,5);d.setFloat32(596,2);
  // A relocated call and six-word hitbox command; continuations are distinct.
  d.setUint32(1800,5<<26);ptr(1804,1820);d.setUint32(1808,0);
  d.setUint32(1820,11<<26);d.setUint32(1824,0x12345678);d.setUint32(1844,6<<26);
  d.setUint32(1860,(16<<26)|(10<<18));d.setUint32(1872,0);
  d.setUint32(1892,15<<26);d.setUint32(1896,0);
  // Deliberately untyped extra data must not become a public Article.
  if(code==='Fx'){ptr(144,3000);body[3000]=0xe3;}
  mutate({body,d,relocs,ptr,states,scripts});
  const text=new TextEncoder().encode('ftData'+({Fx:'Fox',Fc:'Falco',Mr:'Mario',Lg:'Luigi',Dr:'Drmario'})[code]+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+text.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(text,pub+8);return bytes;
}
test('Fox/Falco Articles preserve script branches, special floats and model graphs without exporting extra fighter data',()=>{
  for(const code of ['Fx','Fc']) {
    const input=fixture(code),before=input.slice(),r=convertFighterArticles(input,'Pl'+code+'.dat'),v=new DataView(r.image.buffer,32);
    assert.deepEqual(input,before);assert.deepEqual(r.rows.map(r=>r.stateCount),[2,9,3]);
    assert.equal(v.getFloat32(512,true),35);assert.equal(v.getFloat32(552,true),1.5);
    assert.equal(v.getUint32(1824,true),0x12345678);assert.equal(v.getUint32(1804,true),1820);
    assert.equal(r.pointerSlots.has(1804),true);assert.equal(r.pointerSlots.has(144),false);assert.equal(r.image[3032],code==='Fx'?0xe3:0);
    assert.deepEqual(r.rows[0].script.commands.get(1820),{offset:1820,opcode:11,words:6,target:null});
    const header=new DataView(r.image.buffer);assert.equal(header.getUint32(12,true),3);
  }
});
test('Article import rejects malformed animated states, malformed scripts and descriptor overlap',()=>{
  for(const mutate of [
    a=>{a.ptr(800,2200);a.ptr(2200,2200);},a=>a.d.setFloat32(512,NaN),a=>a.relocs.delete(164),
    a=>a.ptr(164,256),a=>a.ptr(812,256),a=>a.ptr(1804,1804),a=>a.d.setUint32(1820,63<<26),
    a=>a.ptr(176,4092),a=>a.ptr(172,4088),
  ])assert.throws(()=>convertFighterArticles(fixture('Fx',mutate),'PlFx.dat'),undefined,String(mutate));
  assert.throws(()=>convertFighterArticles(fixture(),'PlPe.dat'),/pending/);
});
test('item sound command lengths follow their secondary dispatch, including unknown no-op cases',()=>{
  for(const sub of [0,1,2,10,11,3,255]) {
    const words=[0,1,2,10,11].includes(sub)?3:2,bytes=new Uint8Array((words+1)*4),data=new DataView(bytes.buffer);
    data.setUint32(0,(16<<26)|(sub<<18));const r=readMotionScripts({data,relocations:new Set()},[0],itemCommandWords);
    assert.equal(r.commands.get(0).words,words);assert.equal(r.commands.get(words*4).opcode,0);
  }
});

test('Mario-family Article profiles convert shared joint/material animations and preserve null states',()=>{
  for(const code of ['Mr','Lg','Dr']){
    const input=fixture(code,({ptr,d,states})=>{
      // A valid two-node joint animation and material hierarchy, reused by
      // multiple serialized states. Numeric payloads must change endianness.
      ptr(states[0],2200);ptr(2200,2220);d.setUint32(2216,0x12345678);
      ptr(states[0]+4,2260);ptr(2260,2280);
      if(code==='Dr'){ptr(states[0]+16,2200);ptr(states[0]+20,2260);}
    }),before=input.slice(),r=convertFighterArticles(input,'Pl'+code+'.dat'),d=new DataView(r.image.buffer,32);
    assert.deepEqual(input,before);assert.deepEqual(r.rows.map(x=>[x.slot,x.stateCount,x.specialWords]),Object.entries(fighterArticleProfiles[code].articles).map(([slot,[states,words]])=>[Number(slot),states,words]));
    assert.equal(d.getUint32(2200,true),2220);assert.equal(d.getUint32(2216,true),0x12345678);assert.equal(d.getUint32(2260,true),2280);
    assert.equal(r.rows[0].animations[0].joint,2200);assert.equal(r.rows[0].animations[0].material,2260);
    if(code==='Dr')assert.equal(r.rows[0].animations[5].joint,null);
  }
});
test('Article animation import rejects morph tracks and packed/type conflicts',()=>{
  assert.throws(()=>convertFighterArticles(fixture('Mr',a=>a.ptr(808,2200)),'PlMr.dat'),/morph/);
  assert.throws(()=>convertFighterArticles(fixture('Mr',a=>a.ptr(800,512)),'PlMr.dat'));
});
