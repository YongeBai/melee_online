import {uniformBufferShaders,validateDrawBlock} from './draw-uniform-buffer.mjs';
import {createOwnedUniformState} from './owned-uniform-state.mjs';
import {immediateTriangles,createImmediateStateMatcher,appendImmediateGeometry,uploadImmediateResource} from './immediate-geometry.mjs';
import {generateMaterialShaders,materialShaderKey} from './material-shader.mjs';
import {readNativeTevState} from './native-tev.mjs';
import {readNativeTextures,decodeNativeTexture,nativeTextureSourceBytes} from './native-texture.mjs';
import {createNativePixelReader,gxAlphaTestRejectsAny} from './native-pixel.mjs';
import {readNativeModelMatrices,createPackedModelReader} from './native-model.mjs';
import {readNativeRenderContext,createNativeRenderContextReader,checkNativeRenderContext} from './native-render-context.mjs';
import {inspectArchive} from './archive.mjs';
import {snapshotShapeGeometry} from './shape-geometry.mjs';
import {verifyShapeSamples} from './verify-shape.mjs';

// Forward error for four float32 products and three additions. This remains
// valid when the GPU fuses operations. Scaling only by the result incorrectly
// rejects nearly cancelling terms in large background geometry.
export function nativePositionRoundoffBound(matrix,row,point) {
  const unit=2**-24,gamma=7*unit/(1-7*unit),p=[point[0],point[1],point[2]??0,1];
  return gamma*p.reduce((sum,x,i)=>sum+Math.abs(matrix[row*4+i]*x),0);
}

