// Original offscreen camera and current GX light registers. Materials may update
// light colors/attenuation/specular direction, so read this after each setup.
export function readNativeRenderContext(module) {
  const p=module._portRenderContextState();
  if(!p||p%4||p+632>module.HEAPU8.length)throw Error('Native render context bounds');
  const w=new Uint32Array(module.HEAPU8.buffer,p,158),f=new Float32Array(module.HEAPU8.buffer,p,158);
  if(w[0]>255||w[2]>1||w[3]!==7)throw Error('Native render context masks');
  // Keep independent queued values without allocating an intermediate view or
  // invoking an array callback for every scalar.
  const floats=(at,n)=>{const a=new Array(n);for(let i=0;i<n;i++){const value=f[at+i];if(!Number.isFinite(value))throw Error('Native render context nonfinite');a[i]=value;}return a;};
  const lights=Array.from({length:8},(_,i)=>{
    if(!(w[0]&(1<<i)))return null;const at=30+i*16,color=Array.from(w.subarray(at,at+4));
    if(color.some(x=>x>255))throw Error('Native light color range');
    return {color,angular:floats(at+4,3),distance:floats(at+7,3),position:floats(at+10,3),direction:floats(at+13,3)};
  });
  return {lightMask:w[0],lightLoads:w[1],projectionType:w[2],viewport:floats(4,6),scissor:Array.from(w.subarray(10,14)),projection:floats(14,16),lights};
}
export function checkNativeRenderContext(context,camera,pixel) {
  if(context.projectionType!==0||context.projection.some((x,i)=>x!==camera.raw[12+i]))throw Error('Native offscreen projection differs from gameplay camera');
  if(context.viewport[2]<=0||context.viewport[3]<=0||context.viewport[4]!==0||context.viewport[5]!==1||!context.scissor[2]||!context.scissor[3])throw Error('Invalid native viewport');
  if(pixel)for(const channel of pixel.channels)if(channel?.enabled&&(channel.lights&~context.lightMask))throw Error('Material references unloaded native light');
}
