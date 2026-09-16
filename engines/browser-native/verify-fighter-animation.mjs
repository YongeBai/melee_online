import {prepareGameplayChecks} from './verify-gameplay.mjs';
import {readFighterMotions} from './motion-assets.mjs';
import {motionSpec} from './motion-spec.mjs';
import {convertVisibility} from './visibility-assets.mjs';
import {loadSceneAnimation} from './scene-assets.mjs';

// The original animation and dynamics paths operate on the same initialized
// fighters. This is not the action-state/script/physics update loop yet.
export function verifyFighterAnimation(module,{name,bytes,kind,objects,asset,open,fighters,animations,cleanup}) {
  let checks=0,changed=0;const check=(ok,label)=>{checks++;if(!ok)throw Error(name+' animation: '+label);};
  const read=(object,field,index=0)=>module._portFighterAnimationRead(object,field,index);
  const v=()=>new DataView(module.HEAPU8.buffer),ptr=at=>v().getUint32(at,true);
  const visibility=convertVisibility(bytes,name,module._portCostumeCount(kind));
  const partsRoot=open('AnimParts',visibility.image,'native_visibility');
  const n=asset.model.tree.nodes.length,nodes=objects.map(()=>module._malloc(n*4)),blendNodes=objects.map(()=>module._malloc(n*4)),matrices=objects.map(()=>module._malloc(n*48));
  cleanup.push(()=>{for(const p of [...nodes,...blendNodes,...matrices])module._free(p);});
  for(let instance=0;instance<objects.length;instance++) {
    const object=objects[instance];check(module._portFighterAnimationInitialize(object,partsRoot)===1,'original blend skeleton initialization');
    check(module._portSceneCollect(module._portSceneObjectRoot(object),nodes[instance],n)===n,'primary skeleton');
    check(module._portSceneCollect(read(object,4),blendNodes[instance],n)===n,'blend skeleton');
    for(let i=0;i<n;i++)check(ptr(nodes[instance]+i*4)!==ptr(blendNodes[instance]+i*4),'blend joints alias visible joints');
    for(let field=8;field<=9;field++)for(let i=0;i<(field===9?3:1);i++)check(Number.isFinite(read(object,field,i)),'original bone-derived offsets');
  }
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
    const clip=loadSceneAnimation(module,animation.bytes.subarray(source.animationOffset,source.animationOffset+source.animationSize));cleanup.push(()=>clip.dispose());
    const blend=sequence===0?0:sequence===1?4:8,speed=sequence===2?0.5:1;
    for(const object of objects)check(module._portFighterAnimationStart(object,row.index,clip.tree,speed,blend)===0,'original animation attachment');
    const first=read(objects[0],1);let previous=null;
    for(let frame=0;frame<32;frame++) {
      for(let instance=0;instance<objects.length;instance++) {
        const object=objects[instance],peerFrame=read(objects[1-instance],1);module._portFighterAnimationStep(object);
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
  return {passed:true,gameplay:gameplay.report(),checks,clips,instances:objects.length,frames:clips.length*32*objects.length,changedValues:changed,
    limitation:'Original fighter animation attachment, interpolation skeleton, frame progression and dynamics on initialized fixtures. Preloaded trees; full motion-state changes, scripts, physics and retail parity remain unverified.'};
}
