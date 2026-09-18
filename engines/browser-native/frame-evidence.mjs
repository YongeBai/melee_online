export function distribution(values){const a=[...values].sort((x,y)=>x-y);return {samples:a.length,meanMs:a.reduce((x,y)=>x+y,0)/(a.length||1),p95Ms:a[Math.ceil(a.length*.95)-1]??0,maxMs:a.at(-1)??0};}
export function cadence(times){const gaps=times.slice(1).map((v,i)=>v-times[i]);return {...distribution(gaps),fps:gaps.length?1000*gaps.length/(times.at(-1)-times[0]):0,gapsOver25Ms:gaps.filter(v=>v>25).length,estimatedMissed60HzSlots:gaps.reduce((n,v)=>n+Math.max(0,Math.round(v/(1000/60))-1),0)};}

// captureStream may deliver an automatic initial frame before a request.
// Discard the first sample conservatively, even if it was a real forward draw.
// There is no exact draw-to-capture identity, so loss counts remain estimates.
export function capturedEvidence(rows,requested){
 const measured=rows.slice(1),repeated=measured.slice(1).filter((v,i)=>v.hash===measured[i].hash).length;
 return {requested,rawCaptured:rows.length,bootstrapDiscarded:Math.min(1,rows.length),captured:measured.length,estimatedUnobservedRequests:Math.max(0,requested-measured.length),repeatedSampledImages:repeated,distinctSampledImages:new Set(measured.map(v=>v.hash)).size,blackFrames:measured.filter(v=>!v.nonblackPixels).length,wrongSize:measured.filter(v=>v.width!==960||v.height!==720).length,cadence:cadence(measured.map(v=>v.timestampMs))};
}

// Independent browser canvas-capture frames, not draw counters or monitor
// photons. Downsampling only affects this observer; the game stays 960x720.
// Timestamp cadence and sampled image changes are deliberately separate.
export function observeCanvasFrames(canvas,{enabled=true}={}){
 const rows=[],costs=[];let stopped=false,error=null,requested=0;
 if(!enabled)return {request(){},async stop(){return {enabled:false,physicalPresentationMeasured:false};}};
 if(!globalThis.MediaStreamTrackProcessor)throw Error('Video frame observer unavailable');
 const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
 // Retain a bounded burst while the game thread handles a correction or a
 // long submission. VideoFrame timestamps remain the cadence source, so this
 // queue cannot turn late or missing captures into synthetic 60 Hz evidence.
 const reader=new MediaStreamTrackProcessor({track,maxBufferSize:8}).readable.getReader();
 const worker=new Worker(new URL('./frame-evidence-worker.mjs',import.meta.url),{type:'module'});let drained;
 const drain=new Promise(r=>{drained=r;});worker.onmessage=({data})=>{if(data.row){rows.push(data.row);costs.push(data.cost);}if(data.error)error=data.error;if(data.stopped)drained();};worker.onerror=e=>{error=e.message;drained();};
 const reading=(async()=>{try{while(!stopped){const {done,value:frame}=await reader.read();if(done)break;worker.postMessage({frame,receivedMs:performance.now()},[frame]);}}catch(e){if(!stopped)error=String(e);}})();
 return {request(){requested++;track.requestFrame();},async stop(){
  // Let the final paint/capture reach the reader. Excluded from throughput.
  await new Promise(r=>setTimeout(r,150));stopped=true;await reader.cancel();track.stop();await reading;worker.postMessage({stop:true});await drain;worker.terminate();
  return {enabled:true,...capturedEvidence(rows,requested),observerWorkerCpu:distribution(costs),error,rows,physicalPresentationMeasured:false,scope:'Browser canvas-capture timestamps and 96x72 RGB sample hashes; not compositor scanout, full pixel uniqueness, or input-to-photon.'};
 }};
}
