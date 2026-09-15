import {loadSceneAsset,loadSceneAnimation} from './scene-assets.mjs';
import {animationArchives} from './animation-assets.mjs';
import {loadPose} from './verify-poses.mjs';
export function verifyScene(module,files) {
  const rows=[];
  for(const {name,bytes} of files) {
    const asset=loadSceneAsset(module,bytes),n=asset.model.tree.nodes.length;
    const nodes=module._malloc(n*4),matrices=module._malloc(n*48),reference=module._malloc(n*48),srt=module._malloc(36);
    const pose=module._portPoseCreate(n);let root;
    try {
      asset.model.tree.nodes.forEach((node,i)=>{
        module.HEAPF32.set([...node.rotation,...node.scale,...node.translation],srt/4);
        if(module._portPoseNode(pose,i,node.parent,node.flags,srt)!==0)throw Error('Reference pose rejected');
      });
      module._portPoseRewind(pose);module._portPoseStep(pose,reference);
      const passes=[];
      for(let pass=0;pass<3;pass++) {
        root=module._portSceneLoad(asset.root);if(!root)throw Error('Native HSD joint load failed');
        const count=module._portSceneCollect(root,nodes,n);if(count!==n)throw Error('Native HSD node count mismatch');
        for(let metric=0;metric<asset.metrics.length;metric++) {
          const actual=module._portSceneMetric(count,nodes,metric),expected=asset.metrics[metric];
          if(!Number.isFinite(actual)||Math.abs(actual-expected)>1e-8*(1+Math.abs(expected)))
            throw Error('Native HSD descriptor metric mismatch: '+name+' '+metric+' '+actual+' '+expected);
        }
        module._portSceneMatrices(count,nodes,matrices);let maxError=0;
        for(let i=0;i<count*12;i++) {
          const actual=module.HEAPF32[matrices/4+i],expected=module.HEAPF32[reference/4+i],error=Math.abs(actual-expected);
          maxError=Math.max(maxError,error);
          if(!Number.isFinite(actual)||error>0.00001*(1+Math.abs(expected)))throw Error('Native HSD bind-pose mismatch: '+name+' '+i+' '+actual+' '+expected);
        }
        module._portSceneDestroy(root);root=0;
        if(module._portSceneLiveJoints()!==0||module._portSceneLiveObjects()!==0)throw Error('Native HSD objects or references leaked');
        passes.push({nodes:count,maxMatrixError:maxError,liveAfterDestroy:0,heapFree:module._portRuntimeHeapFree()});
      }
      if(passes[1].heapFree!==passes[2].heapFree)throw Error('Repeated scene loading grew the heap');
      rows.push({name,passes,metrics:asset.metrics});
    } finally {if(root)module._portSceneDestroy(root);module._portPoseDestroy(pose);
      for(const p of [nodes,matrices,reference,srt])module._free(p);asset.dispose();}
  }
  return {passed:true,models:rows,playable:false,gameplayParity:false,performanceMeasured:false,
    limitations:'Real HSD class loading, bind matrices, envelope reference resolution and destruction; no combat or HSD GPU execution'};
}

export function verifySceneAnimations(module,files,animations,{loadClip}={}) {
  const rows=[];
  for(const {name,bytes} of files) {
    const motion=animations.find(a=>a.name===name.replace('Nr','AJ'));
    if(!motion)throw Error('Missing hosted scene animation');
    const asset=loadSceneAsset(module,bytes),n=asset.model.tree.nodes.length;
    const nodes=module._malloc(n*4),matrices=module._malloc(n*48),reference=module._malloc(n*48);
    let first=true;
    try {
      for(const {offset,tree} of animationArchives(motion.bytes,true)) {
        if(!first&&tree.type!==0)continue;first=false;
        const length=new DataView(motion.bytes.buffer,motion.bytes.byteOffset+offset,4).getUint32(0);
        const clip=loadClip?loadClip({offset,tree}):loadSceneAnimation(module,motion.bytes.subarray(offset,offset+length));
        const pose=loadPose(module,asset.model.tree,tree),root=module._portSceneLoad(asset.root);
        const frames=Math.min(64,Math.ceil(tree.frames)+2),record=new Float32Array(frames*n*12);let maxError=0;
        try {
          if(!root||module._portSceneCollect(root,nodes,n)!==n)throw Error('Native animated scene load failed');
          if(module._portSceneAnimation(n,nodes,clip.tree)!==0)throw Error('Native FigaTree attachment failed');
          module._portSceneRequest(root);
          for(let frame=0;frame<frames;frame++) {
            module._portSceneAnimate(root);module._portSceneMatrices(n,nodes,matrices);module._portPoseStep(pose.pointer,reference);
            const values=module.HEAPF32.subarray(matrices/4,matrices/4+n*12);
            for(let i=0;i<values.length;i++) {
              const expected=module.HEAPF32[reference/4+i],error=Math.abs(values[i]-expected);maxError=Math.max(maxError,error);
              if(!Number.isFinite(values[i])||error>0.00001*(1+Math.abs(expected)))
                throw Error('Native HSD animation matrix mismatch: '+name+' '+tree.name+' '+frame+' '+i+' '+values[i]+' '+expected);
            }
            record.set(values,frame*n*12);
          }
          module._portSceneRequest(root);
          for(let frame=0;frame<frames;frame++) {
            module._portSceneAnimate(root);module._portSceneMatrices(n,nodes,matrices);
            if(module.HEAPF32.subarray(matrices/4,matrices/4+n*12).some((v,i)=>!Object.is(v,record[frame*n*12+i])))
              throw Error('Native HSD animation rewind mismatch: '+name+' '+tree.name+' '+frame);
          }
          rows.push({name,animation:tree.name,type:tree.type,frames,maxMatrixError:maxError,rewindPassed:true});
        } finally {if(root)module._portSceneDestroy(root);pose.dispose();clip.dispose();}
        if(module._portSceneLiveJoints()!==0||module._portSceneLiveObjects()!==0)throw Error('Animated HSD objects leaked');
      }
    } finally {for(const p of [nodes,matrices,reference])module._free(p);asset.dispose();}
  }
  return {passed:true,clips:rows,limitations:'Original lbAnim attachment and HSD joint animation; comparison is against native arithmetic/pose checks, not Dolphin gameplay'};
}
