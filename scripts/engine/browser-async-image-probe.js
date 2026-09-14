// Inspect actual canvas pixels without waiting synchronously for GPU completion.
// PBO/fence API references: MDN WebGL2 clientWaitSync and getBufferSubData.
export function hashImagePixels(pixels) {
  let hash=2166136261,nonblack=false;
  for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++){
    const value=pixels[i+c];if(value>8)nonblack=true;hash=Math.imul(hash^value,16777619);
  }
  return {hash:hash>>>0,nonblack};
}

// Harvest fenced pixels in a separate browser task. Capture stays in RAF so
// timestamps and the actual canvas images retain the same meaning. Only one
// task may be pending, and stopping it never discards a GPU sample: callers
// must drain the probe before disposal.
export class ImageHarvestTask {
  constructor(probe, accept, fail, {schedule=fn=>setTimeout(fn,0),cancel=id=>clearTimeout(id)}={}) {
    Object.assign(this,{probe,accept,fail,schedule,cancel,pending:null,closed:false});
  }
  request() {
    if(this.closed||this.pending!==null)return;
    this.pending=this.schedule(()=>{
      this.pending=null;
      if(this.closed)return;
      try{this.accept(this.probe.poll());}
      catch(error){this.stop();this.fail(error);}
    });
  }
  stop() {
    this.closed=true;
    if(this.pending!==null)this.cancel(this.pending);
    this.pending=null;
  }
}
export class AsyncCanvasImageProbe {
  constructor({width=32,height=24,capacity=8}={}) {
    this.width=width;this.height=height;this.capacity=capacity;
    this.canvas=new OffscreenCanvas(width,height);
    const gl=this.gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if(!gl)throw Error('Asynchronous image verification requires WebGL2');
    const shader=(type,source)=>{const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
    const vs=shader(gl.VERTEX_SHADER,'#version 300 es\nout vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}');
    const fs=shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform sampler2D sourceImage;in vec2 uv;out vec4 color;void main(){color=texture(sourceImage,uv);}');
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(this.program);
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(this.program,'sourceImage'),0);gl.disable(gl.DITHER);gl.viewport(0,0,width,height);
    this.buffers=Array.from({length:capacity},()=>{const b=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,b);gl.bufferData(gl.PIXEL_PACK_BUFFER,width*height*4,gl.STREAM_READ);return b;});
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);this.free=[...this.buffers];this.pending=[];this.sourceWidth=0;this.sourceHeight=0;this.captureCount=0;this.maxPending=0;
    this.pixels=new Uint8Array(width*height*4);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Could not initialize asynchronous image verifier');
  }
  reset() {
    if(this.pending.length || this.free.length!==this.capacity)throw Error('Cannot reuse an image verifier with outstanding samples');
    if(this.gl.isContextLost())throw Error('Image verifier context lost');
    this.captureCount=0;this.maxPending=0;
  }
  diagnostics() {
    const now=performance.now();
    return {contextLost:this.gl.isContextLost(),captures:this.captureCount,free:this.free.length,
      pending:this.pending.length,maxPending:this.maxPending,oldestPendingMs:this.pending.length?now-this.pending[0].enqueuedAt:0};
  }
  capture(source,metadata={}) {
    const gl=this.gl;if(gl.isContextLost())throw Error('Image verifier context lost');
    const buffer=this.free.pop();if(!buffer)throw Error('Asynchronous image verifier overflow; samples cannot be discarded');
    const started=performance.now();
    gl.bindTexture(gl.TEXTURE_2D,this.texture);
    if(source.width!==this.sourceWidth||source.height!==this.sourceHeight){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      this.sourceWidth=source.width;this.sourceHeight=source.height;
    }else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,buffer);
    gl.readPixels(0,0,this.width,this.height,gl.RGBA,gl.UNSIGNED_BYTE,0);
    const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)throw Error('Could not fence image sample');
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.flush();
    this.pending.push({buffer,sync,metadata,enqueueMs:performance.now()-started,enqueuedAt:performance.now()});
    this.captureCount++;this.maxPending=Math.max(this.maxPending,this.pending.length);
  }
  poll() {
    const gl=this.gl,ready=[];
    if(gl.isContextLost())throw Error('Image verifier context lost');
    while(this.pending.length){
      const item=this.pending[0],status=gl.clientWaitSync(item.sync,0,0);
      if(status===gl.TIMEOUT_EXPIRED)break;
      if(status!==gl.ALREADY_SIGNALED&&status!==gl.CONDITION_SATISFIED)throw Error('Image verifier fence failed');
      const started=performance.now();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,item.buffer);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,this.pixels);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
      const readMs=performance.now()-started;
      ready.push({...item.metadata,...hashImagePixels(this.pixels),centerPixel:Array.from(this.pixels.slice((Math.floor(this.height/2)*this.width+Math.floor(this.width/2))*4,(Math.floor(this.height/2)*this.width+Math.floor(this.width/2))*4+4)),enqueueMs:item.enqueueMs,readMs,completionDelayMs:performance.now()-item.enqueuedAt});
      gl.deleteSync(item.sync);this.pending.shift();this.free.push(item.buffer);
    }
    return ready;
  }
  dispose() {
    const gl=this.gl;for(const item of this.pending)gl.deleteSync(item.sync);for(const b of this.buffers)gl.deleteBuffer(b);
    gl.deleteTexture(this.texture);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.program);
    this.pending=[];this.free=[];gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
