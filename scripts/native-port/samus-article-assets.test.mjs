import test from 'node:test';
import assert from 'node:assert/strict';
import {convertFighterArticles} from '../../engines/browser-native/article-assets.mjs';
function fixture(mutate=()=>{}){
  const body=new Uint8Array(8192),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};
  ptr(72,128);
  const counts=[2,9,4,0],specials=[];
  for(let slot=0;slot<4;slot++){
    const at=160+slot*24,attrs=256+slot*160,special=1024+slot*256,states=2304+slot*256,model=4096+slot*80;
    specials.push(special);ptr(128+slot*4,at);ptr(at,attrs);ptr(at+4,special);ptr(at+16,model);ptr(model,model+16);
    for(let i=0;i<3;i++)d.setFloat32(model+16+32+i*4,1);
    if(counts[slot])ptr(at+12,states);
  }
  // Integer fields are not floats, including bits that would encode NaN.
  d.setUint32(specials[1]+4,0x7fc00000);d.setInt32(specials[3]+12,30);d.setInt32(specials[3]+52,30);
  for(let i=0;i<4;i++){
    const joint=4608+i*64;ptr(specials[3]+100+i*4,joint);for(let j=0;j<3;j++)d.setFloat32(joint+32+j*4,1);
  }
  for(let i=0;i<15;i++)ptr(specials[3]+116+i*4,5000+i*4);
  // One shared joint animation and one shared material animation.
  ptr(5000,5200);ptr(5012,5200);d.setUint32(5216,0x1234);ptr(5004,5232);
  ptr(144,5504);ptr(5504,5568);ptr(5508,5800);ptr(5512,5200);ptr(5516,5232);
  ptr(5800,5200);ptr(5804,5200);
  // Throw accessory has an owned child and an instance referring to it.
  ptr(5568+8,5632);ptr(5632+12,5696);d.setUint32(5696+4,0x1000);ptr(5696+8,5632);
  for(const joint of [5568,5632,5696])for(let j=0;j<3;j++)d.setFloat32(joint+32+j*4,1);
  mutate({d,ptr,specials});
  const text=new TextEncoder().encode('ftDataSamus\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+text.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(text,pub+8);return bytes;
}
test('Samus imports four Articles, typed grapple animation indirection and instanced throw accessory',()=>{
  const input=fixture(),before=input.slice(),r=convertFighterArticles(input,'PlSs.dat'),d=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.deepEqual(r.rows.map(r=>r.stateCount),[2,9,4,0]);assert.equal(r.rows[3].states,null);
  assert.deepEqual(r.attachments.map(r=>r.nodes),[1,1,1,1,3]);assert.equal(r.extraRows[0].joint,5568);
  assert.equal(d.getUint32(1284,true),0x7fc00000);assert.equal(d.getInt32(1804,true),30);
  assert.equal(d.getUint32(5000,true),5200);assert.equal(d.getUint32(5216,true),0x1234);
  assert.equal(d.getUint32(5704,true),5632);assert.ok(r.pointerSlots.has(5704));
});
test('Samus rejects missing throw animation tables, misplaced states and active shape animation data',()=>{
  for(const mutate of [a=>a.ptr(160+3*24+12,2304),a=>a.ptr(5508,8188),a=>a.ptr(5704,5568),a=>a.ptr(5008,8188)])
    assert.throws(()=>convertFighterArticles(fixture(mutate),'PlSs.dat'));
});
