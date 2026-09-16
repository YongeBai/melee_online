import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertSceneAsset} from './scene-assets.mjs';

// USA 1.02 tables have no serialized variant counts. These extents stop at
// typed bone-list/adjacent-object boundaries, not the next relocation target
// (which may be an interior alias). Runtime script references are checked too.
export const partAnimationCounts=Object.freeze(Object.fromEntries(Object.keys(fighterArchives).map(code=>[code,
  Object.freeze(({Kb:[3,3,3],Sk:[4,4],Pk:[4,3],Pr:[2,3],Ss:[4],Pc:[4,3],
    Fx:[4,4,3,4,4],Ys:[4,4,3,4,4],Gn:[4,4,3,6,6],Fc:[4,4,3,4,4]})[code]??[4,4,3])])));

export function convertSecondaryAnimations(input,name,partCount) {
  const a=inspectArchive(input),d=a.data,code=name.slice(2,4),source=a.publics.get('ftData'+fighterArchives[code]),counts=partAnimationCounts[code];
  if(source===undefined||!counts||!Number.isInteger(partCount)||partCount<1||partCount>140)throw Error('Secondary animation root');
  const words=new Set(),halves=new Set(),packed=new Set(),pointers=new Set(),external=new Map(),nulls=new Set();
  const bounds=(at,size,align=4)=>{if(!Number.isInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Secondary animation bounds');};
  for(const [symbol,start] of a.externs) {
    for(let at=start;at!==0xffffffff;) {bounds(at,4);if(external.has(at)||a.relocations.has(at))throw Error('Invalid secondary extern chain');external.set(at,symbol);at=d.getUint32(at);}
  }
  function word(at){bounds(at,4);words.add(at);return d.getUint32(at);}
  function ptr(at,allowExternal=false){const value=word(at);if(external.has(at)){
    // lbArchive_InitializeDAT resolves extern chains to NULL before ftData loads.
    // Only the two observed Kirby hand entries belong to this graph.
    if(!allowExternal||code!=='Kb'||!['PlyKirby5K_LHaveN_ACTION_HandLMiddle_animjoint','PlyKirby5K_RHaveN_ACTION_HandRMiddle_animjoint'].includes(external.get(at)))throw Error('Unexpected secondary external');
    nulls.add(at);return null;
  }if(!a.relocations.has(at)){if(value)throw Error('Unrelocated secondary pointer');return null;}bounds(value,1,1);pointers.add(at);return value;}
  const table=ptr(source+0x1c),shield=ptr(source+0x20);
  if(table===null||shield===null||shield-table!==counts.length*4)throw Error('Unsupported secondary table extent');
  const channels=[];
  for(const [channel,count] of counts.entries()) {
    const at=ptr(table+channel*4);if(at===null)throw Error('Missing part animation descriptor');bounds(at,12);
    halves.add(at);halves.add(at+2);const start=d.getUint16(at),length=d.getUint16(at+2),bonesAt=ptr(at+4),variantsAt=ptr(at+8);
    if(start>=partCount||!length||length>partCount||bonesAt===null||variantsAt===null)throw Error('Invalid part animation descriptor');bounds(bonesAt,length,1);bounds(variantsAt,count*4);
    const bones=Array.from({length},(_,i)=>{packed.add(bonesAt+i);return d.getUint8(bonesAt+i);});if(bones.some(b=>b>=partCount))throw Error('Invalid part animation bone');
    const variants=[];
    for(let i=0;i<count;i++) {
      const root=ptr(variantsAt+i*4,true),tree=root===null?null:readJointAnimation(a,root);
      if(tree) {
        if(start+tree.nodes.length>partCount)throw Error('Part animation extends beyond skeleton');
        for(const at of tree.words)words.add(at);for(const at of tree.pointers)pointers.add(at);
        for(const node of tree.nodes)if(node.animation)for(const at of node.animation.packed)packed.add(at);
      }
      variants.push(tree);
    }
    channels.push({offset:at,start,bones,variants});
  }
  bounds(shield,8);const shieldRoot=ptr(shield);word(shield+4);const shieldValue=d.getFloat32(shield+4);
  if(!Number.isFinite(shieldValue))throw Error('Nonfinite shield parameter');
  let scene=null;
  if(shieldRoot!==null) {
    scene=convertSceneAsset(archiveRootView({...a,externs:new Map()},'shield_Share_joint',shieldRoot));
    if(scene.model.meshes.length||scene.model.tree.nodes.some(n=>n.display!==null))throw Error('Shield pose must be a skeleton');
    for(const at of external.keys())if(scene.descriptorSlots.has(at)||scene.writes.has(at))throw Error('Shield pose external');
    for(const [at,size] of scene.writes){if(size!==4)throw Error('Shield pose scalar size');words.add(at);}
    for(const at of scene.descriptorSlots){words.add(at);}for(const at of scene.pointerSlots)pointers.add(at);
  } else if(code!=='Ys')throw Error('Missing ordinary shield pose');
  for(const at of packed)if(words.has(at&~3)||halves.has(at&~1)||a.relocations.has(at&~3)||external.has(at&~3))throw Error('Secondary animation payload overlaps descriptor');
  for(const at of halves)if(words.has(at&~3)||a.relocations.has(at&~3))throw Error('Secondary animation short overlaps word');
  for(const at of words)if(a.relocations.has(at)&&!pointers.has(at))throw Error('Untyped secondary relocation');
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(body.buffer);
  for(const at of words)out.setUint32(at,nulls.has(at)?0:d.getUint32(at),true);for(const at of halves)out.setUint16(at,d.getUint16(at),true);
  return {table,channels,counts,shield,shieldRoot,shieldValue,shieldNodes:scene?.model.tree.nodes??[],nullExternals:[...nulls],
    image:nativeSubgraphImage(body,pointers,new Map([['native_part_animations',table],['native_shield_pose',shield]]))};
}
