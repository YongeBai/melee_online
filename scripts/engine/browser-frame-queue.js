// Optional presentation experiment: one frame of buffering absorbs worker
// delivery jitter. This changes presentation latency, never emulation speed.
export class BrowserFrameQueue {
  constructor(present, {schedule = callback => requestAnimationFrame(callback), cancel = id => cancelAnimationFrame(id),
    period = 1000 / 59.94, capacity = 2, rateLimited = true, now = () => performance.now()} = {}) {
    this.present = present;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.period = period;
    if(!Number.isInteger(capacity)||capacity<1||capacity>4)throw Error("Queue capacity must be an integer from 1 to 4");
    this.capacity = capacity;
    if(typeof rateLimited!=="boolean")throw Error("Queue rate limit must be boolean");
    this.rateLimited = rateLimited;
    this.queue = [];
    this.primed = false;
    this.pending = null;
    this.deadline = 0;
    this.closed = false;
    this.stats = {received: 0, presented: 0, dropped: 0, underruns: 0, ageTotalMs:0, ageMaxMs:0, ageHistogram:Array(257).fill(0), maxDepth:0, clockSkips:0, readyClockSkips:0};
  }
  setCapacity(capacity) {
    if(!Number.isInteger(capacity)||capacity<1||capacity>4)throw Error("Queue capacity must be an integer from 1 to 4");
    this.capacity=capacity;
    while(this.queue.length>capacity){this.queue.shift().bitmap.close();this.stats.dropped++;}
  }
  setRateLimited(enabled) {
    if(typeof enabled!=="boolean")throw Error("Queue rate limit must be boolean");
    this.rateLimited=enabled;
    this.primed=false;
    this.deadline=0;
  }
  clear() {
    if (this.pending !== null) this.cancel(this.pending);
    this.pending = null;
    for (const entry of this.queue) entry.bitmap.close();
    this.queue = [];
    this.primed = false;
    this.deadline = 0;
  }
  presentEntry(entry) {
    const age=this.now()-entry.at;
    this.stats.ageHistogram[Math.min(256,Math.max(0,Math.floor(age)))]++;
    this.stats.ageTotalMs+=age;this.stats.ageMaxMs=Math.max(this.stats.ageMaxMs,age);
    this.present(entry.bitmap);
    this.stats.presented++;
  }
  push(bitmap) {
    if (this.closed) { bitmap.close(); return; }
    this.stats.received++;
    if (this.queue.length >= this.capacity) {
      this.queue.shift().bitmap.close();
      this.stats.dropped++;
    }
    const entry={bitmap,at:this.now()};
    this.queue.push(entry);
    this.stats.maxDepth=Math.max(this.stats.maxDepth,this.queue.length);
    this.arm();
  }
  arm() {
    if (this.pending === null && !this.closed)
      this.pending = this.schedule(at => this.tick(at));
  }
  tick(at) {
    this.pending = null;
    if (this.closed) return;
    // A capacity-one queue is a latest-frame latch: it aligns delivery to
    // browser paint without intentionally storing a full extra frame.
    if (!this.primed && this.queue.length >= Math.min(2, this.capacity)) {
      this.primed = true;
      this.deadline = at;
    }
    const due = !this.rateLimited || at >= this.deadline - 1;
    if(this.primed && !due){this.stats.clockSkips++;if(this.queue.length)this.stats.readyClockSkips++;}
    if (this.primed && due) {
      if (this.queue.length) {
        // present takes ownership, including closing the bitmap.
        this.presentEntry(this.queue.shift());
      } else {
        this.stats.underruns++;
        // Stay primed: resume the next real image without another two-frame wait.
      }
      if(this.rateLimited){
        this.deadline += this.period;
        if (this.deadline < at - this.period) this.deadline = at + this.period;
      }
    }
    if (this.primed || this.queue.length) this.arm();
  }
  close() {
    this.closed = true;
    this.clear();
  }
}

// One-ms upper bounds; final bin is explicitly reported as overflow.
export function summarizeQueueInterval(start,end) {
 const count=end.presented-start.presented;
 const histogram=end.ageHistogram.map((n,i)=>n-start.ageHistogram[i]);
 if(count<0||histogram.some(n=>n<0)||histogram.reduce((a,b)=>a+b,0)!==count)throw Error('Queue counters reset during capture');
 const percentile=p=>{if(!count)return null;let seen=0;for(let i=0;i<histogram.length;i++){seen+=histogram[i];if(seen>=Math.ceil(count*p))return i===256?null:i+1;}return null;};
 return {received:end.received-start.received,presented:count,dropped:end.dropped-start.dropped,underruns:end.underruns-start.underruns,
  meanAgeMs:count?(end.ageTotalMs-start.ageTotalMs)/count:0,p50AgeUpperMs:percentile(.5),p95AgeUpperMs:percentile(.95),p99AgeUpperMs:percentile(.99),ageOverflow256Ms:histogram[256],
  clockSkips:end.clockSkips-start.clockSkips,readyClockSkips:end.readyClockSkips-start.readyClockSkips};
}