// First integration of original native material state with actual GPU draws.
// Resource/program caches are persistent; draw-state capture is still a debug
// oracle. Original fighter callbacks now select draws; complete camera/GX-link
// ordering and mutable-image invalidation remain work for the playable renderer.
export function createMaterialRenderer(gl,module,{verifyVertices=false,checkErrors=true,presentationCache=null}={}) {
  const assetLease=presentationCache?.acquire(gl);
  const uniformBuffer=assetLease?.drawUniformBuffer??null;
  const ownedUniforms=assetLease?.exactState?createOwnedUniformState():null;let lastPixelKey=-1,lastCull=-1;
  const programs=assetLease?.programs??new Map(),variants=assetLease?.submissionOptimized?assetLease.variants:new Map(),images=new Map(),nativePlans=new Map(),models=new Set(),view=module._malloc(48);
  if(!view){assetLease?.release();throw Error('Native material view allocation');}
  // WebGL copies uniform arguments during the call. Reuse scratch storage;
  // queued native-state snapshots still own their data until their draw.
  const scratch={position:new Float32Array(120),normal:new Float32Array(120),tex:new Float32Array(120),post:new Float32Array(240),
    registers:new Int32Array(16),konst:new Int32Array(16),ambient:new Int32Array(8),material:new Int32Array(8),lightColor:new Int32Array(32),
    lightPosition:new Float32Array(24),lightDirection:new Float32Array(24),lightAngular:new Float32Array(24),lightDistance:new Float32Array(24),bias:new Float32Array(8)};
  function packRows(target,rows,stride){target.fill(0);for(let i=0;i<rows.length;i++)if(rows[i])target.set(rows[i],i*stride);return target;}
  const packedModel=assetLease?.packedState?createPackedModelReader(module,(i,create)=>assetLease.modelSnapshot(i,create)):null;
  const readModel=packedModel?()=>packedModel.read():()=>readNativeModelMatrices(module);
  const readContext=assetLease?.submissionOptimized?createNativeRenderContextReader(module):()=>readNativeRenderContext(module);
  const drawTiming={};
  function timed(name,fn,arg){if(!assetLease?.profileDraw)return fn(arg);const t=performance.now();try{return fn(arg);}finally{const row=drawTiming[name]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-t;}}
  const readTev=assetLease?.exactState?p=>assetLease.tevInterner.read(module,p):p=>readNativeTevState(module,p),readTextures=()=>readNativeTextures(module);
  function captureState(ptr){return {tev:timed('tev',readTev,ptr),textures:timed('textures',readTextures),pixel:timed('pixel',readPixel),model:timed('model',readModel),context:timed('context',readContext)};}
  const readPixel=createNativePixelReader(module),matchImmediateState=createImmediateStateMatcher(module,{cacheViews:assetLease?.cacheImmediateViews!==false});
  const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
  let queue=[],snapshot,draws=0,vertexChecks,immediateUsed=0,immediateVertices=0,particleDraws=0,particleVertices=0,afterimageDraws=0,afterimageVertices=0,textDraws=0,textVertices=0;const immediatePlans=[];let shaderCompilations=[];
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log+'\n'+source);}return s;}
  function program(state,attributes,origin,immediateRegisters=false){
    const keyStart=assetLease?.profileDraw?performance.now():0;const variant=(uniformBuffer?'ubo-v1:':'')+(assetLease?.exactState?assetLease.shaderKey:materialShaderKey)(state,attributes,{immediateRegisters,legacy:assetLease?.compactShaderKey===false});if(assetLease?.profileDraw){const row=drawTiming.shaderKey??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-keyStart;}if(variants.has(variant))return variants.get(variant);
    const result=compileProgram(generateMaterialShaders(state,attributes,{immediateRegisters}),origin);result.used=true;variants.set(variant,result);return result;
  }
  function compileProgram(originalSources,origin,allowUbo=true){
    const transformed=allowUbo&&uniformBuffer?uniformBufferShaders(originalSources):null,sources=transformed??originalSources;
    const key=sources.vertex+'\n'+sources.fragment;if(programs.has(key))return programs.get(key);
    const compilationStart=performance.now();let vs,fs,p;
    try {
      vs=shader(gl.VERTEX_SHADER,sources.vertex);fs=shader(gl.FRAGMENT_SHADER,sources.fragment);p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);
      gl.transformFeedbackVaryings(p,['transformedPosition','transformedNormal','raster0','raster1','verifiedTexcoord'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
      const block=transformed?validateDrawBlock(gl,p):null;
      const uniforms=new Map(),result={program:p,sources:originalSources,ubo:block,prepared:origin==='prewarm',used:false,uniform(name){if(!uniforms.has(name))uniforms.set(name,gl.getUniformLocation(p,name));return uniforms.get(name);}};
      programs.set(key,result);shaderCompilations.push({program:programs.size,origin,cpuMs:performance.now()-compilationStart});return result;
    } catch(error){if(p)gl.deleteProgram(p);if(transformed&&!gl.isContextLost()){uniformBuffer.fallback(error.message);return compileProgram(originalSources,origin,false);}throw error;}finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
  }
  function image(t){return timed('textureLookup',lookupImage,t);}
  function lookupImage(t){
    const key=JSON.stringify(t);if(images.has(key))return images.get(key);
    const texture=assetLease?assetLease.texture(key,nativeTextureSourceBytes(module,t),()=>createImage(t)):createImage(t);
    images.set(key,texture);return texture;
  }
  function createImage(t){
    const levels=decodeNativeTexture(module,t),texture=gl.createTexture();
    try {
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      levels.forEach((l,i)=>gl.texImage2D(gl.TEXTURE_2D,i,gl.RGBA8,l.width,l.height,0,gl.RGBA,gl.UNSIGNED_BYTE,l.pixels));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,levels.length-1);
      const filters=[gl.NEAREST,gl.LINEAR,gl.NEAREST_MIPMAP_NEAREST,gl.LINEAR_MIPMAP_NEAREST,gl.NEAREST_MIPMAP_LINEAR,gl.LINEAR_MIPMAP_LINEAR];
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filters[t.minFilter]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filters[t.magFilter]);
      gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MIN_LOD,t.lod.min);gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MAX_LOD,t.lod.max);
      const wrap=[gl.CLAMP_TO_EDGE,gl.REPEAT,gl.MIRRORED_REPEAT];gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap[t.wrapS]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap[t.wrapT]);
      if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(2**t.anisotropy,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return texture;
    }catch(error){gl.deleteTexture(texture);throw error;}
  }
  function applyOriginal(state,p,camera){
    gl.useProgram(p.program);const u=name=>p.uniform(name);
    // A null location is absent from this linked program, including its transform
    // feedback outputs. Preserve the old path for independent uncached oracles.
    const active=name=>!assetLease?.submissionOptimized||u(name)!==null;
    if(state.context.fog?.type){const f=state.context.fog;gl.uniform2f(u('fogAC'),f.a,f.c);gl.uniform2i(u('fogBShift'),f.b,f.shift);gl.uniform3iv(u('fogColor'),f.color);}
    gl.uniformMatrix4fv(u('projection'),false,camera.projection);gl.uniform1i(u('currentMatrix'),state.model.current??0);
    if(active('positionRows'))gl.uniform4fv(u('positionRows'),(state.model.positionRows??packRows(scratch.position,state.model.positions,12)));if(active('normalRows'))gl.uniform4fv(u('normalRows'),(state.model.normalRows??packRows(scratch.normal,state.model.normals,12)));
    const matrixPackStart=assetLease?.profileDraw?performance.now():0;const {tex,post,bias}=scratch,texActive=active('textureRows'),postActive=active('postRows');if(texActive)tex.fill(0);if(postActive)post.fill(0);bias.fill(0);
    for(const m of state.textures.matrices)if(m.id<64?texActive:postActive)(m.id<64?tex:post).set(m.values,(m.id<64?m.id-30:m.id-64)*4);
    if(assetLease?.profileDraw){const row=drawTiming.textureMatrixPacking??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-matrixPackStart;}
    if(texActive)gl.uniform4fv(u('textureRows'),tex);if(postActive)gl.uniform4fv(u('postRows'),post);
    if(active('tevRegisters'))gl.uniform4iv(u('tevRegisters'),packRows(scratch.registers,state.tev.registers,4));if(active('tevKonst'))gl.uniform4iv(u('tevKonst'),packRows(scratch.konst,state.tev.konst,4));
    if(active('ambientColor')){for(let i=0;i<2;i++)scratch.ambient.set(state.pixel.colors[i].ambient,i*4);gl.uniform4iv(u('ambientColor'),scratch.ambient);}
    if(active('materialColor')){for(let i=0;i<2;i++)scratch.material.set(state.pixel.colors[i].material,i*4);gl.uniform4iv(u('materialColor'),scratch.material);}
    if(active('lightColor')){scratch.lightColor.fill(0);for(let i=0;i<8;i++)if(state.context.lights[i])scratch.lightColor.set(state.context.lights[i].color,i*4);gl.uniform4iv(u('lightColor'),scratch.lightColor);}
    for(const [name,field] of [['lightPosition','position'],['lightDirection','direction'],['lightAngular','angular'],['lightDistance','distance']]){
      if(!active(name))continue;const target=scratch[name];target.fill(0);for(let i=0;i<8;i++)if(state.context.lights[i])target.set(state.context.lights[i][field],i*3);gl.uniform3fv(u(name),target);
    }
    const textureStart=assetLease?.profileDraw?performance.now():0;
    for(const t of state.textures.textures){gl.activeTexture(gl.TEXTURE0+t.id);gl.bindTexture(gl.TEXTURE_2D,image(t));gl.uniform1i(u('image'+t.id),t.id);bias[t.id]=t.lod.bias;}
    if(assetLease?.profileDraw){const row=drawTiming.textureSubmit??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-textureStart;}
    gl.uniform1fv(u('lodBias'),bias);gl.uniform2iv(u('alphaReference'),[state.pixel.alphaTest.reference0,state.pixel.alphaTest.reference1]);
  }
  function apply(state,p,camera){
    if(!ownedUniforms)return applyOriginal(state,p,camera);
    const row=ownedUniforms.select(gl,p.program),u=name=>p.uniform(name);
    // A null location is absent from this linked program, including its transform
    // feedback outputs. Preserve the old path for independent uncached oracles.
    const active=name=>!assetLease?.submissionOptimized||u(name)!==null;
    if(state.context.fog?.type&&row.fog!==state.context.fog){row.fog=state.context.fog;const f=state.context.fog;gl.uniform2f(u('fogAC'),f.a,f.c);gl.uniform2i(u('fogBShift'),f.b,f.shift);gl.uniform3iv(u('fogColor'),f.color);}
    if(ownedUniforms.projection(row,camera.projection))gl.uniformMatrix4fv(u('projection'),false,camera.projection);if(row.currentMatrix!==(state.model.current??0)){row.currentMatrix=state.model.current??0;gl.uniform1i(u('currentMatrix'),row.currentMatrix);}
    if(active('positionRows'))gl.uniform4fv(u('positionRows'),(state.model.positionRows??packRows(scratch.position,state.model.positions,12)));if(active('normalRows'))gl.uniform4fv(u('normalRows'),(state.model.normalRows??packRows(scratch.normal,state.model.normals,12)));
    const matrixPackStart=assetLease?.profileDraw?performance.now():0;const {tex,post,bias}=scratch,texActive=active('textureRows'),postActive=active('postRows');if(texActive)tex.fill(0);if(postActive)post.fill(0);bias.fill(0);
    for(const m of state.textures.matrices)if(m.id<64?texActive:postActive)(m.id<64?tex:post).set(m.values,(m.id<64?m.id-30:m.id-64)*4);
    if(assetLease?.profileDraw){const row=drawTiming.textureMatrixPacking??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-matrixPackStart;}
    if(texActive)gl.uniform4fv(u('textureRows'),tex);if(postActive)gl.uniform4fv(u('postRows'),post);
    if(active('tevRegisters'))gl.uniform4iv(u('tevRegisters'),packRows(scratch.registers,state.tev.registers,4));if(active('tevKonst'))gl.uniform4iv(u('tevKonst'),packRows(scratch.konst,state.tev.konst,4));
    if(active('ambientColor')){for(let i=0;i<2;i++)scratch.ambient.set(state.pixel.colors[i].ambient,i*4);gl.uniform4iv(u('ambientColor'),scratch.ambient);}
    if(active('materialColor')){for(let i=0;i<2;i++)scratch.material.set(state.pixel.colors[i].material,i*4);gl.uniform4iv(u('materialColor'),scratch.material);}
    if(ownedUniforms.lighting(row,state.context.lights)){
      const packed=ownedUniforms.packLights(state.context.lights);
      if(active('lightColor'))gl.uniform4iv(u('lightColor'),packed.lightColor);
      for(const name of ['lightPosition','lightDirection','lightAngular','lightDistance'])if(active(name))gl.uniform3fv(u(name),packed[name]);
    }
    const textureStart=assetLease?.profileDraw?performance.now():0;
    for(const t of state.textures.textures){gl.activeTexture(gl.TEXTURE0+t.id);gl.bindTexture(gl.TEXTURE_2D,image(t));if(!(row.images&(1<<t.id))){gl.uniform1i(u('image'+t.id),t.id);row.images|=1<<t.id;}bias[t.id]=t.lod.bias;}
    if(assetLease?.profileDraw){const row=drawTiming.textureSubmit??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-textureStart;}
    gl.uniform1fv(u('lodBias'),bias);gl.uniform2iv(u('alphaReference'),[state.pixel.alphaTest.reference0,state.pixel.alphaTest.reference1]);
  }
  function pixelState(pixel){
    const compare=[gl.NEVER,gl.LESS,gl.EQUAL,gl.LEQUAL,gl.GREATER,gl.NOTEQUAL,gl.GEQUAL,gl.ALWAYS];
    if(pixel.destinationAlpha.enabled||pixel.dither||pixel.blend.type===2)throw Error('Native material destination alpha/dither/logic integration pending');
    if(pixel.depth.beforeTexture&&pixel.depth.update&&gxAlphaTestRejectsAny(pixel.alphaTest))throw Error('Native early depth with alpha rejection requires ordered depth pass');
    const key=pixel.depth.enabled|(pixel.depth.compare<<1)|(pixel.depth.update<<4)|(pixel.colorUpdate<<5)|(pixel.alphaUpdate<<6)|(pixel.blend.type<<7)|(pixel.blend.source<<9)|(pixel.blend.destination<<12);
    if(ownedUniforms&&key===lastPixelKey)return;lastPixelKey=key;
    pixel.depth.enabled?gl.enable(gl.DEPTH_TEST):gl.disable(gl.DEPTH_TEST);gl.depthFunc(compare[pixel.depth.compare]);gl.depthMask(!!pixel.depth.update);
    gl.colorMask(!!pixel.colorUpdate,!!pixel.colorUpdate,!!pixel.colorUpdate,!!pixel.alphaUpdate);gl.disable(gl.DITHER);
    if(pixel.blend.type===0)gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      if(pixel.blend.type===3){gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);gl.blendFunc(gl.ONE,gl.ONE);}
      else {gl.blendEquation(gl.FUNC_ADD);
        const src=[gl.ZERO,gl.ONE,gl.DST_COLOR,gl.ONE_MINUS_DST_COLOR,gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.DST_ALPHA,gl.ONE_MINUS_DST_ALPHA];
        const dst=[gl.ZERO,gl.ONE,gl.SRC_COLOR,gl.ONE_MINUS_SRC_COLOR,gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.DST_ALPHA,gl.ONE_MINUS_DST_ALPHA];
        gl.blendFunc(src[pixel.blend.source],dst[pixel.blend.destination]);}
    }
  }
  function verifyDrawVertices(draw){
    const vertices=draw.shape?.vertices??draw.plan.mesh.vertices,feedback=gl.createTransformFeedback(),buffer=gl.createBuffer();
    try {
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,buffer);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,vertices.length*68,gl.STREAM_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,buffer);gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,vertices.length);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
      const values=new Float32Array(vertices.length*17);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,values);
      for(const [i,v] of vertices.entries()) {
        const bound=vertexChecks.byOwner[draw.owner]??={vertices:0,ndcMin:[Infinity,Infinity,Infinity],ndcMax:[-Infinity,-Infinity,-Infinity]};
        const point=[...values.subarray(i*17,i*17+3),1],clip=Array.from({length:4},(_,r)=>point.reduce((sum,x,c)=>sum+x*draw.camera.projection[c*4+r],0));
        if(clip[3]!==0)for(let axis=0;axis<3;axis++){const ndc=clip[axis]/clip[3];bound.ndcMin[axis]=Math.min(bound.ndcMin[axis],ndc);bound.ndcMax[axis]=Math.max(bound.ndcMax[axis],ndc);}bound.vertices++;
        const slot=v[0]?v[0][0]/3:draw.state.model.current??0,position=draw.state.model.positions[slot],normal=draw.state.model.normals[slot];
        if(!position)throw Error('Native GPU position slot missing');
        const dot=(m,r,p,w)=>m?m[r*4]*p[0]+m[r*4+1]*p[1]+m[r*4+2]*(p[2]??0)+m[r*4+3]*w:0;
        const n=[0,1,2].map(r=>dot(normal,r,v[10]??v[25]??[0,0,0],0)),length=Math.hypot(...n);
        for(let c=0;c<17;c++)if(!Number.isFinite(values[i*17+c]))throw Error('Native material vertex output nonfinite');
        for(let c=0;c<3;c++) {
          const expected=dot(position,c,v[9],1),error=Math.abs(values[i*17+c]-expected)/(1+Math.abs(expected));
          const ne=Math.abs(values[i*17+3+c]-(length?n[c]/length:0));
          const roundoff=nativePositionRoundoffBound(position,c,v[9]);
          const absoluteError=Math.abs(values[i*17+c]-expected);
          if(error>0.00004&&absoluteError<=roundoff)vertexChecks.roundoffPositionComponents++;
          vertexChecks.maxPositionRoundoffAllowance=Math.max(vertexChecks.maxPositionRoundoffAllowance,roundoff);
          if((error>0.00004&&absoluteError>roundoff)||ne>0.00004)throw Error('Native material position/normal GPU mismatch '+JSON.stringify({error,normalError:ne,owner:draw.owner,vertex:i,axis:c,expected,actual:values[i*17+c],position,input:v[9]}));
          vertexChecks.maxScaledPositionError=Math.max(vertexChecks.maxScaledPositionError,error);vertexChecks.maxNormalError=Math.max(vertexChecks.maxNormalError,ne);
        }
      }
      vertexChecks.vertices+=vertices.length;vertexChecks.positionComponents+=vertices.length*3;vertexChecks.normalComponents+=vertices.length*3;
    } finally {gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.deleteBuffer(buffer);gl.deleteTransformFeedback(feedback);}
  }
  if(module.onNativeDraw)throw Error('Native draw receiver already owned');
  module.onNativeDraw=(owner,joint,display,polygon,ptr,positions=0,count=0,normals=0,normalCount=0)=>{
    const plan=nativePlans.get(owner+':'+joint+':'+polygon);
    if(!plan)throw Error('Original callback selected geometry not uploaded: '+owner+'/'+joint+'/'+polygon);
    const state=captureState(ptr);
    checkNativeRenderContext(state.context,snapshot,state.pixel);
    const shaped=(plan.mesh.flags&0x3000)===0x1000;
    if(shaped!==!!positions)throw Error('Native shape geometry missing or unexpected');
    const shape=shaped?snapshotShapeGeometry(module,plan.mesh,positions,count,normals,normalCount,{reference:verifyVertices}):null;
    if(shaped&&verifyVertices)shape.reference=verifyShapeSamples(module,plan.archive,plan.mesh,polygon,positions,count,normals,normalCount);
    queue.push({owner,plan,state,shape,camera:snapshot,program:program(state,plan.mesh.attrs,'model')});
  };
  if(module.onNativeImmediate)throw Error('Immediate draw receiver already owned');
  module.onNativeImmediate=(primitive,count,ptr,cull,textured,tev,kind)=>{
    const data=new Float32Array(module.HEAPU8.buffer,ptr,count*9),triangles=immediateTriangles(primitive,count);
    if(!data.every(Number.isFinite)||cull>3||![0,1,2].includes(kind))throw Error('Invalid immediate geometry');
    const previous=queue.at(-1),eligible=previous?.immediate&&previous.kind===kind&&previous.textured===textured&&previous.camera===snapshot&&previous.plan.mesh.flags===(cull<<14)&&previous.plan.stream.vertexCount+count<=4096;
    const merge=timed('immediateMatch',()=>matchImmediateState(tev,eligible,previous?.flatRegisters===true));
    let state,flatRegisters,attrs;
    if(!merge){
      attrs=[{attr:9},{attr:11},...(textured?[{attr:13}]:[])];
      state=captureState(tev);
      checkNativeRenderContext(state.context,snapshot,state.pixel);
      flatRegisters=!state.textures.generators.some(g=>g.source>=5&&g.source<=11);
    }
    let plan=merge?previous.plan:assetLease?.immediate?assetLease.immediate.take({kind,textured,cull,flatRegisters}):immediatePlans[immediateUsed];
    if(!plan){
      plan={vao:gl.createVertexArray(),vertex:gl.createBuffer(),indices:gl.createBuffer(),registers:gl.createBuffer(),stream:{data:new Float32Array(0),indices:new Uint32Array(0),vertexCount:0,indexCount:0}};immediatePlans.push(plan);
      gl.bindVertexArray(plan.vao);gl.bindBuffer(gl.ARRAY_BUFFER,plan.vertex);
      for(const [location,size,offset] of [[0,3,0],[5,4,12],[7,2,28]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,36,offset);}
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,plan.indices);
      gl.bindBuffer(gl.ARRAY_BUFFER,plan.registers);
      for(let i=0;i<4;i++)gl.vertexAttribIPointer(i+8,4,gl.INT,64,i*16);
    }
    if(!merge){
      immediateUsed++;plan.stream.vertexCount=plan.stream.indexCount=0;
      plan.mesh={triangles:null,flags:cull<<14,attrs,vertices:[]};
      queue.push({owner:kind===0?'particles':kind===1?'afterimage':'text',plan,state,camera:snapshot,program:program(state,attrs,kind===0?'particles':kind===1?'afterimage':'text',flatRegisters),immediate:true,flatRegisters,kind,textured});
    }
    appendImmediateGeometry(plan.stream,data,triangles,queue.at(-1).flatRegisters?new Int32Array(module.HEAPU8.buffer,tev+16,16):null);
    plan.mesh.triangles=plan.stream.indices.subarray(0,plan.stream.indexCount);
    if(verifyVertices)for(let i=0;i<count;i++)plan.mesh.vertices.push({9:[...data.slice(i*9,i*9+3)],11:[...data.slice(i*9+3,i*9+7)],13:[...data.slice(i*9+7,i*9+9)]});
    immediateVertices+=count;
    if(kind===0){particleDraws++;particleVertices+=count;}else if(kind===1){afterimageDraws++;afterimageVertices+=count;}else{textDraws++;textVertices+=count;}
  };
  function upload(model,bytes,nodes,owner,{descriptorBase=null}={}){
    if(assetLease&&bytes.buffer===module.HEAPU8.buffer)throw Error('GPU cache source cannot alias rewindable memory');
    const archive=presentationCache?presentationCache.archive(bytes):inspectArchive(bytes),d=archive.data,nativeKeys=[];
    // Shape buffers are mutable. Keep their original per-renderer lifetime.
    const cached=!!assetLease&&!model.meshes.some(mesh=>(mesh.flags&0x3000)===0x1000);
    if(cached&&bytes.buffer===module.HEAPU8.buffer)throw Error('GPU cache source cannot alias rewindable memory');
    let geometry,plans=[];
    const indexOf=(first,target)=>{for(let i=0,at=first;at!==null&&i<4096;i++,at=archive.relocations.has(at+4)?d.getUint32(at+4):null)if(at===target)return i;throw Error('Native draw ownership');};
    function refreshBindings(){
      // Native pools can reuse the owner/root addresses while replacing child
      // objects. Geometry is immutable, but those live polygon identities are
      // not a lifetime token. Refresh without reallocating GPU mesh buffers.
      for(const key of nativeKeys)nativePlans.delete(key);nativeKeys.length=0;
      for(const plan of plans){const joint=new Uint32Array(module.HEAPU8.buffer,nodes,model.tree.nodes.length)[plan.mesh.joint],polygon=descriptorBase===null?module._portMaterialPolygon(joint,plan.display,plan.polygon):module._portMaterialPolygonDescriptor(joint,descriptorBase+plan.mesh.pobj),key=owner+':'+joint+':'+polygon;if(nativePlans.has(key))throw Error('Duplicate native polygon ownership');nativePlans.set(key,plan);nativeKeys.push(key);}
    }
    function dispose(){for(const key of nativeKeys)nativePlans.delete(key);if(!cached)geometry?.dispose();models.delete(result);}
    function createGeometry(){
      const buffers=[],vaos=[],built=[];
      const dispose=()=>{for(const b of buffers)gl.deleteBuffer(b);for(const v of vaos)gl.deleteVertexArray(v);};
      try{for(const mesh of model.meshes) {
        if(mesh.draws.some(d=>[0xa8,0xb0,0xb8].includes(d.primitive)))throw Error('Native line/point rendering not integrated');
        const vao=gl.createVertexArray();vaos.push(vao);gl.bindVertexArray(vao);
        const attributes=[];
        function buffer(target,data){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;}
        function attr(loc,size,fn){attributes[loc]=buffer(gl.ARRAY_BUFFER,Float32Array.from(mesh.vertices.flatMap(fn)));gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}
        attr(0,3,v=>[v[9][0],v[9][1],v[9][2]??0]);attr(1,1,v=>[v[0]?.[0]??0]);
        for(let i=0;i<3;i++)attr(2+i,3,v=>Array.from({length:3},(_,c)=>(v[10]??v[25])?.[i*3+c]??0));
        attr(5,4,v=>v[11]??[1,1,1,1]);attr(6,4,v=>v[12]??[1,1,1,1]);
        for(let i=0;i<8;i++)attr(7+i,3,v=>[v[13+i]?.[0]??0,v[13+i]?.[1]??0,v[1+i]?.[0]??0]);
        buffer(gl.ELEMENT_ARRAY_BUFFER,Uint32Array.from(mesh.triangles));
        built.push({mesh,vao,attributes,archive,display:indexOf(model.tree.nodes[mesh.joint].display,mesh.dobj),polygon:indexOf(d.getUint32(mesh.dobj+12),mesh.pobj)});
      }return {plans:built,dispose};}catch(error){dispose();throw error;}
    }
    let result;
    try {
      geometry=cached?assetLease.model(bytes,createGeometry):createGeometry();plans=geometry.plans;
      refreshBindings();
      result={refreshBindings,
        // Probe-only lookup: attachment models share their parent's GObj, so
        // an owner-level callback count cannot prove that each model drew.
        queuedDrawCount(){return queue.reduce((n,draw)=>n+(draw.owner===owner&&plans.includes(draw.plan)?1:0),0);},
        enqueue(flags,visibility,show=true){
        let count=0;if(!show)return count;
        for(const [i,plan] of plans.entries()) {
          const {mesh}=plan;if((flags[mesh.joint]&16)||!visibility[i])continue;
          if((mesh.flags&0x3000)===0x1000)throw Error('Shape rendering requires original callbacks');
          const joint=new Uint32Array(module.HEAPU8.buffer,nodes,model.tree.nodes.length)[mesh.joint];
          const ptr=module._portMaterialDrawState(joint,plan.display,plan.polygon,view,owner);
          const state=captureState(ptr);
          checkNativeRenderContext(state.context,snapshot,state.pixel);
          queue.push({owner,plan,state,camera:snapshot,program:program(state,mesh.attrs)});count++;
        }
        return count;
      },dispose};models.add(result);return result;
    }catch(error){dispose();throw error;}
  }
  function selectCamera(camera){snapshot=camera;module.__dirtyMark?.(view,48);module.HEAPF32.set(camera.raw.subarray(0,12),view/4);}
  return {upload,selectCamera,
    prewarm(sources){
      if(snapshot)throw Error('Shader preparation must precede the first draw');
      const before=programs.size,start=performance.now();for(const source of sources)compileProgram(source,'prewarm');
      return {requested:sources.length,compiled:programs.size-before,cpuMs:performance.now()-start};
    },
    shaderSources(){return [...new Map([...programs.values()].map(p=>[p.sources.vertex+'\n'+p.sources.fragment,p.sources])).values()];},
    shaderCoverage(){const all=[...programs.values()];return {programs:all.length,prepared:all.filter(p=>p.prepared).length,preparedUsed:all.filter(p=>p.prepared&&p.used).length,unpreparedUsed:all.filter(p=>!p.prepared&&p.used).length};},
    begin(camera){for(const key of Object.keys(drawTiming))delete drawTiming[key];selectCamera(camera);queue=[];packedModel?.reset();assetLease?.immediate?.begin();shaderCompilations=[];draws=0;immediateUsed=0;immediateVertices=0;particleDraws=particleVertices=afterimageDraws=afterimageVertices=textDraws=textVertices=0;vertexChecks={vertices:0,positionComponents:0,normalComponents:0,maxScaledPositionError:0,maxNormalError:0,roundoffPositionComponents:0,maxPositionRoundoffAllowance:0,byOwner:{}};},
    flush({ordered=false,clip=null,clearAlpha=1,forceAlpha=false}={}){
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);if(clip){gl.enable(gl.SCISSOR_TEST);gl.scissor(...clip);}else gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.depthMask(true);gl.clearColor(0,0,0,clearAlpha);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.frontFace(gl.CW);
      // Native transparent sorting/callback traversal is still separate. Keep
      // actor order stable, completing opaque draws before blended draws.
      ownedUniforms?.begin();lastPixelKey=lastCull=-1;
      const drawsInOrder=ordered?queue:[...queue.filter(d=>d.state.pixel.blend.type===0),...queue.filter(d=>d.state.pixel.blend.type!==0)];
      const uniformBefore=uniformBuffer?.snapshot();let uniformVersion=null;
      if(uniformBuffer&&drawsInOrder.some(d=>d.program.ubo)){
        if(timed('uboPack',()=>uniformBuffer.prepare(drawsInOrder)))uniformVersion=timed('uboUpload',()=>uniformBuffer.upload());
        else {uniformBuffer.fallback('frame capacity');for(const draw of drawsInOrder)if(draw.program.ubo)draw.program=compileProgram(draw.program.sources,'fallback',false);}
      }
      for(const [drawIndex,draw] of drawsInOrder.entries()) {
        gl.bindVertexArray(draw.plan.vao);
        if(draw.immediate&&draw.plan.resource)uploadImmediateResource(gl,draw.plan,draw.flatRegisters);
        else if(draw.immediate){
          const stream=draw.plan.stream;
          for(let i=8;i<12;i++)draw.flatRegisters?gl.enableVertexAttribArray(i):gl.disableVertexAttribArray(i);
          if(draw.flatRegisters){gl.bindBuffer(gl.ARRAY_BUFFER,draw.plan.registers);gl.bufferData(gl.ARRAY_BUFFER,stream.registers.subarray(0,stream.vertexCount*16),gl.DYNAMIC_DRAW);}
          gl.bindBuffer(gl.ARRAY_BUFFER,draw.plan.vertex);gl.bufferData(gl.ARRAY_BUFFER,stream.data.subarray(0,stream.vertexCount*9),gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,draw.plan.indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,draw.plan.mesh.triangles,gl.DYNAMIC_DRAW);
        }
        if(draw.shape){
          gl.bindBuffer(gl.ARRAY_BUFFER,draw.plan.attributes[0]);gl.bufferSubData(gl.ARRAY_BUFFER,0,draw.shape.positions);
          if(draw.shape.normals){gl.bindBuffer(gl.ARRAY_BUFFER,draw.plan.attributes[2]);gl.bufferSubData(gl.ARRAY_BUFFER,0,draw.shape.normals);}
        }
        const applyStart=assetLease?.profileDraw?performance.now():0,textureBefore=drawTiming.textureSubmit?.ms??0;
        if(draw.program.ubo){
          timed('uboBind',()=>uniformBuffer.bind(drawIndex,uniformVersion));
          const row=ownedUniforms?ownedUniforms.select(gl,draw.program.program):null;if(!ownedUniforms)gl.useProgram(draw.program.program);
          timed('uboTextures',()=>{for(const t of draw.state.textures.textures){gl.activeTexture(gl.TEXTURE0+t.id);gl.bindTexture(gl.TEXTURE_2D,image(t));if(!row||!(row.images&(1<<t.id))){gl.uniform1i(draw.program.uniform('image'+t.id),t.id);if(row)row.images|=1<<t.id;}}});
        }else apply(draw.state,draw.program,draw.camera);if(assetLease?.profileDraw&&!draw.program.ubo){const row=drawTiming.directUniformsPacking??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-applyStart-((drawTiming.textureSubmit?.ms??0)-textureBefore);}if(assetLease?.profileDraw){const row=drawTiming.uniformsTextures??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-applyStart;}timed('pixelGL',pixelState,draw.state.pixel);if(forceAlpha)gl.colorMask(true,true,true,true);
        const cull=draw.plan.mesh.flags&0xc000;
        if(!ownedUniforms||lastCull!==cull){if(cull){gl.enable(gl.CULL_FACE);gl.cullFace(cull===0xc000?gl.FRONT_AND_BACK:cull===0x4000?gl.FRONT:gl.BACK);}else gl.disable(gl.CULL_FACE);lastCull=cull;}
        if(verifyVertices)verifyDrawVertices(draw);
        gl.drawElements(gl.TRIANGLES,draw.plan.mesh.triangles.length,gl.UNSIGNED_INT,0);draws++;
      }
      if(checkErrors&&gl.getError()!==gl.NO_ERROR)throw Error('Native material GPU draw error');
      const uniformAfter=uniformBuffer?.snapshot(),uniformBufferFrame=uniformAfter?{uploads:uniformAfter.uploads-uniformBefore.uploads,binds:uniformAfter.binds-uniformBefore.binds,bytes:uniformAfter.uploadedBytes-uniformBefore.uploadedBytes,draws}:null;
      return {uniformBufferFrame,drawTiming:assetLease?.profileDraw?structuredClone(drawTiming):null,exactGL:ownedUniforms?.snapshot()??null,shapeDraws:queue.filter(d=>d.shape).map(d=>({pobj:d.plan.mesh.pobj,reference:d.shape.reference??null})),vertexChecks:verifyVertices?vertexChecks:null,immediateDraws:immediateUsed,batchedImmediatePrimitives:particleDraws+afterimageDraws+textDraws-immediateUsed,immediateVertices,particleDraws,particleVertices,afterimageDraws,afterimageVertices,textDraws,textVertices,shaderCompilations:[...shaderCompilations],draws,programs:programs.size,images:images.size,originalMaterialState:true,visualParity:false,performanceMeasured:false};
    },inspect(){
      const tev=new Map(),pixels=new Map(),lights=new Map();
      for(const d of queue){const key=JSON.stringify(d.state.tev.stages);if(!tev.has(key))tev.set(key,{program:d.state.tev,materials:0});tev.get(key).materials++;const p=JSON.stringify(d.state.pixel);if(!pixels.has(p))pixels.set(p,{state:d.state.pixel,materials:0});pixels.get(p).materials++;lights.set(JSON.stringify(d.state.context.lights),d.state.context.lights);}
      return {tevPrograms:[...tev.values()],pixelStates:[...pixels.values()],lightStates:[...lights.values()]};
    },dispose(){delete module.onNativeDraw;delete module.onNativeImmediate;if(!assetLease?.reuseImmediate)for(const p of immediatePlans){gl.deleteVertexArray(p.vao);gl.deleteBuffer(p.vertex);gl.deleteBuffer(p.indices);gl.deleteBuffer(p.registers);}for(const model of [...models])model.dispose();if(!assetLease)for(const p of programs.values())gl.deleteProgram(p.program);if(!assetLease)for(const image of images.values())gl.deleteTexture(image);module._free(view);assetLease?.release();},
  };
}
