// Transport-independent two-player rollback timeline. The adapter must execute
// exactly one game logic frame and suppress video/audio during replay. This is
// not enabled in live games until the browser adapter satisfies that contract.
const fields = ['mask','stickX','stickY','cStickX','cStickY','triggerLeft','triggerRight','analogA','analogB'];
export const neutralBrowserPad = () => Object.fromEntries(fields.map((field,i)=>[field,i>0&&i<5?128:0]));
function validatePad(pad) {
  const result={};
  for(const field of fields) {
    const value=pad?.[field];
    if(!Number.isInteger(value)||value<0||value>(field==='mask'?0xfffff:255)) throw Error('Invalid pad: '+field);
    result[field]=value;
  }
  return Object.freeze(result);
}
const equalPad=(a,b)=>fields.every(field=>a[field]===b[field]);
export class BrowserRollbackTimeline {
  constructor(adapter,{localPort=0,window=12,checkpointInterval=4,futureAllowance=8,checkpointPolicy='periodic'}={}) {
    if(![0,1].includes(localPort)||!Number.isInteger(window)||window<1||window>20||
       !Number.isInteger(checkpointInterval)||checkpointInterval<1||checkpointInterval>window||
       Math.ceil(window/checkpointInterval)+2>6||!Number.isInteger(futureAllowance)||futureAllowance<0||futureAllowance>60||
       !['periodic','prediction'].includes(checkpointPolicy))
      throw Error('Invalid rollback configuration');
    for(const method of ['capture','restore','advance','suppress'])
      if(typeof adapter?.[method]!=='function') throw Error('Missing rollback adapter method: '+method);
    this.adapter=adapter;this.localPort=localPort;this.window=window;
    this.interval=checkpointInterval;this.futureAllowance=futureAllowance;this.checkpointPolicy=checkpointPolicy;
    this.slots=Math.ceil(window/checkpointInterval)+2;
    this.frame=0;this.confirmed=[-1,-1];this.events=[new Map(),new Map()];
    this.pending=[new Map(),new Map()];this.used=new Map();this.checkpoints=new Map();
    this.busy=false;this.failed=null;
    this.stats={rollbacks:0,resimulatedFrames:0,maxDepth:0,stalls:0};
  }
  input(port,frame,pad) {
    if(this.failed) throw this.failed;
    if(![0,1].includes(port)||!Number.isSafeInteger(frame)||frame<0||frame>0xffffffff) throw Error('Invalid input frame');
    if(frame<this.frame-this.window) throw Error('Input outside rollback window');
    if(frame>this.frame+this.futureAllowance) throw Error('Input too far in future');
    const next=validatePad(pad),previous=this.pending[port].get(frame)||this.events[port].get(frame);
    if(previous&&!equalPad(previous,next)) throw Error('Conflicting input for an immutable frame');
    this.pending[port].set(frame,next);
  }
  flushInputs() {
    // Network arrivals during async machine calls remain pending until the next
    // transaction, so they cannot invalidate a checkpoint while it is written.
    for(let port=0;port<2;port++) {
      for(const [frame,pad] of this.pending[port]) this.events[port].set(frame,pad);
      this.pending[port].clear();
      while(this.events[port].has(this.confirmed[port]+1)) this.confirmed[port]++;
    }
  }
  padAt(port,frame) {
    let at=-1,pad=neutralBrowserPad();
    for(const [f,p] of this.events[port]) if(f<=frame&&f>at){at=f;pad=p;}
    return pad;
  }
  checkpointAt(frame) {
    let found=null;
    for(const [slot,at] of this.checkpoints)
      if(at<=frame&&(!found||at>found.frame))found={slot,frame:at};
    return found;
  }
  async simulate(frame,replay,save=true) {
    const previous=this.checkpointAt(frame);
    const predicting=this.events.some(events=>!events.has(frame));
    const needed=this.checkpointPolicy==='periodic'?frame%this.interval===0:
      predicting&&(!previous||frame-previous.frame>=this.interval);
    if(save&&needed) {
      // Irregular prediction starts cannot use frame/interval as a ring index.
      // Reuse an unoccupied slot, otherwise the oldest retained checkpoint.
      let slot=0;
      while(slot<this.slots&&this.checkpoints.has(slot))slot++;
      if(slot===this.slots) {
        const oldest=[...this.checkpoints].sort((a,b)=>a[1]-b[1])[0];
        const anchor=this.checkpointAt(Math.max(0,frame-this.window));
        if(!anchor||oldest[1]>=anchor.frame)throw Error('Checkpoint ring would evict required history');
        slot=oldest[0];
      }
      await this.adapter.capture(slot);
      this.checkpoints.set(slot,frame);
    }
    const pads=[this.padAt(0,frame),this.padAt(1,frame)];
    const result=await this.adapter.advance(frame,pads,{replay});
    this.used.set(frame,pads);
    return result;
  }
  async advance() {
    if(this.failed) throw this.failed;
    if(this.busy) throw Error('Concurrent rollback advance');
    this.busy=true;
    try {
      this.flushInputs();
      let dirty=null;
      for(const [frame,pads] of this.used) {
        if(pads.some((pad,port)=>!equalPad(pad,this.padAt(port,frame)))) dirty=Math.min(dirty??frame,frame);
      }
      if(dirty!==null) {
        const checkpoint=this.checkpointAt(dirty);
        if(!checkpoint) throw Error('Required checkpoint unavailable');
        const {frame:from,slot}=checkpoint;
        await this.adapter.suppress(true);
        try {
          await this.adapter.restore(slot);
          // Later snapshots contain superseded predicted inputs. Rebuild only
          // those still needed while replaying the corrected history.
          for(const [savedSlot,at] of this.checkpoints)if(at>from)this.checkpoints.delete(savedSlot);
          for(let f=from;f<this.frame;f++) {
            await this.simulate(f,true,f!==from);
            this.stats.resimulatedFrames++;
          }
          this.stats.rollbacks++;
          this.stats.maxDepth=Math.max(this.stats.maxDepth,this.frame-from);
        } finally {await this.adapter.suppress(false);}
      }
      if(!this.events[this.localPort].has(this.frame)||
         this.frame>this.confirmed[1-this.localPort]+this.window) {
        this.stats.stalls++;
        return {advanced:false,frame:this.frame};
      }
      const result=await this.simulate(this.frame,false);
      this.frame++;
      this.prune();
      return {advanced:true,frame:this.frame,result};
    } catch(error) {
      // Machine state after a failed capture/step is unknown. Fail closed;
      // continuing would silently turn a recoverable connection into a desync.
      this.failed=error;throw error;
    } finally {this.busy=false;}
  }
  prune() {
    const boundary=Math.max(0,this.frame-this.window);
    let earliestPrediction=null;
    if(this.checkpointPolicy==='prediction') {
      for(const frame of this.used.keys())if(frame>=boundary&&this.events.some(events=>!events.has(frame)))
        earliestPrediction=Math.min(earliestPrediction??frame,frame);
    }
    const anchor=this.checkpointPolicy==='periodic'?this.checkpointAt(boundary):
      earliestPrediction===null?null:this.checkpointAt(earliestPrediction);
    const oldest=anchor?.frame??boundary;
    for(const [slot,frame] of this.checkpoints)if(frame<oldest)this.checkpoints.delete(slot);
    for(const frame of this.used.keys()) if(frame<oldest) this.used.delete(frame);
    for(const events of this.events) {
      let anchor=-1;
      for(const frame of events.keys()) if(frame<oldest) anchor=Math.max(anchor,frame);
      for(const frame of events.keys()) if(frame<oldest&&frame!==anchor) events.delete(frame);
    }
  }
}
