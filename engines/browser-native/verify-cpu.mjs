const f=Math.fround;
export function verifyCpu(module,converted,pointer) {
  const cpu=converted.cpu,root=pointer(22),base=root-cpu.root,scratch=module._malloc(256);
  let scripts=0,bytes=0,choices=0;
  try {
    for(const script of cpu.scripts)if(script.start!==null) {
      const size=module._portCpuScript(root,script.index,scratch);
      if(size!==script.bytes.length)throw Error('Original CPU script copy length mismatch');
      for(let i=0;i<size;i++)if(module.HEAPU8[scratch+i]!==script.bytes[i])throw Error('Original CPU script parameter mismatch');scripts++;bytes+=size;
    }
    for(const at of cpu.words) {
      const original=converted.archive.data.getUint32(at),expected=cpu.pointers.has(at)?base+original:original;
      if(new DataView(module.HEAPU8.buffer).getUint32(base+at,true)!==expected)throw Error('CPU table scalar or pointer mismatch');
    }
    let seed=0x7abc1234;
    // This is the projectile-selection table consumed by ftCo_800B6208. Other
    // lists use contextual scoring and are not passed to the wrong consumer.
    for(const at of cpu.tables[2])for(let trial=0;trial<256;trial++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const random=(((Math.imul(seed,214013)+2531011)>>>0)>>>16)/65536;
      const entries=cpu.lists.get(at).entries;let sum=0,expected=0;
      for(const e of entries)sum=f(sum+e.weight);
      if(entries.length&&!(sum<f(0.00001)&&sum>f(-0.00001))) {
        const inv=f(1/sum);let acc=0,found=false;
        for(const e of entries){acc=f(acc+e.weight);if(f(acc*inv)>=random){expected=e.cmd;found=true;break;}}
        if(!found)throw Error('CPU reference exhausted weighted choices');
      }
      const actual=module._portCpuChoose(base+at,seed,scratch);choices++;
      if(module.HEAPF32[scratch/4]!==random||actual!==expected)throw Error('Original CPU weighted-choice mismatch');
    }
    return {passed:true,scripts,scriptBytes:bytes,attackLists:cpu.lists.size,attackEntries:[...cpu.lists.values()].reduce((n,l)=>n+l.entries.length,0),choices,
      limitation:'Original byte-script copying and projectile weighted choice, not complete CPU decision-making or gameplay'};
  } finally {module._free(scratch);}
}
