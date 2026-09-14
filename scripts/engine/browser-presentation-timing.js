// Optional QA timestamps. These measure JS stages, not physical scanout.
export function timingDistribution(values) {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  return {count:sorted.length,min:sorted[0],mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,
    p50:sorted[Math.floor((sorted.length-1)*.5)],p95:sorted[Math.floor((sorted.length-1)*.95)],max:sorted.at(-1)};
}
export class BrowserPresentationTiming {
  constructor(){this.active=false;this.frames=[];this.receipts=[];this.samples=[];this.pending=new WeakMap();}
  begin(){this.frames=[];this.receipts=[];this.samples=[];this.pending=new WeakMap();this.active=true;}
  receive(bitmap,timing,at){
    if(this.active&&timing){
      const receipt={...timing,receivedAt:at};this.pending.set(bitmap,receipt);
      // Keep timestamps even when the bounded presentation queue drops an
      // image. Retain no bitmap reference and bound diagnostic memory usage.
      if(this.receipts.length<8000)this.receipts.push(receipt);
    }
  }
  present(bitmap,start,end){
    if(!this.active||this.frames.length>=8000)return;
    this.frames.push({...this.pending.get(bitmap),presentStartAt:start,presentEndAt:end});
    this.pending.delete(bitmap);
  }
  sample(at,count,hash,drawMs=0,readMs=0){if(this.active&&this.samples.length<8000)this.samples.push({at,count,hash,drawMs,readMs});}
  finish(){
    this.active=false;
    const intervals=(rows,key)=>rows.slice(1).map((r,i)=>r[key]-rows[i][key]);
    const timed=this.frames.filter(f=>Number.isFinite(f.exportStartAt)&&Number.isFinite(f.exportEndAt)&&Number.isFinite(f.forwardedAt)&&Number.isFinite(f.receivedAt));
    const receipts=this.receipts.filter(f=>['exportStartAt','exportEndAt','forwardedAt','receivedAt'].every(k=>Number.isFinite(f[k])));
    const transportRows=receipts.map((f,i)=>({sequence:f.sequence,
      exportMs:f.exportEndAt-f.exportStartAt,gpuToForwarderMs:f.forwardedAt-f.exportEndAt,
      forwarderToMainMs:f.receivedAt-f.forwardedAt,exportToMainMs:f.receivedAt-f.exportEndAt,
      exportGapMs:i?f.exportEndAt-receipts[i-1].exportEndAt:null,
      receiptGapMs:i?f.receivedAt-receipts[i-1].receivedAt:null}));
    let noSubmissionIntervals=0,multiSubmissionIntervals=0,extraSubmissionsWithinInterval=0,unchangedImagesWithSubmissions=0;
    for(let i=1;i<this.samples.length;i++){
      const a=this.samples[i-1],b=this.samples[i],delta=b.count-a.count;
      if(delta===0)noSubmissionIntervals++;
      if(delta>1){multiSubmissionIntervals++;extraSubmissionsWithinInterval+=delta-1;}
      if(delta>0&&b.hash!==undefined&&b.hash===a.hash)unchangedImagesWithSubmissions++;
    }
    return {diagnosticOnly:true,warning:'JavaScript stage timestamps; GPU completion and physical scanout are not measured.',
      frames:this.frames.length,timedFrames:timed.length,samples:this.samples.length,
      receiptTiming:{count:receipts.length,includesQueueDroppedImages:true,
        exportIntervalMs:timingDistribution(intervals(receipts,'exportEndAt')),
        forwardedIntervalMs:timingDistribution(intervals(receipts,'forwardedAt')),
        receivedIntervalMs:timingDistribution(intervals(receipts,'receivedAt')),
        exportToMainMs:timingDistribution(transportRows.map(f=>f.exportToMainMs)),
        closeArrivalPairs:transportRows.filter(f=>f.receiptGapMs!==null&&f.receiptGapMs<4).length,
        slowestTransport:transportRows.toSorted((a,b)=>b.exportToMainMs-a.exportToMainMs).slice(0,12),
        widestExportGaps:transportRows.filter(f=>f.exportGapMs!==null).toSorted((a,b)=>b.exportGapMs-a.exportGapMs).slice(0,12)},
      exportDurationMs:timingDistribution(timed.map(f=>f.exportEndAt-f.exportStartAt)),
      exportIntervalMs:timingDistribution(intervals(timed,'exportEndAt')),
      gpuWorkerToForwarderMs:timingDistribution(timed.map(f=>f.forwardedAt-f.exportEndAt)),
      forwarderToMainMs:timingDistribution(timed.map(f=>f.receivedAt-f.forwardedAt)),
      exportToPresentMs:timingDistribution(timed.map(f=>f.presentEndAt-f.exportEndAt)),
      receiveToPresentMs:timingDistribution(timed.map(f=>f.presentEndAt-f.receivedAt)),
      canvasTransferMs:timingDistribution(this.frames.map(f=>f.presentEndAt-f.presentStartAt)),
      canvasIntervalMs:timingDistribution(intervals(this.frames,'presentEndAt')),
      probeDrawMs:timingDistribution(this.samples.map(s=>s.drawMs)),probeReadMs:timingDistribution(this.samples.map(s=>s.readMs)),
      noSubmissionIntervals,multiSubmissionIntervals,extraSubmissionsWithinInterval,unchangedImagesWithSubmissions,
      bitmapSequenceGaps:timed.slice(1).reduce((n,f,i)=>n+Math.max(0,f.sequence-timed[i].sequence-1),0)};
  }
}
