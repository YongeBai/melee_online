import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {convertFighterAttributes,fighterArchives} from './fighter-assets.mjs';
import {convertFighterMotions} from './motion-assets.mjs';
// Only fields read by Fighter_UnkInitLoad. The incomplete full ftData root is
// deliberately not published as a native archive symbol.
export function convertFighterInitialization(input,name,spec) {
  const attributes=convertFighterAttributes(input,name),motion=convertFighterMotions(input,name,spec),archive=inspectArchive(input),d=archive.data;
  const code=name.slice(2,4),root=archive.publics.get('ftData'+fighterArchives[code]);
  const at=(archive.dataSize+3)&~3,bytes=new Uint8Array(at+20),out=new DataView(bytes.buffer);
  bytes.set(motion.image.subarray(32,32+archive.dataSize));
  const pointers=new Set(motion.pointerSlots),scalarRanges=[];
  const motionWords=new Set(motion.scripts.words.keys());
  for(const row of motion.motions)for(let i=0;i<24;i+=4)motionWords.add(row.offset+i);
  function scalarTarget(slot,size,alignment) {
    if(!archive.relocations.has(slot))throw Error('Missing initialization pointer');
    const value=d.getUint32(slot);
    if(value%alignment||value+size>d.byteLength)throw Error('Initialization scalar range');
    for(const p of archive.relocations)if(p>=value&&p<value+size)throw Error('Unexpected initialization scalar pointer');
    if(scalarRanges.some(([start,end])=>value<end&&start<value+size)||[...motionWords].some(p=>value<p+4&&p<value+size))
      throw Error('Overlapping initialization data types');
    scalarRanges.push([value,value+size]);
    return value;
  }
  const common=scalarTarget(root,0x184,4),pickup=scalarTarget(root+0x40,48,4),offset=scalarTarget(root+0x50,8,4),mapping=scalarTarget(root+0x10,motion.count*2,1);
  bytes.set(attributes.bytes,common);
  for(const [start,length] of [[pickup,48],[offset,8]])for(let i=0;i<length;i+=4) {
    if(!Number.isFinite(d.getFloat32(start+i)))throw Error('Nonfinite initialization parameter');
    out.setUint32(start+i,d.getUint32(start+i),true);
  }
  const roots=[common,pickup,offset,motion.table,mapping];
  roots.forEach((value,i)=>{out.setUint32(at+i*4,value,true);pointers.add(at+i*4);});
  return {kind:motion.kind,count:motion.count,roots,root:at,
    image:nativeSubgraphImage(bytes,pointers,new Map([['native_fighter_initialization',at]])),
    expected:[attributes.bytes,bytes.slice(pickup,pickup+48),bytes.slice(offset,offset+8)],
    mapping:bytes.slice(mapping,mapping+motion.count*2)};
}
