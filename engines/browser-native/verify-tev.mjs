import {generateTevFunction} from './tev-shader.mjs';
import {evaluateTev,tevTestInputs,tevTestPrograms} from './tev-reference.mjs';

// Integer framebuffer readback preserves signed intermediate results. Testing
// RGBA8 alone would hide wrong clamps, overflow and destination selection.
export function verifyGpuTev(gl,captured=[]) {
  const rows=[...tevTestPrograms(),...captured.map((p,i)=>({name:'native material '+i,stages:p.stages,captured:p}))];
  const framebuffer=gl.createFramebuffer(),texture=gl.createTexture(),vao=gl.createVertexArray();
  const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport=gl.getParameter(gl.VIEWPORT);
  const vertices=[],savedAttributes=Array.from({length:4},(_,i)=>gl.getVertexAttrib(8+i,gl.CURRENT_VERTEX_ATTRIB));let checks=0;
  function shader(type,source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error+'\n'+source);}return s;
  }
  try {
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32I,1,1);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('TEV test integer framebuffer');
    gl.bindVertexArray(vao);gl.viewport(0,0,1,1);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.DITHER);
    for(const flat of [false,true])vertices.push(shader(gl.VERTEX_SHADER,'#version 300 es\nprecision highp int;\n'+(flat?'flat out highp ivec4 tevRegisters[4];\n'+Array.from({length:4},(_,i)=>`layout(location=${8+i}) in ivec4 rawTev${i};`).join('\n'):'')+'\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);'+(flat?Array.from({length:4},(_,i)=>`tevRegisters[${i}]=rawTev${i};`).join(''):'')+'}'));
    for(const row of rows)for(const flat of [false,true]) {
      const n=row.stages.length,source='#version 300 es\nprecision highp float;\nprecision highp int;\n'+generateTevFunction(row.stages,{registerInput:flat?'flat':'uniform'})+
        `\nuniform ivec4 testTextures[${n}];uniform ivec4 testRaster[${n}];layout(location=0) out ivec4 color;\nvoid main(){color=nativeTev(testTextures,testRaster);}`;
      let fragment,program;
      try {
        fragment=shader(gl.FRAGMENT_SHADER,source);program=gl.createProgram();gl.attachShader(program,vertices[Number(flat)]);gl.attachShader(program,fragment);gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
        const uniforms=Object.fromEntries(['tevRegisters','tevKonst','testTextures','testRaster'].map(name=>[name,gl.getUniformLocation(program,name+'[0]')]));
        for(let sample=0;sample<16;sample++) {
          const input=tevTestInputs(n,0x12345678+sample*7919);
          // Include equal packed RGB with unequal alpha, exact interpolation
          // endpoints and signed byte boundaries, not only random samples.
          if(sample===0){input.registers[1]=[0,127,255,255];input.registers[2]=[0,127,255,0];}
          if(sample===1)input.textures.forEach(v=>v.fill(0));
          if(sample===2)input.textures.forEach(v=>v.fill(255));
          if(sample===3)input.registers.forEach(v=>v.fill(-1));
          const p={stages:row.stages,registers:row.captured?.registers??input.registers,konst:row.captured?.konst??input.konst};
          if(flat)for(let i=0;i<4;i++)gl.vertexAttribI4iv(8+i,Int32Array.from(p.registers[i]));
          else gl.uniform4iv(uniforms.tevRegisters,p.registers.flat());
          gl.uniform4iv(uniforms.tevKonst,p.konst.flat());
          gl.uniform4iv(uniforms.testTextures,input.textures.flat());gl.uniform4iv(uniforms.testRaster,input.rasters.flat());
          gl.drawArrays(gl.TRIANGLES,0,3);const actual=new Int32Array(4);
          gl.readPixels(0,0,1,1,gl.RGBA_INTEGER,gl.INT,actual);
          const expected=evaluateTev(p,input.textures,input.rasters);
          if(actual.some((v,i)=>v!==expected[i])||gl.getError()!==gl.NO_ERROR)throw Error(`TEV mismatch ${row.name} sample ${sample}: GPU ${actual}; expected ${expected}`);
          checks+=4;
        }
      } finally {if(program)gl.deleteProgram(program);if(fragment)gl.deleteShader(fragment);}
    }
    return {passed:true,programs:rows.length,capturedPrograms:captured.length,samplesPerProgram:16,registerTransports:['uniform','flat integer attributes'],integerChannelChecks:checks};
  } finally {
    for(const vertex of vertices)gl.deleteShader(vertex);
    for(let i=0;i<4;i++){const v=savedAttributes[i];if(v instanceof Int32Array)gl.vertexAttribI4iv(8+i,v);else if(v instanceof Uint32Array)gl.vertexAttribI4uiv(8+i,v);else gl.vertexAttrib4fv(8+i,v);}
    gl.deleteVertexArray(vao);gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.viewport(...viewport);
  }
}
