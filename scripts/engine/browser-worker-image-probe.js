// Snapshot the displayed canvas on RAF, then inspect that immutable image in
// a worker. This is a QA observer, not the emulator or its presentation path.
export class WorkerCanvasImageProbe {
  constructor({width=32,height=24,capacity=8,createWorker=()=>new Worker(new URL('./browser-image-probe-worker.js',import.meta.url),{type:'module'}),snapshot=source=>createImageBitmap(source),now=()=>performance.now()}={}) {
    Object.assign(this,{width,height,capacity,snapshot,now,pending:[],captureCount:0,maxPending:0,closed:false,failure:null,nextId:0});
    this.worker=createWorker();
    this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
    this.readyTimer=setTimeout(()=>{this.failure=Error('Worker image verifier initialization timed out');this.readyReject(this.failure);},10000);
    this.worker.onmessage=event=>{
      if(this.closed)return;
      const message=event.data;
      if(message?.ready){clearTimeout(this.readyTimer);this.readyResolve();return;}
      if(message?.error){this.failure=Error('Worker image verifier: '+message.error);clearTimeout(this.readyTimer);this.readyReject(this.failure);return;}
      const item=this.pending.find(p=>p.id===message?.id);
      if(!item||item.result){this.failure=Error('Worker image verifier returned an unknown or duplicate sample');return;}
      if(!Number.isInteger(message.hash)||typeof message.nonblack!=='boolean'){
        this.failure=Error('Worker image verifier returned an invalid pixel result');return;
      }
      item.result={...message,...item.metadata,snapshotMs:item.snapshotMs,completionDelayMs:this.now()-item.enqueuedAt};
    };
    this.worker.onerror=event=>{this.failure=Error('Worker image verifier failed: '+event.message);clearTimeout(this.readyTimer);this.readyReject(this.failure);};
    this.worker.postMessage({type:'init',width,height,capacity});
  }
  capture(source,metadata={}) {
    if(this.closed)throw Error('Worker image verifier is closed');
    if(this.failure)throw this.failure;
    if(this.pending.length>=this.capacity)throw Error('Worker image verifier overflow; samples cannot be discarded');
    const item={id:++this.nextId,metadata,enqueuedAt:this.now()};
    this.pending.push(item);this.captureCount++;this.maxPending=Math.max(this.maxPending,this.pending.length);
    // createImageBitmap captures the source at invocation. Its promise may
    // resolve out of order; the main-side queue still returns capture order.
    let snapshotPromise;
    try{snapshotPromise=this.snapshot(source);}
    catch(error){this.failure=error;throw error;}
    Promise.resolve(snapshotPromise).then(bitmap=>{
      item.snapshotMs=this.now()-item.enqueuedAt;
      if(this.closed){bitmap.close();return;}
      try{this.worker.postMessage({type:'capture',id:item.id,bitmap},[bitmap]);}
      catch(error){bitmap.close();throw error;}
    }).catch(error=>{if(!this.closed)this.failure=error;});
  }
  poll() {
    if(this.failure)throw this.failure;
    const ready=[];
    while(this.pending[0]?.result)ready.push(this.pending.shift().result);
    return ready;
  }
  reset() {
    if(this.closed||this.failure)throw this.failure||Error('Worker image verifier is closed');
    if(this.pending.length)throw Error('Cannot reuse an image verifier with outstanding samples');
    this.captureCount=0;this.maxPending=0;
  }
  diagnostics() {
    return {worker:true,captures:this.captureCount,pending:this.pending.length,maxPending:this.maxPending,
      oldestPendingMs:this.pending.length?this.now()-this.pending[0].enqueuedAt:0,error:this.failure?.message};
  }
  dispose() {
    this.closed=true;clearTimeout(this.readyTimer);this.worker.terminate();this.pending=[];
  }
}
