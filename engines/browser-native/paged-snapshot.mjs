import {subscribeDirtyPages} from './dirty-runtime.mjs';
import {createSnapshotPageKernel} from './snapshot-page-kernel.mjs';
// Exact page sharing, not probabilistic hashes or inferred dirty regions. Every
// linear-memory word is covered, including unused bytes. Optional audited dirty
// subscriptions skip only provably unchanged pages; the full path remains a control.
const pageBytes=65536,encoder=new TextEncoder();
function sameWords(a,start,b){
  let j=0;
  for(;j+7<b.length;j+=8){
    const i=start+j;
    if(a[i]!==b[j]||a[i+1]!==b[j+1]||a[i+2]!==b[j+2]||a[i+3]!==b[j+3]||
       a[i+4]!==b[j+4]||a[i+5]!==b[j+5]||a[i+6]!==b[j+6]||a[i+7]!==b[j+7])return false;
  }
  for(;j<b.length;j++)if(a[start+j]!==b[j])return false;
  return true;
}

export function createPagedWasmCheckpointStore({module,instance,audit,dirty=null,sparse=false,auditSparse=false,onTiming=()=>{},health={aborted:false},host={capture:()=>null,restore:()=>{}},maxBytes=1024**3}){
  const owned=new Map(),table=instance.exports.__indirect_function_table;
  const entries=Array.from({length:table.length},(_,i)=>table.get(i)),globals=audit.globals.map(g=>instance.exports[g.name]);
  if(globals.some(g=>!(g instanceof WebAssembly.Global)))throw Error('Snapshot globals not exported');
  let kernel=createSnapshotPageKernel(instance.exports.memory),closed=false;
  const backend=kernel?'wasm-simd-multimemory':'javascript',free=[];let slots=1;
  const zeroBytes=new Uint8Array(pageBytes),zero={offset:0,bytes:zeroBytes,words:new Uint32Array(zeroBytes.buffer),refs:0};
  if(sparse&&typeof module.__dirtyMark!=='function')throw Error('Sparse restore requires audited host marking');
  const subscription=sparse?subscribeDirtyPages({module,instance,audit,dirty},'checkpoint'):null;
  let retainedBytes=0,last=null,liveBase=null;
  const dirtyPage=(marks,index)=>{for(let p=index*16;p<(index+1)*16;p++)if(marks[p])return true;return false;};
  const bytesOf=p=>kernel?new Uint8Array(kernel.memory.buffer,p.offset,pageBytes):p.bytes;
  const same=(p,offset,words)=>kernel?kernel.equal(offset,p.offset):sameWords(words,offset/4,p.words);
  function allocate(heap,offset){
    if(!kernel){const bytes=heap.slice(offset,offset+pageBytes);return {bytes,words:new Uint32Array(bytes.buffer),refs:0};}
    const slot=free.length?free.pop():slots++;
    try{
      const end=(slot+1)*pageBytes;if(end>32768*pageBytes)throw Error('Snapshot page pool exhausted');
      if(end>kernel.memory.buffer.byteLength){const current=kernel.memory.buffer.byteLength/pageBytes;kernel.memory.grow(Math.min(32768-current,Math.ceil((slot+1-current)/64)*64));}
      const p={offset:slot*pageBytes,refs:0};kernel.copyOut(p.offset,offset);return p;
    }catch(error){free.push(slot);throw error;}
  }
  function retire(p){if(kernel&&p!==zero)free.push(p.offset/pageBytes);}
  const metrics={captures:0,restores:0,capturedBytes:0,restoredBytes:0,comparedBytes:0,sharedPages:0,guardCpuMs:0,captureCpuMs:0,restoreCpuMs:0,maxCaptureCpuMs:0,maxRestoreCpuMs:0,peakRetainedBytes:0,sparse,sparseSkippedCapturePages:0,sparseSkippedRestorePages:0,captureAudits:0,restoreAudits:0,restoreCopyCpuMs:0};
  function guard(){
    const start=performance.now();
    if(closed)throw Error('Checkpoint store disposed');
    if(health.aborted)throw Error('Aborted runtime cannot be restored');
    if(module.onNativeDraw||module.onNativeImmediate||module.onNativeObject)throw Error('Snapshot requires detached renderer');
    if(table.length!==entries.length||entries.some((e,i)=>table.get(i)!==e))throw Error('Snapshot function table changed');
    if(instance.exports.memory.buffer!==module.HEAPU8.buffer)throw Error('Stale snapshot memory view');
    metrics.guardCpuMs+=performance.now()-start;
  }
  function row(key){const r=owned.get(key);if(!r)throw Error('Unknown or released checkpoint');return r;}
  function capture(){
    const began=performance.now();guard();
    const heap=module.HEAPU8,words=new Uint32Array(heap.buffer),previous=liveBase??owned.get(last),pages=[],marks=subscription?.read();
    let compared=0,skipped=0;
    let added=0,shared=0,r;const created=new Set();
    try{
    for(let offset=0,index=0;offset<heap.length;offset+=pageBytes,index++){
      const old=previous?.pages[index];
      if(subscription&&liveBase&&old&&!dirtyPage(marks,index)){pages.push(old);shared++;skipped++;}
      else if(old&&(compared+=pageBytes,same(old,offset,words))){pages.push(old);shared++;}
      else{
        const size=Math.min(pageBytes,heap.length-offset);
        if((compared+=pageBytes,same(zero,offset,words))){
          pages.push(zero);shared++;
          if(!zero.refs&&!created.has(zero)){
            if(retainedBytes+added+size>maxBytes)throw Error('Snapshot memory budget exceeded');
            created.add(zero);added+=size;
          }
        }else{
          if(retainedBytes+added+size>maxBytes)throw Error('Snapshot memory budget exceeded');
          const p=allocate(heap,offset);pages.push(p);created.add(p);added+=size;
        }
      }
    }
    if(auditSparse){for(let i=0;i<pages.length;i++)if(!same(pages[i],i*pageBytes,words))throw Error('Untracked checkpoint capture write at page '+i);metrics.captureAudits++;}
    r={pages,size:heap.length,globals:globals.map(g=>g.value),host:structuredClone(host.capture())};
    }catch(error){for(const p of created)retire(p);throw error;}
    for(const p of pages)p.refs++;
    const key=Object.freeze({byteLength:heap.length});owned.set(key,r);last=key;liveBase=r;subscription?.clear();retainedBytes+=added;
    const ms=performance.now()-began;metrics.captures++;metrics.capturedBytes+=added;metrics.comparedBytes+=compared;metrics.sparseSkippedCapturePages+=skipped;metrics.sharedPages+=shared;
    metrics.captureCpuMs+=ms;metrics.maxCaptureCpuMs=Math.max(metrics.maxCaptureCpuMs,ms);metrics.peakRetainedBytes=Math.max(metrics.peakRetainedBytes,retainedBytes);
    onTiming({phase:"capture",ms,comparedBytes:compared,addedBytes:added,skippedPages:skipped});return key;
  }
  function restore(key){
    const began=performance.now();guard();const r=row(key),heap=module.HEAPU8;
    if(heap.length!==r.size)throw Error('Memory growth across checkpoint is unsupported');
    const marks=subscription?.read(),selected=[];const selectionStart=performance.now();
    for(let i=0;i<r.pages.length;i++)if(!subscription||!liveBase||liveBase.pages[i]!==r.pages[i]||dirtyPage(marks,i))selected.push(i);
    const selectionMs=performance.now()-selectionStart;metrics.sparseSkippedRestorePages+=r.pages.length-selected.length;
    const hostStart=performance.now();host.restore(structuredClone(r.host));globals.forEach((g,i)=>g.value=r.globals[i]);const hostMs=performance.now()-hostStart;
    let copied=0;const copyStart=performance.now();
    for(let j=0;j<selected.length;j++){
      const i=selected[j],p=r.pages[i],offset=i*pageBytes;let size=pageBytes;
      if(kernel){
        while(j+1<selected.length&&selected[j+1]===i+size/pageBytes&&(p===zero?r.pages[selected[j+1]]===zero:r.pages[selected[j+1]]!==zero&&r.pages[selected[j+1]].offset===p.offset+size)){j++;size+=pageBytes;}
        module.__dirtyMark?.(offset,size);if(p===zero)kernel.clearRange(offset,size);else kernel.copyRange(offset,p.offset,size);
      }else{module.__dirtyMark?.(offset,size);if(p===zero)heap.fill(0,offset,offset+size);else heap.set(p.bytes,offset);}
      copied+=size;
    }
    const copyMs=performance.now()-copyStart;
    if(auditSparse){const words=new Uint32Array(heap.buffer);for(let i=0;i<r.pages.length;i++)if(!same(r.pages[i],i*pageBytes,words))throw Error('Sparse restore differs from full restore at page '+i);metrics.restoreAudits++;}
    // Broadcast restore writes to presentation, then establish this checkpoint as
    // the new live baseline. Do not clear another consumer's pending marks.
    if(subscription){subscription.read();subscription.clear();}liveBase=r;last=key;
    const ms=performance.now()-began;metrics.restores++;metrics.restoredBytes+=copied;metrics.restoreCopyCpuMs+=copyMs;
    metrics.restoreCpuMs+=ms;metrics.maxRestoreCpuMs=Math.max(metrics.maxRestoreCpuMs,ms);
    onTiming({phase:'restore',ms,copyMs,selectionMs,hostMs,copiedBytes:copied,selectedPages:selected.length});
  }
  function release(key){
    const r=owned.get(key);if(!r)return;
    for(const p of r.pages)if(--p.refs===0){retainedBytes-=pageBytes;retire(p);}
    owned.delete(key);if(liveBase===r)liveBase=null;if(last===key)last=[...owned.keys()].at(-1)??null;
  }
  async function hash(key){
    const r=row(key),bytes=new Uint8Array(r.size);r.pages.forEach((p,i)=>bytes.set(bytesOf(p),i*pageBytes));
    const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
    const memorySha256=hex(await crypto.subtle.digest('SHA-256',bytes));
    const stateSha256=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify({wasmSha256:audit.wasmSha256??null,memorySha256,globals:r.globals,host:r.host}))));
    return {stateSha256,memorySha256,bytes:r.size,globals:[...r.globals]};
  }
  function compare(a,b){
    const x=row(a),y=row(b);if(x.size!==y.size)throw Error('Snapshot sizes differ');
    let changedBytes=0;const pages=[];
    for(let i=0;i<x.pages.length;i++)if(x.pages[i]!==y.pages[i]){
      let bytes=0;const left=bytesOf(x.pages[i]),right=bytesOf(y.pages[i]);
      for(let j=0;j<left.length;j++)bytes+=left[j]!==right[j];
      if(bytes)pages.push({offset:i*pageBytes,bytes});changedBytes+=bytes;
    }
    return {changedBytes,pages,globalsChanged:x.globals.map((v,i)=>v!==y.globals[i]),hostChanged:JSON.stringify(x.host)!==JSON.stringify(y.host)};
  }
  return {capture,restore,release,hash,compare,metrics:()=>({...metrics,retainedBytes,count:owned.size,backend,storageAllocatedBytes:kernel?.memory.buffer.byteLength??retainedBytes}),dispose(){closed=true;subscription?.dispose();owned.clear();last=null;liveBase=null;retainedBytes=0;kernel=null;free.length=0;},get retainedBytes(){return retainedBytes;},get count(){return owned.size;}};
}
