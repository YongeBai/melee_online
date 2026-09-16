import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {textureByteLength} from './texture.mjs';

// Captain's six model effects are referenced as 4000..4005 by efAlt_Spawn.
// Particle scripts use the original byte stream; psReadFloat handles BE operands.
export function convertCaptainEffects(input) {
  const a=inspectArchive(input),d=a.data,root=a.publics.get('effCaptainDataTable');
  if(root===undefined||a.externs.size)throw Error('Unsupported effect archive');
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(body.buffer),pointers=new Set(),claims=new Map(),packed=new Set();
  const bounds=(at,size,align=4)=>{if(!Number.isInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Effect data bounds');};
  function claim(at,size){bounds(at,size,size);for(let i=0;i<size;i++){const old=claims.get(at+i);if(packed.has(at+i)||(old&&old!==at+':'+size))throw Error('Overlapping effect descriptor/payload');claims.set(at+i,at+':'+size);}}
  function scalar(at,size=4){claim(at,size);if(a.relocations.has(at&~3))throw Error('Effect scalar has archive relocation');const v=size===2?d.getUint16(at):d.getUint32(at);size===2?out.setUint16(at,v,true):out.setUint32(at,v,true);return v;}
  function pointer(at){claim(at,4);const v=d.getUint32(at);if(!a.relocations.has(at)){if(v)throw Error('Unrelocated effect pointer');out.setUint32(at,0,true);return null;}bounds(v,1,1);pointers.add(at);out.setUint32(at,v,true);return v;}
  function raw(at,size){bounds(at,size,1);for(let i=at;i<at+size;i++){if(claims.has(i)||a.relocations.has(i&~3))throw Error('Effect payload overlaps descriptor');packed.add(i);}}
  function words(tree){for(const at of tree.words)tree.pointers.has(at)?pointer(at):scalar(at);if(tree.halves)for(const at of tree.halves)scalar(at,2);if(tree.packed)for(const at of tree.packed)raw(at,1);}
  const cmd=pointer(root),tex=pointer(root+4);if(cmd===null||tex===null||tex<=cmd)throw Error('Missing effect banks');
  const version=scalar(cmd,2),bank=scalar(cmd+2,2),first=scalar(cmd+4),count=scalar(cmd+8);
  if(version!==0x42||bank!==4||first!==4000||count!==17)throw Error('Unsupported Captain particle bank');
  bounds(cmd,12+count*4);const commands=[];
  for(let i=0;i<count;i++){const offset=scalar(cmd+12+i*4);if(!offset){commands.push(null);continue;}const at=cmd+offset;if(at<cmd+12+count*4||at+61>tex||at%4)throw Error('Invalid particle command descriptor');commands.push({offset:at,relativeOffset:offset});}
  const order=[...new Set(commands.filter(Boolean).map(c=>c.offset))].sort((x,y)=>x-y);
  for(const c of commands.filter(Boolean)){
    const at=c.offset;c.shorts=[0,2,4,6].map(o=>scalar(at+o,2));c.kind=scalar(at+8);c.floats=[];
    for(let o=12;o<60;o+=4){scalar(at+o);const v=d.getFloat32(at+o);if(!Number.isFinite(v))throw Error('Nonfinite particle parameter');c.floats.push(v);}
    c.scriptStart=at+60;c.scriptEnd=order[order.indexOf(at)+1]??tex;if(c.scriptEnd<=c.scriptStart)throw Error('Overlapping particle commands');raw(c.scriptStart,c.scriptEnd-c.scriptStart);
  }
  const groups=scalar(tex);if(groups!==7)throw Error('Unsupported Captain texture groups');const textures=[],groupOffsets=new Set();
  function relative(slot,size,alignment=1){const offset=scalar(slot);if(!offset)return null;const at=tex+offset;bounds(at,size,alignment);return at;}
  for(let i=0;i<groups;i++) {
    const at=relative(tex+4+i*4,24,4);if(at===null){textures.push(null);continue;}
    if(at<tex+4+groups*4||groupOffsets.has(at))throw Error('Aliased particle texture group would relocate twice');groupOffsets.add(at);
    const n=scalar(at),format=scalar(at+4),tlut=scalar(at+8),width=scalar(at+12),height=scalar(at+16),palnum=scalar(at+20,2),palflag=scalar(at+22,2);
    if(n>256||!n||palnum>256)throw Error('Invalid particle texture count');
    const size=textureByteLength(width,height,format),palettes=[8,9,10].includes(format)?((palflag&1)?1:(palnum||n)):0,slots=[];
    for(let t=0;t<n+palettes;t++){const sizeBytes=t<n?size:2*({8:16,9:256,10:16384}[format]),p=relative(at+24+t*4,sizeBytes);if(p!==null)raw(p,sizeBytes);slots.push(p);}
    textures.push({offset:at,count:n,format,tlut,width,height,palnum,palflag,palettes,slots});
  }
  for(const c of commands.filter(Boolean))if(c.shorts[1]>=groups)throw Error('Particle texture group index');
  const effects=[];
  for(let i=0;i<6;i++) {
    const at=root+8+i*20;scalar(at);const lifetime=d.getFloat32(at);if(!Number.isFinite(lifetime))throw Error('Invalid effect lifetime');
    const joint=pointer(at+4),animation=pointer(at+8),material=pointer(at+12),shape=pointer(at+16);
    if(joint===null||shape!==null)throw Error('Unsupported effect model');
    const scene=convertSceneAsset(archiveRootView(a,'effect_Share_joint',joint));
    for(const p of scene.pointerSlots)pointer(p);for(const [p,size] of scene.writes)scalar(p,size);
    const anim=animation===null?null:readJointAnimation(a,animation);if(anim){words(anim);for(const n of anim.nodes)if(n.animation)for(const p of n.animation.packed)raw(p,1);}
    const mat=material===null?null:convertMaterialAnimation(archiveRootView(a,'effect_Share_matanim_joint',material));if(mat)words(mat);
    effects.push({offset:at,lifetime,joint,animation,material,scene,anim,mat});
  }
  if([...a.relocations].some(p=>!pointers.has(p)))throw Error('Untyped effect archive relocation');
  return {root,cmd,tex,bank,version,first,count,commands,textures,effects,pointerSlots:pointers,packedBytes:packed.size,
    image:nativeSubgraphImage(body,pointers,new Map([['effCaptainDataTable',root]]))};
}
