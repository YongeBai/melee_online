// Diagnostic same-instance checkpoints. No live renderer, async C stack,
// imported memory, shared memory, or dynamically changing function table.
const encoder=new TextEncoder(),decoder=new TextDecoder();
function leb(value){const out=[];do{let byte=value&127;value>>>=7;if(value)byte|=128;out.push(byte);}while(value);return out;}
function string(value){const bytes=encoder.encode(value);return [...leb(bytes.length),...bytes];}
export function instrumentSnapshotWasm(bytes,{memoryInitialPages=null,dirtyTracking=false}={}){
 if(!(bytes instanceof Uint8Array)||bytes.length<8||(new DataView(bytes.buffer,bytes.byteOffset).getUint32(0,true)!==0x6d736100||new DataView(bytes.buffer,bytes.byteOffset).getUint32(4,true)!==1))throw Error('Invalid WASM snapshot module');
 const sections=[];let at=8;
 const u=()=>{let value=0,shift=0,b;do{if(at>=bytes.length||shift>28)throw Error('Invalid WASM LEB');b=bytes[at++];value|=(b&127)<<shift;shift+=7;}while(b&128);return value>>>0;};
 const str=()=>{const n=u(),v=decoder.decode(bytes.subarray(at,at+n));at+=n;return v;};
 const globals=[],imports=[];let exports=null,table=null,memory=null;
 while(at<bytes.length){const id=bytes[at++],length=u(),start=at,end=start+length;if(end>bytes.length)throw Error('Truncated WASM section');
  if(id===2){for(let n=u();n--;){const module=str(),name=str(),kind=bytes[at++];if(kind!==0)throw Error('Snapshot does not support imported state');u();imports.push({module,name});}}
  if(id===4){if(u()!==1||bytes[at++]!==0x70||u()!==1)throw Error('Snapshot requires one bounded funcref table');const initial=u(),maximum=u();if(initial!==maximum)throw Error('Snapshot requires fixed table size');table=initial;}
  if(id===5){if(u()!==(dirtyTracking?2:1))throw Error('Snapshot requires audited memory count');const flags=u();if(flags!==1)throw Error('Snapshot requires unshared bounded memory');memory={initial:u(),maximum:u()};if(dirtyTracking&&(u()!==1||u()!==8||u()!==8))throw Error("Invalid dirty metadata memory");}
  if(id===6){for(let i=0,n=u();i<n;i++){const type=bytes[at++],mutable=bytes[at++];if(type!==0x7f||mutable!==1||bytes[at++]!==0x41)throw Error('Unaudited WASM global layout');u();if(bytes[at++]!==0x0b)throw Error('Unaudited WASM initializer');globals.push({index:i,name:'__checkpoint_global_'+i});}}
  if(id===7){const count=u(),body=bytes.slice(at,end);exports={count,body};}
  sections.push({id,body:bytes.slice(start,end)});at=end;
 }
 const allowed=new Set(['emit_immediate','portEmitDraw','music_request','accept_diagnostic_mute','portDispatchObject','invoke_viiiiii','invoke_vii','invoke_vi','invoke_v','_abort_js','fd_close','fd_write','fd_seek','emscripten_resize_heap','_emscripten_throw_longjmp']);
 if(!exports||!globals.length||!table||!memory||imports.some(i=>!allowed.has(i.name)||!['env','wasi_snapshot_preview1'].includes(i.module)))throw Error('Unaudited snapshot imports/state');
 if(memoryInitialPages!==null&&(!Number.isInteger(memoryInitialPages)||memoryInitialPages<memory.initial||memoryInitialPages>memory.maximum))throw Error('Invalid replica initial memory');
 const additions=globals.flatMap(g=>[...string(g.name),3,...leb(g.index)]);
 const replacement=Uint8Array.from([...leb(exports.count+globals.length),...exports.body,...additions]);
 const parts=[bytes.slice(0,8),...sections.flatMap(s=>{const body=s.id===7?replacement:s.id===5&&memoryInitialPages!==null?Uint8Array.from([dirtyTracking?2:1,1,...leb(memoryInitialPages),...leb(memory.maximum),...(dirtyTracking?[1,8,8]:[])]):s.body;return [Uint8Array.from([s.id,...leb(body.length)]),body];})],result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let cursor=0;for(const p of parts){result.set(p,cursor);cursor+=p.length;}
 return {bytes:result,audit:{globals,imports,table,memory,instantiationMemoryInitialPages:memoryInitialPages??memory.initial,scope:'same instance, detached renderer, synchronous exported-call boundary'}};
}
export async function createSnapshotRuntime(create,bytes,options={}){
 const {memoryInitialPages=null,dirtyManifest=null,...moduleOptions}=options,instrumented=instrumentSnapshotWasm(bytes,{memoryInitialPages,dirtyTracking:!!dirtyManifest});let instance,rejectInstantiation;const health={aborted:false};const dirtyHostEvents=[];
 const failed=new Promise((_,reject)=>rejectInstantiation=reject);
 const module=await Promise.race([failed,create({...moduleOptions,onAbort(reason){health.aborted=true;moduleOptions.onAbort?.(reason);},instantiateWasm(imports,receive){if(dirtyManifest)for(const {name}of instrumented.audit.imports.filter(i=>i.module==='wasi_snapshot_preview1')){const fn=imports.wasi_snapshot_preview1[name];imports.wasi_snapshot_preview1[name]=(...args)=>{if(instance){if(name==='fd_write')instance.exports.__dirty_mark(args[3],4);else {if(dirtyHostEvents.length<8)dirtyHostEvents.push({name,args});instance.exports.__dirty_mark(0,instance.exports.memory.buffer.byteLength);}}return fn(...args);};}WebAssembly.instantiate(instrumented.bytes,imports).then(result=>{instance=result.instance;receive(instance,result.module);}).catch(rejectInstantiation);return {};}})]);
 const wasmSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(dirtyManifest){if(wasmSha256!==dirtyManifest.instrumentedSha256)throw Error('Dirty core digest mismatch');module.__dirtyMark=instance.exports.__dirty_mark;if(!(instance.exports.__dirty_memory instanceof WebAssembly.Memory)||typeof module.__dirtyMark!=='function')throw Error('Dirty exports missing');}
  return {module,instance,dirtyHostEvents,audit:{...instrumented.audit,wasmSha256:dirtyManifest?.originalSha256??wasmSha256,instrumentedSha256:dirtyManifest?wasmSha256:null},dirty:dirtyManifest?new Uint8Array(instance.exports.__dirty_memory.buffer):null,health};
}
export function createWasmCheckpointStore({module,instance,audit,health={aborted:false},host={capture:()=>null,restore:()=>{}},maxBytes=1024*1024*1024}){
 const owned=new Map(),table=instance.exports.__indirect_function_table,entries=Array.from({length:table.length},(_,i)=>table.get(i));let retainedBytes=0;const metrics={captures:0,restores:0,capturedBytes:0,restoredBytes:0,captureCpuMs:0,restoreCpuMs:0,maxCaptureCpuMs:0,maxRestoreCpuMs:0};
 const globals=audit.globals.map(g=>instance.exports[g.name]);if(globals.some(g=>!(g instanceof WebAssembly.Global)))throw Error('Snapshot globals not exported');
 function guard(){if(health.aborted)throw Error('Aborted runtime cannot be restored');if(module.onNativeDraw||module.onNativeImmediate||module.onNativeObject)throw Error('Snapshot requires detached renderer');if(table.length!==entries.length||entries.some((e,i)=>table.get(i)!==e))throw Error('Snapshot function table changed');if(instance.exports.memory.buffer!==module.HEAPU8.buffer)throw Error('Stale snapshot memory view');}
 function capture(){const began=performance.now();guard();const size=module.HEAPU8.length;if(retainedBytes+size>maxBytes)throw Error('Snapshot memory budget exceeded');const key=Object.freeze({byteLength:size}),row={bytes:module.HEAPU8.slice(),globals:globals.map(g=>g.value),host:structuredClone(host.capture())};owned.set(key,row);retainedBytes+=size;const ms=performance.now()-began;metrics.captures++;metrics.capturedBytes+=size;metrics.captureCpuMs+=ms;metrics.maxCaptureCpuMs=Math.max(metrics.maxCaptureCpuMs,ms);return key;}
 function row(key){const r=owned.get(key);if(!r)throw Error('Unknown or released checkpoint');return r;}
 function restore(key){const began=performance.now();guard();const r=row(key);if(module.HEAPU8.length!==r.bytes.length)throw Error('Memory growth across checkpoint is unsupported');host.restore(structuredClone(r.host));module.__dirtyMark?.(0,r.bytes.length);module.HEAPU8.set(r.bytes);globals.forEach((g,i)=>g.value=r.globals[i]);const ms=performance.now()-began;metrics.restores++;metrics.restoredBytes+=r.bytes.length;metrics.restoreCpuMs+=ms;metrics.maxRestoreCpuMs=Math.max(metrics.maxRestoreCpuMs,ms);}
 function release(key){if(!owned.has(key))return;retainedBytes-=key.byteLength;owned.delete(key);}
 async function hash(key){const r=row(key),hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');const memorySha256=hex(await crypto.subtle.digest('SHA-256',r.bytes)),stateSha256=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify({wasmSha256:audit.wasmSha256??null,memorySha256,globals:r.globals,host:r.host}))));return {stateSha256,memorySha256,bytes:r.bytes.length,globals:[...r.globals]};}
 function compare(a,b){const x=row(a),y=row(b);if(x.bytes.length!==y.bytes.length)throw Error('Snapshot sizes differ');let changedBytes=0;const pages=new Map();for(let i=0;i<x.bytes.length;i++)if(x.bytes[i]!==y.bytes[i]){changedBytes++;const page=Math.floor(i/65536);pages.set(page,(pages.get(page)??0)+1);}return {changedBytes,pages:[...pages].map(([page,bytes])=>({offset:page*65536,bytes})),globalsChanged:x.globals.map((v,i)=>v!==y.globals[i]),hostChanged:JSON.stringify(x.host)!==JSON.stringify(y.host)};}
 return {capture,restore,release,hash,compare,metrics:()=>({...metrics,retainedBytes,count:owned.size}),dispose(){owned.clear();retainedBytes=0;},get retainedBytes(){return retainedBytes;},get count(){return owned.size;}};
}
