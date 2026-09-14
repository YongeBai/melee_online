// Diagnostic comparison only. This never replaces or changes raw state equality.
// Native snapshots are already ordered by time and then FIFO insertion order.
export function compareSavedEventQueues(a,b){
  const inspect=s=>{
    if(!s||typeof s.globalTimer!=='string'||typeof s.idleCycles!=='string'||typeof s.nextOrder!=='string'||!Array.isArray(s.events)||!s.ordersValid)throw Error('Saved event diagnostics unavailable or invalid');
    const integer=x=>{if(typeof x!=='string'||! /^-?\d+$/.test(x))throw Error('Non-exact event integer');return BigInt(x);};
    integer(s.globalTimer);integer(s.idleCycles);const next=integer(s.nextOrder);
    let previous,orders=new Set();
    for(const e of s.events){
      const time=integer(e.time),order=integer(e.order),userdata=integer(e.userdata);
      if(typeof e.name!=='string'||order<0n||order>=next||userdata<0n||orders.has(e.order))throw Error('Invalid event ordering');
      if(previous&&(time<previous.time||time===previous.time&&order<=previous.order))throw Error('Events are not in execution order');
      orders.add(e.order);previous={time,order};
    }
    return s.events.map(({time,name,userdata})=>({time,name,userdata}));
  };
  const eventsA=inspect(a),eventsB=inspect(b);
  return {logicalQueueEqual:a.globalTimer===b.globalTimer&&JSON.stringify(eventsA)===JSON.stringify(eventsB),
    rawOrderCounterEqual:a.nextOrder===b.nextOrder,rawIdleCounterEqual:a.idleCycles===b.idleCycles,
    eventsA,eventsB,scope:'Same saved global tick and execution-ordered event times, types and payloads. Valid insertion ordinals may differ. Diagnostic only; raw full-state equality is unchanged.'};
}
