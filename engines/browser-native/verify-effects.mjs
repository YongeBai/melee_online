import {convertCaptainEffects,convertCommonEffects} from './effect-assets.mjs';
import {installResidentFile} from './resident-files.mjs';
// Read back the original loader's relocated bank before any live effects can
// mutate it. HSD archive relocations and particle-relative offsets are distinct.
export function verifyResidentEffectBank(module,source,data) {
  const d=new DataView(module.HEAPU8.buffer),s=new DataView(source.image.buffer,32),base=source.stage?data-source.cmd:data-source.root-8;
  let checks=0;const check=(ok,message)=>{checks++;if(!ok)throw Error('Resident effects: '+message);};
  check(base>0,'loaded data base');
  for(const at of source.pointerSlots)check(d.getUint32(base+at,true)===base+s.getUint32(at,true),'HSD relocation '+at);
  if(!source.stage)check(d.getUint32(data-8,true)===(source.cmd===null?0:base+source.cmd)&&d.getUint32(data-4,true)===(source.tex===null?0:base+source.tex),'original bank roots');
  for(const [i,c] of source.commands.entries()) {
    check(d.getUint32(base+source.cmd+12+i*4,true)===(c?base+c.offset:0),'command relative relocation');
    if(!c)continue;const p=base+c.offset;
    c.shorts.forEach((v,j)=>check(d.getUint16(p+j*2,true)===v,'command short'));
    check(d.getUint32(p+8,true)===((c.kind&0xf1ffffff)|0x08000000)>>>0,'original command kind flags');
    c.floats.forEach((v,j)=>check(Object.is(d.getFloat32(p+12+j*4,true),v),'command float'));
    for(let at=c.scriptStart;at<c.scriptEnd;at++)check(module.HEAPU8[base+at]===source.image[32+at],'packed particle command byte');
  }
  for(const [i,t] of source.textures.entries()) {
    check(d.getUint32(base+source.tex+4+i*4,true)===(t?base+t.offset:0),'texture group relative relocation');
    if(!t)continue;const p=base+t.offset;
    [t.count,t.format,t.tlut,t.width,t.height].forEach((v,j)=>check(d.getUint32(p+j*4,true)===v,'texture descriptor'));
    check(d.getUint16(p+20,true)===t.palnum&&d.getUint16(p+22,true)===t.palflag,'palette fields');
    t.slots.forEach((v,j)=>check(d.getUint32(p+24+j*4,true)===(v===null?0:base+v),'texture/palette relative relocation'));
  }
  for(const e of source.effects) {
    check(Object.is(d.getFloat32(base+e.offset,true),e.lifetime),'model lifetime');
    for(const [at,size] of e.scene.writes)check(size===2?d.getUint16(base+at,true)===s.getUint16(at,true):d.getUint32(base+at,true)===s.getUint32(at,true),'model descriptor');
  }
  return {passed:true,checks,models:source.effects.length,commands:source.count,textures:source.textures.length,relocations:source.pointerSlots.size,unreferencedRelocations:source.unreferencedRelocations.length};
}
export function verifyEffects(module,input,{common=false}={}) {
  const source=(common?convertCommonEffects:convertCaptainEffects)(input);let checks=0,updates=0,changed=0,particleSteps=0,peakParticles=0,peakGenerators=0;const rows=[];
  const check=(ok,message)=>{checks++;if(!ok)throw Error('Effects: '+message);};
  const view=()=>new DataView(module.HEAPU8.buffer),ptr=p=>view().getUint32(p,true);
  const operand=module._malloc(5);let operandChecks=0,seed=0x8a617bc3;
  try {for(let i=0;i<4104;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const bits=i<8?[0,0x80000000,1,0x7f800000,0xff800000,0x7fc00001,0x3f800000,0xc0200000][i]:seed;view().setUint32(operand+1,bits);check((module._portParticleOperandBits(operand+1)>>>0)===bits,'packed float operand bits');operandChecks++;}}finally{module._free(operand);}
  module._portEffectsInitialize();installResidentFile(module,common?'EfCoData.dat':'EfCaData.dat',source.image);
  const load=()=>common?module._portCommonEffectsLoad():module._portEffectsLoad();
  const allocations=module._portFileAllocations(),data=load(),base=data-source.root-8;
  check(data>8&&module._portFileAllocations()===allocations+2,'original effect archive loading');
  check(load()===data&&module._portFileAllocations()===allocations+2,'original loaded-bank reuse');
  const bank=verifyResidentEffectBank(module,source,data);checks+=bank.checks;
  if(!common)check(module._portEffectsRead(1,0)===4017&&module._portEffectsRead(2,0)===7,'original particle bank registration');
  const metrics=()=>Array.from({length:10},(_,i)=>module._portSceneLiveMetric(i));
  const initialMetrics=metrics(),initialObjects=module._portRuntimeObjectsUsed();
  const parent=module._portEffectParentCreate();check(parent,'live effect parent');
  const baseline={metrics:metrics(),objects:module._portRuntimeObjectsUsed(),live:module._portSceneLiveObjects()};
  const tickParticles=()=>{module._portEffectsParticleStep();particleSteps++;peakParticles=Math.max(peakParticles,module._portEffectsRead(8,0));peakGenerators=Math.max(peakGenerators,module._portEffectsRead(6,0));};
  for(const [index,e] of source.effects.entries()) {
    check(view().getFloat32(data+index*20,true)===e.lifetime,'effect lifetime descriptor');
    const n=e.scene.model.tree.nodes.length,objects=[],nodes=[module._malloc(n*4),module._malloc(n*4)],matrices=[module._malloc(n*48),module._malloc(n*48)],life=Math.trunc(e.lifetime)?Math.trunc(e.lifetime)+1:0,steps=life?life-1:32;
    try {
      for(let i=0;i<2;i++){
        const o=module._portEffectBankCreate(source.bank,index,parent);check(o,'original effect creation');objects.push(o);
        check(module._portEffectLife(o)===life,'original effect lifetime');
        check(module._portSceneCollect(module._portSceneObjectRoot(o),nodes[i],n)===n,'original effect hierarchy');
        for(const metric of [3,6,7])check(Math.abs(module._portSceneMetric(n,nodes[i],metric)-e.scene.metrics[metric])<1e-5,'effect scene geometry and skin');
      }
      for(let i=0;i<n;i++)check(ptr(nodes[0]+i*4)!==ptr(nodes[1]+i*4),'independent effect joints');
      let before=null;
      for(let frame=0;frame<steps;frame++) {
        for(let i=0;i<2;i++){module._portEffectStep(objects[i]);updates++;check(module._portEffectLife(objects[i])===(life?life-frame-1:0),'original effect countdown');module._portSceneMatrices(n,nodes[i],matrices[i]);}
        tickParticles();
        const a=new Float32Array(module.HEAPU8.buffer,matrices[0],n*12),b=new Float32Array(module.HEAPU8.buffer,matrices[1],n*12);
        for(let j=0;j<a.length;j++){check(Number.isFinite(a[j])&&Object.is(a[j],b[j]),'finite independent animated effects');if(before&&before[j]!==a[j])changed++;}before=Float32Array.from(a);
      }
      if(life){while(objects.length){module._portEffectStep(objects.shift());updates++;}}
      else {module._portEffectsDestroyOwner(parent);updates+=objects.length;objects.length=0;}
      let drainFrames=0;
      while(drainFrames<600&&(module._portEffectsRead(6,0)||module._portEffectsRead(7,0)||module._portEffectsRead(8,0))){tickParticles();drainFrames++;}
      check(!module._portEffectsRead(6,0)&&!module._portEffectsRead(7,0)&&!module._portEffectsRead(8,0),'original particle and generator expiration');
      check(metrics().every((v,i)=>v===baseline.metrics[i]),'all ten effect object pools return to baseline '+JSON.stringify({bank:source.bank,index,metrics:metrics(),baseline:baseline.metrics}));
      check(module._portRuntimeObjectsUsed()===baseline.objects&&module._portSceneLiveObjects()===baseline.live&&module._portEffectsRead(5,0)===0,'original effect expiration releases all objects '+JSON.stringify({index,objects:module._portRuntimeObjectsUsed(),live:module._portSceneLiveObjects(),effects:module._portEffectsRead(5,0),metrics:metrics(),baseline}));
      rows.push({index,nodes:n,meshes:e.scene.model.meshes.length,instances:2,updates:(steps+1)*2,lifetime:e.lifetime,drainFrames});
    } finally {for(const o of objects)module._portSceneObjectFree(o);for(const p of [...nodes,...matrices])module._free(p);}
  }
  module._portSceneObjectFree(parent);
  check(metrics().every((v,i)=>v===initialMetrics[i])&&module._portRuntimeObjectsUsed()===initialObjects,'effect parent teardown');
  check(changed>0,'animated effect motion');check(module._portFileClear()===0,'effect prefetch release');
  return {passed:true,bank,checks,operandChecks,commands:source.count,textureGroups:source.textures.length,models:rows,updates,changed,particleSteps,peakParticles,peakGenerators,retainedArchiveAllocations:module._portFileAllocations()-allocations,
    limitation:'Original effect bank loading, model creation, animation, countdown and expiration. No comprehensive particle interpreter corpus, GPU drawing, fighter-attached effects or match performance.'};
}
