// USA 1.02 Fountain map objects 0 and 1 have animation initialization and
// empty gameplay processes. Object 3 owns collision/platform setup; keep it.
// Category-2 objects already belong to the independent background toggle.
import {BACKGROUND_RENDER,EMPTY_RENDER} from './melee-background.js';
export function planFountainScenery(read32,read8,enabled){
 if(typeof enabled!=='boolean')throw Error('Scenery mode must be boolean');
 if(read32(BACKGROUND_RENDER)!==0x7c0802a6||read32(EMPTY_RENDER)!==0x4e800020)throw Error('Scenery requires original USA 1.02 callbacks');
 const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
 const lists=read32(0x804d782c);if(!valid(lists,24))throw Error('Invalid stage-object list');
 let g=read32(lists+20);const seen=new Set(),objects=[],writes=[];
 while(g){
  if(!valid(g,0x38)||seen.has(g)||seen.size>=128)throw Error('Invalid scenery-object chain');seen.add(g);
  const ground=read32(g+0x2c),cb=read32(g+0x1c);
  if(read8(g)===0&&read8(g+1)===3&&valid(ground,0x20)&&read32(ground+4)===g&&[0,1].includes(read32(ground+0x14))&&(read8(ground+0x11)>>>5)!==2&&[BACKGROUND_RENDER,EMPTY_RENDER].includes(cb)){
   objects.push({gobj:g,mapId:read32(ground+0x14)});const target=enabled?BACKGROUND_RENDER:EMPTY_RENDER;if(cb!==target)writes.push([g+0x1c,target]);
  }
  g=read32(g+8);
 }
 return {objects,writes};
}


// Private render-only diagnostic for the Fountain main map object. This does
// not remove joints, processes, materials, animation, collision or cameras.
// HSD_JObjDispSub tests DOBJ_HIDDEN before calling the material/mesh renderer.
export function inspectFountainGeometry(read32,read8,readFloat,{mapIds=[3],stageName='Fountain',renderCallback=0x801cd220}={}) {
 const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
 const requirePtr=(p,n)=>{if(!valid(p,n))throw Error('Invalid Fountain geometry pointer');};
 const lists=read32(0x804d782c);requirePtr(lists,24);
 const objects=[],seenG=new Set();let g=read32(lists+20);
 while(g){
  requirePtr(g,0x38);if(seenG.has(g)||seenG.size>=128)throw Error('Invalid Fountain object chain');seenG.add(g);
  const ground=read32(g+0x2c);
  if(read8(g)===0&&read8(g+1)===3&&valid(ground,0x20)&&read32(ground+4)===g&&mapIds.includes(read32(ground+0x14))){
   const mapId=read32(ground+0x14);
   if(read32(g+0x1c)!==renderCallback||read32(renderCallback)!==0x7c0802a6)throw Error('Unexpected '+stageName+' stage renderer');
   const root=read32(g+0x28),joints=[],draws=[],seenJ=new Set(),seenD=new Set();requirePtr(root,0x88);
   const visit=(j,parent,depth)=>{
    if(depth>64)throw Error('Fountain joint tree too deep');
    while(j){
     requirePtr(j,0x88);if(seenJ.has(j)||seenJ.size>=2048)throw Error('Invalid Fountain joint chain');seenJ.add(j);
     if(read32(j+12)!==parent)throw Error('Fountain joint parent mismatch');
     const flags=read32(j+20),index=joints.length;
     const entry={index,address:j,parent,flags,local:[0,4,8].map(k=>readFloat(j+0x38+k)),world:[0x50,0x60,0x70].map(k=>readFloat(j+k)),draws:[]};joints.push(entry);
     if(!(flags&0x4020)){
      let d=read32(j+24);
      while(d){requirePtr(d,24);if(seenD.has(d)||seenD.size>=2048)throw Error('Invalid Fountain display-object chain');seenD.add(d);
       const draw={index:draws.length,joint:index,address:d,flags:read32(d+20),material:read32(d+8),mesh:read32(d+12)};
       entry.draws.push(draw.index);draws.push(draw);d=read32(d+4);
      }
     }
     if(flags&0x1000)throw Error('Instanced Fountain geometry needs separate validation');
     if(read32(j+16))visit(read32(j+16),j,depth+1);
     j=read32(j+8);
    }
   };
   visit(root,0,0);objects.push({gobj:g,mapId,root,joints,draws});
  }
  g=read32(g+8);
 }
 if(objects.length!==mapIds.length||new Set(objects.map(object=>object.mapId)).size!==mapIds.length)
  throw Error('Expected checked '+stageName+' stage mesh objects');
 return {objects,diagnosticOnly:true};
}

