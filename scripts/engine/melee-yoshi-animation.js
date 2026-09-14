import {BACKGROUND_RENDER, EMPTY_RENDER} from './melee-background.js';
import {cloneFountainAnimationProcedure, FOUNTAIN_ANIMATION_PROC as PROC,
  FOUNTAIN_ANIMATION_CAVE as CAVE} from './melee-fountain-animation.js';
const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;

// USA 1.02 Yoshi map 1 is the hidden decorative pass. Map 2 is Randall;
// map 3 owns Shy Guy logic. Neither is eligible. Keep material processing,
// collision-update counter and callbacks in the existing checked procedure.
export function planYoshiBackgroundAnimation(read32,read8,enabled,stage){
  if(typeof enabled!=='boolean'||stage!==8)throw Error('Yoshi animation requires a boolean mode and current stage 8');
  if(read32(0x801e322c)!==0x4e800020)throw Error('Unexpected Yoshi background callback');
  const lists=read32(0x804d782c);if(!valid(lists,24))throw Error('Invalid stage object list');
  const seen=new Set(),objects=[],writes=[],codeWrites=[];let g=read32(lists+20);
  while(g){
    if(!valid(g,0x38)||seen.has(g)||seen.size>=128)throw Error('Invalid Yoshi object chain');seen.add(g);
    const ground=read32(g+0x2c);
    if(read8(g)===0&&read8(g+1)===3&&valid(ground,0x20)&&read32(ground+4)===g&&read32(ground+0x14)===1){
      const render=read32(g+0x1c);
      if((read8(ground+0x11)>>>5)!==2||![BACKGROUND_RENDER,EMPTY_RENDER].includes(render)||(!enabled&&render!==EMPTY_RENDER))
        throw Error('Only the already-hidden Yoshi background may stop animation');
      const procs=new Set();let p=read32(g+0x18),found=0,stageCallback=0;
      while(p){
        if(!valid(p,0x18)||procs.has(p)||procs.size>=16||read32(p+0x10)!==g)throw Error('Invalid Yoshi process ownership');procs.add(p);
        const callback=read32(p+0x14);
        if(callback===0x801e322c)stageCallback++;
        if([PROC,CAVE].includes(callback)){
          if(++found!==1)throw Error('Duplicate Yoshi animation procedure');
          const target=enabled?PROC:CAVE;if(callback!==target)writes.push([p+0x14,target]);
          objects.push({gobj:g,mapId:1,process:p,enabled});
        }
        p=read32(p);
      }
      if(found!==1||stageCallback!==1)throw Error('Yoshi background procedures not identified');
    }
    g=read32(g+8);
  }
  if(objects.length!==1)throw Error('Expected exactly one Yoshi background');
  const code=cloneFountainAnimationProcedure(read32);
  for(let i=0;i<code.length;i++){
    const address=CAVE+i*4,current=read32(address);
    if(current!==0&&current!==code[i])throw Error('Animation code area already in use');
    if(!enabled&&current!==code[i])codeWrites.push([address,code[i]]);
  }
  return {objects,writes,codeWrites};
}

// Exact transform bits for every gameplay map; the cosmetic map is excluded.
// Include spawned item/projectile actors, including Shy Guys and their drops.
export function inspectYoshiGameplay(read32,read8){
  const lists=read32(0x804d782c);if(!valid(lists,40))throw Error('Invalid Yoshi lists');
  const objects=[],seen=new Set();let g=read32(lists+20);
  while(g){
    if(!valid(g,0x38)||seen.has(g)||seen.size>=128)throw Error('Invalid Yoshi stage chain');seen.add(g);
    const ground=read32(g+0x2c),mapId=valid(ground,0xcc)?read32(ground+0x14):-1;
    if(read8(g)===0&&read8(g+1)===3&&valid(ground,0xcc)&&read32(ground+4)===g&&[0,2,3].includes(mapId)){
      const joints=[],seenJ=new Set();
      const visit=(j,depth=0)=>{
        if(depth>64)throw Error('Yoshi joint depth exceeded');
        while(j){
          if(!valid(j,0x88)||seenJ.has(j)||seenJ.size>=2048)throw Error('Invalid Yoshi joint tree');seenJ.add(j);
          joints.push({local:Array.from({length:10},(_,i)=>read32(j+0x1c+i*4)),matrix:Array.from({length:12},(_,i)=>read32(j+0x44+i*4))});
          if(!(read32(j+0x14)&0x1000))visit(read32(j+0x10),depth+1);j=read32(j+8);
        }
      };
      const root=read32(g+0x28);if(!valid(root,0x88))throw Error('Invalid Yoshi gameplay root');visit(root);
      objects.push({mapId,modeWords:[read32(ground+0xc4),read32(ground+0xc8)],joints});
    }
    g=read32(g+8);
  }
  if(objects.length!==3||![0,2,3].every(id=>objects.some(o=>o.mapId===id)))throw Error('Yoshi gameplay maps missing');
  const items=[];seen.clear();g=read32(lists+0x24);
  while(g){
    if(!valid(g,0x38)||seen.has(g)||seen.size>=256)throw Error('Invalid Yoshi item chain');seen.add(g);
    const item=read32(g+0x2c);
    if(!valid(item,0xcc0)||read32(item+4)!==g)throw Error('Invalid Yoshi item owner');
    items.push({kind:read32(item+0x10),state:read32(item+0x24),animation:read32(item+0x28),
      facingBits:read32(item+0x2c),motionWords:Array.from({length:15},(_,i)=>read32(item+0x40+i*4)),
      damageWords:[read32(item+0xc9c),read32(item+0xca0)]});
    g=read32(g+8);
  }
  return {platforms:objects,items};
}
