import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectArchive} from '../../engines/browser-native/archive.mjs';
import {convertResultMotionAsset} from '../../engines/browser-native/result-motion-assets.mjs';

test('result-motion import converts outer metadata and nested descriptors without changing offsets',async t=>{
 const path=new URL('../../dist/native-port/fixtures/GmRstMFx.dat',import.meta.url);
 let input;try{input=new Uint8Array(await (await import('node:fs/promises')).readFile(path));}catch(error){if(error?.code==='ENOENT')return t.skip('fixture unavailable');throw error;}
 const before=input.slice(),source=inspectArchive(input),converted=convertResultMotionAsset(input,'GmRstMFx.dat'),native=new DataView(converted.image.buffer,converted.image.byteOffset,converted.image.byteLength);
 assert.deepEqual(input,before);
 assert.equal(native.getUint32(0,true),converted.image.length);
 assert.equal(native.getUint32(4,true),source.dataSize);
 assert.equal(native.getUint32(8,true),0);
 assert.equal(native.getUint32(12,true),source.publics.size);
 assert.equal(native.getUint32(16,true),0);
 let row=32+source.dataSize,index=0;for(const offset of source.publics.values())assert.equal(native.getUint32(row+index++*8,true),offset);
 assert.equal(converted.image.length,input.length);
 assert.notDeepEqual(converted.image.subarray(32,32+source.dataSize),input.subarray(32,32+source.dataSize));
 for(const motion of converted.motions)for(const clip of motion.clips){
  const sourceAt=32+motion.start+clip.offset,sourceSize=new DataView(input.buffer,input.byteOffset+sourceAt,4).getUint32(0);
  const nativeAt=32+motion.start+clip.offset,nativeSize=new DataView(converted.image.buffer,converted.image.byteOffset+nativeAt,4).getUint32(0,true);
  assert.equal(nativeSize,sourceSize);
 }
 assert(converted.clips>0&&converted.tracks>0&&converted.commands>0);
});
