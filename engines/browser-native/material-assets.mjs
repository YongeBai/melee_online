import {inspectArchive} from './archive.mjs';
import {decodeGX,textureByteLength} from './texture.mjs';

export function readModelMaterials(input,model) {
  const archive=inspectArchive(input),d=archive.data,materials=new Map(),textures=new Map(),images=new Map(),palettes=new Map();
  const bounds=(at,size)=>{if(at===null||at%4||at<0||at+size>d.byteLength)throw Error('Material data out of bounds');};
  const ptr=at=>{bounds(at,4);const v=d.getUint32(at);if(archive.relocations.has(at))return v;
    if(v)throw Error('Unrelocated material pointer');return null;};
  const floats=(at,count)=>{bounds(at,count*4);return Array.from({length:count},(_,i)=>{
    const v=d.getFloat32(at+i*4);if(!Number.isFinite(v))throw Error('Nonfinite material value');return v;});};
  function palette(at) {
    if(at===null)return null;if(palettes.has(at))return palettes.get(at);
    bounds(at,16);const data=ptr(at),format=d.getUint32(at+4),entries=d.getUint16(at+12);
    if(![0,1,2].includes(format)||!entries||entries>16384)throw Error('Invalid material palette');
    bounds(data,entries*2);
    const result={offset:at,format,entries,data:archive.bytes.slice(32+data,32+data+entries*2)};
    palettes.set(at,result);return result;
  }
  function image(at,tlut) {
    const key=at+':'+(tlut?.offset??'none');if(images.has(key))return images.get(key);
    bounds(at,24);let data=ptr(at);
    const width=d.getUint16(at+4),height=d.getUint16(at+6),format=d.getUint32(at+8),mipmap=d.getUint32(at+12),[minLOD,maxLOD]=floats(at+16,2);
    textureByteLength(width,height,format);
    if(minLOD<0||maxLOD<minLOD||maxLOD>10||mipmap>1)throw Error('Invalid image LOD');
    const levels=[];
    for(let level=0;level<=(mipmap?Math.floor(maxLOD):0);level++) {
      const w=Math.max(1,width>>level),h=Math.max(1,height>>level),size=textureByteLength(w,h,format);
      bounds(data,size);const pixels=decodeGX(archive.bytes.subarray(32+data,32+data+size),w,h,format,tlut);
      levels.push({width:w,height:h,pixels});data+=size;
    }
    const result={offset:at,width,height,format,mipmap,minLOD,maxLOD,levels};images.set(key,result);return result;
  }
  function texture(at,active) {
    if(active.has(at))throw Error('Cyclic material texture chain');
    if(textures.has(at))return textures.get(at);
    bounds(at,92);active.add(at);
    const className=ptr(at);if(className!==null)throw Error('Custom texture class needs native integration');
    const tlut=palette(ptr(at+80)),im=image(ptr(at+76),tlut),lod=ptr(at+84),tev=ptr(at+88);
    const transform=floats(at+16,9),blend=floats(at+68,1)[0],wrapS=d.getUint32(at+52),wrapT=d.getUint32(at+56);
    if(wrapS>2||wrapT>2||!d.getUint8(at+60)||!d.getUint8(at+61))throw Error('Invalid texture wrapping');
    if(lod!==null)bounds(lod,16);if(tev!==null)bounds(tev,32);
    const result={offset:at,id:d.getUint32(at+8),src:d.getUint32(at+12),rotation:transform.slice(0,3),
      scale:transform.slice(3,6),translation:transform.slice(6),wrapS,wrapT,repeatS:d.getUint8(at+60),repeatT:d.getUint8(at+61),
      flags:d.getUint32(at+64),blend,magFilter:d.getUint32(at+72),image:im,palette:tlut,
      lod:lod===null?null:{minFilter:d.getUint32(lod),bias:floats(lod+4,1)[0],biasClamp:d.getUint8(lod+8),edge:d.getUint8(lod+9),anisotropy:d.getUint32(lod+12)},
      tev:tev===null?null:archive.bytes.slice(32+tev,32+tev+32),next:null};
    const next=ptr(at+4);if(next!==null)result.next=texture(next,active);
    textures.set(at,result);active.delete(at);return result;
  }
  for(const mesh of model.meshes) {
    const at=mesh.material;if(materials.has(at))continue;bounds(at,24);
    if(ptr(at)!==null)throw Error('Custom material class needs native integration');
    const mat=ptr(at+12),pe=ptr(at+20),tex=ptr(at+8);bounds(mat,20);if(pe!==null)bounds(pe,12);
    const colors=Array.from(archive.bytes.subarray(32+mat,32+mat+12)),[alpha,shininess]=floats(mat+12,2);
    materials.set(at,{offset:at,renderMode:d.getUint32(at+4),ambient:colors.slice(0,4),diffuse:colors.slice(4,8),
      specular:colors.slice(8),alpha,shininess,texture:tex===null?null:texture(tex,new Set()),
      pixelEngine:pe===null?null:archive.bytes.slice(32+pe,32+pe+12),renderDescriptor:ptr(at+16)});
  }
  return {materials,textures,images,palettes};
}
