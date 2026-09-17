import {readModelMeshes} from './mesh-assets.mjs';

// Match-scoped cache for immutable hosted archive views. Only decoded source
// geometry is shared: native nodes, animation, visibility, matrices, GPU buffers
// and polygon bindings retain their existing per-object lifetime. Callers must
// use a new view after changing archive contents or its published model root.
export function createModelGeometryCache({enabled=false}={}){
  let cache=new WeakMap(),decodes=0,hits=0,verticesDecoded=0;
  return {
    read(bytes){
      if(!(bytes instanceof Uint8Array))throw Error('Geometry cache requires an immutable archive view');
      if(enabled&&cache.has(bytes)){hits++;return cache.get(bytes);}
      const model=readModelMeshes(bytes);decodes++;verticesDecoded+=model.totalVertices;
      if(enabled)cache.set(bytes,model);return model;
    },
    clear(){cache=new WeakMap();},
    get stats(){return {enabled,decodes,hits,verticesDecoded};},
  };
}
