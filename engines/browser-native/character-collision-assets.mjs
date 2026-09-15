import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';

// The hurtbox and dynamics-collider subgraph only. This does not expose the
// incomplete full ftData root or the separate dynamic-bone simulation graph.
export function convertCharacterCollision(input,name,partCount) {
  const kind=fighterArchives[/^Pl([A-Za-z]{2})\.dat$/.exec(name)?.[1]],archive=inspectArchive(input),d=archive.data;
  const root=archive.publics.get('ftData'+kind);
  if(root===undefined||!Number.isInteger(partCount)||partCount<1||partCount>140)throw Error('Invalid fighter collision root');
  const bounds=(at,size)=>{if(!Number.isInteger(at)||at%4||at<0||at+size>d.byteLength)throw Error('Fighter collision data out of bounds');};
  function word(at){bounds(at,4);return d.getUint32(at);}
  function ptr(at){const value=word(at);if(!archive.relocations.has(at)){if(value)throw Error('Unrelocated collision pointer');return null;}bounds(value,4);return value;}
  const hurt=ptr(root+0x30),dyn=ptr(root+0x2c);if(hurt===null||dyn===null)throw Error('Missing fighter collision tables');
  const count=word(hurt),inits=ptr(hurt+4),dynamicCount=word(dyn+8),dynamicInits=ptr(dyn+12);
  if(count>15||dynamicCount>11||(count&&inits===null)||(dynamicCount&&dynamicInits===null))throw Error('Invalid fighter collision count');
  function entries(at,count,dynamic) {
    const size=dynamic?20:40,rows=[];
    if(count)bounds(at,count*size);
    for(let i=0;i<count;i++) {
      const start=at+i*size,values=[];
      for(let j=0;j<size;j+=4) {
        if(archive.relocations.has(start+j))throw Error('Pointer inside collision scalar');
        const raw=word(start+j),integer=j<(dynamic?4:12),value=integer?raw:d.getFloat32(start+j);
        if(!Number.isFinite(value))throw Error('Nonfinite fighter collision value');values.push(value);
      }
      if(values[0]>=partCount||(!dynamic&&(values[1]>2||values[2]>1)))throw Error('Invalid collision bone or enum');
      rows.push(values);
    }
    return rows;
  }
  const hurtboxes=entries(inits,count,false),dynamicColliders=entries(dynamicInits,dynamicCount,true);
  // Only retain the reached scalar arrays and a small dedicated verification
  // root. Unknown ftData pointers (including extern chains) stay inaccessible.
  const bytes=new Uint8Array(16+count*40+dynamicCount*20),out=new DataView(bytes.buffer);
  out.setUint32(0,count,true);out.setUint32(4,16,true);out.setUint32(8,dynamicCount,true);out.setUint32(12,16+count*40,true);
  for(const [rows,at,size] of [[hurtboxes,16,40],[dynamicColliders,16+count*40,20]])for(let i=0;i<rows.length;i++)
    for(let j=0;j<size;j+=4)out.setUint32(at+i*size+j,d.getUint32((size===40?inits:dynamicInits)+i*size+j),true);
  const relocs=new Set();if(count)relocs.add(4);else out.setUint32(4,0,true);
  if(dynamicCount)relocs.add(12);else out.setUint32(12,0,true);
  return {image:nativeSubgraphImage(bytes,relocs,new Map([['native_character_collision',0]])),hurtboxes,dynamicColliders,partCount};
}
