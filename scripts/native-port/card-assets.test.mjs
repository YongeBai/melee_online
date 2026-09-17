import test from 'node:test';import assert from 'node:assert/strict';
import {convertCardIconAsset} from '../../engines/browser-native/card-assets.mjs';
function fixture(mutate=()=>{}){
 const names=['MemCardBanner_01','MemCardBanner_02','MemCardBanner_03','MemCardIcon_01','MemCardIconData'],offsets=[0,6144,12288,18432,19968],data=new Uint8Array(19988),d=new DataView(data.buffer);
 for(let i=0;i<19968;i++)data[i]=(i*23+7)%256;
 for(let i=0;i<4;i++)d.setUint32(19968+i*4,offsets[i]);mutate(d);
 const strings=new TextEncoder().encode(names.join('\0')+'\0'),bytes=new Uint8Array(32+19988+16+40+strings.length),h=new DataView(bytes.buffer);[bytes.length,19988,4,5,0].forEach((v,i)=>h.setUint32(i*4,v));bytes.set(data,32);
 for(let i=0;i<4;i++)h.setUint32(32+19988+i*4,19968+i*4);
 let stringOffset=0;for(let i=0;i<5;i++){h.setUint32(32+19988+16+i*8,offsets[i]);h.setUint32(32+19988+20+i*8,stringOffset);stringOffset+=names[i].length+1;}bytes.set(strings,32+19988+56);return bytes;
}
test('card icon import preserves packed image bytes and relocates all four original pointers',()=>{
 const input=fixture(),before=input.slice(),result=convertCardIconAsset(input),a=new DataView(result.image.buffer,result.image.byteOffset);
 assert.deepEqual(input,before);assert.deepEqual(result.image.subarray(32,32+19968),input.subarray(32,32+19968));
 assert.equal(result.images.length,4);assert.equal(a.getUint32(8,true),4);
 const d=new DataView(result.image.buffer,result.image.byteOffset+32);assert.equal(d.getUint32(19980,true),18432);assert.equal(d.getUint32(19968,true),0);
});
test('card icon import rejects changed pointer layout and nonzero terminator',()=>{
 assert.throws(()=>convertCardIconAsset(fixture(d=>d.setUint32(19980,18436))));assert.throws(()=>convertCardIconAsset(fixture(d=>d.setUint32(19984,1))));
});
