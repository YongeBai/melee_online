import {generateMaterialShaders,materialShaderKey} from './material-shader.mjs';
import {readNativeTevState} from './native-tev.mjs';
import {readNativeTextures,decodeNativeTexture} from './native-texture.mjs';
import {readNativePixel,gxAlphaTest} from './native-pixel.mjs';
import {readNativeModelMatrices} from './native-model.mjs';
import {readNativeRenderContext,checkNativeRenderContext} from './native-render-context.mjs';
import {inspectArchive} from './archive.mjs';

// First integration of original native material state with actual GPU draws.
// Resource/program caches are persistent; draw-state capture is still a debug
// oracle. Original fighter callbacks now select draws; complete camera/GX-link
// ordering and mutable-image invalidation remain work for the playable renderer.
export function createMaterialRenderer(gl,module,{verifyVertices=false}={}) {
  const programs=new Map(),variants=new Map(),images=new Map(),nativePlans=new Map(),models=new Set(),view=module._malloc(48);
  if(!view)throw Error('Native material view allocation');
  const rows=(array,n)=>Float32Array.from({length:n*12},(_,i)=>array[i/12|0]?.[i%12]??0);
  const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
  let queue=[],snapshot,draws=0,vertexChecks;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log+'\n'+source);}return s;}
  function program(state,attributes){
    const variant=materialShaderKey(state,attributes);if(variants.has(variant))return variants.get(variant);
    const sources=generateMaterialShaders(state,attributes),key=sources.vertex+'\n'+sources.fragment;
    if(programs.has(key)){const p=programs.get(key);variants.set(variant,p);return p;}
    let vs,fs,p;
    try {
      vs=shader(gl.VERTEX_SHADER,sources.vertex);fs=shader(gl.FRAGMENT_SHADER,sources.fragment);p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);
      gl.transformFeedbackVaryings(p,['transformedPosition','transformedNormal','raster0','raster1','verifiedTexcoord'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
      const uniforms=new Map(),result={program:p,uniform(name){if(!uniforms.has(name))uniforms.set(name,gl.getUniformLocation(p,name));return uniforms.get(name);}};
      programs.set(key,result);variants.set(variant,result);return result;
    } catch(error){if(p)gl.deleteProgram(p);throw error;}finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
  }
  function image(t){
    const key=JSON.stringify(t);if(images.has(key))return images.get(key);
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
      images.set(key,texture);return texture;
    }catch(error){gl.deleteTexture(texture);throw error;}
  }
  function apply(state,p){
    gl.useProgram(p.program);const u=name=>p.uniform(name);
    gl.uniformMatrix4fv(u('projection'),false,snapshot.projection);gl.uniform1i(u('currentMatrix'),state.model.current??0);
    gl.uniform4fv(u('positionRows'),rows(state.model.positions,10));gl.uniform4fv(u('normalRows'),rows(state.model.normals,10));
    const tex=new Float32Array(120),post=new Float32Array(240);
    for(const m of state.textures.matrices)(m.id<64?tex:post).set(m.values,(m.id<64?m.id-30:m.id-64)*4);
    gl.uniform4fv(u('textureRows'),tex);gl.uniform4fv(u('postRows'),post);
    gl.uniform4iv(u('tevRegisters'),state.tev.registers.flat());gl.uniform4iv(u('tevKonst'),state.tev.konst.flat());
    gl.uniform4iv(u('ambientColor'),state.pixel.colors.flatMap(c=>c.ambient));gl.uniform4iv(u('materialColor'),state.pixel.colors.flatMap(c=>c.material));
    gl.uniform4iv(u('lightColor'),state.context.lights.flatMap(l=>l?.color??[0,0,0,0]));
    for(const [name,field] of [['lightPosition','position'],['lightDirection','direction'],['lightAngular','angular'],['lightDistance','distance']])gl.uniform3fv(u(name),state.context.lights.flatMap(l=>l?.[field]??[0,0,0]));
    const bias=new Float32Array(8);
    for(const t of state.textures.textures){gl.activeTexture(gl.TEXTURE0+t.id);gl.bindTexture(gl.TEXTURE_2D,image(t));gl.uniform1i(u('image'+t.id),t.id);bias[t.id]=t.lod.bias;}
    gl.uniform1fv(u('lodBias'),bias);gl.uniform2iv(u('alphaReference'),[state.pixel.alphaTest.reference0,state.pixel.alphaTest.reference1]);
  }
  function pixelState(pixel){
    const compare=[gl.NEVER,gl.LESS,gl.EQUAL,gl.LEQUAL,gl.GREATER,gl.NOTEQUAL,gl.GEQUAL,gl.ALWAYS];
    if(pixel.destinationAlpha.enabled||pixel.dither||pixel.blend.type===2)throw Error('Native material destination alpha/dither/logic integration pending');
    if(pixel.depth.beforeTexture&&pixel.depth.update&&Array.from({length:256},(_,i)=>gxAlphaTest(i,pixel.alphaTest)).some(x=>!x))throw Error('Native early depth with alpha rejection requires ordered depth pass');
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
    const vertices=draw.plan.mesh.vertices,feedback=gl.createTransformFeedback(),buffer=gl.createBuffer();
    try {
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,buffer);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,vertices.length*68,gl.STREAM_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,buffer);gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,vertices.length);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
      const values=new Float32Array(vertices.length*17);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,values);
      for(const [i,v] of vertices.entries()) {
        const slot=v[0]?v[0][0]/3:draw.state.model.current??0,position=draw.state.model.positions[slot],normal=draw.state.model.normals[slot];
        if(!position)throw Error('Native GPU position slot missing');
        const dot=(m,r,p,w)=>m?m[r*4]*p[0]+m[r*4+1]*p[1]+m[r*4+2]*(p[2]??0)+m[r*4+3]*w:0;
        const n=[0,1,2].map(r=>dot(normal,r,v[10]??v[25]??[0,0,0],0)),length=Math.hypot(...n);
        for(let c=0;c<17;c++)if(!Number.isFinite(values[i*17+c]))throw Error('Native material vertex output nonfinite');
        for(let c=0;c<3;c++) {
          const expected=dot(position,c,v[9],1),error=Math.abs(values[i*17+c]-expected)/(1+Math.abs(expected));
          const ne=Math.abs(values[i*17+3+c]-(length?n[c]/length:0));
          if(error>0.00004||ne>0.00004)throw Error('Native material position/normal GPU mismatch '+error+'/'+ne);
          vertexChecks.maxScaledPositionError=Math.max(vertexChecks.maxScaledPositionError,error);vertexChecks.maxNormalError=Math.max(vertexChecks.maxNormalError,ne);
        }
      }
      vertexChecks.vertices+=vertices.length;vertexChecks.positionComponents+=vertices.length*3;vertexChecks.normalComponents+=vertices.length*3;
    } finally {gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.deleteBuffer(buffer);gl.deleteTransformFeedback(feedback);}
  }
  if(module.onNativeDraw)throw Error('Native draw receiver already owned');
  module.onNativeDraw=(owner,joint,display,polygon,ptr)=>{
    const plan=nativePlans.get(owner+':'+joint+':'+polygon);
    if(!plan)throw Error('Original callback selected geometry not uploaded: '+owner+'/'+joint+'/'+polygon);
    const state={tev:readNativeTevState(module,ptr),textures:readNativeTextures(module),pixel:readNativePixel(module),model:readNativeModelMatrices(module),context:readNativeRenderContext(module)};
    checkNativeRenderContext(state.context,snapshot,state.pixel);
    queue.push({owner,plan,state,program:program(state,plan.mesh.attrs)});
  };
  function upload(model,bytes,nodes,owner){
    const archive=inspectArchive(bytes),d=archive.data,buffers=[],vaos=[],plans=[],nativeKeys=[];
    const indexOf=(first,target)=>{for(let i=0,at=first;at!==null&&i<4096;i++,at=archive.relocations.has(at+4)?d.getUint32(at+4):null)if(at===target)return i;throw Error('Native draw ownership');};
    function dispose(){for(const key of nativeKeys)nativePlans.delete(key);for(const b of buffers)gl.deleteBuffer(b);for(const v of vaos)gl.deleteVertexArray(v);models.delete(result);}
    let result;
    try {
      for(const mesh of model.meshes) {
        if(mesh.draws.some(d=>[0xa8,0xb0,0xb8].includes(d.primitive)))throw Error('Native line/point rendering not integrated');
        const vao=gl.createVertexArray();vaos.push(vao);gl.bindVertexArray(vao);
        function buffer(target,data){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);}
        function attr(loc,size,fn){buffer(gl.ARRAY_BUFFER,Float32Array.from(mesh.vertices.flatMap(fn)));gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}
        attr(0,3,v=>[v[9][0],v[9][1],v[9][2]??0]);attr(1,1,v=>[v[0]?.[0]??0]);
        for(let i=0;i<3;i++)attr(2+i,3,v=>Array.from({length:3},(_,c)=>(v[10]??v[25])?.[i*3+c]??0));
        attr(5,4,v=>v[11]??[1,1,1,1]);attr(6,4,v=>v[12]??[1,1,1,1]);
        for(let i=0;i<8;i++)attr(7+i,3,v=>[v[13+i]?.[0]??0,v[13+i]?.[1]??0,v[1+i]?.[0]??0]);
        buffer(gl.ELEMENT_ARRAY_BUFFER,Uint32Array.from(mesh.triangles));
        plans.push({mesh,vao,display:indexOf(model.tree.nodes[mesh.joint].display,mesh.dobj),polygon:indexOf(d.getUint32(mesh.dobj+12),mesh.pobj)});
      }
      for(const plan of plans){const joint=new Uint32Array(module.HEAPU8.buffer,nodes,model.tree.nodes.length)[plan.mesh.joint],polygon=module._portMaterialPolygon(joint,plan.display,plan.polygon),key=owner+':'+joint+':'+polygon;if(nativePlans.has(key))throw Error('Duplicate native polygon ownership');nativePlans.set(key,plan);nativeKeys.push(key);}
      result={enqueue(flags,visibility,show=true){
        let count=0;if(!show)return count;
        for(const [i,plan] of plans.entries()) {
          const {mesh}=plan;if((flags[mesh.joint]&16)||!visibility[i])continue;
          const joint=new Uint32Array(module.HEAPU8.buffer,nodes,model.tree.nodes.length)[mesh.joint];
          const ptr=module._portMaterialDrawState(joint,plan.display,plan.polygon,view,owner);
          const state={tev:readNativeTevState(module,ptr),textures:readNativeTextures(module),pixel:readNativePixel(module),model:readNativeModelMatrices(module),context:readNativeRenderContext(module)};
          checkNativeRenderContext(state.context,snapshot,state.pixel);
          queue.push({owner,plan,state,program:program(state,mesh.attrs)});count++;
        }
        return count;
      },dispose};models.add(result);return result;
    }catch(error){dispose();throw error;}
  }
  return {upload,begin(camera){snapshot=camera;module.HEAPF32.set(camera.raw.subarray(0,12),view/4);queue=[];draws=0;vertexChecks={vertices:0,positionComponents:0,normalComponents:0,maxScaledPositionError:0,maxNormalError:0};},
    flush({ordered=false}={}){
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.depthMask(true);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.frontFace(gl.CW);
      // Native transparent sorting/callback traversal is still separate. Keep
      // actor order stable, completing opaque draws before blended draws.
      const drawsInOrder=ordered?queue:[...queue.filter(d=>d.state.pixel.blend.type===0),...queue.filter(d=>d.state.pixel.blend.type!==0)];
      for(const draw of drawsInOrder) {
        gl.bindVertexArray(draw.plan.vao);apply(draw.state,draw.program);pixelState(draw.state.pixel);
        const cull=draw.plan.mesh.flags&0xc000;
        if(cull){gl.enable(gl.CULL_FACE);gl.cullFace(cull===0xc000?gl.FRONT_AND_BACK:cull===0x4000?gl.FRONT:gl.BACK);}else gl.disable(gl.CULL_FACE);
        if(verifyVertices)verifyDrawVertices(draw);
        gl.drawElements(gl.TRIANGLES,draw.plan.mesh.triangles.length,gl.UNSIGNED_INT,0);draws++;
      }
      if(gl.getError()!==gl.NO_ERROR)throw Error('Native material GPU draw error');
      return {vertexChecks:verifyVertices?vertexChecks:null,draws,programs:programs.size,images:images.size,originalMaterialState:true,visualParity:false,performanceMeasured:false};
    },inspect(){
      const tev=new Map(),pixels=new Map(),lights=new Map();
      for(const d of queue){const key=JSON.stringify(d.state.tev.stages);if(!tev.has(key))tev.set(key,{program:d.state.tev,materials:0});tev.get(key).materials++;const p=JSON.stringify(d.state.pixel);if(!pixels.has(p))pixels.set(p,{state:d.state.pixel,materials:0});pixels.get(p).materials++;lights.set(JSON.stringify(d.state.context.lights),d.state.context.lights);}
      return {tevPrograms:[...tev.values()],pixelStates:[...pixels.values()],lightStates:[...lights.values()]};
    },dispose(){delete module.onNativeDraw;for(const model of [...models])model.dispose();for(const p of programs.values())gl.deleteProgram(p.program);for(const image of images.values())gl.deleteTexture(image);module._free(view);},
  };
}
