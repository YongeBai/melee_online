import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {readAnimationObject} from './animation-object-assets.mjs';
import {textureByteLength} from './texture.mjs';

export function convertMaterialAnimation(input) {
  const archive=inspectArchive(input),d=archive.data;
  if(archive.externs.size)throw Error('Material animation needs explicit external linking');
  const roots=[...archive.publics].filter(([name])=>name.endsWith('_Share_matanim_joint'));
  if(!roots.length)return null;if(roots.length!==1)throw Error('Ambiguous material animation root');
  const [name,root]=roots[0],words=new Set(),halves=new Set(),pointers=new Set(),packed=new Set(),nodes=[],seen=new Set(),images=new Map(),palettes=new Map();
  const bounds=(at,size,align=4)=>{if(!Number.isInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Material animation descriptor out of bounds');};
  function word(at){bounds(at,4);words.add(at);return d.getUint32(at);}
  function half(at){bounds(at,2,2);halves.add(at);return d.getUint16(at);}
  function ptr(at){const v=word(at);if(!archive.relocations.has(at)){if(v)throw Error('Unrelocated material animation pointer');return null;}bounds(v,1,1);pointers.add(at);return v;}
  function aobj(at){if(at===null)return null;const a=readAnimationObject(archive,at);for(const x of a.words)words.add(x);for(const x of a.pointers)pointers.add(x);for(const x of a.packed)packed.add(x);return a;}
  function raw(at,size){bounds(at,size,1);for(let i=0;i<size;i++)packed.add(at+i);}
  function image(at) {
    if(images.has(at))return images.get(at);bounds(at,24);
    const data=ptr(at),width=half(at+4),height=half(at+6),format=word(at+8),mipmap=word(at+12);
    word(at+16);word(at+20);const min=d.getFloat32(at+16),max=d.getFloat32(at+20);
    if(data===null||!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min||max>10||mipmap>1)throw Error('Invalid animated image');
    textureByteLength(width,height,format);
    let length=0;for(let level=0;level<=(mipmap?Math.floor(max):0);level++)length+=textureByteLength(Math.max(1,width>>level),Math.max(1,height>>level),format);
    raw(data,length);const result={offset:at,width,height,format};images.set(at,result);return result;
  }
  function palette(at) {
    if(palettes.has(at))return palettes.get(at);bounds(at,16);
    const data=ptr(at),format=word(at+4);word(at+8);const count=half(at+12);
    if(data===null||format>2||!count||count>16384)throw Error('Invalid animated palette');
    raw(data,count*2);const result={offset:at,format,count};palettes.set(at,result);return result;
  }
  function chain(at,size,read) {
    const rows=[],visited=new Set();while(at!==null){bounds(at,size);if(visited.has(at)||visited.size>=4096)throw Error('Cyclic material animation chain');visited.add(at);rows.push(read(at));at=ptr(at);}return rows;
  }
  function textures(at) {return chain(at,24,at=>{
    const id=word(at+4),animation=aobj(ptr(at+8)),imageTable=ptr(at+12),paletteTable=ptr(at+16),imageCount=half(at+20),paletteCount=half(at+22);
    if(id>7||imageCount>4096||paletteCount>4096)throw Error('Invalid texture animation capacity');
    function table(start,count,read){if(count&&start===null)throw Error('Missing texture animation table');if(count)bounds(start,count*4);const rows=[];for(let i=0;i<count;i++){const p=ptr(start+i*4);if(p===null)throw Error('Null texture animation entry');rows.push(read(p));}return rows;}
    return {id,animation,images:table(imageTable,imageCount,image),palettes:table(paletteTable,paletteCount,palette)};
  });}
  function materials(at) {return chain(at,16,at=>{
    const animation=aobj(ptr(at+4)),textureAnimations=textures(ptr(at+8)),render=ptr(at+12);
    if(render!==null)throw Error('Render-channel animation needs explicit integration');return {animation,textures:textureAnimations};
  });}
  function visit(at,parent) {
    if(at===null)return;bounds(at,12);if(seen.has(at)||seen.size>=4096)throw Error('Cyclic/shared material animation hierarchy');seen.add(at);
    const child=ptr(at),next=ptr(at+4),material=ptr(at+8),index=nodes.length;
    nodes.push({offset:at,parent,materials:materials(material)});visit(child,index);visit(next,parent);
  }
  visit(root,-1);
  for(const at of packed)if(words.has(at&~3)||halves.has(at&~1)||archive.relocations.has(at&~3))throw Error('Material animation payload overlaps descriptors');
  const body=Uint8Array.from(archive.bytes.subarray(32,32+archive.dataSize)),out=new DataView(body.buffer);
  for(const at of words)out.setUint32(at,d.getUint32(at),true);for(const at of halves)out.setUint16(at,d.getUint16(at),true);
  return {name,root,nodes,images,palettes,words,halves,pointers,image:nativeSubgraphImage(body,pointers,new Map([[name,root]]))};
}
