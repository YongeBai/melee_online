import test from 'node:test';
import assert from 'node:assert/strict';
import {convertItemModels,characterArticleSlots} from '../../engines/browser-native/item-model-assets.mjs';
function fixture(mutate=()=>{}) {
  const body=new Uint8Array(640),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(at,value)=>{d.setUint32(at,value);relocs.add(at);};
  ptr(0x48,128);ptr(128,192);d.setUint32(132,0xffffffff);ptr(136,192);
  ptr(192,256);ptr(200,392);ptr(208,448);body[256]=0xb5;body[257]=0xca;
  d.setFloat32(260,1.25);d.setInt32(264,-1);d.setFloat32(352,1.5);d.setInt32(376,-1);
  d.setUint32(392,1);ptr(396,400);d.setFloat32(404,-1.25);d.setFloat32(428,2);
  ptr(448,512);d.setUint32(452,1);body[460]=0x80;d.setUint32(516,1);for(let i=0;i<3;i++)d.setFloat32(544+i*4,1);
  mutate({body,d,relocs});
  const text=new TextEncoder().encode('ftDataMario\0'),start=32+body.length+relocs.size*4,bytes=new Uint8Array(start+8+text.length),view=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>view.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((at,i)=>view.setUint32(32+body.length+i*4,at));bytes.set(text,start+8);return bytes;
}
test('item model import preserves aliases, packed flags and signed words, without following other item types',()=>{
  const input=fixture(),before=input.slice(),r=convertItemModels(input,'PlMr.dat'),d=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.equal(r.rows.length,2);assert.deepEqual(r.rows.map(r=>r.slot),[0,2]);assert.equal(r.rows[0].model,r.rows[1].model);
  assert.equal(d.getUint8(256),0xb5);assert.equal(d.getUint8(257),0xca);assert.equal(d.getUint8(460),0x80);assert.equal(d.getInt32(264,true),-1);assert.equal(d.getFloat32(260,true),1.25);
  assert.deepEqual(r.rows[0].hurtboxes,[{bone:0,a:[-1.25,0,0],b:[0,0,0],scale:2}]);assert.equal(r.rows[0].scene.model.tree.nodes.length,1);
  assert.equal(Object.keys(characterArticleSlots).length,27);assert.equal(new DataView(r.image.buffer).getUint32(12,true),1);
});
test('item model import rejects nonfinite parameters, unsafe bone/hurtbox extents and type overlap',()=>{
  for(const mutate of [a=>a.d.setFloat32(260,NaN),a=>a.d.setUint32(452,101),a=>a.d.setUint32(456,1),a=>a.d.setUint32(392,3),a=>a.d.setUint32(400,1),a=>a.d.setUint32(192,448),a=>a.relocs.delete(448),a=>{a.relocs.add(212);a.d.setUint32(212,392);}])
    assert.throws(()=>convertItemModels(fixture(mutate),'PlMr.dat'));
});
