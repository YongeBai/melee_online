// The guarded code area follows the seven tap-jump stubs and precedes their flags.
// Private USA 1.02 experiment: stop joint animation only on already-hidden
// Fountain map objects 0/1. Retain material processing, the collision update
// counter, callbacks, the main stage, moving platforms, fighters and camera.
import {BACKGROUND_RENDER,EMPTY_RENDER} from './melee-background.js';
export const FOUNTAIN_ANIMATION_PROC=0x801c1cd0;
export const FOUNTAIN_ANIMATION_CAVE=0x80002c00;
export const FOUNTAIN_ANIMATION_BYTES=0x68;
export function cloneFountainAnimationProcedure(read32){
 const words=Array.from({length:FOUNTAIN_ANIMATION_BYTES/4},(_,i)=>read32(FOUNTAIN_ANIMATION_PROC+i*4)>>>0);
 let hash=2166136261;for(const word of words)hash=Math.imul(hash^word,16777619)>>>0;
 if(hash!==0x1fbe4a71)throw Error('Unexpected USA 1.02 ground animation procedure');
 // Omit HSD_JObjAnimAll. Relocate the retained external grMaterial call.
 // All other instructions and internal branches retain their original offsets.
 words[8]=0x60000000;
 const from=FOUNTAIN_ANIMATION_CAVE+10*4,to=0x801c9698;
 words[10]=(0x48000001|((to-from)&0x03fffffc))>>>0;
 return words;
}
export function planFountainAnimation(read32,read8,enabled){
 if(typeof enabled!=='boolean')throw Error('Animation mode must be boolean');
 const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
 const lists=read32(0x804d782c);if(!valid(lists,24))throw Error('Invalid stage-object list');
 const seen=new Set(),objects=[],writes=[],codeWrites=[];let g=read32(lists+20);
 while(g){
  if(!valid(g,0x38)||seen.has(g)||seen.size>=128)throw Error('Invalid stage-object chain');seen.add(g);
  const ground=read32(g+0x2c),render=read32(g+0x1c);
  if(read8(g)===0&&read8(g+1)===3&&valid(ground,0x20)&&read32(ground+4)===g&&[0,1].includes(read32(ground+0x14))&&(read8(ground+0x11)>>>5)!==2){
   if(![BACKGROUND_RENDER,EMPTY_RENDER].includes(render)||(!enabled&&render!==EMPTY_RENDER))throw Error('Only already-hidden scenery animation may be disabled');
   const procs=new Set();let p=read32(g+0x18),found=0;
   while(p){
    if(!valid(p,0x18)||procs.has(p)||procs.size>=16||read32(p+0x10)!==g)throw Error('Invalid scenery process ownership');procs.add(p);
    const callback=read32(p+0x14);
    if([FOUNTAIN_ANIMATION_PROC,FOUNTAIN_ANIMATION_CAVE].includes(callback)){
     if(++found!==1)throw Error('Duplicate scenery animation process');
     const target=enabled?FOUNTAIN_ANIMATION_PROC:FOUNTAIN_ANIMATION_CAVE;
     if(callback!==target)writes.push([p+0x14,target]);
     objects.push({gobj:g,mapId:read32(ground+0x14),process:p,enabled});
    }
    p=read32(p);
   }
   if(found!==1)throw Error('Scenery animation process not identified');
  }
  g=read32(g+8);
 }
 if(objects.length!==2)throw Error('Both Fountain scenery objects are required');
 const code=cloneFountainAnimationProcedure(read32);
 for(let i=0;i<code.length;i++){
  const address=FOUNTAIN_ANIMATION_CAVE+i*4,current=read32(address);
  if(current!==0&&current!==code[i])throw Error('Animation code-handler area already in use at '+address.toString(16)+' value '+current.toString(16)+'; zero areas '+[0x80002c00,0x80002d00,0x80002e00].filter(start=>Array.from({length:26},(_,j)=>read32(start+j*4)).every(word=>word===0)).map(a=>a.toString(16)).join(','));
  if(!enabled&&current!==code[i])codeWrites.push([address,code[i]]);
 }
 return {objects,writes,codeWrites};
}
