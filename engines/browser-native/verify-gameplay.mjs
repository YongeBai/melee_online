import {convertGameplayParameters} from './gameplay-assets.mjs';
import {motionSpec} from './motion-spec.mjs';
export function prepareGameplayChecks(module,{name,bytes,kind,objects,open,partCount}) {
  const source=convertGameplayParameters(bytes,name,partCount,motionSpec.counts[kind]);
  const root=open('Gameplay',source.image,'native_fighter_gameplay'),base=root-source.root;
  let checks=0,updates=0,maxContactError=0;
  const check=(ok,text)=>{checks++;if(!ok)throw Error(name+' gameplay: '+text);};
  const v=()=>new DataView(module.HEAPU8.buffer),f32=at=>v().getFloat32(at,true);
  for(const {at,type,value} of source.values){const d=v(),actual=type==='u8'?d.getUint8(base+at):type==='s16'?d.getInt16(base+at,true):type==='s32'?d.getInt32(base+at,true):type==='f32'?d.getFloat32(base+at,true):d.getUint32(base+at,true);check(actual===value,'typed native parameter '+at);}
  const read=(object,field,index=0)=>module._portGameplayRead(object,field,index);
  const desired=object=>Array.from({length:8},(_,i)=>f32(read(object,17)+i*4));
  const actual=object=>Array.from({length:8},(_,i)=>f32(read(object,18)+i*4));
  for(const object of objects) {
    check(module._portGameplayAttach(object,root,partCount)===0,'original reset/collision initialization');
    check(read(object,0)===1&&read(object,1)===1,'joint-sourced environment collision');
    check(read(object,2)===module._portSceneObjectRoot(object),'collision root');
    for(let i=0;i<6;i++)check(read(object,3,i)===module._portCollisionPartRead(object,source.ecb[i],0),'six ECB bone pointers');
    for(const [field,value] of [[11,-1],[12,-1],[13,-1],[14,1],[15,-1],[16,0]])check(read(object,field)===value,'original collision defaults');
    check(JSON.stringify(actual(object))===JSON.stringify([0,8,0,0,4,4,-4,4]),'initial collision diamond');
    for(const scale of [0.5,2,1]) {
      module._portGameplayRescale(object,scale);
      for(const [field,value] of [[4,source.ecb[6]],[7,source.ecb[7]],[8,source.ecb[8]],[9,source.ecb[9]]])check(read(object,field)===Math.fround(value*scale),'original scaled collider/ledge parameter');
      const common=module._portFighterInitRead(object,20,0);
      // The original resize routine retains the fighter's own weight.
      check(read(object,10)===f32(common+0x88),'fighter weight binding');
      check(read(object,5)===10&&read(object,6)===10,'ECB size limits retain the actual fighter scale');
    }
    check(read(object,20)===module._portCollisionPartRead(object,source.thrown[0],0)&&read(object,21)===source.thrown[1]&&read(object,22)===2,'original thrown-hitbox initialization');
    for(let i=0;i<2;i++)check(read(object,25,i)===module._portCollisionPartRead(object,source.colliders[i][0],0)&&read(object,26,i)===source.colliders[i][4],'original body contact initialization');
  }
  return {
    sample(object,matrices,partNodes,frame) {
      const previous=actual(object),oldThrown=[0,1,2].map(i=>read(object,23,i)),alpha=frame%2?1:0.5;
      module._portGameplayUpdate(object,alpha);updates++;
      const target=desired(object),current=actual(object);
      for(let i=0;i<8;i++) {
        const expected=Math.fround(previous[i]+Math.fround(alpha*Math.fround(target[i]-previous[i])));
        check(Number.isFinite(current[i])&&current[i]===expected,'original ECB interpolation');
      }
      check(target[0]===0&&target[2]===0&&target[4]>=1&&target[6]<=-1&&target[1]>target[3],'valid collision diamond');
      check(target[5]>=target[3]&&target[5]<=target[1]&&target[7]>=target[3]&&target[7]<=target[1],'collision sides within vertical extent');
      const thrownMatrix=partNodes[source.thrown[0]]*12;
      for(let axis=0;axis<3;axis++) {
        check(read(object,23,axis)===matrices[thrownMatrix+axis*4+3],'thrown-hitbox world position');
        check(read(object,24,axis)===oldThrown[axis],'thrown-hitbox previous world position');
      }
      for(let i=0;i<2;i++) {
        const row=source.colliders[i],at=partNodes[row[0]]*12;
        for(let axis=0;axis<3;axis++) {
          const k=at+axis*4,p=row.slice(1,4),expected=axis===2?0:Math.fround(Math.fround(Math.fround(Math.fround(matrices[k]*p[0])+Math.fround(matrices[k+1]*p[1]))+Math.fround(matrices[k+2]*p[2]))+matrices[k+3]);
          const value=read(object,27,i*3+axis),error=Math.abs(value-expected);maxContactError=Math.max(maxContactError,error);
          check(Number.isFinite(value)&&error<1e-5*(1+Math.abs(expected)),'body contact world position');
        }
      }
    },
    report(){return {passed:true,checks,updates,maxContactError,importedFields:9,scalarValues:source.values.length,idleTables:source.waits.filter(Boolean).length,
      limitation:'Original character collision initialization, resizing, animated ECB generation/interpolation, thrown-hitbox history and body-contact transforms. Stage line traversal, grounding, ledge grabs and full combat are not executed; camera/IK/sound/idle tables are imported but their consumers are not verified here.'};}
  };
}
