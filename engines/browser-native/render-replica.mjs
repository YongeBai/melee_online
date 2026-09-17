// Isolate *all* native rendering writes, including libc/HSD allocators, stack,
// object dirty flags, GX capture registers, and mutable WASM globals. The second
// instance uses identical code/table indices and a private, unshared memory.
// No classification or omission of supposedly cosmetic game bytes is needed.
export function createRenderReplica(source,target,{sourceHost,targetHost}={}){
 if(source===target||source.module===target.module||source.instance.exports.memory===target.instance.exports.memory||source.module.HEAPU8.buffer===target.module.HEAPU8.buffer)throw Error('Replica requires independent memory and runtime');
 if(!source.audit.wasmSha256||source.audit.wasmSha256!==target.audit.wasmSha256||JSON.stringify(source.audit.globals)!==JSON.stringify(target.audit.globals)||source.audit.table!==target.audit.table||JSON.stringify(source.audit.imports)!==JSON.stringify(target.audit.imports))throw Error('Replica core identity mismatch');
 const memoryBytes=source.module.HEAPU8.length,states=[source,target].map(r=>({runtime:r,table:r.instance.exports.__indirect_function_table,entries:Array.from({length:r.audit.table},(_,i)=>r.instance.exports.__indirect_function_table.get(i)),globals:r.audit.globals.map(g=>r.instance.exports[g.name])}));
 if(target.module.HEAPU8.length!==memoryBytes)throw Error('Replica memory size mismatch');
 let busy=false,closed=false;const stats={frames:0,copiedBytes:0,comparedBytes:0,copyCpuMs:0,guardCpuMs:0,maxCopyCpuMs:0,replicaBytes:memoryBytes,copyMode:'full'};
 function detached(r){if(r.health?.aborted)throw Error('Aborted renderer replica');if(r.module.onNativeDraw||r.module.onNativeImmediate||r.module.onNativeObject)throw Error('Replica overwrite requires detached renderer');if(r.module.HEAPU8.length!==memoryBytes||r.module.HEAPU8.buffer!==r.instance.exports.memory.buffer)throw Error('Replica memory growth or stale views');}
 function guard(){const t=performance.now();for(const s of states){detached(s.runtime);if(s.table.length!==s.entries.length||s.entries.some((v,i)=>s.table.get(i)!==v))throw Error('Replica function table changed');}stats.guardCpuMs+=performance.now()-t;}
 return {
  present(construct,draw){
   if(busy||closed)throw Error('Replica scope unavailable');guard();busy=true;let renderer;
   const sourceGlobals=states[0].globals.map(g=>g.value),t=performance.now();
   try{
    target.module.HEAPU8.set(source.module.HEAPU8);stats.copiedBytes+=memoryBytes;
    states[1].globals.forEach((g,i)=>g.value=sourceGlobals[i]);
    if(sourceHost||targetHost){if(!sourceHost||!targetHost)throw Error('Replica host journal pair required');targetHost.restore(structuredClone(sourceHost.capture()));}
    const ms=performance.now()-t;stats.copyCpuMs+=ms;stats.maxCopyCpuMs=Math.max(stats.maxCopyCpuMs,ms);
    renderer=construct(target.module);const result=draw(renderer);
    if(result?.then)throw Error('Replica draw must be synchronous');stats.frames++;return result;
   }finally{
    try{renderer?.dispose();detached(target);detached(source);if(states[0].globals.some((g,i)=>g.value!==sourceGlobals[i]))throw Error('Rendering changed gameplay globals');}finally{busy=false;}
   }
  },
  metrics:()=>({...stats}),
  dispose(){if(busy)throw Error('Replica still rendering');closed=true;},
 };
}
