const same=(actual,expected,label)=> {
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(label+': '+JSON.stringify({actual,expected}));
};
export function verifyRuntime(module) {
  same(module._portRuntimeInit(),1,'first runtime initialization');
  same(module._portRuntimeInit(),0,'idempotent runtime initialization');
  const read=()=> {
    const values=[];
    for(let i=0;i<256;i++) {const v=module._portRuntimeProbeRead(i);if(v<0)break;values.push(v);}
    same(module._portRuntimeProbeReset(),values.length,'trace count');
    return values;
  };
  const create=(id,link,priority,proc,remove=0)=>same(module._portRuntimeProbeCreate(id,link,priority,proc,remove),0,'object creation');
  create(1,8,2,2); create(2,4,1,0); create(3,4,0,0,1); create(4,8,0,1);
  same(module._portRuntimeObjectsUsed(),4,'object accounting');
  same(module._portRuntimeStep(),1,'native frame counter');
  same(read(),[3,2,4,1],'process priorities and delayed self-deletion');
  same(module._portRuntimeObjectsUsed(),3,'delayed object deletion');
  same(module._portRuntimeProcsUsed(),3,'delayed process deletion');
  module._portRuntimeProbePause(8,1);
  module._portRuntimeStep();same(read(),[2],'paused link');
  module._portRuntimeProbePause(8,0);
  module._portRuntimeStep();same(read(),[2,4,1],'resumed link');
  create(5,63,0,1);
  module._portRuntimeProbePause(63,1);
  module._portRuntimeStep();same(read(),[2,4,1],'64-bit pause mask');
  module._portRuntimeProbePause(63,0);
  module._portRuntimeStep();same(read(),[2,4,5,1],'64-bit resume');
  create(6,8,0,24);
  module._portRuntimeStep();same(read(),[2,4,5,1,6],'Melee process priority 24');
  module._portRuntimeProbeClear();
  same([module._portRuntimeObjectsUsed(),module._portRuntimeProcsUsed()],[0,0],'pool reset');
  const heap=module._portRuntimeHeapFree();
  if(heap<=0)throw Error('Heap integrity check failed');
  for(let i=0;i<120;i++) {
    create(1,8,2,2);create(2,4,1,0);create(3,4,0,0,1);create(4,8,0,1);
    module._portRuntimeStep();same(read(),[3,2,4,1],'reused scheduler order');
    module._portRuntimeProbeClear();
    same([module._portRuntimeObjectsUsed(),module._portRuntimeProcsUsed()],[0,0],'reused pools');
    same(module._portRuntimeHeapFree(),heap,'bounded pool allocation');
  }
  return {passed:true,frames:126,allocationCycles:120,heapIntegrity:true,
    callbackOrder:true,pauseResume:true,delayedDeletion:true,gameplay:false};
}
