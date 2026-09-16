// Browser GPU resource path for native mesh/skin bring-up. The diagnostic
// fragment shader displays the first UV image only: it is NOT HSD TEV/lighting.
const vertexSource=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(location=0) in vec3 position;
layout(location=1) in float paletteIndex;
layout(location=2) in vec2 uv0;
layout(location=3) in vec2 uv1;
uniform sampler2D palette;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec4 textureRow0;
uniform vec4 textureRow1;
uniform int uvChannel;
out vec3 worldPosition;
out vec2 textureCoord;
void main() {
  int slot=int(paletteIndex);
  vec4 p=vec4(position,1.0);
  worldPosition=vec3(dot(texelFetch(palette,ivec2(0,slot),0),p),
    dot(texelFetch(palette,ivec2(1,slot),0),p),dot(texelFetch(palette,ivec2(2,slot),0),p));
  vec4 uv=vec4(uvChannel==1?uv1:uv0,0.0,1.0);
  textureCoord=vec2(dot(textureRow0,uv),dot(textureRow1,uv));
  gl_Position=projectionMatrix*viewMatrix*vec4(worldPosition,1.0);
  // Original GX projection maps near/far to [-1,0]; WebGL uses [-1,+1].
  gl_Position.z=2.0*gl_Position.z+gl_Position.w;
}`;
const fragmentSource=`#version 300 es
precision highp float;
uniform sampler2D image;
in vec2 textureCoord;
out vec4 color;
void main() {color=texture(image,textureCoord);if(color.a<0.01)discard;}`;
export function createMeshPipeline(gl) {
  function compile(type,source) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error);}
    return shader;
  }
  const shaders=[compile(gl.VERTEX_SHADER,vertexSource),compile(gl.FRAGMENT_SHADER,fragmentSource)],program=gl.createProgram();
  for(const shader of shaders)gl.attachShader(program,shader);
  gl.transformFeedbackVaryings(program,['worldPosition'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);
  for(const shader of shaders)gl.deleteShader(shader);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const error=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw Error(error);}
  const uniforms=Object.fromEntries(['palette','image','viewMatrix','projectionMatrix','textureRow0','textureRow1','uvChannel']
    .map(name=>[name,gl.getUniformLocation(program,name)]));
  return {program,uniforms,dispose(){gl.deleteProgram(program);}};
}
export function uploadMesh(gl,pipeline,model,skin,assets,transforms) {
  const buffers=[],textures=[],vao=gl.createVertexArray();gl.bindVertexArray(vao);
  function buffer(target,data){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;}
  function attribute(location,size,data){buffer(gl.ARRAY_BUFFER,data);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
  function texture(){const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);return t;}
  const imageCache=new Map(),wrap=[gl.CLAMP_TO_EDGE,gl.REPEAT,gl.MIRRORED_REPEAT];
  function uploadImage(t) {
    const key=t?.offset??'white';if(imageCache.has(key))return imageCache.get(key);
    const image=texture(),levels=t?.image.levels??[{width:1,height:1,pixels:Uint8Array.from([255,255,255,255])}];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    levels.forEach((l,i)=>gl.texImage2D(gl.TEXTURE_2D,i,gl.RGBA8,l.width,l.height,0,gl.RGBA,gl.UNSIGNED_BYTE,l.pixels));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,levels.length-1);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,t?.magFilter===0?gl.NEAREST:gl.LINEAR);
    // Diagnostic sampling uses base-level filtering; native LOD/TEV is pending.
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap[t?.wrapS??0]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap[t?.wrapT??0]);
    imageCache.set(key,image);return image;
  }
  try {
    if(skin.groupCount>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('Skin palette exceeds GPU texture capacity');
    attribute(0,3,skin.positions);attribute(1,1,Float32Array.from(skin.indices));
    const uvs=[new Float32Array(model.totalVertices*2),new Float32Array(model.totalVertices*2)],triangles=[],draws=[];
    let base=0;
    for(const mesh of model.meshes) {
      mesh.vertices.forEach((v,i)=>{for(let channel=0;channel<2;channel++)uvs[channel].set([v[13+channel]?.[0]??0,v[13+channel]?.[1]??0],(base+i)*2);});
      let t=assets.materials.get(mesh.material).texture;
      // Reflection and hilight maps require native lighting/view-normal setup.
      while(t&&((t.flags&15)!==0||t.src<4||t.src>5))t=t.next;
      draws.push({joint:mesh.joint,flags:mesh.flags,offset:triangles.length*4,count:mesh.triangles.length,
        texture:uploadImage(t),matrix:transforms.get(t?.offset)??Float32Array.from([1,0,0,0,0,1,0,0,0,0,1,0]),uvChannel:(t?.src??4)-4});
      for(const index of mesh.triangles)triangles.push(base+index);base+=mesh.vertices.length;
    }
    attribute(2,2,uvs[0]);attribute(3,2,uvs[1]);buffer(gl.ELEMENT_ARRAY_BUFFER,Uint32Array.from(triangles));
    const palette=texture();gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,3,skin.groupCount);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    const {program,uniforms:u}=pipeline;
    const activate=()=>{gl.useProgram(program);gl.bindVertexArray(vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,palette);gl.uniform1i(u.palette,0);gl.uniform1i(u.image,1);};
    return {draws,updatePalette(matrices){activate();gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,3,skin.groupCount,gl.RGBA,gl.FLOAT,matrices);},
      draw(view,projection,flags,visibility) {
        activate();gl.uniformMatrix4fv(u.viewMatrix,false,view);gl.uniformMatrix4fv(u.projectionMatrix,false,projection);
        gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.BLEND);
        // GX's front winding is clockwise (also used by Dolphin OGLGfx).
        gl.frontFace(gl.CW);
        let count=0;
        for(const [index,draw] of draws.entries()) {
          if((flags[draw.joint]&16)||(visibility&&!visibility[index]))continue;
          const cull=draw.flags&0xc000;
          if(cull){gl.enable(gl.CULL_FACE);gl.cullFace(cull===0xc000?gl.FRONT_AND_BACK:cull===0x4000?gl.FRONT:gl.BACK);}else gl.disable(gl.CULL_FACE);
          gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,draw.texture);
          gl.uniform4fv(u.textureRow0,draw.matrix.subarray(0,4));gl.uniform4fv(u.textureRow1,draw.matrix.subarray(4,8));gl.uniform1i(u.uvChannel,draw.uvChannel);
          gl.drawElements(gl.TRIANGLES,draw.count,gl.UNSIGNED_INT,draw.offset);count++;
        }
        return count;
      },
      // Validation only: read GPU vertex transforms without rasterizing them.
      readPositions() {
        activate();const feedback=gl.createTransformFeedback(),output=gl.createBuffer();
        try {
          gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,output);
          gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,model.totalVertices*12,gl.STREAM_READ);
          gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,output);gl.enable(gl.RASTERIZER_DISCARD);
          gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,model.totalVertices);gl.endTransformFeedback();
          gl.disable(gl.RASTERIZER_DISCARD);const result=new Float32Array(model.totalVertices*3);
          gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,result);return result;
        } finally {gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);
          gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.deleteTransformFeedback(feedback);gl.deleteBuffer(output);}
      },
      dispose(){for(const b of buffers)gl.deleteBuffer(b);for(const t of textures)gl.deleteTexture(t);gl.deleteVertexArray(vao);}};
  } catch(error){for(const b of buffers)gl.deleteBuffer(b);for(const t of textures)gl.deleteTexture(t);gl.deleteVertexArray(vao);throw error;}
}