// Read-only inventory for the Yoshi main stage and the Shy Guy stage object.
// Map 2 is Randall and is intentionally never in a mesh-edit candidate.
export function inspectYoshiGeometry(read32,read8,readFloat){
 return inspectFountainGeometry(read32,read8,readFloat,{mapIds:[0,3],stageName:'Yoshi',renderCallback:BACKGROUND_RENDER});
}

// Seven two-material meshes with low joint origins draw Yoshi's foreground
// water waves. Change only DOBJ_HIDDEN; the Shy Guy map object, its processes,
// joints, collision, animations and all native camera state remain present.
export function planYoshiOffscreenDecor(geometry,enabled){
 if(typeof enabled!=='boolean')throw Error('Yoshi offscreen visibility requires a boolean mode');
 const collision=geometry.objects?.find(object=>object.mapId===0);
 const display=geometry.objects?.find(object=>object.mapId===3);
 if(geometry.objects?.length!==2||collision?.joints.length!==23||collision.draws.length!==0||
    display?.joints.length!==22||display.draws.length!==102)
  throw Error('Unexpected Yoshi stage geometry; offscreen visibility rejected');
 const groups=[[13,-20,54],[14,-50,56],[15,-70,58],[16,-90,60],
               [18,-225,79],[20,-320,98],[21,-370,100]];
 const writes=[],draws=[];
 for(const [joint,z,first] of groups){
  const j=display.joints[joint];
  if(j.parent!==display.joints[1].address||j.local[0]!==0||j.local[1]>-280||
     j.local[2]!==z||j.world[1]>-180||j.draws.length!==2||
     j.draws[0]!==first||j.draws[1]!==first+1)
   throw Error('Yoshi offscreen joint identity changed');
  for(const [index,base] of [[first,8],[first+1,2]]){
   const draw=display.draws[index];
   if(draw.joint!==joint||(draw.flags&~1)!==base||!draw.material||!draw.mesh)
    throw Error('Yoshi offscreen material identity changed');
   const target=base|(enabled?0:1);
   if(draw.flags!==target)writes.push([draw.address+20,target]);
   draws.push(index);
  }
 }
 return {objects:[{mapId:3,root:display.root,groups:groups.length,draws,enabled}],writes,
  limits:'Render-only foreground water-wave reduction; native water stays default. The camera and gameplay probes match in the tested Yoshi Ice Climbers fixture.'};
}

export function planFountainGeometryView(current,original,selection) {
 if(!Number.isInteger(selection)||selection < -2)throw Error('Invalid geometry selection');
 const a=current.objects[0],b=original.objects[0];
 if(a.root!==b.root||a.draws.length!==b.draws.length||a.draws.some((d,i)=>d.address!==b.draws[i].address||d.joint!==b.draws[i].joint))throw Error('Fountain geometry changed; inspect again');
 if(selection>=a.joints.length)throw Error('Joint selection is out of range');
 const writes=[];
 for(const [i,d]of a.draws.entries()){
  const hidden=selection===-1 ? (b.draws[i].flags&1) : selection===d.joint ? (b.draws[i].flags&1) : 1;
  const target=((d.flags&~1)|hidden)>>>0;if(target!==d.flags)writes.push([d.address+20,target]);
 }
 return {objects:[{root:a.root,joints:a.joints.length,draws:a.draws.length}],selection,writes,diagnosticOnly:true};
}


// USA 1.02 Fountain main-object decorations, identified by isolated live draws.
// Keep all floor/ledge/platform meshes and every original joint/process. The
// selected display flags have no animation writer in the observed fixture.
// Validate the entire structure before returning any data writes.
export function planFountainDecorations(read32,read8,readFloat,enabled) {
 if(typeof enabled!=='boolean')throw Error('Decoration visibility must be boolean');
 const geometry=inspectFountainGeometry(read32,read8,readFloat),o=geometry.objects[0];
 if(o.joints.length!==56||o.draws.length!==108)throw Error('Unexpected Fountain mesh layout');
 const targets=[[11,31,7,0],[12,38,7,0],[13,45,6,0],[37,74,18,-27]],writes=[],objects=[];
 for(const[joint,first,count,z]of targets){
  const j=o.joints[joint];
  if(j.parent!==o.joints[1].address||j.local[0]!==0||j.local[2]!==z||j.draws.length!==count||j.draws.some((n,i)=>n!==first+i))throw Error('Fountain decoration identity mismatch');
  for(const index of j.draws){
   const d=o.draws[index],base=index===89?4:2;
   if(d.joint!==joint||(d.flags&~1)!==base||!d.material||!d.mesh)throw Error('Unexpected Fountain decoration display flags');
   const value=base|(enabled?0:1);if(d.flags!==value)writes.push([d.address+20,value]);
  }
  objects.push({joint,draws:count});
 }
 return {objects,writes,enabled,drawCount:38,limits:'Cosmetic visibility only; gameplay equivalence and sustained performance require separate validation.'};
}
