import {generateMaterialShaders} from './material-shader.mjs';

// Independent, hand-computed pixel cases exercise the full vertex-lighting /
// texgen / sampling / TEV chain. The combiner has its larger integer oracle too.
export function verifyGpuMaterialShader(gl,{fog=false}={}) {
  const stage=texture=>{const s=Array(32).fill(0);s[0]=s[1]=texture?0:255;s[2]=4;s[3]=texture?3:4;return s;};
  const channel={enabled:0,ambientSource:0,materialSource:0,lights:0,diffuse:2,attenuation:2};
  const base=()=>({tev:{stages:[stage(false)],registers:Array.from({length:4},()=>[0,0,0,0]),konst:Array.from({length:4},()=>[0,0,0,0])},textures:{generators:[],textures:[],matrices:[]},pixel:{channelCount:1,channels:[{...channel},null,{...channel},null],colors:[{ambient:[0,0,0,0],material:[64,128,192,255]},{ambient:[0,0,0,0],material:[0,0,0,0]}],alphaTest:{compare0:7,reference0:0,operation:0,compare1:7,reference1:0}}});
  // GX material multiply is (mat * (acc + (acc >> 7))) >> 8.
  // With mat=255, nonzero accumulators below 128 lose one unit.
  const cases=[];
  cases.push({name:'unlit material',state:base(),expected:[64,128,192,255]});
  if(fog)for(const [name,c,expected]of [['before fog start',1.25,[64,128,192,199]],['half fog',.5,[32,64,108,199]],['full fog',-.25,[0,0,25,199]]]){
    const state=base();state.pixel.colors[0].material[3]=199;
    // At depth .5: (.25 * 2^24) / (2^23 - (2^23 >> 1)) = 1.
    state.context={fog:{type:2,a:.25,c,b:8388608,shift:1,color:[0,0,25]}};
    cases.push({name,state,expected});
  }
  for(const [name,normal,diffuse,ambient,light,expected] of [
    ['diffuse toward light',[0,0,1],2,[32,32,32],[100,60,20],[132,91,51,255]],
    ['clamped diffuse away',[0,0,-1],2,[32,32,32],[100,60,20],[31,31,31,255]],
    ['signed diffuse subtraction',[0,0,-1],1,[140,140,140],[100,60,20],[39,79,119,255]],
    ['diffuse accumulator clamp',[0,0,1],2,[200,200,200],[100,60,20],[255,255,220,255]],
  ]){const state=base();state.pixel.colors[0]={ambient:[...ambient,0],material:[255,255,255,255]};state.pixel.channels[0]={...channel,enabled:1,lights:1,diffuse};cases.push({name,state,normal,light,expected});}
  {const state=base();state.pixel.colors[0]={ambient:[0,0,0,0],material:[255,255,255,255]};state.pixel.channels[0]={...channel,enabled:1,lights:1,diffuse:2,attenuation:0};cases.push({name:'SDK specular forces diffuse NONE',state,normal:[0,0,1],light:[180,120,60],specular:true,expected:[180,119,59,255]});}
  {const state=base();state.pixel.channels[0].materialSource=1;state.pixel.channels[2].materialSource=1;cases.push({name:'vertex material RGBA',state,vertexColor:[23,71,149,199],expected:[23,71,149,199]});}
  {const state=base();state.pixel.alphaTest={compare0:4,reference0:255,operation:0,compare1:7,reference1:0};cases.push({name:'alpha rejection',state,expected:[0,0,0,0]});}
  for(const reflection of [false,true]) {
    const state=base();state.tev.stages=[stage(true)];state.textures.generators=[{id:0,type:reflection?0:1,source:reflection?1:4,matrix:reflection?30:60,normalize:reflection?1:0,postMatrix:64}];state.textures.textures=[{id:0}];
    cases.push({name:reflection?'normal reflection texgen':'UV texgen and nearest sampling',state,texture:true,reflection,expected:[0,255,0,255]});
  }
  for(const mode of ['bump','vertex matrix','SRTG']) {
    const state=base();state.tev.stages=[stage(true)];state.textures.textures=[{id:0}];state.textures.generators=[{id:0,type:1,source:4,matrix:60,normalize:0,postMatrix:64}];
    if(mode==='bump'){state.textures.generators.push({id:1,type:2,source:12,matrix:60,normalize:0,postMatrix:125});state.tev.stages[0][0]=1;}
    if(mode==='SRTG'){state.pixel.channelCount=0;state.pixel.colors[0].material=[64,192,0,255];state.textures.generators[0]={id:0,type:10,source:19,matrix:60,normalize:0,postMatrix:125};}
    cases.push({name:mode+' texture coordinates',state,mode,uv:mode==='vertex matrix'?[0.25,0.25,33]:[0.25,0.25,0],expected:mode==='bump'?[255,255,0,255]:mode==='SRTG'?[0,0,255,255]:[0,255,0,255]});
  }
  const framebuffer=gl.createFramebuffer(),target=gl.createTexture(),image=gl.createTexture(),vao=gl.createVertexArray(),buffer=gl.createBuffer();
  const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport=gl.getParameter(gl.VIEWPORT);
  const ident=[1,0,0,0,0,1,0,0,0,0,1,0],identity4=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log+'\n'+source);}return s;}
  try {
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,target);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,1,1);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Material test framebuffer');
    gl.bindTexture(gl.TEXTURE_2D,image);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,Float32Array.from([-1,-1,-0.5,3,-1,-0.5,-1,3,-0.5]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    gl.viewport(0,0,1,1);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.DITHER);gl.colorMask(true,true,true,true);
    for(const c of cases) {
      const source=generateMaterialShaders(c.state,[{attr:9},{attr:c.mode==='bump'?25:10},{attr:11},{attr:13},...(c.mode==='vertex matrix'?[{attr:1}]:[])]);let vs,fs,p;
      try {
        vs=shader(gl.VERTEX_SHADER,source.vertex);fs=shader(gl.FRAGMENT_SHADER,source.fragment);p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);const u=n=>gl.getUniformLocation(p,n);
        gl.vertexAttrib3f(2,...(c.normal??[0,0,1]));gl.vertexAttrib4f(5,...(c.vertexColor??[255,255,255,255]).map(v=>v/255));gl.vertexAttrib3f(3,0,1,0);gl.vertexAttrib3f(4,1,0,0);gl.vertexAttrib3f(7,...(c.uv??[0.75,0.25,0]));
        const matrices=new Float32Array(120);matrices.set(ident);gl.uniform4fv(u('positionRows'),matrices);gl.uniform4fv(u('normalRows'),matrices);const textureMatrices=Float32Array.from(matrices);textureMatrices.set([1,0,0,0.5,0,1,0,0,0,0,1,0],12);gl.uniform4fv(u('textureRows'),textureMatrices);
        const post=new Float32Array(240);post.set(c.reflection?[0,0,0,0.75,0,0,0,0.25,0,0,0,1]:ident);gl.uniform4fv(u('postRows'),post);gl.uniformMatrix4fv(u('projection'),false,identity4);gl.uniform1i(u('currentMatrix'),0);
        gl.uniform4iv(u('materialColor'),c.state.pixel.colors.flatMap(v=>v.material));gl.uniform4iv(u('ambientColor'),c.state.pixel.colors.flatMap(v=>v.ambient));
        const lp=new Float32Array(24),ld=new Float32Array(24),a=new Float32Array(24),k=new Float32Array(24),color=new Int32Array(32);lp.set(c.mode==='bump'?[1000000,1000000,0]:c.specular?[1000000,0,1000000]:[0,0,1000000]);ld.set([0,0,1]);a.set(c.specular?[0,0,1]:[1,0,0]);k.set(c.specular?[25,0,-24]:[1,0,0]);color.set([...(c.light??[0,0,0]),255]);
        for(const [n,v] of [['lightPosition',lp],['lightDirection',ld],['lightAngular',a],['lightDistance',k]])gl.uniform3fv(u(n),v);gl.uniform4iv(u('lightColor'),color);
        gl.uniform4iv(u('tevRegisters'),c.state.tev.registers.flat());gl.uniform4iv(u('tevKonst'),c.state.tev.konst.flat());gl.uniform1i(u('image0'),0);gl.uniform1fv(u('lodBias'),new Float32Array(8));gl.uniform2iv(u('alphaReference'),[c.state.pixel.alphaTest.reference0,c.state.pixel.alphaTest.reference1]);
        if(c.state.context?.fog){const f=c.state.context.fog;gl.uniform2f(u('fogAC'),f.a,f.c);gl.uniform2i(u('fogBShift'),f.b,f.shift);gl.uniform3iv(u('fogColor'),f.color);}
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);const actual=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,actual);
        if(actual.some((v,i)=>v!==c.expected[i])||gl.getError()!==gl.NO_ERROR)throw Error(`Native material pixel ${c.name}: ${actual}, expected ${c.expected}`);
      }finally{if(p)gl.deleteProgram(p);if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
    }
    return {passed:true,cases:cases.map(c=>c.name),pixelChannelChecks:cases.length*4};
  }finally{gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);gl.deleteTexture(image);gl.deleteTexture(target);gl.deleteFramebuffer(framebuffer);gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.viewport(...viewport);}
}
