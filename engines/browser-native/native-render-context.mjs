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
  const fogPtr=module._portFogState();if(!fogPtr||fogPtr%4||fogPtr+20>module.HEAPU8.length)throw Error('Native fog bounds');
  const regs=Array.from(new Uint32Array(module.HEAPU8.buffer,fogPtr,5));
  const fogType=(regs[3]>>>21)&7;if(![0,2].includes(fogType)||regs[3]&(1<<20))throw Error('Unsupported native fog equation');
  const f20=x=>{const b=new ArrayBuffer(4),v=new DataView(b);v.setUint32(0,(x&0xfffff)*4096);return v.getFloat32(0);};
  const fog={type:fogType,a:f20(regs[0]),c:f20(regs[3]),b:regs[1],shift:regs[2]&31,color:[regs[4]>>>16,(regs[4]>>>8)&255,regs[4]&255],registers:regs};
  if(regs.some(v=>v>0xffffff)||!Number.isFinite(fog.a)||!Number.isFinite(fog.c))throw Error('Invalid native fog registers');
  return {lightMask:w[0],lightLoads:w[1],projectionType:w[2],viewport:floats(4,6),scissor:Array.from(w.subarray(10,14)),projection:floats(14,16),lights,fog};
}
export function checkNativeRenderContext(context,camera,pixel) {
  if(context.projectionType!==0||context.projection.some((x,i)=>x!==camera.raw[12+i]))throw Error('Native offscreen projection differs from gameplay camera');
  if(context.viewport[2]<=0||context.viewport[3]<=0||context.viewport[4]!==0||context.viewport[5]!==1||!context.scissor[2]||!context.scissor[3])throw Error('Invalid native viewport');
  if(pixel)for(const channel of pixel.channels)if(channel?.enabled&&(channel.lights&~context.lightMask))throw Error('Material references unloaded native light');
}

// Per-renderer memoization of decoded values, never of live native pointers.
// Compare every context/fog word on every draw. lightLoads is a diagnostic
// counter, returned exactly even when the remaining decoded values are reused.
// All returned arrays are owned snapshots and must be treated as immutable.
export function createNativeRenderContextReader(module){
  const saved=new Uint32Array(158),savedFog=new Uint32Array(5);let context=null;
  return ()=>{
    const p=module._portRenderContextState(),q=module._portFogState(),heap=module.HEAPU8;
    if(!p||p%4||p+632>heap.length)throw Error('Native render context bounds');
    if(!q||q%4||q+20>heap.length)throw Error('Native fog bounds');
    const words=new Uint32Array(heap.buffer,p,158),fog=new Uint32Array(heap.buffer,q,5);
    let equal=context!==null;
    if(equal)for(let i=0;i<158;i++)if(i!==1&&words[i]!==saved[i]){equal=false;break;}
    if(equal)for(let i=0;i<5;i++)if(fog[i]!==savedFog[i]){equal=false;break;}
    if(!equal){
      // Validate before caching. A failed decode must not bless invalid bytes.
      const decoded=readNativeRenderContext(module);saved.set(words);savedFog.set(fog);context=decoded;
    }else if(context.lightLoads!==words[1])context={...context,lightLoads:words[1]};
    return context;
  };
}
