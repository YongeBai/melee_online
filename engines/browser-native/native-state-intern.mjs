import {readNativeTevState} from './native-tev.mjs';
// Only the pointer-free TEV instruction rows are interned. Registers, constants,
// masks and counters are copied anew for every draw. Hashes select a bucket;
// equality still compares every active instruction word, including unused fields.
export function createTevStageInterner({capacity=1024}={}){
 const buckets=new Map();let entries=0,hits=0,misses=0;
 return {read(module,p){
  if(!p||p%4||p+2192>module.HEAPU8.length)throw Error('Native TEV snapshot bounds');
  const words=new Int32Array(module.HEAPU8.buffer,p,548),n=words[0];if(n<1||n>16)throw Error('Native TEV stage capacity');
  const end=36+n*32;let hash=n;for(let i=36;i<end;i++)hash=Math.imul(hash^words[i],16777619);
  const bucket=buckets.get(hash);let stages=null;
  if(bucket)for(const row of bucket){if(row.words.length!==end-36)continue;let equal=true;for(let i=36;i<end;i++)if(words[i]!==row.words[i-36]){equal=false;break;}if(equal){stages=row.stages;break;}}
  if(!stages){misses++;const state=readNativeTevState(module,p);if(entries<capacity){const row={words:words.slice(36,end),stages:state.stages};if(bucket)bucket.push(row);else buckets.set(hash,[row]);entries++;}return state;}
  hits++;const rows=at=>{const result=new Array(4);for(let i=0;i<4;i++){const row=new Array(4);for(let j=0;j<4;j++)row[j]=words[at+i*4+j];result[i]=row;}return result;};
  return {stages,registers:rows(4),konst:rows(20),registerMask:words[1],constantMask:words[2],syncs:words[3]};
 },snapshot:()=>({entries,hits,misses})};
}
// Stages above are immutable owned arrays. Assign their exact identities a
// match-scoped number so every draw does not copy the large TEV serialization
// into its variant key. The remaining arrays contain only shader-generating
// fields; uniform values intentionally stay out of the key.
export function createInternedShaderKey(){
 const stageIds=new WeakMap(),stageJson=new WeakMap();let nextStage=0;
 return ({tev,textures,pixel,context},attributes,{immediateRegisters=false,legacy=false}={})=>{
  let stage;
  if(legacy){stage=stageJson.get(tev.stages);if(stage===undefined){stage=JSON.stringify(tev.stages);stageJson.set(tev.stages,stage);}}
  else {stage=stageIds.get(tev.stages);if(stage===undefined){if(nextStage>=Number.MAX_SAFE_INTEGER)throw Error('Shader stage identity capacity');stage=nextStage++;stageIds.set(tev.stages,stage);}}
  const a=pixel.alphaTest;
  if(legacy){const rest=JSON.stringify([textures.generators,textures.textures.map(t=>t.id),pixel.channelCount,pixel.channels,[a.compare0,a.operation,a.compare1],attributes.map(a=>a.attr).sort((a,b)=>a-b),immediateRegisters,context?.fog?.type??0]);return '['+stage+','+rest.slice(1);}
  const generators=textures.generators.map(g=>[g.id,g.type,g.source,g.matrix,g.normalize,g.postMatrix]);
  const channels=pixel.channels.map(c=>c?[c.enabled,c.ambientSource,c.materialSource,c.lights,c.diffuse,c.attenuation]:null);
  return stage+':'+JSON.stringify([generators,textures.textures.map(t=>t.id),pixel.channelCount,channels,[a.compare0,a.operation,a.compare1],attributes.map(a=>a.attr).sort((a,b)=>a-b),+immediateRegisters,context?.fog?.type??0]);
 };
}
