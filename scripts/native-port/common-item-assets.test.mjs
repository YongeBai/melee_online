import test from 'node:test';
import assert from 'node:assert/strict';
import {convertPeachCommonItems} from '../../engines/browser-native/common-item-assets.mjs';
function fixture(change=()=>{}){
  const body=new Uint8Array(4096),d=new DataView(body.buffer),relocations=new Set(),ptr=(at,to)=>{relocations.add(at);d.setUint32(at,to);};
  ptr(4,32);const rows=[];
  for(const [i,kind]of [6,7,12].entries()){
    const article=128+i*768,attr=article+32,special=article+176,states=article+240,model=article+384,joint=model+16;
    ptr(32+kind*4,article);ptr(article,attr);ptr(article+4,special);ptr(article+12,states);ptr(article+16,model);ptr(model,joint);d.setUint32(model+4,1);
    for(let j=0;j<3;j++)d.setFloat32(joint+32+j*4,1);
    if(kind===6)for(let j=0;j<11;j++)d.setFloat32(special+j*4,j+.25);
    if(kind===7)for(let j=0;j<6;j++)[0,2].includes(j)?d.setFloat32(special+j*4,j+.25):d.setInt32(special+j*4,-j);
    if(kind===12){for(let j=0;j<9;j++)j<3||j===6?d.setUint32(special+j*4,100+j):d.setFloat32(special+j*4,j+.25);body.set([255,0,170,255,0,187,255,0,204],special+36);}
    rows.push({kind,article,special,states,model,joint});
  }
  change({body,d,ptr,relocations,rows});const name=new TextEncoder().encode('itPublicData\0'),start=32+body.length+relocations.size*4,image=new Uint8Array(start+8+name.length),v=new DataView(image.buffer);
  [image.length,body.length,relocations.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));image.set(body,32);[...relocations].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));image.set(name,start+8);return {image,rows};
}
test('Peach common items preserve signed parameters and packed Beam Sword colors',()=>{
  const {image,rows}=fixture(),copy=image.slice(),r=convertPeachCommonItems(image),v=new DataView(r.image.buffer,32);
  assert.deepEqual(image,copy);assert.deepEqual(r.rows.map(r=>[r.kind,r.stateCount]),[[6,7],[7,4],[12,2]]);
  assert.equal(v.getFloat32(rows[0].special+40,true),10.25);assert.equal(v.getInt32(rows[1].special+20,true),-5);
  assert.equal(v.getUint32(rows[2].special,true),100);assert.equal(v.getFloat32(rows[2].special+32,true),8.25);
  assert.deepEqual([...r.image.slice(32+rows[2].special+36,32+rows[2].special+45)],[255,0,170,255,0,187,255,0,204]);
});
test('Peach common items reject missing graphs, corrupt floats and pointer/color overlap',()=>{
  for(const change of [a=>a.relocations.delete(4),a=>a.d.setFloat32(a.rows[0].special,NaN),a=>a.ptr(a.rows[2].special+36,a.rows[0].joint),a=>a.ptr(a.rows[1].states,a.rows[1].states),a=>a.ptr(a.rows[0].states+8,a.rows[0].states)])assert.throws(()=>convertPeachCommonItems(fixture(change).image));
});
