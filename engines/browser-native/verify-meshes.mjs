import {readModelMeshes} from './mesh-assets.mjs';
import {verifyAnimatedSkin,verifySkinArithmetic} from './verify-skin.mjs';
export function verifyMeshes(module,files,animations) {
  const arithmetic=verifySkinArithmetic(module);
  const models=files.map(({name,bytes})=>{
    const model=readModelMeshes(bytes);
    if(!model.meshes.length||!model.totalVertices)throw Error('Empty fighter model: '+name);
    const motion=animations.find(a=>a.name===name.replace('Nr','AJ'));
    if(!motion)throw Error('Missing skin animation');
    const skin=verifyAnimatedSkin(module,model,bytes,motion);
    return {name,joints:model.tree.nodes.length,meshes:model.meshes.length,vertices:model.totalVertices,
      skin,
      triangles:model.meshes.reduce((n,m)=>n+m.triangles.length/3,0),
      formats:[...new Set(model.meshes.flatMap(m=>m.draws.map(d=>d.format)))],
      primitives:[...new Set(model.meshes.flatMap(m=>m.draws.map(d=>d.primitive)))]};
  });
  return {passed:true,arithmetic,models,limitations:'Animated geometry decoding/skinning; no materials, textures or rendered-image comparison'};
}
