// Version 1: one std140 record per queued draw. This module accepts owned JS
// snapshots only; it never reads or retains a native heap, address or binding.
export const DRAW_BLOCK='MeleeDrawV1';
const definitions=[['projection','mat4'],['positionRows','vec4',30],['normalRows','vec4',30],['textureRows','vec4',30],['postRows','vec4',60],['tevRegisters','ivec4',4],['tevKonst','ivec4',4],['ambientColor','ivec4',2],['materialColor','ivec4',2],['lightColor','ivec4',8],['lightPosition','vec3',8],['lightDirection','vec3',8],['lightAngular','vec3',8],['lightDistance','vec3',8],['lodBias','float',8],['fogAC','vec2'],['fogBShift','ivec2'],['fogColor','ivec3'],['alphaReference','ivec2'],['currentMatrix','int']];
const round=(n,a)=>Math.ceil(n/a)*a;
let bytes=0;
export const DRAW_FIELDS=Object.freeze(definitions.map(([name,type,count=1])=>{
 const components=type==='mat4'?16:type==='float'||type==='int'?1:Number(type.at(-1)),array=count>1,align=array||components>=3?16:components*4;
 bytes=round(bytes,align);const offset=bytes,stride=array?round(components*4,16):components*4;bytes+=stride*count;
 return Object.freeze({name,type,count,components,offset,stride,arrayStride:array?stride:0,matrixStride:type==='mat4'?16:0});
}));
export const DRAW_BLOCK_BYTES=round(bytes,16);
const byName=new Map(DRAW_FIELDS.map(f=>[f.name,f]));
const block=`layout(std140) uniform ${DRAW_BLOCK} {\n${DRAW_FIELDS.map(f=>`highp ${f.type} ubo_${f.name}${f.count>1?'['+f.count+']':''};`).join('\n')}\n};\n`;
export function uniformBufferShaders(sources){
 if(!sources||Object.values(sources).some(s=>typeof s!=='string'))return null;
 const result={};
 for(const stage of ['vertex','fragment']){
  let source=sources[stage];if(!source?.startsWith('#version 300 es\n')||source.includes(DRAW_BLOCK))return null;
  const converted=new Set();let unsupported=false;
  source=source.replace(/\buniform\s+(float|int|vec[234]|ivec[234]|mat4)\s+([^;]+);/g,(original,type,decl)=>{
   const rows=decl.split(',').map(s=>s.trim().match(/^(\w+)(?:\[(\d+)\])?$/));
   if(rows.some(r=>!r||!byName.has(r[1])||byName.get(r[1]).type!==type||byName.get(r[1]).count!==Number(r[2]??1))){unsupported=true;return original;}
   for(const r of rows)converted.add(r[1]);return '';
  });
  if(unsupported||!converted.size||/\buniform\s+(?!sampler2D\b)/.test(source))return null;
  // Flat TEV varyings in immediate programs are intentionally not converted.
  source=source.replace(/\b[A-Za-z_]\w*\b/g,word=>converted.has(word)?'ubo_'+word:word);
  const precision='precision highp float;precision highp int;';if(!source.includes(precision))return null;
  result[stage]=source.replace(precision,precision+'\n'+block);
 }
 return result;
}
export function validateDrawBlock(gl,program){
 const index=gl.getUniformBlockIndex(program,DRAW_BLOCK);if(index===gl.INVALID_INDEX||index===0xffffffff)throw Error('Uniform block absent');
 const size=gl.getActiveUniformBlockParameter(program,index,gl.UNIFORM_BLOCK_DATA_SIZE);
 if(!Number.isInteger(size)||size<=0||size>DRAW_BLOCK_BYTES)throw Error('Uniform block size');
 const ids=Array.from(gl.getActiveUniformBlockParameter(program,index,gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES));
 const query=which=>Array.from(gl.getActiveUniforms(program,ids,which));
 const offsets=query(gl.UNIFORM_OFFSET),arrays=query(gl.UNIFORM_ARRAY_STRIDE),matrices=query(gl.UNIFORM_MATRIX_STRIDE),major=query(gl.UNIFORM_IS_ROW_MAJOR),blocks=query(gl.UNIFORM_BLOCK_INDEX);
 const types={float:gl.FLOAT,int:gl.INT,vec2:gl.FLOAT_VEC2,vec3:gl.FLOAT_VEC3,vec4:gl.FLOAT_VEC4,ivec2:gl.INT_VEC2,ivec3:gl.INT_VEC3,ivec4:gl.INT_VEC4,mat4:gl.FLOAT_MAT4};
 for(let i=0;i<ids.length;i++){
  const info=gl.getActiveUniform(program,ids[i]),name=info?.name.replace(/^MeleeDrawV1\./,'').replace(/^ubo_/,'').replace(/\[0\]$/,''),f=byName.get(name);
  if(!f||info.type!==types[f.type]||info.size<1||info.size>f.count||offsets[i]!==f.offset||arrays[i]!==f.arrayStride||matrices[i]!==f.matrixStride||major[i]||blocks[i]!==index||f.offset+(info.size-1)*f.stride+f.components*4>size)throw Error('Uniform block layout '+name);
 }
 if(!ids.length)throw Error('Uniform block has no active values');gl.uniformBlockBinding(program,index,0);return {version:1,index,size,active:ids.length};
}
const offsets=Object.fromEntries(DRAW_FIELDS.map(f=>[f.name,f.offset/4]));
export function writeDrawUniforms(buffer,byteOffset,state,camera,{clear=true}={}){
 const f=new Float32Array(buffer,byteOffset,DRAW_BLOCK_BYTES/4),i=new Int32Array(buffer,byteOffset,DRAW_BLOCK_BYTES/4);if(clear)i.fill(0);
 writeDrawUniformViews(f,i,0,state,camera);
}
function writeModelRows(f,at,packed,rows){
 if(packed)f.set(packed,at);else for(let n=0;n<rows.length;n++)if(rows[n])f.set(rows[n],at+n*12);
}
// The pool owns these views, so packing hundreds of records needs no per-draw
// views, closures, descriptor arrays or temporary scalar arrays. Offsets remain
// derived from the reflected std140 layout; all padding is cleared by prepare.
function writeDrawUniformViews(f,i,base,state,camera){
 f.set(camera.projection,base+offsets.projection);
 writeModelRows(f,base+offsets.positionRows,state.model.positionRows,state.model.positions);
 writeModelRows(f,base+offsets.normalRows,state.model.normalRows,state.model.normals);
 for(const m of state.textures.matrices)f.set(m.values,base+(m.id<64?offsets.textureRows+(m.id-30)*4:offsets.postRows+(m.id-64)*4));
 for(let n=0;n<4;n++){i.set(state.tev.registers[n],base+offsets.tevRegisters+n*4);i.set(state.tev.konst[n],base+offsets.tevKonst+n*4);}
 for(let n=0;n<2;n++){i.set(state.pixel.colors[n].ambient,base+offsets.ambientColor+n*4);i.set(state.pixel.colors[n].material,base+offsets.materialColor+n*4);}
 for(let n=0;n<8;n++)if(state.context.lights[n]){const l=state.context.lights[n];i.set(l.color,base+offsets.lightColor+n*4);f.set(l.position,base+offsets.lightPosition+n*4);f.set(l.direction,base+offsets.lightDirection+n*4);f.set(l.angular,base+offsets.lightAngular+n*4);f.set(l.distance,base+offsets.lightDistance+n*4);}
 for(const t of state.textures.textures)f[base+offsets.lodBias+t.id*4]=t.lod.bias;
 const fog=state.context.fog;if(fog){f[base+offsets.fogAC]=fog.a;f[base+offsets.fogAC+1]=fog.c;i[base+offsets.fogBShift]=fog.b;i[base+offsets.fogBShift+1]=fog.shift;i.set(fog.color,base+offsets.fogColor);}
 i[base+offsets.alphaReference]=state.pixel.alphaTest.reference0;i[base+offsets.alphaReference+1]=state.pixel.alphaTest.reference1;i[base+offsets.currentMatrix]=state.model.current??0;
}
export function createDrawUniformBuffer(gl,{maxBytes=32*1024**2}={}){
 const alignment=gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT),limit=gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE);
 if(!Number.isInteger(alignment)||alignment<=0||alignment%4||limit<DRAW_BLOCK_BYTES||gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS)<1||gl.getParameter(gl.MAX_VERTEX_UNIFORM_BLOCKS)<1||gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_BLOCKS)<1)return null;
 const stride=round(DRAW_BLOCK_BYTES,alignment);let buffer=null,slab=new ArrayBuffer(0),capacity=0,used=0,epoch=0,closed=false,uploaded=false;
 let floats=new Float32Array(slab),ints=new Int32Array(slab);
 const stats={version:1,alignment,stride,blockBytes:DRAW_BLOCK_BYTES,allocations:0,uploads:0,uploadedBytes:0,binds:0,frames:0,fallbacks:[]};
 const guard=()=>{if(closed||gl.isContextLost())throw Error('Uniform buffer context unavailable');};
 return {
  prepare(draws){guard();epoch++;uploaded=false;used=0;const count=draws.length,required=count*stride;if(!Number.isSafeInteger(required)||required>maxBytes)return false;
   if(required>capacity){let next=Math.max(stride*16,capacity);while(next<required)next*=2;next=Math.min(next,maxBytes);slab=new ArrayBuffer(next);buffer??=gl.createBuffer();if(!buffer)throw Error('Uniform buffer allocation');gl.bindBuffer(gl.UNIFORM_BUFFER,buffer);gl.bufferData(gl.UNIFORM_BUFFER,next,gl.DYNAMIC_DRAW);const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Uniform buffer allocation GL error '+error);capacity=next;stats.allocations++;}
   if(floats.buffer!==slab){const words=Math.floor(slab.byteLength/4);floats=new Float32Array(slab,0,words);ints=new Int32Array(slab,0,words);}
   used=required;
   // Clear the complete used range once. This is byte-for-byte equivalent to
   // clearing each std140 record separately, but avoids hundreds of small
   // TypedArray fill calls on stages with many native material draws.
   new Uint8Array(slab,0,used).fill(0);
   for(let n=0;n<count;n++)writeDrawUniformViews(floats,ints,n*stride/4,draws[n].state,draws[n].camera);stats.frames++;return true;
  },
  upload(){guard();if(used){gl.bindBuffer(gl.UNIFORM_BUFFER,buffer);gl.bufferSubData(gl.UNIFORM_BUFFER,0,new Uint8Array(slab,0,used));stats.uploads++;stats.uploadedBytes+=used;}uploaded=true;return epoch;},
  bind(index,version){guard();if(!uploaded||version!==epoch||!Number.isInteger(index)||index<0||(index+1)*stride>used)throw Error('Uniform buffer stale or invalid draw');gl.bindBufferRange(gl.UNIFORM_BUFFER,0,buffer,index*stride,DRAW_BLOCK_BYTES);stats.binds++;},
  fallback(reason){if(stats.fallbacks.length<16)stats.fallbacks.push(String(reason));},
  snapshot:()=>({...stats,capacity,used}),
  dispose(){if(closed)return;closed=true;if(buffer)gl.deleteBuffer(buffer);buffer=null;slab=new ArrayBuffer(0);floats=new Float32Array(slab);ints=new Int32Array(slab);capacity=used=0;}
 };
}
