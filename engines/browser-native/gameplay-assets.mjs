import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';
export const gameplayFields=[0x24,0x28,0x34,0x38,0x3c,0x44,0x4c,0x54,0x58];

// Typed ftData fields needed by reset/collision/camera/idle paths. This does not
// publish the full ftData symbol while item and secondary-animation graphs remain.
export function convertGameplayParameters(input,name,partCount,motionCount) {
  const a=inspectArchive(input),d=a.data,source=a.publics.get('ftData'+fighterArchives[name.slice(2,4)]);
  if(source===undefined||!Number.isInteger(partCount)||partCount<1||partCount>140||!Number.isInteger(motionCount)||motionCount<1)throw Error('Gameplay parameter root');
  const root=(a.dataSize+3)&~3,bytes=new Uint8Array(root+36),out=new DataView(bytes.buffer);bytes.set(a.bytes.subarray(32,32+a.dataSize));
  const pointers=new Set(),typed=new Map(),values=[];
  function range(at,size,align=4){if(!Number.isInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Gameplay parameter range');}
  function claim(at,size,type){range(at,size,size===1?1:size===2?2:4);for(let i=0;i<size;i++){const prev=typed.get(at+i);if(prev&&prev!==at+':'+type)throw Error('Overlapping gameplay data types');typed.set(at+i,at+':'+type);}}
  function pointer(at){range(at,4);const value=d.getUint32(at);if(!a.relocations.has(at)){if(value)throw Error('Unrelocated gameplay pointer');claim(at,4,'pointer');out.setUint32(at,0,true);return null;}range(value,1,1);claim(at,4,'pointer');pointers.add(at);out.setUint32(at,value,true);return value;}
  function scalar(at,type='u32') {
    const size=type==='u8'?1:type==='s16'?2:4;claim(at,size,type);
    for(let i=0;i<size;i++)if(a.relocations.has((at+i)&~3))throw Error('Pointer inside gameplay scalar');
    const value=type==='f32'?d.getFloat32(at):type==='s32'?d.getInt32(at):type==='s16'?d.getInt16(at):type==='u8'?d.getUint8(at):d.getUint32(at);
    if(!Number.isFinite(value))throw Error('Nonfinite gameplay parameter');
    if(size===4)out.setUint32(at,d.getUint32(at),true);else if(size===2)out.setUint16(at,d.getUint16(at),true);
    values.push({at,type,value});return value;
  }
  const bone=(at,type='u32')=>{const value=scalar(at,type);if(value<0||value>=partCount)throw Error('Invalid gameplay bone');return value;};
  const roots=gameplayFields.map((offset,i)=>{const value=pointer(source+offset);out.setUint32(root+i*4,value??0,true);if(value!==null)pointers.add(root+i*4);return value;});
  if(roots.slice(2).some(p=>p===null))throw Error('Missing required gameplay table');
  const waits=[];
  for(const at of roots.slice(0,2)) {
    if(at===null){waits.push(null);continue;}const rows=[];let weight=0;
    for(let i=0;;i++){if(i>=64)throw Error('Unterminated idle choices');const index=scalar(at+i*8,'s32'),chance=scalar(at+i*8+4,'s32');rows.push([index,chance]);if(index===-1)break;if(index<0||index>=motionCount||chance<1||chance>100)throw Error('Invalid idle choice');weight+=chance;}
    if(weight!==100)throw Error('Idle weights must total 100');waits.push(rows);
  }
  const thrown=[bone(roots[2]),scalar(roots[2]+4,'f32')],colliders=[];
  for(let i=0;i<2;i++){const at=roots[3]+i*20;colliders.push([bone(at),...Array.from({length:4},(_,j)=>scalar(at+4+j*4,'f32'))]);}
  const camera=Array.from({length:6},(_,i)=>scalar(roots[4]+i*4,'f32'));
  const ecb=[...Array.from({length:6},(_,i)=>bone(roots[5]+i*2,'s16')),...Array.from({length:4},(_,i)=>scalar(roots[5]+12+i*4,'f32'))];
  const sfx=[],sfxLists=[];
  for(let i=0;i<14;i++) {
    const at=roots[6]+i*4;
    if([0,7,8].includes(i)) {
      const list=pointer(at);sfx.push(list);if(list===null){sfxLists.push(null);continue;}
      const count=scalar(list,'s32'),ids=pointer(list+4);if(count<0||count>64||(count&&ids===null))throw Error('Invalid sound list');
      sfxLists.push(Array.from({length:count},(_,j)=>scalar(ids+j*4,'s32')));
    } else sfx.push(scalar(at,'s32'));
  }
  const effects=Array.from({length:5},(_,i)=>bone(roots[7]+i*4,'s32'));
  const ik={bones:[0,1,8,9,16,17].map(o=>bone(roots[8]+o,'u8')),lengths:[4,12,24].map(o=>scalar(roots[8]+o,'f32'))};
  return {root,roots,waits,thrown,colliders,camera,ecb,sfx,sfxLists,effects,ik,values,
    image:nativeSubgraphImage(bytes,pointers,new Map([['native_fighter_gameplay',root]]))};
}
