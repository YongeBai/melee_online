// QA analysis only. Named guest functions aggregate sampled last-committed PCs;
// this remains wall residency, not exact host CPU time or instruction cost.
export function aggregateGuestFunctions(locations,functions,total){
 const counts=new Map();let unmapped=0;
 for(const {pc,count} of locations){
  const address=Number(pc);let low=0,high=functions.length;
  while(low<high){const mid=(low+high)>>>1;if(functions[mid].start<=address)low=mid+1;else high=mid;}
  const fn=functions[low-1];
  if(!fn||address>=fn.start+fn.size){unmapped+=count;continue;}
  const entry=counts.get(fn.start)||{name:fn.name,start:'0x'+fn.start.toString(16),size:fn.size,count:0};entry.count+=count;counts.set(fn.start,entry);
 }
 return {unmapped,functions:[...counts.values()].sort((a,b)=>b.count-a.count).map(f=>({...f,fraction:total?f.count/total:0}))};
}
