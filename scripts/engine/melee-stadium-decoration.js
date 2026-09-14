import {BACKGROUND_RENDER,EMPTY_RENDER} from './melee-background.js';
import {STADIUM_TRANSFORMATION_CONTROLLER} from './melee-stadium-freeze.js';

const RETURN=0x4e800020;
const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;

// Frozen Stadium keeps map 5 as the neutral playable stage. Map 2 owns the
// transformation controller and a separate generic draw root. Once that
// controller is frozen at its checked idle state, its draw root is decorative:
// map 0 and map 5 continue to render and all collision/state objects remain.
export function planFrozenStadiumDecoration(read32,read8,enabled){
  if(typeof enabled!=='boolean')throw Error('Frozen Stadium decoration mode must be boolean');
  if(read32(BACKGROUND_RENDER)!==0x7c0802a6||read32(EMPTY_RENDER)!==RETURN)
    throw Error('Frozen Stadium decoration requires original USA 1.02 callbacks');
  const lists=read32(0x804d782c);if(!valid(lists,24))throw Error('Invalid Stadium object list');
  const seen=new Set(),objects=[],preserved=[];let gobj=read32(lists+20);
  while(gobj){
    if(!valid(gobj,0x38)||seen.has(gobj)||seen.size>=128)throw Error('Invalid Stadium object chain');
    seen.add(gobj);const ground=read32(gobj+0x2c),mapId=valid(ground,0xec)?read32(ground+0x14):-1;
    if(read8(gobj)===0&&read8(gobj+1)===3&&valid(ground,0xec)&&read32(ground+4)===gobj){
      if(mapId===0||mapId===5)preserved.push({gobj,mapId,callback:read32(gobj+0x1c)});
      if(mapId===2){
        const callback=read32(gobj+0x1c),mode=(read8(ground+0xdc)<<8)|read8(ground+0xdd),
          activeMap=(read8(ground+0xde)<<8)|read8(ground+0xdf),incomingObject=read32(ground+0xe8);
        if((read8(ground+0x11)>>>5)!==1||![BACKGROUND_RENDER,EMPTY_RENDER].includes(callback)||
            mode!==0||activeMap!==5||incomingObject!==0)
          throw Error('Stadium transformation draw root is not idle on the neutral map');
        objects.push({gobj,ground,mapId,callback,mode,activeMap});
      }
    }
    gobj=read32(gobj+8);
  }
  if(objects.length!==1||!preserved.some(o=>o.mapId===0)||!preserved.some(o=>o.mapId===5))
    throw Error('Expected Stadium transformation, main and neutral objects');
  if(!enabled&&read32(STADIUM_TRANSFORMATION_CONTROLLER)!==RETURN)
    throw Error('Decoration may be hidden only after Stadium transformations are frozen');
  const target=enabled?BACKGROUND_RENDER:EMPTY_RENDER;
  return {enabled,objects,preserved,writes:objects[0].callback===target?[]:[[objects[0].gobj+0x1c,target]]};
}
