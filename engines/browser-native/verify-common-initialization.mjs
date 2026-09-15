import {convertSharedParameters} from './shared-assets.mjs';
import {sharedSpec} from './shared-spec.mjs';
import {installResidentFile} from './resident-files.mjs';
import {loadPose} from './verify-poses.mjs';
export function verifyCommonInitialization(module,input) {
  const converted=convertSharedParameters(input,sharedSpec),allocations=module._portFileAllocations(),objects=module._portRuntimeObjectsUsed();
  installResidentFile(module,'PlCo.dat',converted.image);
  if(module._portSharedInitialize()!==0)throw Error('Common initialization was already run');
  const base=module._portSharedGlobal(0)-converted.roots[0];
  for(let section=0;section<23;section++)if(module._portSharedGlobal(section)!==base+converted.roots[section])throw Error('Original common-data global mismatch');
  if(module._portFileAllocations()!==allocations+2)throw Error('Original common archive ownership mismatch');
  if(module._portFileClear()!==0)throw Error('Common prefetch cache remained pinned');
  if(module._portSharedInitialize()!==1||module._portFileAllocations()!==allocations+2)throw Error('Common runtime initialization allocated twice');
  // Confirm every descriptor remains relocated after releasing prefetched bytes.
  for(const slot of converted.archive.relocations) {
    const expected=base+converted.archive.data.getUint32(slot);
    if(new DataView(module.HEAPU8.buffer).getUint32(base+slot,true)!==expected)throw Error('Common relocation did not survive cache release');
  }
  const rows=[];
  for(const scene of converted.scenes) {
    const n=scene.model.tree.nodes.length,animated=scene.section===8,animation=converted.animation;
    let model=scene.model.tree,clip={type:1,flags:0,frames:0,bones:n,tracks:[]};
    if(animated) {
      if(animation.nodes.length!==n||animation.nodes.some((node,i)=>node.parent!==model.nodes[i].parent))throw Error('Shared model/animation hierarchy mismatch');
      const active=animation.nodes.filter(n=>n.animation).map(n=>n.animation),first=active[0];
      if(!first||active.some(a=>a.end!==first.end||a.flags!==first.flags))throw Error('Shared animation needs per-joint reference timelines');
      model={...model,nodes:model.nodes.map((node,i)=>({...node,flags:(node.flags&~8)|((animation.nodes[i].flags&1)?8:0)}))};
      clip={type:1,flags:first.flags,frames:first.end,bones:n,tracks:active.flatMap(a=>a.tracks)};
    }
    const pose=loadPose(module,model,clip),nodes=module._malloc(n*4),matrices=module._malloc(n*48),reference=module._malloc(n*48);
    let object=0;
    try {
      object=module._portSceneObjectCreate(base+scene.rootOffset);const root=object&&module._portSceneObjectRoot(object);
      if(!root||module._portSceneCollect(root,nodes,n)!==n)throw Error('Original shared model failed to load');
      if(animated){module._portSceneJointAnimation(root,base+animation.root);module._portSceneRequest(root);}
      const frames=animated?153:1,record=new Float32Array(frames*n*12);let maxError=0;
      for(let frame=0;frame<frames;frame++) {
        if(animated)module._portSceneAnimate(root);
        module._portSceneMatrices(n,nodes,matrices);module._portPoseStep(pose.pointer,reference);
        for(let i=0;i<n*12;i++) {
          const value=module.HEAPF32[matrices/4+i],expected=module.HEAPF32[reference/4+i],error=Math.abs(value-expected);maxError=Math.max(maxError,error);
          if(!Number.isFinite(value)||error>0.00001*(1+Math.abs(expected)))throw Error('Shared model pose mismatch: '+scene.section+'/'+frame+'/'+i+': '+value+' != '+expected);
          record[frame*n*12+i]=value;
        }
      }
      if(animated) {
        module._portSceneRequest(root);
        for(let frame=0;frame<frames;frame++) {
          module._portSceneAnimate(root);module._portSceneMatrices(n,nodes,matrices);
          for(let i=0;i<n*12;i++)if(!Object.is(module.HEAPF32[matrices/4+i],record[frame*n*12+i]))throw Error('Shared animation rewind mismatch');
        }
      }
      rows.push({section:scene.section,joints:n,meshes:scene.model.meshes.length,frames,maxMatrixError:maxError,rewindPassed:animated});
    } finally {if(object)module._portSceneObjectFree(object);pose.dispose();for(const p of [nodes,matrices,reference])module._free(p);}
    if(module._portRuntimeObjectsUsed()!==objects||module._portSceneLiveObjects())throw Error('Shared model owner leaked');
  }
  return {passed:true,originalFunction:'Fighter_LoadCommonData',globals:23,sourceRelocations:converted.archive.relocations.size,
    runtimeOwnedArchives:1,runtimeOwnedAllocations:2,cacheReleased:true,models:rows,fullCommonDataLoaded:true,
    limitation:'Original common-data initialization only; Fighter_Create and the competitive match loop remain incomplete'};
}
