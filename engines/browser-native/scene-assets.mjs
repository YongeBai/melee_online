import {inspectArchive,nativeArchiveImage} from './archive.mjs';
import {readModelMeshes} from './mesh-assets.mjs';
import {readModelMaterials} from './material-assets.mjs';
import {readSkinBindings} from './skin-assets.mjs';
import {readFigaTree} from './animation-assets.mjs';
// Convert known HSD descriptors only. GX display lists, texture pixels, packed
// colors and vertex-array payloads remain byte-for-byte big endian for GX.
export function convertSceneAsset(input) {
  const archive=inspectArchive(input),d=archive.data,model=readModelMeshes(input),assets=readModelMaterials(input,model);
  readSkinBindings(input,model); // Validate every reference and weight first.
  if(archive.externs.size)throw Error('Scene extern references require explicit linking');
  if(model.tree.nodes.some(n=>n.className!==null||n.constraints!==null||(n.flags&0x5020)))
    throw Error('Custom, constrained, instance, spline or particle joints require a typed importer');
  // Hide public entry points whose payload type has not been imported.
  const publics=new Map([...archive.publics].filter(([,at])=>at===model.tree.nodes[0].offset));
  const image=nativeArchiveImage(archive,publics);
  {
    const out=new DataView(image.buffer,32,archive.dataSize);
    const word=at=>out.setUint32(at,d.getUint32(at),true),half=at=>out.setUint16(at,d.getUint16(at),true);
    const ptr=at=>archive.relocations.has(at)?d.getUint32(at):null;
    for(const node of model.tree.nodes) {
      word(node.offset+4);for(let i=0;i<9;i++)word(node.offset+20+i*4);
      if(node.inverseBind!==null)for(let i=0;i<12;i++)word(node.inverseBind+i*4);
    }
    const dobjs=new Set();let weightSum=0;
    for(const mesh of model.meshes) {
      dobjs.add(mesh.dobj);
      if(ptr(mesh.dobj)!==null||ptr(mesh.pobj)!==null)throw Error('Custom display/polygon class requires integration');
      half(mesh.pobj+12);half(mesh.pobj+14);
      let at=ptr(mesh.pobj+8);
      for(;;at+=24) {
        word(at);if(d.getUint32(at)===255)break;
        for(const field of [4,8,12])word(at+field);half(at+18);
      }
      if((mesh.flags&0x3000)===0x2000) {
        for(let slot=mesh.binding;ptr(slot)!==null;slot+=4)
          for(let entry=ptr(slot);ptr(entry)!==null;entry+=8){word(entry+4);weightSum+=d.getFloat32(entry+4);}
      }
    }
    for(const material of assets.materials.values()) {
      word(material.offset+4);const mat=ptr(material.offset+12);word(mat+12);word(mat+16);
      if(material.renderDescriptor!==null)throw Error('Render descriptors require a typed importer');
    }
    for(const texture of assets.textures.values()) {
      const at=texture.offset;
      for(const field of [8,12,16,20,24,28,32,36,40,44,48,52,56,64,68,72])word(at+field);
      const lod=ptr(at+84),tev=ptr(at+88);
      if(lod!==null)for(const field of [0,4,12])word(lod+field);
      if(tev!==null)word(tev+28);
    }
    for(const image of assets.images.values()) {
      half(image.offset+4);half(image.offset+6);for(const field of [8,12,16,20])word(image.offset+field);
    }
    for(const palette of assets.palettes.values()) {
      word(palette.offset+4);word(palette.offset+8);half(palette.offset+12);
    }
    let inverseSum=0,materialSum=0,textureSum=0;
    for(const node of model.tree.nodes)if(node.inverseBind!==null)
      for(let i=0;i<12;i++)inverseSum+=(i+1)*d.getFloat32(node.inverseBind+i*4);
    for(const at of dobjs) {
      const mat=assets.materials.get(ptr(at+8));materialSum+=mat.alpha+2*mat.shininess;
      for(let t=mat.texture;t;t=t.next)textureSum+=t.image.width+2*t.image.height+3*t.image.format;
    }
    const metrics=[model.tree.nodes.reduce((n,node)=>n+[...node.rotation,...node.scale,...node.translation].reduce((n,v,i)=>n+(i+1)*v,0),0),
      inverseSum,0,dobjs.size,materialSum,textureSum,model.meshes.length,weightSum];
    return {image,rootOffset:model.tree.nodes[0].offset,model,metrics,archive};
  }
}

export function loadSceneAsset(module,input) {
  const converted=convertSceneAsset(input),{archive}=converted;
  const memory=module._malloc(archive.dataSize);if(!memory)throw Error('Scene descriptor allocation failed');
  try {
    module.HEAPU8.set(converted.image.subarray(32,32+archive.dataSize),memory);
    const out=new DataView(module.HEAPU8.buffer,memory,archive.dataSize);
    for(const slot of archive.relocations)out.setUint32(slot,memory+archive.data.getUint32(slot),true);
    let disposed=false;
    return {memory,root:memory+converted.rootOffset,model:converted.model,metrics:converted.metrics,
      dispose(){if(!disposed){module._free(memory);disposed=true;}}};
  } catch(error){module._free(memory);throw error;}
}

export function loadSceneAnimation(module,input) {
  readFigaTree(input);
  const archive=inspectArchive(input),d=archive.data;
  const root=[...archive.publics].find(([name])=>name.endsWith('_figatree'))?.[1];
  if(root===undefined||archive.externs.size)throw Error('Invalid scene animation archive');
  const memory=module._malloc(archive.dataSize);
  if(!memory)throw Error('Scene animation allocation failed');
  try {
    module.HEAPU8.set(archive.bytes.subarray(32,32+archive.dataSize),memory);
    const out=new DataView(module.HEAPU8.buffer,memory,archive.dataSize);
    for(const slot of archive.relocations)out.setUint32(slot,memory+d.getUint32(slot),true);
    for(const field of [0,4,8])out.setUint32(root+field,d.getUint32(root+field),true);
    let track=d.getUint32(root+16),node=d.getUint32(root+12);
    while(d.getInt8(node)!==-1) {
      const count=d.getInt8(node++);if(count<0)throw Error('Invalid animation track count');
      for(let i=0;i<count;i++,track+=12) {
        out.setUint16(track,d.getUint16(track),true);out.setUint16(track+2,d.getUint16(track+2),true);
      }
    }
    return {memory,tree:memory+root,dispose(){module._free(memory);}};
  } catch(error){module._free(memory);throw error;}
}
