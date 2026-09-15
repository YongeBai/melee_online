import {inspectArchive} from './archive.mjs';

// Animation track payloads are already byte-coded little-endian even inside a
// big-endian HSD archive. Preserve payload bytes; decode only descriptors.
export function validateTrack(bytes, fracValue, fracSlope) {
  let cursor=0,commands=0;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const byte=()=>{if(cursor>=bytes.length)throw Error('Truncated animation stream');return bytes[cursor++];};
  function variable(initial,shift) {
    let value=initial;
    for(;;) {
      const b=byte();value+=(b&127)*2**shift;
      if(!(b&128))return value;
      shift+=7;if(shift>28)throw Error('Oversized animation integer');
    }
  }
  function scalar(frac) {
    const kind=frac>>5;
    if((kind===0&&frac!==0)||kind>4||(frac&31)>30)throw Error('Unsupported animation scalar');
    const width=kind===0?4:kind<3?2:1;
    if(cursor+width>bytes.length)throw Error('Truncated animation scalar');
    if(kind===0&&!Number.isFinite(view.getFloat32(cursor,true)))throw Error('Nonfinite animation scalar');
    cursor+=width;
  }
  while(cursor<bytes.length) {
    const header=byte(), op=header&15;
    if(op<1||op>6)throw Error('Unsupported animation opcode: '+op);
    let count=((header>>4)&7)+1;
    if(header&128)count=variable(count,3);
    if(count>65535)throw Error('Oversized animation pack');
    for(let i=0;i<count;i++) {
      commands++;
      if(op!==5)scalar(fracValue);
      if(op===4||op===5)scalar(fracSlope);
      if(op!==5 && cursor<bytes.length) {
        const wait=variable(0,0);
        if(wait>65535)throw Error('Animation wait exceeds native field');
      }
      if(cursor===bytes.length && i+1<count)throw Error('Truncated animation pack');
    }
  }
  return commands;
}

export function readFigaTree(input) {
  const archive=inspectArchive(input), d=archive.data;
  const entry=[...archive.publics].filter(([name])=>name.endsWith('_figatree'));
  if(entry.length!==1)throw Error('Expected one fighter animation tree');
  const [name,root]=entry[0];
  if(root+20>d.byteLength)throw Error('Truncated animation tree');
  const type=d.getUint32(root),flags=d.getUint32(root+4),frames=d.getFloat32(root+8);
  // lbAnim uses bit zero to select classical scaling. Both 0 and 1 are
  // present in retail moves (Mario's taunt and several Yoshi attacks use 0).
  if((type!==0&&type!==1) || !Number.isFinite(frames)||frames<0||frames>100000)throw Error('Unsupported animation tree');
  if(!archive.relocations.has(root+12)||!archive.relocations.has(root+16))throw Error('Unrelocated animation tree');
  let node=d.getUint32(root+12),at=d.getUint32(root+16),bone=0;
  const tracks=[];
  for(;;bone++) {
    if(node>=d.byteLength||bone>140)throw Error('Invalid animation bone list');
    const count=d.getInt8(node++);if(count===-1)break;
    if(count<0)throw Error('Invalid animation track count');
    for(let i=0;i<count;i++,at+=12) {
      if(at+12>d.byteLength||!archive.relocations.has(at+8))throw Error('Invalid animation track descriptor');
      const length=d.getUint16(at),start=d.getInt16(at+2),objType=d.getUint8(at+4),
        fracValue=d.getUint8(at+5),fracSlope=d.getUint8(at+6),data=d.getUint32(at+8);
      if(!length||data+length>d.byteLength)throw Error('Invalid animation payload');
      const bytes=archive.bytes.slice(32+data,32+data+length);
      const commands=validateTrack(bytes,fracValue,fracSlope);
      tracks.push({bone,start,objType,fracValue,fracSlope,bytes,commands});
    }
  }
  return {name,type,flags,frames,bones:bone,tracks};
}

export function* animationArchives(bytes,all=false) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let offset=0;offset<bytes.length;) {
    if(offset+32>bytes.length)throw Error('Truncated animation archive header');
    const size=view.getUint32(offset);
    if(size<32||offset+size>bytes.length)throw Error('Invalid animation archive size');
    yield {offset,tree:readFigaTree(bytes.subarray(offset,offset+size))};
    if(!all)return;
    offset=Math.ceil((offset+size)/32)*32;
  }
}
