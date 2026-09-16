import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectArchive} from '../../engines/browser-native/archive.mjs';
import {initializeStageArchive} from '../../engines/browser-native/stage-archive.mjs';
function fixture(change=()=>{}) {
  const body=new Uint8Array(4096),d=new DataView(body.buffer),root=400,table=800,lights=2000,special=2300;
  for(const [at,value] of [[8,table],[12,10],[24,lights],[28,48],[40,special],[44,44]])d.setUint32(root+at,value);
  const slots=[];for(const row of [3,4,6,7,8,9])for(const field of [0,4,8,16,24])slots.push(table+row*52+field);
  for(let i=0;i<24;i++)slots.push(lights+i*8);for(let i=0;i<44;i++)slots.push(special+i*4);
  const entries=slots.slice(0,75).map((at,i)=>({at,name:'GrdPStadiumFire_test'+i}));for(const {at} of entries)d.setUint32(at,0xffffffff);
  change({body,d,entries,root,table});
  const names=['map_head',...entries.map(e=>e.name)],strings=new TextEncoder().encode(names.join('\0')+'\0'),start=32+body.length,image=new Uint8Array(start+8+entries.length*8+strings.length),v=new DataView(image.buffer);
  [image.length,body.length,0,1,entries.length].forEach((n,i)=>v.setUint32(i*4,n));image.set(body,32);v.setUint32(start,root);
  let offset=9;entries.forEach((e,i)=>{v.setUint32(start+8+i*8,e.at);v.setUint32(start+12+i*8,offset);offset+=e.name.length+1;});image.set(strings,start+8+entries.length*8);return image;
}
test('Stadium initializes only transformation extern descriptor chains and preserves input',()=>{
  const source=fixture(),copy=source.slice(),out=initializeStageArchive(source,'stadium'),a=inspectArchive(out);
  assert.deepEqual(source,copy);assert.equal(a.externs.size,0);assert.equal(a.publics.get('map_head'),400);assert.equal(a.data.getUint32(800+3*52),0);
  assert.deepEqual(initializeStageArchive(out,'stadium'),out);
});
test('Stadium external boundary rejects unknown names, counts, active-model slots and cycles',()=>{
  for(const change of [a=>a.entries[0].name='OtherModel',a=>a.d.setUint32(a.root+12,9),a=>a.entries[0].at=a.table,a=>a.d.setUint32(a.entries[0].at,a.entries[0].at),a=>a.d.setUint32(a.entries[0].at,4096)])assert.throws(()=>initializeStageArchive(fixture(change),'stadium'));
});
