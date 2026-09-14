// USA 1.02 Fountain-only cosmetic experiment. grIzumi_801CCEA0 draws an
// additional camera pass into an 80x60 RGB565 reflection texture. Replace
// that render callback only; retain the stage/platform processes and camera.
export const REFLECTION_RENDER=0x801ccea0;
export const REFLECTION_EMPTY=0x8021a60c;
export function planFountainReflection(read32,read8,enabled) {
 if(typeof enabled!=='boolean')throw Error('Reflection mode must be boolean');
 if(read32(REFLECTION_RENDER)!==0x7c0802a6||read32(REFLECTION_EMPTY)!==0x4e800020)throw Error('Reflection experiment requires unmodified USA 1.02 callbacks');
 const valid=(p,bytes)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+bytes<=0x81800000;
 const lists=read32(0x804d782c);if(!valid(lists,0x4c))throw Error('Invalid camera-object list');
 let gobj=read32(lists+0x48);const seen=new Set(),writes=[],clear=[],objects=[];
 while(gobj){
  if(!valid(gobj,0x38)||seen.has(gobj)||seen.size>=128)throw Error('Invalid reflection-object chain');seen.add(gobj);
  const cb=read32(gobj+0x1c);
  if(read8(gobj)===0&&read8(gobj+1)===0x11&&read8(gobj+2)===0x12&&read8(gobj+6)===read8(0x804d784b)&&read8(gobj+7)===3&&[REFLECTION_RENDER,REFLECTION_EMPTY].includes(cb)){
   const camera=read32(gobj+0x28),reflection=read32(gobj+0x2c);
   if(!valid(camera,0x40)||!valid(reflection,0x34))throw Error('Invalid Fountain reflection data');
   const image=read32(reflection+0x30);
   if(!valid(image,0x18)||read32(image+4)!==((80<<16)|60)||read32(image+8)!==4||read32(image+12)!==0)throw Error('Unexpected Fountain reflection image');
   const pixels=read32(image),bytes=80*60*2;if(!valid(pixels,bytes))throw Error('Invalid reflection pixel allocation');
   objects.push({gobj,camera,image,pixels,bytes});
   const target=enabled?REFLECTION_RENDER:REFLECTION_EMPTY;
   if(cb!==target){writes.push([gobj+0x1c,target]);if(!enabled)clear.push([pixels,bytes]);}
  }
  gobj=read32(gobj+8);
 }
 if(objects.length>1)throw Error('Unexpected duplicate Fountain reflection cameras');
 return {writes,clear,objects};
}
