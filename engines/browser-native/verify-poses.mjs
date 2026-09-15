import {readJointTree} from './joint-assets.mjs';
import {animationArchives} from './animation-assets.mjs';

export function loadPose(module,model,animation) {
  if(animation.bones!==model.nodes.length)throw Error('Animation/model node count mismatch');
  if(model.nodes.some(n=>n.constraints!==null||n.className!==null))throw Error('Pose constraints/classes need native integration');
  const pose=module._portPoseCreate(model.nodes.length),storage=module._malloc(36),payloads=[];
  if(!pose)throw Error('Pose allocation failed');
  const dispose=()=>{module._portPoseDestroy(pose);for(const p of payloads)module._free(p);};
  try {
    model.nodes.forEach((node,index)=>{
      module.HEAPF32.set([...node.rotation,...node.scale,...node.translation],storage/4);
      if(module._portPoseNode(pose,index,node.parent,node.flags,storage)!==0)throw Error('Unsupported native pose node');
    });
    for(const track of animation.tracks) {
      const data=module._malloc(track.bytes.length);payloads.push(data);module.HEAPU8.set(track.bytes,data);
      const pointer=module._portAnimationCreate(data,track.bytes.length,track.start,track.objType,track.fracValue,track.fracSlope);
      if(module._portPoseTrack(pose,track.bone,pointer,animation.type&1,animation.flags,animation.frames)!==0) {
        module._portAnimationDestroy(pointer);throw Error('Unsupported native pose track: '+track.objType);
      }
    }
    module._portPoseRewind(pose);
    return {pointer:pose,dispose};
  } catch(error){dispose();throw error;} finally{module._free(storage);}
}

export function verifyPoses(module,modelFiles,animationFiles) {
  for(const classical of [0,8]) {
    const pose=module._portPoseCreate(2),input=module._malloc(36),output=module._malloc(96);
    try {
      module.HEAPF32.set([0,0,0,2,3,4,10,20,30],input/4);
      if(module._portPoseNode(pose,0,-1,classical,input)!==0)throw Error('Synthetic root rejected');
      const angle=Math.fround(Math.PI/2),s=module._sinf(angle),c=module._cosf(angle);
      module.HEAPF32.set([0,0,angle,1,1,1,1,2,3],input/4);
      if(module._portPoseNode(pose,1,0,8,input)!==0)throw Error('Synthetic child rejected');
      module._portPoseRewind(pose);module._portPoseStep(pose,output);
      const expected=[2*c,-(classical?2:3)*s,0,12,(classical?3:2)*s,3*c,0,26,0,0,4,42];
      const actual=module.HEAPF32.subarray(output/4+12,output/4+24);
      if(actual.some((v,i)=>Math.abs(v-expected[i])>1e-6))throw Error('Parent scale compensation failed');
    } finally {module._free(input);module._free(output);module._portPoseDestroy(pose);}
  }
  const rows=[];
  for(const {name,bytes} of modelFiles) {
    const model=readJointTree(bytes),motion=animationFiles.find(f=>f.name===name.replace('Nr','AJ'));
    if(!motion)throw Error('Missing hosted model animation');
    let first=true;
    for(const {tree:animation} of animationArchives(motion.bytes,true)) {
      // First clip of every component plus all uncommon scaling-mode clips.
      if(!first&&animation.type!==0)continue;
      first=false;
      const pose=loadPose(module,model,animation),count=model.nodes.length*12;
      const output=module._malloc(count*4),frames=Math.min(120,Math.ceil(animation.frames)+2);
      const reference=new Float32Array(frames*count);
      try {
        let changed=false;
        for(let frame=0;frame<frames;frame++) {
          module._portPoseStep(pose.pointer,output);
          const values=module.HEAPF32.subarray(output/4,output/4+count);
          if(values.some(v=>!Number.isFinite(v)))throw Error('Nonfinite native bone transform: '+name);
          if(frame&&values.some((v,i)=>v!==reference[i]))changed=true;
          reference.set(values,frame*count);
        }
        module._portPoseRewind(pose.pointer);
        for(let frame=0;frame<frames;frame++) {
          module._portPoseStep(pose.pointer,output);
          const values=module.HEAPF32.subarray(output/4,output/4+count);
          if(values.some((v,i)=>!Object.is(v,reference[frame*count+i])))throw Error('Native pose rewind mismatch: '+name);
        }
        if(!changed)throw Error('Pose never animated: '+name);
        rows.push({name,animation:animation.name,classical:animation.type===1,nodes:model.nodes.length,frames,rewindPassed:true});
      } finally {module._free(output);pose.dispose();}
    }
  }
  return {passed:true,parentScaleCases:2,models:modelFiles.length,clips:rows,
    limitations:'Limited SRT/visibility integration; no constraints, combat, rendering or Dolphin pose parity'};
}
