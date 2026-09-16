import {validateTrack} from './animation-assets.mjs';
// Shared HSD_AObjDesc/FObjDesc reader. Track payloads retain their byte coding.
export function readAnimationObject(archive,root,bone=0) {
  const d=archive.data,pointers=new Set(),words=new Set(),packed=new Set();
  const bounds=(at,size)=>{if(!Number.isInteger(at)||at%4||at<0||at+size>d.byteLength)throw Error('Animation object descriptor out of bounds');};
  function word(at){bounds(at,4);words.add(at);return d.getUint32(at);}
  function ptr(at){const v=word(at);if(!archive.relocations.has(at)){if(v)throw Error('Unrelocated animation object pointer');return null;}pointers.add(at);return v;}
  bounds(root,16);const flags=word(root),end=d.getFloat32(root+4);word(root+4);
  let track=ptr(root+8);const object=ptr(root+12);
  if(object!==null)throw Error('Animation object references need explicit ownership');
  if(!Number.isFinite(end)||end<0)throw Error('Invalid animation duration');
  const tracks=[],visited=new Set();
  while(track!==null) {
    bounds(track,20);if(visited.has(track))throw Error('Cyclic FObj descriptor');visited.add(track);
    const next=ptr(track),length=word(track+4),start=d.getFloat32(track+8);word(track+8);
    const objType=d.getUint8(track+12),fracValue=d.getUint8(track+13),fracSlope=d.getUint8(track+14),data=ptr(track+16);
    if(!length||data===null||data+length>d.byteLength||!Number.isFinite(start)||start<-32768||start>32767)throw Error('Invalid animation track');
    const bytes=Uint8Array.from(archive.bytes.subarray(32+data,32+data+length));validateTrack(bytes,fracValue,fracSlope);
    for(let i=12;i<16;i++)packed.add(track+i);for(let i=0;i<length;i++)packed.add(data+i);
    tracks.push({bone,start,objType,fracValue,fracSlope,bytes});track=next;
  }
  for(const at of packed)if(words.has(at&~3)||archive.relocations.has(at&~3))throw Error('Animation payload overlaps descriptors');
  return {root,flags,end,tracks,pointers,words,packed};
}
