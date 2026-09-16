import {convertBattlefieldMap} from './stage-map-assets.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
export function verifyStageMap(module,input) {
  const converted=convertBattlefieldMap(input);let checks=0,updates=0,changed=0;
  const check=(value,message)=>{checks++;if(!value)throw Error('Stage map: '+message);};
  const view=()=>new DataView(module.HEAPU8.buffer),ptr=p=>view().getUint32(p,true);
  for(let bits=0;bits<256;bits++)check(module._portStageLightOverrideBits(bits)===(bits>>>5),'packed override flags');
  module._portSceneInitialize();
  const metrics=()=>Array.from({length:10},(_,i)=>module._portSceneLiveMetric(i)),before=metrics(),objects=module._portRuntimeObjectsUsed(),procs=module._portRuntimeProcsUsed();
  installResidentFile(module,'NativeBattlefieldMap.dat',converted.image);
  const file=openResidentArchive(module,'NativeBattlefieldMap.dat',['native_stage_map','native_stage_parameters']),[root,param]=file.addresses,base=root-converted.root;
  const native=new DataView(converted.image.buffer,32);for(const p of converted.pointerSlots)check(ptr(base+p)===base+native.getUint32(p,true),'native stage relocation');
  for(const [p,size] of converted.writes)check((size===2?view().getUint16(base+p,true):ptr(base+p))===(size===2?native.getUint16(p,true):native.getUint32(p,true)),'typed stage descriptor');
  module._portStageMapInstall(file.archive,root,param);const owners=[],buffers=[],rows=[];
  try {
    for(let index=0;index<7;index++){
      const at=base+converted.table+index*52,model=converted.models.find(m=>base+m.root===ptr(at));
      const object=module._portStageMapCreate(index),n=model.nodes+1,nodes=module._malloc(n*4),matrix=module._malloc(n*48);buffers.push(nodes,matrix);
      const joint=module._portSceneObjectRoot(object);check(module._portSceneCollect(joint,nodes,n)===n,'original scaled stage hierarchy');
      for(const metric of [3,6,7])check(Math.abs(module._portSceneMetric(n,nodes,metric)-model.metrics[metric])<1e-4,'stage mesh and envelope descriptors');
      const lightCount=module._portStageMapLights(index);check(lightCount>0&&lightCount<=3,'original light override selection');
      owners.push({object,n,nodes,matrix,last:null});rows.push({index,joints:n,meshes:model.meshes,selectedLights:lightCount,cameraOwner:!!module._portStageMapRead(2,index)});
    }
    module._portStageMapBounds();const camera=Array.from({length:4},(_,i)=>module._portStageMapRead(0,i)),blast=Array.from({length:4},(_,i)=>module._portStageMapRead(0,i+4));
    const point=id=>[module._portStageMapRead(3,id),module._portStageMapRead(4,id)];
    for(const id of [0,1,2,3,0x94,0x95,0x96,0x97,0x98])check(module._portStageMapRead(1,id)>0,'original stage joint binding');
    const origin=point(0x94),c0=point(0x95),c1=point(0x96),b0=point(0x97),b1=point(0x98);
    for(const [values,p0,p1] of [[camera,c0,c1],[blast,b0,b1]]){
      const expected=[Math.min(p0[0],p1[0])-origin[0],Math.max(p0[0],p1[0])-origin[0],Math.max(p0[1],p1[1])-origin[1],Math.min(p0[1],p1[1])-origin[1]];
      check(values.every((v,i)=>Math.abs(v-expected[i])<1e-5),'original camera/blast bounds from source joints');
    }
    for(let frame=0;frame<120;frame++){
      module._portRuntimeStep();updates++;
      for(const o of owners){module._portSceneMatrices(o.n,o.nodes,o.matrix);const now=new Float32Array(module.HEAPU8.buffer,o.matrix,o.n*12);for(let i=0;i<now.length;i++){check(Number.isFinite(now[i]),'finite original stage animation matrix');if(o.last&&now[i]!==o.last[i])changed++;}o.last=Float32Array.from(now);}
    }
    check(changed>0,'original stage animation advances');
    return {passed:true,checks,updates,changed,rows,camera,blast,flagCases:256,typedRelocations:converted.pointerSlots.size,declaredLightOverrides:converted.declaredOverrides,typedLightOverrides:converted.typedOverrideRows,playable:false,performanceMeasured:false,
      limitation:'Original stage model owners, animation, light selection and source-joint camera/blast bounds only. No collision registration, complete Stage startup, stage-specific callbacks, particle spawning, GPU rendering or match.'};
  } finally {
    module._portStageMapClear();for(const p of buffers)module._free(p);file.dispose();module._portFileClear();
    check(metrics().every((v,i)=>v===before[i])&&module._portRuntimeObjectsUsed()===objects&&module._portRuntimeProcsUsed()===procs,'stage objects and callbacks released');
  }
}
