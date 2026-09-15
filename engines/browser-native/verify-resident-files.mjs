import {convertSceneAsset} from './scene-assets.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
function check(ok,message){if(!ok)throw Error('Resident file verification: '+message);}
export function verifyResidentFiles(module,files) {
  check(module._portFileCount()===0&&module._portFileAllocations()===0,'initial ownership is not empty');
  const rows=[];let totalBytes=0;
  try {
    for(const {name,bytes} of files) {
      const converted=convertSceneAsset(bytes);
      // A model archive can have unrelated public symbols (e.g. material
      // animation). Request only the imported joint; none are silently used.
      const symbol=[...converted.archive.publics].find(([,at])=>at===converted.rootOffset)?.[0];
      check(symbol,'joint public symbol missing');
      installResidentFile(module,name,converted.image);totalBytes+=converted.image.length;
      const n=converted.model.tree.nodes.length,nodes=module._malloc(n*4);let root,object;
      const passes=[];
      try {
        for(let pass=0;pass<3;pass++) {
          const a=openResidentArchive(module,name,[symbol,symbol]),b=openResidentArchive(module,name,[symbol]);
          try {
            check(a.addresses[0]===a.addresses[1],'original varargs lookup differs');
            check(a.addresses[0]!==b.addresses[0],'two loads alias mutable descriptors');
            check(module._portFileAllocations()===4,'each archive must own data and metadata');
            const av=new DataView(module.HEAPU8.buffer),flags=av.getUint32(a.addresses[0]+4,true);
            av.setUint32(a.addresses[0]+4,flags^1,true);
            check(av.getUint32(b.addresses[0]+4,true)===flags,'load changed another archive');
            av.setUint32(a.addresses[0]+4,flags,true);
            object=module._portSceneObjectCreate(a.addresses[0]);
            check(object,'GObj creation failed');root=module._portSceneObjectRoot(object);
            check(root&&module._portSceneCollect(root,nodes,n)===n,'original HSD scene load');
            for(let metric=0;metric<converted.metrics.length;metric++) {
              const actual=module._portSceneMetric(n,nodes,metric),expected=converted.metrics[metric];
              check(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-8*(1+Math.abs(expected)),name+' descriptor metric '+metric);
            }
            if(pass===0)module._portSceneObjectFree(object);
            else {module._portSceneObjectDeleteNextStep(object);module._portRuntimeStep();}
            object=0;root=0;
          } finally {if(object){module._portSceneObjectFree(object);object=0;root=0;}b.dispose();a.dispose();}
          check(module._portFileAllocations()===0,'archive allocations leaked');
          check(module._portSceneLiveObjects()===0,'HSD object leaked');
          check(module._portRuntimeObjectsUsed()===0&&module._portRuntimeProcsUsed()===0,'GObj owner or callback leaked');
          passes.push(module._portRuntimeHeapFree());
        }
      } finally {module._free(nodes);}
      check(passes[1]===passes[2],'repeated original archive loads grow heap');
      rows.push({name,loads:6,nodes:n,independentRelocation:true,originalVarargs:true,gobjOwnership:true,callbackDeletion:true,heapFree:passes[2]});
    }
    check(module._portFileCount()===files.length,'registry count');
    check(module._portFileBytes()===totalBytes,'registry byte count');
    check(module._portFileReads()===files.length*6,'each open must read a fresh image');
    return {passed:true,files:rows,residentBytes:totalBytes,reads:module._portFileReads(),
      archiveAllocationsAfterClose:module._portFileAllocations(),noDiscWait:true,playable:false,performanceMeasured:false};
  } finally {
    module._portFileClear();
    check(module._portFileCount()===0&&module._portFileBytes()===0,'registry clear leaked assets');
  }
}

export function verifyResidentLifecycle(module) {
  const image=new Uint8Array(78),v=new DataView(image.buffer);
  [78,16,1,2,0].forEach((n,i)=>v.setUint32(i*4,n,true));
  v.setUint32(32,8,true);v.setUint32(40,0x12345678,true);
  v.setUint32(48,0,true);v.setUint32(52,0,true);v.setUint32(56,0,true);
  v.setUint32(60,8,true);v.setUint32(64,5,true);
  image.set(new TextEncoder().encode('root\0leaf\0'),68);
  const heapBefore=module._portRuntimeHeapFree();let loaded;
  try {
    installResidentFile(module,'Pair.dat',image);
    let rejected=0;
    for(const [name,bytes] of [['Pair.dat',image],['../Pair.dat',image],['Pair',image],['x'.repeat(40)+'.dat',image],['Raw.dat',new Uint8Array(32)]]) {
      try {installResidentFile(module,name,bytes);}catch{rejected++;}
    }
    check(rejected===5,'invalid or duplicate installs accepted');
    image.fill(0); // Registry owns its copy, not the transfer buffer.
    loaded=openResidentArchive(module,'Pair.dat',['root','leaf']);
    let view=new DataView(module.HEAPU8.buffer);
    check(view.getUint32(loaded.addresses[0],true)===loaded.addresses[1],'relative pointer was not relocated');
    check(view.getUint32(loaded.addresses[1],true)===0x12345678,'source buffer mutation changed registry');
    module._portFileClear();
    view=new DataView(module.HEAPU8.buffer);
    check(view.getUint32(loaded.addresses[1],true)===0x12345678,'cache release invalidated a loaded archive');
    loaded.dispose();loaded.dispose();loaded=null;
    check(module._portFileAllocations()===0,'archive release leaked');
    check(module._portRuntimeHeapFree()===heapBefore,'synthetic load did not return heap allocation');
    return {passed:true,rejectedInstalls:rejected,sourceCopy:true,cacheIndependentLifetime:true,twoDistinctSymbols:true};
  } finally {if(loaded)loaded.dispose();module._portFileClear();}
}
