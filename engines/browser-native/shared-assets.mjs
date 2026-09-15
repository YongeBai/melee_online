import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {readCpuTables} from './cpu-assets.mjs';
import {readColorTables} from './color-assets.mjs';
import {inspectArchive,nativeSubgraphImage,archiveRootView} from './archive.mjs';
export const sharedSections=Array.from({length:23},(_,i)=>i);
export const pendingSharedSections=[];
// Import the typed parameter/bone-map graph needed by fighter initialization.
// All root sections are typed before the original ftLoadCommonData is exposed.
export function convertSharedParameters(input,spec) {
  const archive=inspectArchive(input),d=archive.data,root=archive.publics.get('ftLoadCommonData');
  if(root===undefined||archive.externs.size)throw Error('Invalid shared fighter archive');
  const bytes=archive.bytes.slice(32,32+archive.dataSize),data=new Uint8Array(bytes.length+sharedSections.length*4),out=new DataView(data.buffer);
  data.set(bytes);const pointers=new Set(),scalars=new Set(),packed=new Set(),parts=[],groups=[];
  const bounds=(at,size)=>{if(!Number.isSafeInteger(at)||at<0||at+size>d.byteLength)throw Error('Shared data exceeds archive');};
  function word(at) {
    bounds(at,4);if(at%4||[0,1,2,3].some(i=>packed.has(at+i)))throw Error('Shared numeric/packed layout overlap');
    scalars.add(at);out.setUint32(at,d.getUint32(at),true);return d.getUint32(at);
  }
  function pointer(at) {
    const value=word(at);if(!archive.relocations.has(at)){if(value)throw Error('Unrelocated shared pointer');return null;}
    bounds(value,1);pointers.add(at);return value;
  }
  function raw(at,count) {
    bounds(at,count);for(let i=0;i<count;i++){if(scalars.has((at+i)&~3))throw Error('Packed/numeric layout overlap');packed.add(at+i);}
    return archive.bytes.slice(32+at,32+at+count);
  }
  function floats(at,count) {
    bounds(at,count*4);for(let i=0;i<count;i++){word(at+i*4);if(archive.relocations.has(at+i*4))throw Error('Shared float is a relocation');if(!Number.isFinite(d.getFloat32(at+i*4)))throw Error('Nonfinite shared float');}
  }
  const roots=Array.from({length:23},(_,i)=>{bounds(root+i*4,4);if(!archive.relocations.has(root+i*4))throw Error('Missing shared root');return d.getUint32(root+i*4);});
  const common=roots[0];bounds(common,spec.size);
  for(const f of spec.fields) {
    const at=common+f.offset;if(archive.relocations.has(at))throw Error('Shared parameter is a relocation');
    if(f.enumMax!==undefined&&d.getUint32(at)>f.enumMax)throw Error('Invalid shared enum');if(f.type==='u8')raw(at,1);else word(at);
    if(f.type==='float'&&!Number.isFinite(d.getFloat32(at)))throw Error('Nonfinite common parameter');
  }
  for(const [section,count] of [[1,78],[2,30],[3,9],[12,39],[13,15],[14,9],[15,2]])floats(roots[section],count);
  for(const section of [17,18,19])raw(roots[section],20);
  for(let i=0;i<17;i++)word(roots[21]+i*4); // CrowdConfig: f32/s32, no packed fields.
  for(let kind=0;kind<34;kind++) {
    const at=pointer(roots[4]+kind*4);if(at===null)throw Error('Missing bone map');
    const joint=pointer(at),part=pointer(at+4),count=word(at+8);
    if(joint===null||part===null||count<1||count>140)throw Error('Invalid bone-map descriptor');
    const jointToPart=raw(joint,count),partToJoint=raw(part,56);
    if([...jointToPart].some(v=>v!==255&&v>=56)||[...partToJoint].some(v=>v!==255&&v>=count))throw Error('Invalid bone-map index');
    parts.push({kind,count,jointToPart,partToJoint});
    const group=pointer(roots[5]+kind*4);
    if(group!==null) {
      const entries=pointer(group),count=word(group+4);if(count>32||(count&&entries===null))throw Error('Invalid part-group table');
      groups.push({kind,count,bytes:count?raw(entries,count*4):new Uint8Array()});
    }
  }
  for(const [section,count] of [[9,3],[10,1],[11,1]])for(let i=0;i<count;i++) {
    const at=roots[section]+i*8,values=pointer(at),length=word(at+4);
    if(values===null||length>256)throw Error('Invalid shake table');floats(values,length*2);
  }
  const colors=readColorTables(archive);
  for(const table of colors.tables)for(const entry of table.entries){pointer(entry.offset);raw(entry.offset+4,4);}
  for(const at of colors.scripts.words.keys())word(at);
  for(const at of colors.scripts.pointers)pointers.add(at);
  const cpu=readCpuTables(archive);
  for(const at of cpu.raw)raw(at,1);
  for(const at of cpu.words)word(at);
  for(const at of cpu.pointers)pointers.add(at);
  const scenes=[];
  for(const section of [8,16,20]) {
    const at=section===8?pointer(roots[8]):roots[section];if(at===null)throw Error('Missing shared model');
    const view=archiveRootView(archive,'shared_Share_joint',at),scene=convertSceneAsset(view);
    for(const [slot,width] of scene.writes) {
      bounds(slot,width);for(let i=0;i<width;i++)if(packed.has(slot+i))throw Error('Shared scene overlaps packed data');
      if(width===4)word(slot);else out.setUint16(slot,d.getUint16(slot),true);
    }
    for(const slot of scene.pointerSlots)pointer(slot);
    scenes.push({section,...scene});
  }
  const animationRoot=pointer(roots[8]+4);if(animationRoot===null)throw Error('Missing shared accessory animation');
  const animation=readJointAnimation(archive,animationRoot);
  for(const at of animation.words)word(at);
  for(const at of animation.pointers)pointers.add(at);
  for(let i=0;i<23;i++)pointer(root+i*4);
  const missing=[...archive.relocations].filter(slot=>!pointers.has(slot));
  if(missing.length)throw Error('Unclassified shared relocations: '+missing.map(x=>x.toString(16)).join(','));
  // The original root is exposed only after every source relocation belongs to
  // an imported descriptor. The secondary root supports independent verification.
  sharedSections.forEach((section,i)=>{const at=bytes.length+i*4;out.setUint32(at,roots[section],true);pointers.add(at);});
  return {image:nativeSubgraphImage(data,pointers,new Map([['native_shared_parameters',bytes.length],['ftLoadCommonData',root]])),archive,roots,
    parts,groups,colors,cpu,scenes,animation,common,sections:sharedSections,pending:pendingSharedSections,metrics:{numericWords:scalars.size,packedBytes:packed.size,relocations:pointers.size}};
}
