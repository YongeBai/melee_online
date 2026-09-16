import {convertFighterInitialization} from './fighter-init-assets.mjs';
import {motionSpec} from './motion-spec.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
import {loadCostume} from './costume-assets.mjs';
export function verifyFighterInitialization(module,fighters,models) {
  const rows=[],scales=[1,0.5,1.5,2,1],flags=[0,127,85,42,1];let checks=0;
  const check=(ok,message)=>{checks++;if(!ok)throw Error(message);};
  const baseline={objects:module._portRuntimeObjectsUsed(),live:module._portSceneLiveObjects(),allocations:module._portFileAllocations()};
  for(const {name,bytes} of fighters) {
    const converted=convertFighterInitialization(bytes,name,motionSpec),{kind}=converted;
    const model=models.find(m=>m.name===name.replace('.dat','Nr.dat'));check(model,'Missing default model');
    const asset=loadCostume(module,model.bytes,model.name,kind),fileName=name.replace('.dat','Init.dat');
    installResidentFile(module,fileName,converted.image);
    const archive=openResidentArchive(module,fileName,['native_fighter_initialization']),binding=archive.addresses[0],base=binding-converted.root;
    const objects=[];
    try {
      for(let variant=0;variant<5;variant++) {
        module._portFighterPlayerConfigure(variant,variant,variant%2?255:0,variant%4,5-variant,scales[variant],flags[variant]);
        const object=module._portFighterInitModelCreate(kind,variant,binding,variant%2,variant-2);check(object,'Original fighter initialization/model creation');objects.push(object);
        const read=(field,index=0)=>module._portFighterInitRead(object,field,index);
        const expected=[kind,variant,variant,5-variant,0,variant%4,variant%2,variant-2,scales[variant],341,1,1,base+converted.roots[3],base+converted.roots[4],1,flags[variant]];
        expected.forEach((value,field)=>check(read(field)===value,name+' original field '+field));
        const color=variant?module.HEAPU8.slice(module._portSharedGlobal(0)+0x6DC+(variant-1)*4,module._portSharedGlobal(0)+0x6DC+variant*4):new Uint8Array(4);
        for(let i=0;i<4;i++)check(read(16,i)===(i===3?color[3]:Math.floor(color[i]*color[3]/255)),name+' controller color');
        for(let field=0;field<3;field++) {
          const at=read(20+field),expected=converted.expected[field];
          for(let i=0;i<expected.length;i++)check(module.HEAPU8[at+i]===expected[i],name+' original parameter copy '+field+'/'+i);
        }
        check(read(23)===0x184,'Common attribute ABI');
        for(let i=0;i<20;i++)check(read(24,i)===0,'Original input history reset');
        for(let i=0;i<28;i++)check(read(25,i)===(i<12?0xFE:0xFF),'Original input timer initialization');
        check(read(26)===1&&read(27)===-1,'Original default action flags');
        check(module._portStartupMetric(2,2)===variant+1&&module._portStartupMetric(2,3)===variant+1,'Original part pools remain shared');
      }
      // Later player setup must not mutate an already initialized fighter.
      for(let i=0;i<objects.length;i++)check(module._portFighterInitRead(objects[i],8,0)===scales[i],'Initialized fighters lost independent state');
      rows.push({name,kind,instances:objects.length,motionRows:converted.count,parameterBytes:converted.expected.reduce((sum,b)=>sum+b.length,0)});
    } finally {
      for(const object of objects)module._portSceneObjectFree(object);
      archive.dispose();asset.dispose();module._portFileClear();
    }
    check(module._portFighterModelLive()===0&&module._portSceneLiveObjects()===baseline.live&&module._portRuntimeObjectsUsed()===baseline.objects,'Per-fighter fixture teardown');
    check(module._portFileAllocations()===baseline.allocations,'Per-fighter archive ownership');
  }
  return {passed:true,originalFunction:'Fighter_UnkInitLoad_80068914',rows,instances:rows.reduce((n,r)=>n+r.instances,0),checks,
    realActionTables:true,controllerVariants:5,seededInputReset:true,
    limitation:'Original per-fighter field initialization and model construction. Uses a scoped typed subset of ftData; full Fighter_Create, OnLoad, combat, stage callbacks and player input polling are not executed.'};
}
