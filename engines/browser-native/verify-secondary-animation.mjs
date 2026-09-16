import {convertSecondaryAnimations} from './secondary-animation-assets.mjs';
export function verifySecondaryAnimation(module,{name,bytes,objects,open,partNodes,motions,visibility}) {
  const source=convertSecondaryAnimations(bytes,name,partNodes.length),root=open('Secondary',source.image,'native_part_animations'),shield=root-source.table+source.shield;
  let checks=0,applications=0,steps=0,poseApplications=0,changed=0;
  const check=(ok,text)=>{checks++;if(!ok)throw Error(name+' secondary: '+text);};
  const joint=(o,p,b,f)=>module._portSecondaryJointRead(o,p,b,f),state=(o,c,f)=>module._portPartAnimationRead(o,c,f);
  const fields=[0,1,2,4,5,6,7,8,9];
  const parts=partNodes.map((n,p)=>n<0?-1:p).filter(p=>p>=0);
  function snapshot(o,blend=0){return parts.flatMap(p=>fields.map(f=>joint(o,p,blend,f)));}
  const counts=module._malloc(source.counts.length*4);
  try {
    new Uint32Array(module.HEAPU8.buffer,counts,source.counts.length).set(source.counts);
    for(const object of objects)check(module._portSecondaryAttach(object,root,shield,source.counts.length,counts,partNodes.length)===0,'bind original tables');
  } finally {module._free(counts);}
  for(const cmd of motions.scripts.commands.values())if(cmd.opcode===41) {
    const word=motions.archive.data.getUint32(cmd.offset),channel=(word>>>19)&127,variant=(word>>>12)&127;
    check(channel<source.counts.length&&variant<source.counts[channel],'primary script variant extent');
  }
  // All variants, including the two intentionally NULL Kirby externs. Run
  // original attachment, interpolation and restoration on independent owners.
  for(const [channel,row] of source.channels.entries())for(const [variant,tree] of row.variants.entries())for(const duration of [0,4]) {
    const end=tree?.nodes.find(n=>n.animation)?.animation.end??0,rate=duration?Math.fround(end/duration):0;
    const affected=[];let part=row.start;
    for(const node of tree?.nodes??[]) {
      while(part<partNodes.length&&partNodes[part]<0)part++;
      check(part<partNodes.length,'animation node maps inside part allocation');
      if(node.animation&&!joint(objects[0],part,0,11))affected.push(part);part++;
    }
    const initial=snapshot(objects[0]),peer=snapshot(objects[1],1);
    for(const [instance,object] of objects.entries()) {
      check(module._portPartAnimationApply(object,channel,variant,duration)===0,'original part animation attachment');applications++;
      if(instance===0)check(JSON.stringify(snapshot(objects[1],1))===JSON.stringify(peer),'attachment leaves peer skeleton unchanged');
      check(state(object,channel,0)===variant&&state(object,channel,2)===duration&&state(object,channel,3)===0&&state(object,channel,4)===rate,'original part animation state');
      for(const p of parts)check(joint(object,p,0,13)===Number(affected.includes(p)),'original enabled part mask');
    }
    const frames=duration&&rate?Math.ceil(duration/rate)+1:1;check(frames<=256,'bounded blend fixture');
    for(let frame=0;frame<frames;frame++) {
      for(const object of objects){module._portPartAnimationStep(object);steps++;}
      for(const object of objects) {
        const expected=Math.min(duration,Math.fround((frame+1)*rate));
        check(Math.abs(state(object,channel,3)-expected)<1e-5,'original blend progress');
      }
      const a=snapshot(objects[0]),b=snapshot(objects[1]);
      for(let i=0;i<a.length;i++){check(Number.isFinite(a[i])&&Object.is(a[i],b[i]),'finite deterministic part pose');if(a[i]!==initial[i])changed++;}
    }
    if(!duration||rate)for(const object of objects)for(const p of row.bones)if(affected.includes(p)) {
      for(const field of fields)check(joint(object,p,0,field)===joint(object,p,1,field),'completed blend copies target SRT');
    }
    for(const object of objects) {
      module._portPartAnimationClear(object,channel);check(state(object,channel,0)===-1,'original channel reset');
      for(const p of parts)check(joint(object,p,0,13)===0,'restoration clears part overrides');
    }
  }
  // Exercise the exact three pose consumers used by Guard. Guard mechanics,
  // size/health, shield tilt and effects still require the full state loop.
  if(source.shieldNodes.length) {
    check(source.shieldNodes.length===parts.length&&source.shieldNodes[0].child===1&&source.shieldNodes[0].next===-1,'shield pose skeleton correspondence');
    for(const [mode,weight] of [[1,.25],[2,.75],[0,1]]) {
      const blend=mode===2?1:0,before=objects.map(o=>snapshot(o,blend));
      for(const object of objects){check(module._portShieldPoseApply(object,mode,weight)===1,'original shield pose consumer');poseApplications++;}
      for(let i=1;i<source.shieldNodes.length;i++) {
        const node=source.shieldNodes[i],part=parts[i];
        for(const [instance,object] of objects.entries()) {
          const dynamic=joint(object,part,blend,11),copy=joint(object,part,blend,12);
          for(let axis=0;axis<3;axis++) {
            const oldPos=before[instance][i*9+6+axis],oldScale=before[instance][i*9+3+axis];
            const mix=(value,old)=>Math.fround(Math.fround(value*weight)+Math.fround(old*Math.fround(1-weight)));
            const expectedPos=mode===0||copy?node.translation[axis]:dynamic?oldPos:mix(node.translation[axis],oldPos);
            const actual=joint(object,part,blend,7+axis);
            check(actual===expectedPos,'original shield translation');
            if(mode!==0||part!==visibility.bones[0]) {
              const expectedScale=mode===0||copy?node.scale[axis]:dynamic?oldScale:mix(node.scale[axis],oldScale);
              check(joint(object,part,blend,4+axis)===expectedScale,'original shield scale');
            }
          }
        }
      }
      const a=snapshot(objects[0],blend),b=snapshot(objects[1],blend);for(let i=0;i<a.length;i++)check(Number.isFinite(a[i])&&Object.is(a[i],b[i]),'finite deterministic shield pose');
    }
  } else for(const object of objects)check(module._portShieldPoseApply(object,0,1)===0,'Yoshi has no ordinary shield pose');
  return {passed:true,checks,channels:source.channels.length,variants:source.counts.reduce((a,b)=>a+b,0),nullExternals:source.nullExternals.length,applications,steps,poseApplications,shieldNodes:source.shieldNodes.length,changedValues:changed,
    limitation:'Original per-part animation and shield-pose consumers on initialized fighters, all imported variants. Full action scripts, shield gameplay/effects, Yoshi shield mechanics and retail parity are not established by this fixture.'};
}
