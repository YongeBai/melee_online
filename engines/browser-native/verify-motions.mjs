import {verifySceneAnimations} from './verify-scene.mjs';
import {motionSpec} from './motion-spec.mjs';
import {convertFighterMotions} from './motion-assets.mjs';
import {convertMotionAnimations} from './motion-animations.mjs';
import {installResidentFile,installResidentBytes,openResidentArchive} from './resident-files.mjs';

// Compare the original loader's relocated result to independently decoded BE
// descriptors and byte-coded tracks, including every byte of every stream.
function checkTree(module,pointer,tree) {
  const d=new DataView(module.HEAPU8.buffer),u=module.HEAPU8;
  if(!pointer)throw Error('Original motion loader returned no tree');
  if(d.getUint32(pointer,true)!==tree.type||d.getUint32(pointer+4,true)!==tree.flags||d.getFloat32(pointer+8,true)!==tree.frames)
    throw Error('Loaded motion tree metadata mismatch');
  let node=d.getUint32(pointer+12,true),track=d.getUint32(pointer+16,true),index=0;
  for(let bone=0;bone<tree.bones;bone++) {
    const count=u[node++];
    if(count===255)throw Error('Loaded motion tree ended early');
    for(let i=0;i<count;i++,track+=12) {
      const t=tree.tracks[index++];
      if(!t||t.bone!==bone||d.getUint16(track,true)!==t.bytes.length||d.getInt16(track+2,true)!==t.start||
        u[track+4]!==t.objType||u[track+5]!==t.fracValue||u[track+6]!==t.fracSlope)throw Error('Loaded motion track descriptor mismatch');
      const payload=d.getUint32(track+8,true);
      for(let b=0;b<t.bytes.length;b++)if(u[payload+b]!==t.bytes[b])throw Error('Loaded motion track payload mismatch');
    }
  }
  if(u[node]!==255||index!==tree.tracks.length)throw Error('Loaded motion tree length mismatch');
}
function string(module,pointer) {
  const end=module.HEAPU8.indexOf(0,pointer);if(!pointer||end<0)throw Error('Invalid motion string');
  return new TextDecoder().decode(module.HEAPU8.subarray(pointer,end));
}
export function verifyMotions(module,fighters,animations,models) {
  const live=new Map(),reports=[],sceneClips=[];let rows=0,loads=0,cacheHits=0,peerRequests=0,scriptWords=0,trackBytes=0;
  if(module._portMotionLive()||module._portFileCount()||module._portMotionBuffers())throw Error('Motion verifier requires clean owners');
  const objects=module._portRuntimeObjectsUsed();
  function dispose(kind) {
    const item=live.get(kind);module._portMotionDestroy(kind);item.file.dispose();live.delete(kind);
  }
  try {
    for(let kind=0;kind<27;kind++) {
      const code=motionSpec.codes[kind],name='Pl'+code+'.dat',ajName='Pl'+code+'AJ.dat';
      const fighter=fighters.find(f=>f.name===name),animation=animations.find(f=>f.name===ajName);
      if(!fighter||!animation)throw Error('Missing hosted motion assets: '+code);
      const motion=convertFighterMotions(fighter.bytes,name,motionSpec),bundle=convertMotionAnimations(animation.bytes,motion.motions);
      installResidentFile(module,name,motion.image);installResidentBytes(module,ajName,bundle.image);
      const file=openResidentArchive(module,name,['native_motion_table']),table=file.addresses[0];
      if(module._portMotionCreate(kind,table,motion.count)!==0){file.dispose();throw Error('Original animation setup failed');}
      live.set(kind,{file,motion,bundle,table});
      if(module._portMotionCreate(kind,table,motion.count)!==-1)throw Error('Duplicate motion owner accepted');
      if(module._portFilePins()!==live.size||module._portFileClear()!==-1)throw Error('Resident bundle lifetime is not pinned');
      const base=table-motion.table,d=new DataView(module.HEAPU8.buffer);
      for(const [slot] of motion.scripts.words) {
        const original=motion.archive.data.getUint32(slot),expected=motion.scripts.pointers.has(slot)?base+original:original;
        if(d.getUint32(base+slot,true)!==expected)throw Error('Command word or shared script pointer was changed');scriptWords++;
      }
      let fallbacks=0,own=0;
      for(let index=0;index<motion.count;index++) {
        const ownRow=motion.motions[index],fallback=kind===11&&!ownRow.animationSize,owner=fallback?live.get(10):live.get(kind),m=owner.motion.motions[index];
        rows++;if(fallback)fallbacks++;else own++;
        if(module._portMotionEntry(kind,index,0)!==owner.table+index*24||module._portMotionEntry(kind,index,2)!==m.animationSize||
          module._portMotionEntry(kind,index,4)!==(m.flags>>>31)||module._portMotionEntry(kind,index,5)!==((m.flags>>>30)&1))throw Error('Original motion row selection/flags mismatch');
        const source=module._portMotionEntry(kind,index,6),namePointer=module._portMotionEntry(kind,index,1);
        if((m.name===null?namePointer!==0:string(module,namePointer)!==m.name)||Boolean(source)!==Boolean(m.animationSize))throw Error('Original motion binding mismatch');
        if(module._portMotionEntry(kind,index,3)!==(m.script===null?0:owner.table-owner.motion.table+m.script))throw Error('Original action script selection mismatch');
        // Force the original Nana -> Popo relocated-buffer sharing path.
        if(fallback&&m.animationSize){module._portMotionLoad(10,index,0);peerRequests+=2;}
        for(const secondary of [0,1]) {
          const tree=module._portMotionLoad(kind,index,secondary);loads++;
          if(m.animationSize) {
            const expected=owner.bundle.clips.get(m.animationOffset).tree;checkTree(module,tree,expected);
            trackBytes+=expected.tracks.reduce((n,t)=>n+t.bytes.length,0);
          } else if(tree)throw Error('Empty motion returned a stale animation');
          if(module._portMotionLoad(kind,index,secondary)!==tree)throw Error('Repeated motion did not reuse its buffer');cacheHits++;
        }
      }
      // Walk backwards to cover reuse after a different animation, too.
      for(let index=motion.count-1;index>=0;index--) {
        const ownRow=motion.motions[index],owner=kind===11&&!ownRow.animationSize?live.get(10):live.get(kind),m=owner.motion.motions[index];
        const tree=module._portMotionLoad(kind,index,0);loads++;
        if(m.animationSize)checkTree(module,tree,owner.bundle.clips.get(m.animationOffset).tree);
        else if(tree)throw Error('Reverse load retained an empty motion');
      }
      const model=models.find(m=>m.name==='Pl'+code+'Nr.dat');if(!model)throw Error('Missing motion scene model');
      const loadClip=({offset,tree})=>{
        const index=motion.motions.findIndex(m=>m.animationSize&&m.animationOffset===offset&&m.name===tree.name);
        if(index<0)throw Error('Scene clip missing from original motion table');
        // Borrow the fighter buffer only until the scene has released its tracks.
        return {tree:module._portMotionLoad(kind,index,0),dispose(){}};
      };
      sceneClips.push(...verifySceneAnimations(module,[model],[animation],{loadClip}).clips);
      if(kind===11) {
        const popo=live.get(10),popoAnimation=animations.find(a=>a.name==='PlPpAJ.dat');
        sceneClips.push(...verifySceneAnimations(module,[model],[{name:ajName,bytes:popoAnimation.bytes}],{loadClip:({offset,tree})=>{
          const index=popo.motion.motions.findIndex((m,i)=>m.animationSize&&m.animationOffset===offset&&m.name===tree.name&&!motion.motions[i].animationSize);
          if(index<0)throw Error('Missing Nana fallback scene motion');
          module._portMotionLoad(10,index,0);
          return {tree:module._portMotionLoad(11,index,0),dispose(){}};
        }}).clips);
      }
      reports.push({name,kind,rows:motion.count,own,fallbacks,clips:bundle.clips.size,commands:motion.scripts.commands.size});
      if(kind!==10)dispose(kind);
      if(kind===11)dispose(10);
      if(!live.size) {
        if(module._portFilePins()||module._portMotionBuffers()||module._portFileAllocations()||module._portRuntimeObjectsUsed()!==objects)throw Error('Motion owner leaked');
        if(module._portFileClear()!==0)throw Error('Unpinned cache did not clear');
      }
    }
    return {passed:true,components:reports,rows,loads,cacheHits,peerRequests,scriptWords,trackBytes,sceneClips,liveOwners:module._portMotionLive(),playable:false};
  } finally {
    if(live.has(11))dispose(11);
    for(const kind of live.keys())dispose(kind);
    module._portFileClear();
  }
}
