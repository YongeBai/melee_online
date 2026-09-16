// Build-local generated GLSL only. Catalogs contain no textures, models or match
// state. Exact source lookup remains authoritative when a material is drawn.
// Backend-only diagnostics do not generate GLSL. Older catalog fingerprints
// may retain those extra hashes as provenance; only generators key validity.
export const shaderIdentityFiles=['material-shader.mjs','tev-shader.mjs','native-tev.mjs','native-pixel.mjs'];
const digest=/^[a-f0-9]{64}$/;
function identityKey(identity){
  if(!identity||!digest.test(identity.wasmSha256??''))throw Error('Invalid shader catalog core identity');
  const sources=identity.sources;
  if(!sources||shaderIdentityFiles.some(f=>!digest.test(sources[f]??'')))throw Error('Invalid shader generator identity');
  return JSON.stringify([identity.wasmSha256,...shaderIdentityFiles.map(f=>sources[f])]);
}
export function validateShaderCatalog(catalog,identity){
  const expected=identityKey(identity);
  if(catalog?.version!==1||identityKey(catalog.identity)!==expected)throw Error('Stale or incompatible shader catalog');
  if(!Array.isArray(catalog.programs)||!catalog.programs.length||catalog.programs.length>4096)throw Error('Invalid shader catalog size');
  let total=0;const seen=new Set();
  for(const source of catalog.programs){
    for(const kind of ['vertex','fragment']){
      const text=source?.[kind];
      if(typeof text!=='string'||!text.startsWith('#version 300 es\n')||text.length>262144)throw Error('Invalid shader catalog source');
      total+=text.length;if(total>32*1024*1024)throw Error('Shader catalog exceeds byte budget');
    }
    const key=source.vertex+'\n'+source.fragment;
    if(seen.has(key))throw Error('Duplicate shader catalog program');seen.add(key);
  }
  return catalog;
}
export function mergeShaderCatalogs(catalogs){
  if(!catalogs.length)throw Error('No shader catalogs');const identity=catalogs[0].identity,programs=new Map();
  for(const catalog of catalogs){validateShaderCatalog(catalog,identity);for(const p of catalog.programs)programs.set(p.vertex+'\n'+p.fragment,p);}
  return validateShaderCatalog({version:1,identity,programs:[...programs.values()]},identity);
}
