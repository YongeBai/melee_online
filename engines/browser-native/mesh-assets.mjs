import {inspectArchive} from './archive.mjs';
import {readJointTree} from './joint-assets.mjs';

// Typed decoding of static GX geometry. Material, texture and envelope offsets
// are retained for their own importers; this is not yet a renderer.
export function readModelMeshes(input) {
  const archive=inspectArchive(input),d=archive.data,tree=readJointTree(input),meshes=[];
  const bounds=(at,size)=>{if(!Number.isSafeInteger(at)||at<0||at+size>d.byteLength)throw Error('Mesh data out of bounds');};
  function pointer(slot) {
    bounds(slot,4);const at=d.getUint32(slot);
    if(archive.relocations.has(slot))return at;
    if(at)throw Error('Unrelocated mesh pointer');return null;
  }
  function* list(first,size) {
    const seen=new Set();
    for(let at=first;at!==null;at=pointer(at+4)) {
      bounds(at,size);if(seen.has(at))throw Error('Cyclic mesh list');seen.add(at);yield at;
    }
  }
  function attributes(at) {
    if(at===null)throw Error('Missing vertex descriptors');
    const result=[];const seen=new Set();
    for(let i=0;i<32;i++,at+=24) {
      bounds(at,4);const attr=d.getUint32(at);if(attr===255)return result.sort((a,b)=>a.order-b.order);
      bounds(at,24);
      const type=d.getUint32(at+4),count=d.getUint32(at+8),format=d.getUint32(at+12),
        frac=d.getUint8(at+16),stride=d.getUint16(at+18),data=pointer(at+20),order=attr===25?10:attr;
      if(seen.has(order)||attr>25||(attr>20&&attr!==25)||type>3||frac>31)throw Error('Invalid vertex descriptor');
      seen.add(order);
      if(type===0)continue;
      if(attr<=8&&type!==1)throw Error('Matrix index must be direct');
      if((attr===10||attr===25)&&count===2)throw Error('Three-index normal decoding is not implemented');
      const color=attr===11||attr===12;
      const components=attr<=8?1:attr===9?(count===0?2:3):attr===10||attr===25?(count===0?3:9):color?4:count===0?1:2;
      if(count>(attr===10||attr===25?2:1)||(color?format>5:format>4))throw Error('Unsupported vertex format');
      const width=attr<=8?1:color?[2,3,4,2,3,4][format]:[1,1,2,2,4][format]*components;
      if(type>=2&&(data===null||stride<width))throw Error('Invalid vertex array');
      result.push({attr,order,type,count,format,frac,stride,data,components,width,color});
    }
    throw Error('Unterminated vertex descriptor list');
  }
  function decode(at,a) {
    bounds(at,a.width);
    if(a.attr<=8)return [d.getUint8(at)];
    if(a.color) {
      const byte=i=>d.getUint8(at+i),word=()=>d.getUint16(at);
      if(a.format===0){const x=word();return [(x>>11)/31,((x>>5)&63)/63,(x&31)/31,1];}
      if(a.format===1||a.format===2)return [byte(0)/255,byte(1)/255,byte(2)/255,1];
      if(a.format===3){const x=word();return [12,8,4,0].map(n=>((x>>n)&15)/15);}
      if(a.format===4){const x=(byte(0)<<16)|(byte(1)<<8)|byte(2);return [18,12,6,0].map(n=>((x>>n)&63)/63);}
      return [0,1,2,3].map(i=>byte(i)/255);
    }
    const width=[1,1,2,2,4][a.format],methods=['getUint8','getInt8','getUint16','getInt16','getFloat32'];
    const values=Array.from({length:a.components},(_,i)=>d[methods[a.format]](at+i*width)/(a.format===4?1:2**a.frac));
    if(values.some(v=>!Number.isFinite(v)))throw Error('Nonfinite mesh coordinate');return values;
  }
  let totalVertices=0;
  tree.nodes.forEach((joint,jointIndex)=>{
    if(joint.flags&0x4020)return; // Particle/spline payloads have different types.
    for(const dobj of list(joint.display,16))for(const pobj of list(pointer(dobj+12),24)) {
      const flags=d.getUint16(pobj+12),blocks=d.getUint16(pobj+14),start=pointer(pobj+16),attrs=attributes(pointer(pobj+8));
      if(start===null||!attrs.some(a=>a.attr===9))throw Error('Mesh has no display/position data');
      bounds(start,blocks*32);
      const vertices=[],triangles=[],draws=[];let cursor=start,end=start+blocks*32;
      while(cursor<end) {
        const opcode=d.getUint8(cursor++);if(opcode===0){while(cursor<end)if(d.getUint8(cursor++))throw Error('Nonzero display padding');break;}
        if(cursor+2>end)throw Error('Truncated primitive header');
        const primitive=opcode&0xf8,count=d.getUint16(cursor);cursor+=2;
        if(![0x80,0x90,0x98,0xa0,0xa8,0xb0,0xb8].includes(primitive))throw Error('Unsupported display opcode: '+opcode);
        const base=vertices.length;
        if(totalVertices+count>1000000)throw Error('Model vertex count exceeds capacity');totalVertices+=count;
        for(let i=0;i<count;i++) {
          const vertex={};
          for(const a of attrs) {
            const width=a.type===1?a.width:a.type===2?1:2;
            if(cursor+width>end)throw Error('Truncated primitive vertex');
            let at=cursor;
            if(a.type>=2)at=a.data+(a.type===2?d.getUint8(cursor):d.getUint16(cursor))*a.stride;
            vertex[a.attr]=decode(at,a);cursor+=width;
          }
          vertices.push(vertex);
        }
        draws.push({primitive,format:opcode&7,base,count});
        const triangle=(a,b,c)=>triangles.push(base+a,base+b,base+c);
        if(primitive===0x90){if(count%3)throw Error('Incomplete triangles');for(let i=0;i<count;i+=3)triangle(i,i+1,i+2);}
        if(primitive===0x80){if(count%4)throw Error('Incomplete quads');for(let i=0;i<count;i+=4){triangle(i,i+1,i+2);triangle(i,i+2,i+3);}}
        if(primitive===0x98)for(let i=2;i<count;i++)i%2?triangle(i-1,i-2,i):triangle(i-2,i-1,i);
        if(primitive===0xa0)for(let i=2;i<count;i++)triangle(0,i-1,i);
      }
      meshes.push({joint:jointIndex,dobj,pobj,flags,material:pointer(dobj+8),binding:pointer(pobj+20),attrs,vertices,triangles,draws});
    }
  });
  return {tree,meshes,totalVertices};
}
