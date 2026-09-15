import {convertFighterAttributes,attributeProbeOffsets} from './fighter-assets.mjs';
const same=(a,b,label)=> {if(!Object.is(a,b))throw Error(label+': '+a+' != '+b);};
export function verifyFighters(module,files) {
  const results=[];
  for(const {name,bytes} of files) {
    const attrs=convertFighterAttributes(bytes,name), ptr=module._malloc(attrs.bytes.length),
      output=module._malloc(121*4);
    if(!ptr||!output)throw Error('Fighter probe allocation failed');
    try {
      module.HEAPU8.set(attrs.bytes,ptr);
      attributeProbeOffsets.forEach((_,i)=>same(module._portFighterAttribute(ptr,i),attrs.values[i],name+' attribute '+i));
      const gravity=attrs.values[8],terminal=attrs.values[9],friction=attrs.values[1];
      for(const initial of [0,attrs.values[5],-attrs.values[14],0.03125,-0.03125]) {
        module._portFighterPhysicsProbe(ptr,initial,120,output);
        let velocity=Math.fround(initial);
        for(let i=0;i<120;i++) {
          velocity=Math.max(Math.fround(velocity-gravity),-terminal);
          same(module.HEAPF32[output/4+i],velocity,name+' gravity frame '+i);
        }
        const expected=Math.abs(friction)>Math.abs(initial)?-initial:initial>0?-friction:friction;
        same(module.HEAPF32[output/4+120],expected,name+' ground friction');
      }
      results.push({name,kind:attrs.kind,attributeValues:attrs.values.length,gravitySteps:600,
        groundFrictionCases:5,passed:true});
    } finally {module._free(output);module._free(ptr);}
  }
  return results;
}
