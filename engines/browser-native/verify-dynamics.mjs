import {verifyFighterAnimation} from './verify-fighter-animation.mjs';
import {convertDynamics} from './dynamics-assets.mjs';
import {convertCharacterCollision} from './character-collision-assets.mjs';
import {convertFighterInitialization} from './fighter-init-assets.mjs';
import {motionSpec} from './motion-spec.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
import {loadCostume} from './costume-assets.mjs';

export function verifyDynamics(module,fighters,models,animations) {
  const rows=[];let checks=0,frames=0,changed=0;
  const check=(ok,message)=>{checks++;if(!ok)throw Error(message);};
  const view=()=>new DataView(module.HEAPU8.buffer),ptr=at=>view().getUint32(at,true),f32=at=>view().getFloat32(at,true);
  check(module._portDynamicsInitialize()===320,'Original dynamics pool initialization');
  const baseline={objects:module._portRuntimeObjectsUsed(),live:module._portSceneLiveObjects(),allocations:module._portFileAllocations()};
  for(const {name,bytes} of fighters) {
    const kind=motionSpec.codes.indexOf(name.slice(2,4)),partCount=ptr(ptr(module._portSharedGlobal(4)+kind*4)+8);
    const source=convertDynamics(bytes,name,partCount,motionSpec),collision=convertCharacterCollision(bytes,name,partCount),init=convertFighterInitialization(bytes,name,motionSpec);
    const model=models.find(m=>m.name===name.replace('.dat','Nr.dat')),asset=loadCostume(module,model.bytes,model.name,kind);
    const cleanup=[],files=[],objects=[],parts=module._malloc(partCount*4),nodeSet=new Set();
    const n=asset.model.tree.nodes.length,nodes=module._malloc(n*4),matrices=module._malloc(n*48);
    const group=ptr(module._portSharedGlobal(5)+kind*4),skip=new Set();
    if(group){const start=ptr(group),count=ptr(group+4);for(let i=0;i<count;i++)skip.add(module.HEAPU8[start+i*4]);}
    const partNodes=[];let next=0;for(let i=0;i<partCount;i++)partNodes.push(skip.has(i)?-1:next++);
    check(next===n,'Dynamics part mapping');
    const open=(suffix,image,symbol)=>{const filename=name.replace('.dat',suffix+'.dat');installResidentFile(module,filename,image);const file=openResidentArchive(module,filename,[symbol]);files.push(file);return file.addresses[0];};
    try {
      const initRoot=open('Init',init.image,'native_fighter_initialization'),collisionRoot=open('Coll',collision.image,'native_character_collision'),dynRoot=open('Dyn',source.image,'native_fighter_dynamics');
      const expectedNodes=source.rows.slice(0,source.count).reduce((n,r)=>n+r.count,0);
      for(let instance=0;instance<2;instance++) {
        module._portFighterPlayerConfigure(instance,0,0,0,1,1,0);
        const object=module._portFighterInitModelCreate(kind,instance,initRoot,0,0);check(object,'Dynamics fighter creation');objects.push(object);
        check(module._portSceneCollect(module._portSceneObjectRoot(object),nodes,n)===n,'Dynamics joint count');
        for(let i=0;i<partCount;i++)view().setUint32(parts+i*4,partNodes[i]<0?0:ptr(nodes+partNodes[i]*4),true);
        module._portSceneMatrices(n,nodes,matrices);
        const initialMatrices=Array.from(new Float32Array(module.HEAPU8.buffer,matrices,n*12));
        check(module._portCollisionAttach(object,collisionRoot,partCount,parts,kind)===0,'Dynamics collider initialization');
        check(module._portDynamicsAttach(object,dynRoot,partCount)===source.count,name+' dynamic bone construction');
        check(module._portDynamicsPoolFree()===320-(instance+1)*expectedNodes,'Dynamics exact pool consumption');
        for(let set=0;set<source.count;set++) {
          const row=source.rows[set],position=module._portDynamicsRead(object,set,5);let node=module._portDynamicsRead(object,set,1);
          check(module._portDynamicsRead(object,set,2)===row.count&&module._portDynamicsRead(object,set,3)===0,'Original chain size/default cutoff');
          row.pos.forEach((v,i)=>check(f32(position+i*4)===v,'Dynamics position parameter'));
          for(let i=0;i<row.count;i++) {
            check(node&&!nodeSet.has(node),'Independent dynamic node ownership');nodeSet.add(node);
            check(ptr(node)===module._portCollisionPartRead(object,row.bone+i,0),'Dynamics original child joint chain');
            const matrix=partNodes[row.bone+i]*12;
            for(let axis=0;axis<3;axis++)check(f32(node+44+axis*4)===initialMatrices[matrix+axis*4+3],'Dynamics initial world position');
            check(module._portDynamicsRead(object,row.bone+i,4)===1,'Original dynamic part enable');
            const nextMatrix=i+1<row.count?partNodes[row.bone+i+1]*12:null;
            const distance=nextMatrix===null?0:Math.hypot(...[0,1,2].map(axis=>initialMatrices[matrix+axis*4+3]-initialMatrices[nextMatrix+axis*4+3]));
            const actualLength=f32(node+72);
            check(Math.abs(actualLength-distance)<1e-5*(1+distance),'Original segment world length');
            check(f32(node+140)===(actualLength?Math.fround(row.pos[2]/actualLength):0),'Original length-scaled parameter');
            const offsets=[0x4c,0x50,...Array.from({length:13},(_,j)=>0x58+j*4)];
            offsets.forEach((offset,j)=>check(f32(node+offset)===row.parameters[i*15+j],name+' parameter '+set+'/'+i+'/'+j));
            for(const offset of [4,8,12,16,20,24,28,32,36,40,44,48,52,72,140])check(Number.isFinite(f32(node+offset)),'Finite constructed dynamics');
            node=ptr(node+144);
          }
          check(node===0,'Dynamic chain terminated exactly');
        }
      }
      // Exercise every source selector, including null rows and 256 (disabled).
      for(let selector=0;selector<Math.max(1,source.selectors.length);selector++) {
        module._portDynamicsSelect(objects[0],selector,1);
        for(let set=0;set<source.count;set++) {
          const cutoff=source.selectors[selector]?.[set]??256,row=source.rows[set];
          check(module._portDynamicsRead(objects[0],set,3)===cutoff,'Original selector cutoff');
          for(let i=0;i<row.count;i++)check(module._portDynamicsRead(objects[0],row.bone+i,4)===Number(i>=cutoff),'Original cutoff part flags');
        }
      }
      for(const object of objects)module._portDynamicsSelect(object,0,0);
      function state(object) {
        const values=[];
        for(let set=0;set<source.count;set++)for(let node=module._portDynamicsRead(object,set,1);node;node=ptr(node+144)) {
          // Saved/world vectors and active physics fields; exclude pointers and
          // the unused tail axis, which the original allocator does not reset.
          for(let offset=4;offset<144;offset+=4)if(offset!==84)values.push(f32(node+offset));
        }
        return values;
      }
      const initial=state(objects[0]);let localChanged=0;
      for(let frame=0;frame<60;frame++) {
        module._portDynamicsStep(objects[0]);module._portDynamicsStep(objects[1]);
        const a=state(objects[0]),b=state(objects[1]);
        for(let i=0;i<a.length;i++){check(Number.isFinite(a[i])&&Object.is(a[i],b[i]),name+' deterministic finite dynamics '+frame+'/'+i);if(a[i]!==initial[i])localChanged++;}
        frames+=2;
      }
      const animation=verifyFighterAnimation(module,{name,bytes,kind,objects,asset,open,fighters,animations,cleanup});
      changed+=localChanged;rows.push({animation,name,sets:source.count,nodes:expectedNodes,importedDescriptors:source.rows.length,selectorRows:source.selectors.length,instances:2,frames:120,changedValues:localChanged});
    } finally {
      for(const object of objects)module._portSceneObjectFree(object);
      for(const dispose of cleanup.reverse())dispose();
      for(const file of files.reverse())file.dispose();asset.dispose();module._portFileClear();module._free(parts);module._free(nodes);module._free(matrices);
    }
    check(module._portDynamicsPoolFree()===320,'Original dynamics unload returned all nodes');
    check(module._portFighterModelLive()===0&&module._portSceneLiveObjects()===baseline.live&&module._portRuntimeObjectsUsed()===baseline.objects,'Dynamics fighter teardown');
    check(module._portFileAllocations()===baseline.allocations,'Dynamics asset teardown');
  }
  check(changed>0,'Dynamic simulation must change state');
  return {passed:true,rows,checks,frames,changedValues:changed,sets:rows.reduce((n,r)=>n+r.sets,0),nodes:rows.reduce((n,r)=>n+r.nodes,0),
    limitation:'Original construction, selector, rest-pose simulation and teardown. Two default-costume instances per component; no match, animation-driven dynamics, stage/wind interaction, Kirby copy hats, or retail simulation parity claim. Extra Purin hat descriptors are imported but not executed.'};
}
