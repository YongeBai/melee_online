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
  if(model.tree.nodes.some(n=>n.className!==null||n.constraints!==null||(n.flags&0x20)))
    throw Error('Custom, constrained or particle joints require a typed importer');
  // Hide public entry points whose payload type has not been imported.
  const publics=new Map([...archive.publics].filter(([,at])=>at===model.tree.nodes[0].offset));
  const image=nativeArchiveImage(archive,publics);
  {
    const out=new DataView(image.buffer,32,archive.dataSize);
    const writes=new Map(),pointerSlots=new Set(),descriptorSlots=new Set();
    const claim=(at,size)=>{for(let i=0;i<size;i+=4){descriptorSlots.add(at+i);if(archive.relocations.has(at+i))pointerSlots.add(at+i);}};
    const word=at=>{writes.set(at,4);out.setUint32(at,d.getUint32(at),true);};
    const half=at=>{writes.set(at,2);out.setUint16(at,d.getUint16(at),true);};
    const ptr=at=>archive.relocations.has(at)?d.getUint32(at):null;
    for(const node of model.tree.nodes) {
      claim(node.offset,64);word(node.offset+4);for(let i=0;i<9;i++)word(node.offset+20+i*4);
      if(node.inverseBind!==null)for(let i=0;i<12;i++)word(node.inverseBind+i*4);
      if(node.flags&0x4000) {
        // HSD_Spline is the joint's display union, not a DObj. Keep the
        // original control points and arc-length coefficients for HSD.
        const at=node.display;
        if(at===null||at%4||at+24>d.byteLength)throw Error('Invalid spline descriptor');
        const type=d.getUint8(at),count=d.getInt16(at+2);
        if(type>3||count<2||count>4096)throw Error('Invalid spline type/count');
        if(!Number.isFinite(d.getFloat32(at+4))||!Number.isFinite(d.getFloat32(at+12))||d.getFloat32(at+12)<0)throw Error('Invalid spline parameter');
        claim(at,24);half(at+2);word(at+4);word(at+12);
        const sizes=[(type===1?3*(count-1)+1:type>=2?count+2:count)*3,count,(count-1)*5];
        for(let k=0;k<3;k++) {
          const data=ptr(at+[8,16,20][k]);
          if(data===null){if(k===2&&type===0)continue;throw Error('Missing spline array');}
          if(data%4||data+sizes[k]*4>d.byteLength)throw Error('Spline array bounds');
          for(let i=0;i<sizes[k];i++){if(!Number.isFinite(d.getFloat32(data+i*4)))throw Error('Nonfinite spline coefficient');word(data+i*4);}
        }
      }
    }
    const dobjs=new Set();let weightSum=0;
    for(const mesh of model.meshes) {
      dobjs.add(mesh.dobj);claim(mesh.dobj,16);claim(mesh.pobj,24);
      if(ptr(mesh.dobj)!==null||ptr(mesh.pobj)!==null)throw Error('Custom display/polygon class requires integration');
      half(mesh.pobj+12);half(mesh.pobj+14);
      let at=ptr(mesh.pobj+8);
      for(;;at+=24) {
        word(at);if(d.getUint32(at)===255)break;claim(at,24);
        for(const field of [4,8,12])word(at+field);half(at+18);
      }
      if((mesh.flags&0x3000)===0x2000) {
        for(let slot=mesh.binding;ptr(slot)!==null;slot+=4) {
          claim(slot,4);for(let entry=ptr(slot);ptr(entry)!==null;entry+=8){claim(entry,8);word(entry+4);weightSum+=d.getFloat32(entry+4);}
        }
      }
    }
    for(const material of assets.materials.values()) {
      claim(material.offset,24);word(material.offset+4);const mat=ptr(material.offset+12);word(mat+12);word(mat+16);
      if(material.renderDescriptor!==null)throw Error('Render descriptors require a typed importer');
    }
    for(const texture of assets.textures.values()) {
      const at=texture.offset;claim(at,92);
      for(const field of [8,12,16,20,24,28,32,36,40,44,48,52,56,64,68,72])word(at+field);
      const lod=ptr(at+84),tev=ptr(at+88);
      if(lod!==null)for(const field of [0,4,12])word(lod+field);
      if(tev!==null)word(tev+28);
    }
    for(const image of assets.images.values()) {
      claim(image.offset,24);half(image.offset+4);half(image.offset+6);for(const field of [8,12,16,20])word(image.offset+field);
    }
    for(const palette of assets.palettes.values()) {
      claim(palette.offset,16);word(palette.offset+4);word(palette.offset+8);half(palette.offset+12);
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
    return {image,rootOffset:model.tree.nodes[0].offset,model,metrics,archive,writes,pointerSlots,descriptorSlots};
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

export function convertSceneAnimation(input,tree=readFigaTree(input)) {
  const archive=inspectArchive(input),d=archive.data;
  const root=archive.publics.get(tree.name);
  if(root===undefined||archive.externs.size)throw Error('Invalid scene animation archive');
  const image=nativeArchiveImage(archive,new Map([[tree.name,root]])),out=new DataView(image.buffer,32,archive.dataSize);
  for(const field of [0,4,8])out.setUint32(root+field,d.getUint32(root+field),true);
  let track=d.getUint32(root+16),node=d.getUint32(root+12);
  while(d.getInt8(node)!==-1) {
    const count=d.getInt8(node++);if(count<0)throw Error('Invalid animation track count');
    for(let i=0;i<count;i++,track+=12) {
      out.setUint16(track,d.getUint16(track),true);out.setUint16(track+2,d.getUint16(track+2),true);
    }
  }
  return {image,archive,root,tree};
}

export function loadSceneAnimation(module,input) {
  const converted=convertSceneAnimation(input),{archive}=converted;
  const memory=module._malloc(archive.dataSize);
  if(!memory)throw Error('Scene animation allocation failed');
  try {
    module.HEAPU8.set(converted.image.subarray(32,32+archive.dataSize),memory);
    const out=new DataView(module.HEAPU8.buffer,memory,archive.dataSize);
    for(const slot of archive.relocations)out.setUint32(slot,memory+archive.data.getUint32(slot),true);
    let disposed=false;
    return {memory,tree:memory+converted.root,dispose(){if(!disposed){module._free(memory);disposed=true;}}};
  } catch(error){module._free(memory);throw error;}
}
