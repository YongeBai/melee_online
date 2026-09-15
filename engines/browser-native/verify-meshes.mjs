import {readModelMeshes} from './mesh-assets.mjs';
export function verifyMeshes(files) {
  const models=files.map(({name,bytes})=>{
    const model=readModelMeshes(bytes);
    if(!model.meshes.length||!model.totalVertices)throw Error('Empty fighter model: '+name);
    return {name,joints:model.tree.nodes.length,meshes:model.meshes.length,vertices:model.totalVertices,
      triangles:model.meshes.reduce((n,m)=>n+m.triangles.length/3,0),
      formats:[...new Set(model.meshes.flatMap(m=>m.draws.map(d=>d.format)))],
      primitives:[...new Set(model.meshes.flatMap(m=>m.draws.map(d=>d.primitive)))]};
  });
  return {passed:true,models,limitations:'Static geometry decoding; no skinning, materials, textures or rendered-image comparison'};
}
