export function distribution(values){const a=[...values].sort((x,y)=>x-y);return {samples:a.length,meanMs:a.reduce((x,y)=>x+y,0)/(a.length||1),p95Ms:a[Math.ceil(a.length*.95)-1]??0,maxMs:a.at(-1)??0};}
export function cadence(times){const gaps=times.slice(1).map((v,i)=>v-times[i]);return {...distribution(gaps),fps:gaps.length?1000*gaps.length/(times.at(-1)-times[0]):0,gapsOver25Ms:gaps.filter(v=>v>25).length,estimatedMissed60HzSlots:gaps.reduce((n,v)=>n+Math.max(0,Math.round(v/(1000/60))-1),0)};}

// captureStream may deliver an automatic initial frame before a request.
// Discard the first sample conservatively, even if it was a real forward draw.
// There is no exact draw-to-capture identity, so loss counts remain estimates.
export function capturedEvidence(rows,requested,{discardBootstrap=true}={}){
 const offset=discardBootstrap?Math.min(1,rows.length):0,measured=rows.slice(offset),repeated=measured.slice(1).filter((v,i)=>v.hash===measured[i].hash).length;
 return {requested,rawCaptured:rows.length,bootstrapDiscarded:offset,captured:measured.length,estimatedUnobservedRequests:Math.max(0,requested-measured.length),repeatedSampledImages:repeated,distinctSampledImages:new Set(measured.map(v=>v.hash)).size,blackFrames:measured.filter(v=>!v.nonblackPixels).length,wrongSize:measured.filter(v=>v.width!==960||v.height!==720).length,cadence:cadence(measured.map(v=>v.timestampMs))};
}

// Independent browser VideoFrame snapshots, not draw counters or monitor
// photons. Downsampling only affects this observer; the game stays 960x720.
// Timestamp cadence and sampled image changes are deliberately separate.
export function observeCanvasFrames(canvas,{enabled=true}={}){
 const rows=[],costs=[];let stopped=false,error=null,requested=0,warmed=false,warmupCaptured=0,warmResolve=null;
 if(!enabled)return {async start(){},request(){},async stop(){return {enabled:false,physicalPresentationMeasured:false};}};
 if(!globalThis.VideoFrame)throw Error('Video frame observer unavailable');
 const worker=new Worker(new URL('./frame-evidence-worker.mjs',import.meta.url),{type:'module'});let drained;
 const drain=new Promise(r=>{drained=r;});worker.onmessage=({data})=>{if(data.row){rows.push(data.row);costs.push(data.cost);warmResolve?.();warmResolve=null;}if(data.error){error=data.error;warmResolve?.();warmResolve=null;}if(data.stopped)drained();};worker.onerror=e=>{error=e.message;warmResolve?.();warmResolve=null;drained();};
 function capture(count){if(stopped)throw Error('Canvas observer stopped');const now=performance.now(),frame=new VideoFrame(canvas,{timestamp:Math.round(now*1000)});if(count)requested++;worker.postMessage({frame,receivedMs:now},[frame]);}
 return {async start(){
  if(warmed)return;const first=new Promise(resolve=>{warmResolve=resolve;});capture(false);await Promise.race([first,new Promise((_,reject)=>setTimeout(()=>reject(Error('Canvas observer warmup timed out')),2000))]);
  if(error)throw Error(error);warmupCaptured=rows.length;rows.length=0;costs.length=0;warmed=true;
 },request(){capture(true);},async stop(){
  // Drain every constructed frame before terminating the worker. This wait is
  // outside throughput and never requests or synthesizes an additional frame.
  const deadline=performance.now()+1000;while(rows.length<requested&&!error&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));
  stopped=true;worker.postMessage({stop:true});await drain;worker.terminate();
  return {enabled:true,mode:'direct-canvas-video-frame',sampleRegion:rows.every(row=>row.sampleRegion==='full-frame-downsample')?'full-frame-downsample':null,...capturedEvidence(rows,requested,{discardBootstrap:false}),warmupCaptured,observerWorkerCpu:distribution(costs),error,rows,physicalPresentationMeasured:false,scope:'Post-draw 960x720 browser VideoFrame(canvas) timestamps and full-frame 96x72 RGB sample hashes; not compositor scanout, media-track delivery, full pixel uniqueness, or input-to-photon.'};
 }};
}
