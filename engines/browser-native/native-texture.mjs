import {decodeGX,textureByteLength} from './texture.mjs';

// Effective register precision of the pinned SDK's GXInitTexObjLOD, applied
// separately from the captured API arguments. Negative bias truncates to zero
// before signed-byte storage; it must not use floor or unsigned saturation.
export function gxTextureLod(min,max,bias) {
  if(![min,max,bias].every(Number.isFinite))throw Error('Native texture nonfinite LOD');
  const lod=v=>Math.trunc(Math.min(10,Math.max(0,v))*16)/16;
  return {min:lod(min),max:lod(max),bias:Math.trunc(Math.fround(Math.min(Math.fround(3.99),Math.max(-4,bias))*32))/32};
}
export function readNativeTextures(module) {
  const p=module._portMaterialTextureState(),heap=module.HEAPU8;
  if(!p||p%4||p+2896>heap.length)throw Error('Native texture snapshot bounds');
  const view=new DataView(heap.buffer,p,2896),u=at=>view.getUint32(at*4,true),f=at=>view.getFloat32(at*4,true);
  const [textureMask,texgenMask,matrixMask,texgens]=[0,1,2,3].map(u);
  if(textureMask>255||texgenMask>255||matrixMask>=2**30||texgens>8||(texgenMask&(2**texgens-1))!==2**texgens-1)throw Error('Native texture resource masks');
  const textures=[],generators=[],matrices=[];
  for(let id=0;id<8;id++) {
    if(textureMask&(1<<id)) {
      const b=4+id*24,t={id,address:u(b),width:u(b+1),height:u(b+2),format:u(b+3),wrapS:u(b+4),wrapT:u(b+5),mipmap:u(b+6),tlut:u(b+7),
        minFilter:u(b+8),magFilter:u(b+9),biasClamp:u(b+10),edgeLod:u(b+11),anisotropy:u(b+12),paletteAddress:u(b+13),paletteFormat:u(b+14),paletteEntries:u(b+15),
        minLod:f(b+16),maxLod:f(b+17),lodBias:f(b+18)};
      textureByteLength(t.width,t.height,t.format);
      if(!t.address||t.wrapS>2||t.wrapT>2||t.mipmap>1||t.minFilter>5||t.magFilter>1||t.biasClamp>1||t.edgeLod>1||t.anisotropy>2||u(b+23)!==1)throw Error('Native texture configuration');
      t.lod=gxTextureLod(t.minLod,t.maxLod,t.lodBias);
      if(t.minLod<0||t.maxLod<t.minLod||t.maxLod>10)throw Error('Native texture mip range');
      if([8,9,10].includes(t.format)&&(!t.paletteAddress||t.paletteFormat>2||!t.paletteEntries||t.paletteEntries>16384))throw Error('Native texture palette');
      textures.push(t);
    }
    if(id<texgens&&(texgenMask&(1<<id))) {
      const b=196+id*6,g={id,type:u(b),source:u(b+1),matrix:u(b+2),normalize:u(b+3),postMatrix:u(b+4)};
      if(g.type>10||g.source>20||g.normalize>1)throw Error('Native texture generator');generators.push(g);
    }
  }
  for(let slot=0;slot<30;slot++)if(matrixMask&(1<<slot)) {
    const b=244+slot*16,id=u(b),type=u(b+1),values=Array.from({length:12},(_,i)=>f(b+4+i));
    if(id!==(slot<10?30+slot*3:64+(slot-10)*3)||type>1||!values.every(Number.isFinite))throw Error('Native texture matrix');
    matrices.push({id,type,values});
  }
  for(const g of generators)for(const id of [g.matrix,g.postMatrix])if(![0,30,60,125].includes(id)&&!matrices.some(m=>m.id===id))throw Error('Native texture generator missing matrix');
  return {textures,generators,matrices};
}

// Decode the runtime image/palette selection, not a stale archive descriptor.
// Call while the owning native archive is alive; returned pixels own their data.
export function decodeNativeTexture(module,t) {
  const heap=module.HEAPU8,bounds=(at,size)=>{if(!Number.isSafeInteger(at)||at<=0||at+size>heap.length)throw Error('Native image memory bounds');return heap.subarray(at,at+size);};
  const palette=t.paletteAddress?{format:t.paletteFormat,data:bounds(t.paletteAddress,t.paletteEntries*2)}:null;
  let address=t.address;const levels=[];
  for(let level=0;level<=(t.mipmap?Math.floor(t.maxLod):0);level++) {
    const width=Math.max(1,t.width>>level),height=Math.max(1,t.height>>level),size=textureByteLength(width,height,t.format);
    levels.push({width,height,pixels:decodeGX(bounds(address,size),width,height,t.format,palette)});address+=size;
  }
  return levels;
}
