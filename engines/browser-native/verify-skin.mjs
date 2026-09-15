import {loadSkin,readSkinBindings} from './skin-assets.mjs';
import {loadPose} from './verify-poses.mjs';
import {animationArchives} from './animation-assets.mjs';

export function verifySkinArithmetic(module) {
  const nodes=[{flags:2,parent:-1},{flags:1,parent:0}];
  const translated=x=>[1,0,0,x,0,1,0,0,0,0,1,0];
  const bindings={inverse:Float32Array.from([...translated(-1),...translated(-2)]),hasInverse:Uint32Array.from([1,1]),
    groups:[{kind:0,owner:0,first:0,count:1},{kind:1,owner:0,first:0,count:1},
      {kind:1,owner:0,first:1,count:2},{kind:1,owner:1,first:0,count:1},{kind:1,owner:1,first:1,count:2}],
    influences:[{joint:0,weight:1},{joint:0,weight:0.25},{joint:1,weight:0.75}],
    meshPalettes:[[0],[1],[2],[3],[4]]};
  const model={tree:{nodes},totalVertices:5,meshes:Array.from({length:5},()=>({vertices:[{9:[1,2,3]}]}))};
  const skin=loadSkin(module,model,bindings);
  try {
    module.HEAPF32.set([...translated(10),...translated(20)],skin.world/4);skin.step();
    const positions=module.HEAPF32.subarray(skin.transformed/4,skin.transformed/4+15);
    [11,11,16.75,12,18.75].forEach((x,i)=>{
      if(Math.abs(positions[i*3]-x)>0.00001||positions[i*3+1]!==2||positions[i*3+2]!==3)
        throw Error('Skin coordinate-space case failed: '+i);
    });
    return {passed:true,cases:5};
  } finally {skin.dispose();}
}

export function verifyAnimatedSkin(module,model,bytes,motion) {
  const bindings=readSkinBindings(bytes,model),animation=animationArchives(motion.bytes).next().value.tree;
  const pose=loadPose(module,model.tree,animation);let skin;
  const frames=32,count=model.totalVertices*3,reference=new Float32Array(count*frames);
  let min=Infinity,max=-Infinity,changed=false;
  try {
    skin=loadSkin(module,model,bindings);
    for(let frame=0;frame<frames;frame++) {
      module._portPoseStep(pose.pointer,skin.world);skin.step();
      const values=module.HEAPF32.subarray(skin.transformed/4,skin.transformed/4+count);
      for(let i=0;i<count;i++) {
        if(!Number.isFinite(values[i]))throw Error('Nonfinite animated mesh');
        min=Math.min(min,values[i]);max=Math.max(max,values[i]);
        if(frame&&values[i]!==reference[i])changed=true;
      }
      reference.set(values,frame*count);
    }
    module._portPoseRewind(pose.pointer);
    for(let frame=0;frame<frames;frame++) {
      module._portPoseStep(pose.pointer,skin.world);skin.step();
      const values=module.HEAPF32.subarray(skin.transformed/4,skin.transformed/4+count);
      for(let i=0;i<count;i++)if(!Object.is(values[i],reference[frame*count+i]))throw Error('Skinned geometry rewind mismatch');
    }
    if(!changed)throw Error('Skinned geometry did not animate');
    return {frames,paletteMatrices:bindings.groups.length,influences:bindings.influences.length,min,max,rewindPassed:true};
  } finally {skin?.dispose();pose.dispose();}
}
