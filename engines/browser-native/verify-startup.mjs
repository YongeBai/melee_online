import {convertSharedParameters} from './shared-assets.mjs';
import {sharedSpec} from './shared-spec.mjs';
import {installResidentFile} from './resident-files.mjs';
import {loadCostume} from './costume-assets.mjs';
import {motionSpec} from './motion-spec.mjs';
export function verifyStartup(module,input,models) {
  const outer=module._OSDisableInterrupts(),inner=module._OSDisableInterrupts();
  if(outer!==1||inner!==0||module._OSRestoreInterrupts(inner)!==0||module._OSRestoreInterrupts(outer)!==0||module._OSRestoreInterrupts(1)!==1)throw Error('Nested platform interrupt-mask state');

  const require=(condition,message)=>{if(!condition)throw Error(message);};
  const resetChecks=module._portStartupResetCheck();require(resetChecks>1000,'Incomplete startup reset checks');
  const converted=convertSharedParameters(input,sharedSpec);installResidentFile(module,'PlCo.dat',converted.image);
  require(module._portFighterInitialize()===0,'Original fighter initialization failed');
  const base=module._portSharedGlobal(0)-converted.roots[0];
  for(let i=0;i<23;i++)require(module._portSharedGlobal(i)===base+converted.roots[i],'Startup common global '+i);
  const metric=(i,j=0)=>module._portStartupMetric(i,j);
  const sizes=[metric(7),0x424,metric(8),124*4,32*4,0x8000],alignments=[4,4,4,4,4,32];
  const pools=sizes.map((expected,i)=>{const size=metric(0,i),align=metric(1,i)+1,used=metric(2,i);require(size===expected&&align===alignments[i]&&used===0,'Original startup pool '+i+': '+JSON.stringify({size,expected,align,expectedAlign:alignments[i],used}));return {size,align,used};});
  require(metric(3)===1,'Spawn counter initialization');
  require(metric(4)&&metric(5)&&metric(4)!==metric(5),'Independent shared materials');
  const color=Array.from({length:4},(_,i)=>metric(6,i));
  require(color.every((value,i)=>value===converted.archive.bytes[32+converted.roots[0]+0x7D8+i]),'Shared material tint');
  require(metric(9)===12&&metric(10)===2,'Original stage-light object');
  const lights=[0,1].map(i=>({flags:metric(11,i),shininess:metric(12,i),position:[14,15,16].map(m=>metric(m,i))}));
  require((lights[0].flags&0xffff)===4&&(lights[1].flags&0xffff)===13,'Original fallback light flags');
  // Original LObjLoad does not read the shininess union for infinite lights.
  require(lights[1].shininess===0&&lights[1].position.every(x=>x===Math.fround(0.57)),'Original fallback light descriptor '+JSON.stringify(lights));
  const live=module._portSceneLiveObjects(),joints=module._portSceneLiveJoints(),heap=module._portRuntimeHeapFree();
  require(module._portFileAllocations()===2&&module._portRuntimeObjectsUsed()===1&&module._portRuntimeProcsUsed()===1,'Startup ownership');
  require(module._portFileClear()===0,'Startup prefetch release');
  require(module._portFighterInitialize()===1&&module._portSharedInitialize()===1,'Startup is not idempotent');
  for(let frame=0;frame<120;frame++)module._portRuntimeStep();
  require(module._portRuntimeHeapFree()===heap&&module._portSceneLiveObjects()===live,'Startup scheduler lifetime');
  require(models.length===27&&new Set(models.map(m=>m.name)).size===27,'Hosted default roster');
  const modelRows=[];
  for(const model of models) {
    const kind=motionSpec.codes.indexOf(model.name.slice(2,4));require(kind>=0&&kind<27,'Hosted model kind');
    const costume=loadCostume(module,model.bytes,model.name,kind),objects=[];
    try {
      for(let i=0;i<2;i++) {
        const object=module._portFighterModelCreate(kind);require(object,'Model construction after full startup');objects.push(object);
        require(metric(2,2)===i+1&&metric(2,3)===i+1,'Model constructor reset active startup pools');
      }
    } finally {for(const object of objects)module._portSceneObjectFree(object);costume.dispose();module._portFileClear();}
    require(module._portFighterModelLive()===0&&module._portSceneLiveObjects()===live&&module._portSceneLiveJoints()===joints,'Model lifetime after full startup');
    require(module._portFileAllocations()===2,'Common archive ownership after model cleanup');
    modelRows.push({name:model.name,kind,instances:2});
  }
  return {passed:true,originalFunction:'Fighter_FirstInitialize_80067A84',resetChecks,commonGlobals:23,pools,lights,sharedMaterialColor:color,
    schedulerSteps:120,modelInstances:modelRows.length*2,modelRows,runtimeObjects:1,runtimeProcs:1,prefetchReleased:true,commonAllocations:2,sharedLiveObjects:live,sharedLiveJoints:joints,
    playable:false,performanceMeasured:false,limitation:'Original fighter global startup with the original fallback lights. Full Fighter_Create, tournament stage startup, combat, presentation, audio and input are not integrated.'};
}

export function verifyStartupOrder(module,input) {
  const converted=convertSharedParameters(input,sharedSpec);installResidentFile(module,'PlCo.dat',converted.image);
  if(module._portSharedInitialize()!==0)throw Error('Fresh runtime required for startup-order check');
  const root=module._portSharedGlobal(0),allocations=module._portFileAllocations();
  if(module._portFighterInitialize()!==-1||module._portSharedGlobal(0)!==root||module._portFileAllocations()!==allocations)
    throw Error('Full startup must reject an already partially initialized runtime');
  module._portFileClear();return {passed:true,lateFullStartupRejected:true,commonOwnershipPreserved:true};
}
