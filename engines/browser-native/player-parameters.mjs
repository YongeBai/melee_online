import {inspectArchive,nativeSubgraphImage} from './archive.mjs';

// pl/types.h: pl_804D6470_t is 0x184 bytes of f32/u32/s32, except the
// opaque packed bytes at 0xC0..0xC3. The public root holds one pointer.
export function convertPlayerParameters(input) {
  const archive=inspectArchive(input),root=archive.publics.get('plLoadCommonData');
  if(archive.externs.size||root===undefined||root%4||root+4>archive.dataSize||!archive.relocations.has(root))throw Error('Invalid player parameter root');
  const source=archive.data.getUint32(root),size=0x184;
  if(source%4||source+size>archive.dataSize||(root>=source&&root<source+size)||archive.relocations.size!==1)throw Error('Invalid player parameter layout');
  const data=new Uint8Array(size+4),out=new DataView(data.buffer);
  data.set(archive.bytes.subarray(32+source,32+source+size));
  for(let at=0;at<size;at+=4)if(at!==0xC0)out.setUint32(at,archive.data.getUint32(source+at),true);
  // These source parameters are modulo divisors in the original statistics
  // callbacks. Reject corrupt input before it reaches those callbacks.
  for(const at of [0x18,0x2C,0x70,0x7C,0x90,0xA8,0xB8,0xC4,0xE0,0x130])if(!out.getUint32(at,true))throw Error('Zero player statistics interval');
  out.setUint32(size,0,true);
  return {image:nativeSubgraphImage(data,new Set([size]),new Map([['plLoadCommonData',size]]))};
}
