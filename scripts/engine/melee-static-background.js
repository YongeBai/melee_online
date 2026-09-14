import {BACKGROUND_RENDER,EMPTY_RENDER} from './melee-background.js';
import {cloneFountainAnimationProcedure,FOUNTAIN_ANIMATION_PROC as PROC,
  FOUNTAIN_ANIMATION_CAVE as CAVE} from './melee-fountain-animation.js';

const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
// These are decorative stage objects in USA 1.02. Battlefield map 1 must
// already be hidden by black-background mode. Map 3 is deliberately excluded:
// it is the background transition controller, consumes the global game RNG and
// waits on its joint animation. Freezing it changes competitive simulation.
// Final Destination maps 1/2
// are the visible animated underside; maps 4-8 are its hidden backdrop layers.
// The main/collision objects (Battlefield 0/6, Final Destination 0/3) are absent.
const STAGES={
  31:new Map([[1,0x8021a26c]]),
  32:new Map([[1,0x8021a968],[2,0x8021a9a4],[4,0x8021ab80],[5,0x8021abd4],
    [6,0x8021ac28],[7,0x8021add0],[8,0x8021b28c]]),
};

export function planStaticBackgroundAnimation(read32,read8,enabled,stage){
  if(typeof enabled!=='boolean'||!STAGES[stage])throw Error('Static background requires Battlefield or Final Destination');
  const wanted=STAGES[stage],seen=new Set(),objects=[],writes=[],codeWrites=[];
  const lists=read32(0x804d782c);if(!valid(lists,24))throw Error('Invalid stage object list');
  let gobj=read32(lists+20);
  while(gobj){
    if(!valid(gobj,0x38)||seen.has(gobj)||seen.size>=128)throw Error('Invalid stage object chain');seen.add(gobj);
    const ground=read32(gobj+0x2c),mapId=valid(ground,0x20)?read32(ground+0x14):-1;
    if(read8(gobj)===0&&read8(gobj+1)===3&&valid(ground,0x20)&&read32(ground+4)===gobj&&wanted.has(mapId)){
      const render=read32(gobj+0x1c),category=read8(ground+0x11)>>>5;
      if(![BACKGROUND_RENDER,EMPTY_RENDER].includes(render))throw Error('Unexpected decorative render callback');
      if((stage===31||category===2)&&!enabled&&render!==EMPTY_RENDER)
        throw Error('Hidden decorative animation requires black-background mode');
      const processes=new Set();let process=read32(gobj+0x18),joint=0,stageProcess=0,material=0;
      while(process){
        if(!valid(process,0x18)||processes.has(process)||processes.size>=16||read32(process+0x10)!==gobj)
          throw Error('Invalid decorative process ownership');
        processes.add(process);const callback=read32(process+0x14);
        if(callback===wanted.get(mapId))stageProcess++;
        if(callback===0x801c1d38)material++;
        if([PROC,CAVE].includes(callback)){
          if(++joint!==1)throw Error('Duplicate decorative joint-animation procedure');
          const target=enabled?PROC:CAVE;if(callback!==target)writes.push([process+0x14,target]);
          objects.push({gobj,mapId,category,render,process,enabled});
        }
        process=read32(process);
      }
      if(joint!==1||stageProcess!==1||material!==1)throw Error('Decorative procedures not identified');
    }
    gobj=read32(gobj+8);
  }
  if(objects.length!==wanted.size||![...wanted.keys()].every(id=>objects.some(object=>object.mapId===id)))
    throw Error('Decorative stage objects missing');
  const code=cloneFountainAnimationProcedure(read32);
  for(let i=0;i<code.length;i++){
    const address=CAVE+i*4,current=read32(address);
    if(current!==0&&current!==code[i])throw Error('Animation code area already in use');
    if(!enabled&&current!==code[i])codeWrites.push([address,code[i]]);
  }
  return {enabled,stage,objects,writes,codeWrites,
    preserved:stage===31?['main Battlefield','three platforms','map 3 background RNG/transition controller']:['main Final Destination collision object']};
}
