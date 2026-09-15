import {readModelMeshes} from './mesh-assets.mjs';
import {verifyAnimatedSkin,verifySkinArithmetic} from './verify-skin.mjs';
import {readModelMaterials} from './material-assets.mjs';
import {textureMatrices} from './texture-matrix.mjs';
export function verifyMeshes(module,files,animations) {
  const arithmetic=verifySkinArithmetic(module);
  const models=files.map(({name,bytes})=>{
    const model=readModelMeshes(bytes);
    if(!model.meshes.length||!model.totalVertices)throw Error('Empty fighter model: '+name);
    const motion=animations.find(a=>a.name===name.replace('Nr','AJ'));
    if(!motion)throw Error('Missing skin animation');
    const skin=verifyAnimatedSkin(module,model,bytes,motion);
    const assets=readModelMaterials(bytes,model);
    const transforms=textureMatrices(module,assets.textures);
    return {name,joints:model.tree.nodes.length,meshes:model.meshes.length,vertices:model.totalVertices,
      materials:assets.materials.size,textures:assets.textures.size,images:assets.images.size,palettes:assets.palettes.size,
      textureMatrices:transforms.size,
      textureFormats:[...new Set([...assets.images.values()].map(image=>image.format))],
      decodedTexels:[...assets.images.values()].reduce((n,image)=>n+image.levels.reduce((n,l)=>n+l.width*l.height,0),0),
      skin,
      triangles:model.meshes.reduce((n,m)=>n+m.triangles.length/3,0),
      formats:[...new Set(model.meshes.flatMap(m=>m.draws.map(d=>d.format)))],
      primitives:[...new Set(model.meshes.flatMap(m=>m.draws.map(d=>d.primitive)))]};
  });
  return {passed:true,arithmetic,models,limitations:'Animated geometry and material/texture decoding; no GX lighting/TEV execution or rendered-image comparison'};
}
