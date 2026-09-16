import {readFigaTree} from './animation-assets.mjs';
import {checkTree} from './verify-motions.mjs';
import {verifySecondaryAnimation} from './verify-secondary-animation.mjs';
import {prepareGameplayChecks} from './verify-gameplay.mjs';
import {readFighterMotions} from './motion-assets.mjs';
import {motionSpec} from './motion-spec.mjs';
import {convertVisibility} from './visibility-assets.mjs';

// The original animation and dynamics paths operate on the same initialized
// fighters. This is not the action-state/script/physics update loop yet.
export function verifyFighterAnimation(module,{name,bytes,kind,objects,asset,open,fighters,animations,cleanup}) {
  let checks=0,changed=0,loaderChecks=0,liveBufferChecks=0;const check=(ok,label)=>{checks++;if(!ok)throw Error(name+' animation: '+label);};
  const read=(object,field,index=0)=>module._portFighterAnimationRead(object,field,index);
  const v=()=>new DataView(module.HEAPU8.buffer),ptr=at=>v().getUint32(at,true);
  const visibility=convertVisibility(bytes,name,module._portCostumeCount(kind));
  const partsRoot=open('AnimParts',visibility.image,'native_visibility');
  const n=asset.model.tree.nodes.length,nodes=objects.map(()=>module._malloc(n*4)),blendNodes=objects.map(()=>module._malloc(n*4)),matrices=objects.map(()=>module._malloc(n*48));
  cleanup.push(()=>{for(const p of [...nodes,...blendNodes,...matrices])module._free(p);});
  for(let instance=0;instance<objects.length;instance++) {
    const object=objects[instance];check(module._portFighterMotionAttach(object)===0,'original motion buffers on initialized fighter');
    check(module._portFighterMotionAttach(object)===-1,'duplicate motion owner rejected');
    check(module._portFighterAnimationInitialize(object,partsRoot)===1,'original blend skeleton initialization');
    check(module._portSceneCollect(module._portSceneObjectRoot(object),nodes[instance],n)===n,'primary skeleton');
    check(module._portSceneCollect(read(object,4),blendNodes[instance],n)===n,'blend skeleton');
    for(let i=0;i<n;i++)check(ptr(nodes[instance]+i*4)!==ptr(blendNodes[instance]+i*4),'blend joints alias visible joints');
    for(let field=8;field<=9;field++)for(let i=0;i<(field===9?3:1);i++)check(Number.isFinite(read(object,field,i)),'original bone-derived offsets');
  }
  const buffers=objects.flatMap(o=>[0,1].map(f=>module._portFighterMotionRead(o,f)));
  check(new Set(buffers).size===4&&buffers.every(Boolean)&&module._portMotionBuffers()===4,'four independent owned motion buffers');
  check(module._portFighterMotionUnregister(kind)===-1,'live fighter prevents motion archive unregister');
  if(kind===11)check(module._portFighterMotionUnregister(10)===-1,'live Nana retains the Popo fallback archive');
  for(let i=0;i<n;i++)check(ptr(blendNodes[0]+i*4)!==ptr(blendNodes[1]+i*4),'independent blending skeletons');
  const partCount=ptr(ptr(module._portSharedGlobal(4)+kind*4)+8),group=ptr(module._portSharedGlobal(5)+kind*4),skip=new Set();
  if(group){const start=ptr(group),count=ptr(group+4);for(let i=0;i<count;i++)skip.add(module.HEAPU8[start+i*4]);}
  const partNodes=[];let partNode=0;for(let i=0;i<partCount;i++)partNodes.push(skip.has(i)?-1:partNode++);
  check(partNode===n,'environment collision part map');
  const gameplay=prepareGameplayChecks(module,{name,bytes,kind,objects,open,partCount});
  const motions=readFighterMotions(bytes,name,motionSpec);
  const popo=kind===11?readFighterMotions(fighters.find(f=>f.name==='PlPp.dat').bytes,'PlPp.dat',motionSpec):null;
  const effective=motions.motions.map(row=>({row,source:row.animationSize?row:popo?.motions[row.index],archive:row.animationSize?name:popo?'PlPp.dat':null})).filter(m=>m.source?.animationSize);
  const chosen=[];
  for(const text of ['_Wait1_','_WalkSlow_','_Dash_']){const candidate=effective.find(m=>m.source.name.includes(text));if(candidate&&!chosen.includes(candidate))chosen.push(candidate);}
  for(const candidate of effective)if(chosen.length<3&&!chosen.includes(candidate))chosen.push(candidate);
  check(chosen.length===3,'three real motion clips');const clips=[];
  for(const [sequence,{row,source,archive}] of chosen.entries()) {
    const animation=animations.find(a=>a.name===archive.replace('.dat','AJ.dat'));
    check(animation,'hosted animation archive');
    const expectedTree=readFigaTree(animation.bytes.subarray(source.animationOffset,source.animationOffset+source.animationSize));
    const blend=sequence===0?0:sequence===1?4:8,speed=sequence===2?0.5:1;
    for(const object of objects) {
      const tree=module._portFighterMotionLoad(object,row.index,0);checkTree(module,tree,expectedTree);
      check(module._portFighterMotionLoad(object,row.index,0)===tree,'primary loader cache');
      const secondary=module._portFighterMotionLoad(object,row.index,1);checkTree(module,secondary,expectedTree);
      check(module._portFighterMotionLoad(object,row.index,1)===secondary,'secondary loader cache');
      check(tree!==secondary&&tree>=module._portFighterMotionRead(object,0)&&tree<module._portFighterMotionRead(object,0)+source.animationSize,'owned primary tree');
      check(secondary>=module._portFighterMotionRead(object,1)&&secondary<module._portFighterMotionRead(object,1)+source.animationSize,'owned secondary tree');loaderChecks+=2;
      check(module._portFighterAnimationStart(object,row.index,speed,blend)===0,'original loader to animation attachment');
    }
    const first=read(objects[0],1);let previous=null;
    for(let frame=0;frame<32;frame++) {
      for(let instance=0;instance<objects.length;instance++) {
        const object=objects[instance],peerFrame=read(objects[1-instance],1);module._portFighterAnimationStep(object);
        if(frame===8) {
          const other=chosen[(sequence+1)%chosen.length],otherBundle=animations.find(a=>a.name===other.archive.replace('.dat','AJ.dat'));
          const otherTree=readFigaTree(otherBundle.bytes.subarray(other.source.animationOffset,other.source.animationOffset+other.source.animationSize));
          const primary=module._portFighterMotionRead(object,0),before=module.HEAPU8.slice(primary,primary+0x8000),active=module._portFighterMotionRead(object,2);
          checkTree(module,module._portFighterMotionLoad(object,other.row.index,1),otherTree);loaderChecks++;
          check(module._portFighterMotionRead(object,2)===active&&before.every((byte,i)=>byte===module.HEAPU8[primary+i]),'secondary loading preserves live primary animation bytes');liveBufferChecks++;
        }
        check(read(objects[1-instance],1)===peerFrame,'stepping one fighter does not advance its peer');
        module._portSceneMatrices(n,nodes[instance],matrices[instance]);
        gameplay.sample(object,new Float32Array(module.HEAPU8.buffer,matrices[instance],n*12),partNodes,frame);
        check(read(object,0)===row.flags,'raw motion flags');check(read(object,2)===blend,'requested blend length');
        check(read(object,3)>=0&&read(object,3)<=blend,'blend progress');
        for(const field of [1,2,3,6,7])for(let i=0;i<(field>=6?3:1);i++)check(Number.isFinite(read(object,field,i))&&read(object,field,i)===read(objects[0],field,i),'independent animation state');
      }
      const a=Array.from(new Float32Array(module.HEAPU8.buffer,matrices[0],n*12)),b=new Float32Array(module.HEAPU8.buffer,matrices[1],n*12);
      for(let i=0;i<a.length;i++){check(Number.isFinite(a[i])&&Object.is(a[i],b[i]),'finite deterministic animated world matrices');if(previous&&a[i]!==previous[i])changed++;}
      previous=a;
    }
    check(read(objects[0],1)>first,'animation frame advances');check(read(objects[0],3)===blend,'blend reaches requested duration');
    clips.push({index:row.index,name:source.name,sourceArchive:archive,flags:row.flags,speed,blend,frames:32,firstFrame:first,lastFrame:read(objects[0],1)});
  }
  check(changed>0,'visible skeleton motion');
  const secondary=verifySecondaryAnimation(module,{name,bytes,objects,open,partNodes,motions,visibility});
  return {passed:true,originalMotionLoader:true,loaderTreeChecks:loaderChecks,liveBufferChecks,secondary,gameplay:gameplay.report(),checks,clips,instances:objects.length,frames:clips.length*32*objects.length,changedValues:changed,
    limitation:'Original fighter animation attachment, interpolation skeleton, frame progression and dynamics on initialized fixtures. Original motion loader with owned buffers; full motion-state changes, scripts, physics and retail parity remain unverified.'};
}
