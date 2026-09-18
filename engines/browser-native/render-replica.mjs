import {subscribeDirtyPages} from './dirty-runtime.mjs';
// Isolate *all* native rendering writes, including libc/HSD allocators, stack,
// object dirty flags, GX capture registers, and mutable WASM globals. The second
// instance uses identical code/table indices and a private, unshared memory.
// No classification or omission of supposedly cosmetic game bytes is needed.
const dirtyOwners=new WeakSet();
export function createRenderReplica(source,target,{sourceHost,targetHost,copyMode="full",auditDirty=false,verifyImmutableTable=false}={}){
 if(source===target||source.module===target.module||source.instance.exports.memory===target.instance.exports.memory||source.module.HEAPU8.buffer===target.module.HEAPU8.buffer)throw Error('Replica requires independent memory and runtime');
 if(!source.audit.wasmSha256||source.audit.wasmSha256!==target.audit.wasmSha256||JSON.stringify(source.audit.globals)!==JSON.stringify(target.audit.globals)||source.audit.table!==target.audit.table||JSON.stringify(source.audit.imports)!==JSON.stringify(target.audit.imports))throw Error('Replica core identity mismatch');
 const memoryBytes=source.module.HEAPU8.length,states=[source,target].map(r=>({runtime:r,table:r.instance.exports.__indirect_function_table,entries:Array.from({length:r.audit.table},(_,i)=>r.instance.exports.__indirect_function_table.get(i)),globals:r.audit.globals.map(g=>r.instance.exports[g.name])})),fixedTableContents=[source,target].every(r=>r.audit.fixedTableContents===true),scanTable=!fixedTableContents||verifyImmutableTable;
 if(target.module.HEAPU8.length!==memoryBytes)throw Error('Replica memory size mismatch');
 if(!['full','dirty'].includes(copyMode)||copyMode==='dirty'&&(!source.audit.instrumentedSha256||!source.dirty||!target.dirty||source.audit.instrumentedSha256!==target.audit.instrumentedSha256))throw Error('Unaudited dirty replica');
 if(copyMode==='dirty'){if([source,target].some(r=>!(r.dirty instanceof Uint8Array)||r.dirty.byteLength!==524288||dirtyOwners.has(r.dirty.buffer))||source.dirty.buffer===target.dirty.buffer)throw Error('Dirty bitmap needs an exclusive owner');for(const r of [source,target])dirtyOwners.add(r.dirty.buffer);}
 const subscriptions=copyMode==='dirty'?[source,target].map(r=>subscribeDirtyPages(r,'presentation')):null;
 let first=true;const pageBytes=4096;
 let busy=false,closed=false;const stats={frames:0,copiedBytes:0,comparedBytes:0,copyCpuMs:0,guardCpuMs:0,tableEntriesChecked:0,fixedTableContents,scanTable,maxCopyCpuMs:0,replicaBytes:memoryBytes,copyMode,dirtyPages:0,fullCopies:0,coverageAudits:0,dirtySamples:[]};
 function detached(r){if(r.health?.aborted)throw Error('Aborted renderer replica');if(r.module.onNativeDraw||r.module.onNativeImmediate||r.module.onNativeObject)throw Error('Replica overwrite requires detached renderer');if(r.module.HEAPU8.length!==memoryBytes||r.module.HEAPU8.buffer!==r.instance.exports.memory.buffer)throw Error('Replica memory growth or stale views');}
 function guard(){const t=performance.now();for(const s of states){detached(s.runtime);if(s.table.length!==s.entries.length)throw Error('Replica function table changed');if(scanTable){stats.tableEntriesChecked+=s.entries.length;for(let i=0;i<s.entries.length;i++)if(s.table.get(i)!==s.entries[i])throw Error('Replica function table changed');}}stats.guardCpuMs+=performance.now()-t;}
 return {
  present(construct,draw){
   if(busy||closed)throw Error('Replica scope unavailable');guard();busy=true;let renderer;
   const sourceGlobals=states[0].globals.map(g=>g.value),t=performance.now();
   try{
    const marks=subscriptions?.map(s=>s.read());
    if(copyMode==='dirty'&&stats.frames<3)stats.dirtySamples.push({game:marks[0].reduce((a,b)=>a+(b!==0),0),render:marks[1].reduce((a,b)=>a+(b!==0),0)});
    if(copyMode==='dirty'&&!first){
     for(let page=0,count=memoryBytes/pageBytes;page<count;page++)if(marks[0][page]||marks[1][page]){const start=page;while(page+1<count&&(marks[0][page+1]||marks[1][page+1]))page++;const lo=start*pageBytes,hi=(page+1)*pageBytes;target.module.HEAPU8.set(source.module.HEAPU8.subarray(lo,hi),lo);target.dirty.fill(1,start,page+1);stats.copiedBytes+=hi-lo;stats.dirtyPages+=page-start+1;}
    }else{target.module.HEAPU8.set(source.module.HEAPU8);if(copyMode==='dirty')target.dirty.fill(1,0,memoryBytes/pageBytes);else target.module.__dirtyMark?.(0,memoryBytes);stats.copiedBytes+=memoryBytes;stats.fullCopies++;}
    if(copyMode==='dirty'){if(auditDirty){const a=source.module.HEAPU8,b=target.module.HEAPU8;for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Untracked presentation write at '+i);stats.coverageAudits++;}subscriptions[1].read();subscriptions.forEach(s=>s.clear());}first=false;
    states[1].globals.forEach((g,i)=>g.value=sourceGlobals[i]);
    if(sourceHost||targetHost){if(!sourceHost||!targetHost)throw Error('Replica host journal pair required');targetHost.restore(structuredClone(sourceHost.capture()));}
    const ms=performance.now()-t;stats.copyCpuMs+=ms;stats.maxCopyCpuMs=Math.max(stats.maxCopyCpuMs,ms);
    renderer=construct(target.module);const result=draw(renderer);
    if(result?.then)throw Error('Replica draw must be synchronous');stats.frames++;return result;
   }finally{
    try{renderer?.dispose();detached(target);detached(source);if(states[0].globals.some((g,i)=>g.value!==sourceGlobals[i]))throw Error('Rendering changed gameplay globals');}finally{busy=false;}
   }
  },
  metrics:()=>({...stats,dirtyHostEvents:target.dirtyHostEvents}),
  dispose(){if(closed)return;if(busy)throw Error('Replica still rendering');closed=true;if(copyMode==='dirty'){subscriptions.forEach(s=>s.dispose());for(const r of [source,target])dirtyOwners.delete(r.dirty.buffer);}},
 };
}
