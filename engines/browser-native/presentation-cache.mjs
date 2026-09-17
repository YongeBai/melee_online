import {createModelGeometryCache} from './model-geometry-cache.mjs';
import {inspectArchive} from './archive.mjs';

// Match-scoped immutable source/GPU assets only. No native owners, node arrays,
// polygon bindings, uniforms, or WASM allocations. Retained textures own exact
// copies of their source image/palette bytes, checked before every new lease use.
export function createPresentationCache(){
  const programs=new Map(),models=new Map(),images=new Map(),geometry=createModelGeometryCache({enabled:true});
  let context=null,leases=0,closed=false,archives=new WeakMap(),gpuInfo=null;
  const stats={modelHits:0,modelMisses:0,textureHits:0,textureMisses:0,textureInvalidations:0,rendererLeases:0};
  return {
    geometry,
    archive(bytes){
      if(closed||!(bytes instanceof Uint8Array))throw Error('Immutable archive cache unavailable');
      if(!archives.has(bytes))archives.set(bytes,inspectArchive(bytes));
      return archives.get(bytes);
    },
    gpuInfo(gl,read){
      if(closed||gl.isContextLost()||(context&&context!==gl))throw Error('Presentation cache context unavailable');
      context=gl;return gpuInfo??=read();
    },
    acquire(gl){
      if(closed||gl.isContextLost()||(context&&context!==gl))throw Error('Presentation cache context unavailable');
      if(leases)throw Error('Presentation cache already leased');
      context=gl;leases++;stats.rendererLeases++;
      let released=false;
      return {
        programs,
        model(bytes,create){
          if(released)throw Error('Released presentation lease');
          if(models.has(bytes)){stats.modelHits++;return models.get(bytes);}
          const model=create();models.set(bytes,model);stats.modelMisses++;return model;
        },
        texture(key,source,create){
          if(released)throw Error('Released presentation lease');
          const old=images.get(key);
          const equal=old&&source.length===old.source.length&&source.every((bytes,index)=>{
            const prior=old.source[index];if(bytes.length!==prior.length)return false;
            for(let i=0;i<bytes.length;i++)if(bytes[i]!==prior[i])return false;return true;
          });
          if(equal){stats.textureHits++;return old.texture;}
          const texture=create(),owned=source.map(bytes=>bytes.slice());
          if(old){gl.deleteTexture(old.texture);stats.textureInvalidations++;}
          images.set(key,{texture,source:owned});stats.textureMisses++;return texture;
        },
        release(){if(!released){released=true;leases--;}}
      };
    },
    snapshot:()=>({...stats,models:models.size,programs:programs.size,textures:images.size,textureSourceBytes:[...images.values()].reduce((n,i)=>n+i.source.reduce((n,b)=>n+b.length,0),0),leases,geometry:geometry.stats}),
    dispose(){
      if(leases)throw Error('Cannot dispose leased presentation assets');
      if(closed)return;closed=true;
      for(const model of models.values())model.dispose();
      for(const p of programs.values())context.deleteProgram(p.program);
      for(const image of images.values())context.deleteTexture(image.texture);
      models.clear();programs.clear();images.clear();geometry.clear();archives=new WeakMap();gpuInfo=null;
    }
  };
}
