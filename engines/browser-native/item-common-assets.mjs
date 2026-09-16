import {inspectArchive,nativeSubgraphImage} from './archive.mjs';

// ItemCommonData and it_804D6D40_t from the pinned source. Packed bytes and
// unidentified padding stay byte-for-byte intact; only declared words swap.
// The item registries and color table are deliberately not public yet.
export function convertItemCommon(input) {
  const archive=inspectArchive(input),d=archive.data,root=archive.publics.get('itPublicData');
  if(root===undefined)throw Error('Invalid common item archive');
  const bounds=(at,n)=>{if(!Number.isInteger(at)||at<0||at%4||at+n>d.byteLength)throw Error('Common item bounds');};
  bounds(root,24);
  const external=new Set();
  for(const start of archive.externs.values())for(let at=start;at!==0xffffffff;) {
    bounds(at,4);if(external.has(at))throw Error('Invalid common item external chain');
    external.add(at);at=d.getUint32(at);
  }
  function sourcePointer(at){if(!archive.relocations.has(at))throw Error('Missing common item pointer');const p=d.getUint32(at);bounds(p,4);return p;}
  const common=sourcePointer(root),parameters=sourcePointer(root+16);
  bounds(common,0x160);bounds(parameters,28);
  if(common<parameters+28&&parameters<common+0x160)throw Error('Overlapping common item structures');
  if([common,parameters].some((p,i)=>p<root+24&&root<p+[0x160,28][i]))throw Error('Common item root overlap');
  if([...external].some(at=>at>=root&&at<root+24||at>=common&&at<common+0x160||at>=parameters&&at<parameters+28))throw Error('Common item data requires external linking');
  const bytes=Uint8Array.from(archive.bytes.subarray(32,32+archive.dataSize)),out=new DataView(bytes.buffer),words=[],packed=[];
  const commonFloats=new Set([0x4c,...Array.from({length:24},(_,i)=>0x54+i*4),...Array.from({length:8},(_,i)=>0xb8+i*4),0xe0,0xe8,0xf0,0xf4,0xf8,0x144,0x14c,0x150,0x154,0x158,0x15c]);
  // x64 is declared s32 despite its historical suffix; retain its numeric bits.
  commonFloats.delete(0x64);
  for(const [at,n] of [[common,0x160],[parameters,28]])for(let offset=0;offset<n;offset+=4) {
    const slot=at+offset;if(archive.relocations.has(slot))throw Error('Common item scalar relocation');
    if(at===common&&[0x48,0xe4,0xec].includes(offset)){for(let i=0;i<4;i++)packed.push(slot+i);continue;}
    if((at===parameters&&offset>0||at===common&&commonFloats.has(offset))&&!Number.isFinite(d.getFloat32(slot)))throw Error('Nonfinite common item parameter');
    words.push(slot);out.setUint32(slot,d.getUint32(slot),true);
  }
  return {common,parameters,words,packed,image:nativeSubgraphImage(bytes,[],new Map([['native_item_common',common],['native_item_parameters',parameters]]))};
}
