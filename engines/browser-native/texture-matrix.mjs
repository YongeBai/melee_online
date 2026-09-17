export function textureMatrices(module,textures) {
  const input=module._malloc(36),output=module._malloc(48),result=new Map();
  try {
    for(const texture of textures.values()) {
      module.__dirtyMark?.(input,36);module.HEAPF32.set([...texture.rotation,...texture.scale,...texture.translation],input/4);
      if(module._portTextureMatrix(input,texture.repeatS,texture.repeatT,texture.wrapT,output)!==0)
        throw Error('Native texture matrix rejected');
      const matrix=module.HEAPF32.slice(output/4,output/4+12);
      if(matrix.some(v=>!Number.isFinite(v)))throw Error('Nonfinite native texture matrix');
      result.set(texture.offset,matrix);
    }
    return result;
  } finally {module._free(input);module._free(output);}
}
