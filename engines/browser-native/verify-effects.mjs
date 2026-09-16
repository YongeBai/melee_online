import {convertCaptainEffects} from './effect-assets.mjs';
import {installResidentFile} from './resident-files.mjs';
export function verifyEffects(module,input) {
  const source=convertCaptainEffects(input);let checks=0,updates=0,changed=0,particleSteps=0,peakParticles=0,peakGenerators=0;const rows=[];
  const check=(ok,message)=>{checks++;if(!ok)throw Error('Effects: '+message);};
  const view=()=>new DataView(module.HEAPU8.buffer),ptr=p=>view().getUint32(p,true);
  const operand=module._malloc(5);let operandChecks=0,seed=0x8a617bc3;
  try {for(let i=0;i<4104;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const bits=i<8?[0,0x80000000,1,0x7f800000,0xff800000,0x7fc00001,0x3f800000,0xc0200000][i]:seed;view().setUint32(operand+1,bits);check((module._portParticleOperandBits(operand+1)>>>0)===bits,'packed float operand bits');operandChecks++;}}finally{module._free(operand);}
  module._portEffectsInitialize();installResidentFile(module,'EfCaData.dat',source.image);
  const allocations=module._portFileAllocations(),data=module._portEffectsLoad(),base=data-source.root-8;
  check(data>8&&module._portFileAllocations()===allocations+2,'original effect archive loading');
  check(module._portEffectsLoad()===data&&module._portFileAllocations()===allocations+2,'original loaded-bank reuse');
  check(module._portEffectsRead(1,0)===4017&&module._portEffectsRead(2,0)===7,'original particle bank registration');
  for(const [index,c] of source.commands.entries()) {
    const p=module._portEffectsRead(3,index);check(p===(c?base+c.offset:0),'original command-bank relative relocation');if(!c)continue;
    c.shorts.forEach((v,i)=>check(view().getUint16(p+i*2,true)===v,'particle command short'));
    check(ptr(p+8)===((c.kind&0xF1FFFFFF)|0x08000000)>>>0,'original command kind conversion');
    c.floats.forEach((v,i)=>check(Object.is(view().getFloat32(p+12+i*4,true),v),'particle float parameter'));
    for(let at=c.scriptStart;at<c.scriptEnd;at++)check(module.HEAPU8[base+at]===source.image[32+at],'packed particle script unchanged');
  }
  for(const [index,t] of source.textures.entries()) {
    const p=module._portEffectsRead(4,index);check(p===(t?base+t.offset:0),'original texture-bank relative relocation');if(!t)continue;
    [t.count,t.format,t.tlut,t.width,t.height].forEach((v,i)=>check(ptr(p+i*4)===v,'texture descriptor word'));
    check(view().getUint16(p+20,true)===t.palnum&&view().getUint16(p+22,true)===t.palflag,'texture palette shorts');
    t.slots.forEach((v,i)=>check(ptr(p+24+i*4)===(v===null?0:base+v),'original texture/palette pointer'));
  }
  const metrics=()=>Array.from({length:10},(_,i)=>module._portSceneLiveMetric(i));
  const initialMetrics=metrics(),initialObjects=module._portRuntimeObjectsUsed();
  const parent=module._portEffectParentCreate();check(parent,'live effect parent');
  const baseline={metrics:metrics(),objects:module._portRuntimeObjectsUsed(),live:module._portSceneLiveObjects()};
  const tickParticles=()=>{module._portEffectsParticleStep();particleSteps++;peakParticles=Math.max(peakParticles,module._portEffectsRead(8,0));peakGenerators=Math.max(peakGenerators,module._portEffectsRead(6,0));};
  for(const [index,e] of source.effects.entries()) {
    check(view().getFloat32(data+index*20,true)===e.lifetime,'effect lifetime descriptor');
    const n=e.scene.model.tree.nodes.length,objects=[],nodes=[module._malloc(n*4),module._malloc(n*4)],matrices=[module._malloc(n*48),module._malloc(n*48)],life=Math.trunc(e.lifetime)+1;
    try {
      for(let i=0;i<2;i++){
        const o=module._portEffectCreate(index,parent);check(o,'original effect creation');objects.push(o);
        check(module._portEffectLife(o)===life,'original effect lifetime');
        check(module._portSceneCollect(module._portSceneObjectRoot(o),nodes[i],n)===n,'original effect hierarchy');
        for(const metric of [3,6,7])check(Math.abs(module._portSceneMetric(n,nodes[i],metric)-e.scene.metrics[metric])<1e-5,'effect scene geometry and skin');
      }
      for(let i=0;i<n;i++)check(ptr(nodes[0]+i*4)!==ptr(nodes[1]+i*4),'independent effect joints');
      let before=null;
      for(let frame=0;frame<life-1;frame++) {
        for(let i=0;i<2;i++){module._portEffectStep(objects[i]);updates++;check(module._portEffectLife(objects[i])===life-frame-1,'original effect countdown');module._portSceneMatrices(n,nodes[i],matrices[i]);}
        tickParticles();
        const a=new Float32Array(module.HEAPU8.buffer,matrices[0],n*12),b=new Float32Array(module.HEAPU8.buffer,matrices[1],n*12);
        for(let j=0;j<a.length;j++){check(Number.isFinite(a[j])&&Object.is(a[j],b[j]),'finite independent animated effects');if(before&&before[j]!==a[j])changed++;}before=Float32Array.from(a);
      }
      while(objects.length){module._portEffectStep(objects.shift());updates++;}
      let drainFrames=0;
      while(drainFrames<600&&(module._portEffectsRead(6,0)||module._portEffectsRead(7,0)||module._portEffectsRead(8,0))){tickParticles();drainFrames++;}
      check(!module._portEffectsRead(6,0)&&!module._portEffectsRead(7,0)&&!module._portEffectsRead(8,0),'original particle and generator expiration');
      check(metrics().every((v,i)=>v===baseline.metrics[i]),'all ten effect object pools return to baseline');
      check(module._portRuntimeObjectsUsed()===baseline.objects&&module._portSceneLiveObjects()===baseline.live&&module._portEffectsRead(5,0)===0,'original effect expiration releases all objects '+JSON.stringify({index,objects:module._portRuntimeObjectsUsed(),live:module._portSceneLiveObjects(),effects:module._portEffectsRead(5,0),metrics:metrics(),baseline}));
      rows.push({index,nodes:n,meshes:e.scene.model.meshes.length,instances:2,updates:life*2,lifetime:e.lifetime,drainFrames});
    } finally {for(const o of objects)module._portSceneObjectFree(o);for(const p of [...nodes,...matrices])module._free(p);}
  }
  module._portSceneObjectFree(parent);
  check(metrics().every((v,i)=>v===initialMetrics[i])&&module._portRuntimeObjectsUsed()===initialObjects,'effect parent teardown');
  check(changed>0,'animated effect motion');check(module._portFileClear()===0,'effect prefetch release');
  return {passed:true,checks,operandChecks,commands:source.count,textureGroups:source.textures.length,models:rows,updates,changed,particleSteps,peakParticles,peakGenerators,retainedArchiveAllocations:module._portFileAllocations()-allocations,
    limitation:'Original effect bank loading, model creation, animation, countdown and expiration. No comprehensive particle interpreter corpus, GPU drawing, fighter-attached effects or match performance.'};
}
