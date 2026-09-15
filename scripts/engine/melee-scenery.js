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
     const entry={index,address:j,parent,flags,local:[0,4,8].map(k=>readFloat(j+0x38+k)),world:[0x50,0x60,0x70].map(k=>readFloat(j+k)),
      // Read-only draw-cache probe. These are the 12 native JObj world-matrix
      // floats; translation alone cannot detect rotation or scale animation.
      worldMatrix:Array.from({length:12},(_,k)=>readFloat(j+0x44+k*4)),draws:[]};joints.push(entry);
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

// Read-only legal-stage graphics inventory for choosing a shared bottleneck
// instead of extrapolating Yoshi artwork to Battlefield, Stadium or the rest.
// Counts are structural; no DObj is called, hidden or declared cosmetic.
export function inspectTournamentStageGeometry(read32,read8,readFloat){
 const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
 const requirePtr=(p,n)=>{if(!valid(p,n))throw Error('Invalid tournament stage geometry pointer');};
 const lists=read32(0x804d782c);requirePtr(lists,24);
 const objects=[],seenG=new Set();let g=read32(lists+20);
 while(g){
  requirePtr(g,0x38);if(seenG.has(g)||seenG.size>=128)throw Error('Invalid tournament stage object chain');seenG.add(g);
  const ground=read32(g+0x2c);
  if(read8(g)===0&&read8(g+1)===3&&valid(ground,0x20)&&read32(ground+4)===g){
   const root=read32(g+0x28);requirePtr(root,0x88);
   const joints=[],draws=[],seenJ=new Set(),seenD=new Set();
   const visit=(j,parent,depth)=>{
    if(depth>64)throw Error('Tournament stage joint tree too deep');
    while(j){
     requirePtr(j,0x88);if(seenJ.has(j)||seenJ.size>=2048)throw Error('Invalid tournament stage joint chain');seenJ.add(j);
     const flags=read32(j+20),index=joints.length,entry={index,address:j,parent,flags,
      local:[0,4,8].map(k=>readFloat(j+0x38+k)),world:[0x50,0x60,0x70].map(k=>readFloat(j+k)),draws:[]};
     joints.push(entry);
     let d=read32(j+24);
     while(d){
      requirePtr(d,24);if(seenD.has(d)||seenD.size>=4096)throw Error('Invalid tournament stage mesh chain');seenD.add(d);
      const draw={index:draws.length,joint:index,address:d,flags:read32(d+20),
       material:read32(d+8),mesh:read32(d+12)};
      entry.draws.push(draw.index);draws.push(draw);d=read32(d+4);
     }
     if(!(flags&0x1000)&&read32(j+16))visit(read32(j+16),j,depth+1);
     j=read32(j+8);
    }
   };
   visit(root,0,0);
   objects.push({gobj:g,ground,mapId:read32(ground+0x14),category:read8(ground+0x11)>>>5,
    renderCallback:read32(g+0x1c),root,joints,draws,diagnosticOnly:true});
  }
  g=read32(g+8);
 }
 if(!objects.length)throw Error('No tournament stage geometry found');
 return {objects,diagnosticOnly:true,limits:'Read-only native stage object/joint/DObj counts. Mesh identity and artwork role require isolated pictures; no performance or cache-safety conclusion.'};
}

// GALE01 PObj layout: class header, next, vertex descriptors, packed flags and
// display-list length, display pointer, then a skin/shape/envelope union.
// Count kinds before attempting to cache any polygon work. This reads only
// structure and emits aggregates; a repeated pointer is not cache proof.
export function inspectStagePolygonKinds(geometry,read32){
 const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
 const objects=[];
 for(const object of geometry.objects||[]){
  const kinds={rigidOrShared:0,shapeAnimated:0,envelope:0},
   displayLists=new Set(),vertexDescriptors=new Set(),envelopeLists=new Set(),
   polygons=new Set();
  let polygonReferences=0,displayListBytes=0,nonPolygonUnionDraws=0;
  for(const draw of object.draws||[]){
   // JObj +0x18 is a union: spline and particle joints do not own DObjs.
   // The generic geometry walk sees that union as a candidate draw on Yoshi's
   // Randall map. Exclude it only from this read-only PObj inventory.
   const joint=object.joints?.[draw.joint];
   if(joint&&(joint.flags&(0x20|0x4000))){nonPolygonUnionDraws++;continue;}
   let p=draw.mesh;const chain=new Set();
   while(p){
    if(!valid(p,24)||chain.has(p)||chain.size>=4096)
     throw Error('Invalid stage polygon chain on map '+object.mapId+' draw '+draw.index+
      ' at '+p.toString(16)+' after '+chain.size+' polygons');
    chain.add(p);polygonReferences++;
    if(!polygons.has(p)){
     polygons.add(p);
     const packed=read32(p+12),flags=packed>>>16,length=(packed&0xffff)*32,
      kind=flags&0x3000,display=read32(p+16),verts=read32(p+8);
     if(!valid(verts,20)||length>262144||!valid(display,length||1))
      throw Error('Invalid stage polygon descriptor or display list');
     if(kind===0)kinds.rigidOrShared++;
     else if(kind===0x1000)kinds.shapeAnimated++;
     else if(kind===0x2000){kinds.envelope++;const list=read32(p+20);
      if(!valid(list,8))throw Error('Invalid stage envelope list');envelopeLists.add(list);}
     else throw Error('Unknown stage polygon kind');
     displayLists.add(display);vertexDescriptors.add(verts);displayListBytes+=length;
    }
    p=read32(p+4);
   }
  }
  objects.push({mapId:object.mapId,category:object.category,draws:object.draws.length,
   nonPolygonUnionDraws,
   polygonReferences,uniquePolygons:polygons.size,kinds,
   uniqueDisplayLists:displayLists.size,uniqueVertexDescriptors:vertexDescriptors.size,
   uniqueEnvelopeLists:envelopeLists.size,displayListBytes});
 }
 return {diagnosticOnly:true,cacheSafe:false,objects,
  limits:'Structural live PObj counts. Static addresses alone do not establish unchanged GX state, vertex bytes, material, transform or camera across frames.'};
}

// Final Destination map 2 is a low two-display grid, while map 3 also owns
// the dark top surface that makes the playable floor legible. Full-scene QA
// showed that hiding all 18 joint-4 meshes or its seven translucent draws
// removes that floor. The 11 opaque draws are beneath it; preview those only.
// Keep map-3's native callback and all translucent floor draws. Only
// DOBJ_HIDDEN changes, leaving processes, collision and camera native.
export function planFinalDestinationBottomVisual(read32,geometry,enabled,selection='opaque'){
 if(typeof enabled!=='boolean')throw Error('Final Destination bottom visual mode must be boolean');
 if(!['all','translucent','opaque'].includes(selection))throw Error('Unknown Final Destination draw selection');
 if(read32(BACKGROUND_RENDER)!==0x7c0802a6||read32(EMPTY_RENDER)!==0x4e800020)
  throw Error('Final Destination visual mode requires original USA 1.02 callbacks');
 const get=id=>geometry.objects?.filter(o=>o.mapId===id);
 const collision=get(0),small=get(1),floor=get(2),bottom=get(3);
 if(![collision,small,floor,bottom].every(list=>list?.length===1)||
    collision[0].category!==0||collision[0].draws.length||
    small[0].category!==1||small[0].draws.length!==2||
    floor[0].category!==0||floor[0].joints.length!==2||floor[0].draws.length!==2||
    floor[0].renderCallback!==BACKGROUND_RENDER||
    bottom[0].category!==1||bottom[0].joints.length!==6||bottom[0].draws.length!==26||
    bottom[0].renderCallback!==BACKGROUND_RENDER||
    JSON.stringify(bottom[0].joints[2].draws)!=='[0,1,2,3,4]'||
    bottom[0].joints[4].draws.length!==18||
    bottom[0].joints[4].draws.some((index,k)=>index!==k+6)||
    bottom[0].draws.slice(0,5).some(d=>d.joint!==2||(d.flags&1)||![2,4].includes(d.flags&~1)||!d.material||!d.mesh))
  throw Error('Final Destination lower visual pass identity changed');
 const selected=bottom[0].joints[4].draws.filter(index=>selection==='all'||
  (selection==='translucent'?bottom[0].draws[index].flags&2:bottom[0].draws[index].flags&4)),writes=[];
 for(const index of selected){
  const draw=bottom[0].draws[index],base=draw?.flags&~1;
  if(draw?.joint!==4||![2,4].includes(base)||!draw.material||!draw.mesh)
   throw Error('Final Destination lower mesh identity changed');
  const target=base|(enabled?0:1);
  if(draw.flags!==target)writes.push([draw.address+20,target]);
 }
 return {enabled,selection,objects:[{mapId:3,selectedDraws:selected,retainedTopDraws:bottom[0].joints[2].draws,
   retainedFloorDraws:bottom[0].joints[4].draws.filter(index=>bottom[0].draws[index].flags&2),
   floorMapId:2,floorDraws:2,gameObjectsPreserved:true}],writes,
  limits:'Diagnostic: selected Final Destination map-3 DObj visibility flags change; opaque-only mode retains the dark native playable floor. Native collision, object processes, rules and camera remain. Sustained gameplay/FPS verification is required.'};
}

// This proves only that a drawable's world transform and native identities
// stayed fixed between two observed frames. It does not prove its GX commands,
// materials, textures or vertex-memory dependencies are reusable. Never use
// this result to bypass a live draw callback without an independent FIFO gate.
export function compareYoshiStageMatrixSnapshots(before,after){
 const get=(geometry,id)=>geometry.objects?.find(o=>o.mapId===id);
 const collisionA=get(before,0),collisionB=get(after,0),stageA=get(before,3),stageB=get(after,3);
 if(before.objects?.length!==2||after.objects?.length!==2||
    !collisionA||!collisionB||!stageA||!stageB||collisionA.draws.length||collisionB.draws.length||
    collisionA.joints.length!==23||collisionB.joints.length!==23||
    stageA.joints.length!==22||stageB.joints.length!==22||
    stageA.draws.length!==102||stageB.draws.length!==102||
    collisionA.root!==collisionB.root||stageA.root!==stageB.root)
  throw Error('Unexpected Yoshi stage geometry for matrix comparison');
 const stableJoints=new Set();
 for(let i=0;i<stageA.joints.length;i++){
  const a=stageA.joints[i],b=stageB.joints[i];
  if(a.address!==b.address||a.parent!==b.parent||a.flags!==b.flags||
     a.worldMatrix?.length!==12||b.worldMatrix?.length!==12||
     a.worldMatrix.some((v,k)=>!Number.isFinite(v)||!Number.isFinite(b.worldMatrix[k])||!Object.is(v,b.worldMatrix[k])))continue;
  stableJoints.add(i);
 }
 const stableDraws=[];
 for(let i=0;i<stageA.draws.length;i++){
  const a=stageA.draws[i],b=stageB.draws[i];
  if(stableJoints.has(a.joint)&&a.address===b.address&&a.joint===b.joint&&
     a.flags===b.flags&&!(a.flags&1)&&a.material===b.material&&a.mesh===b.mesh)
    stableDraws.push(i);
 }
 return {diagnosticOnly:true,cacheSafe:false,stage:8,drawableMapId:3,
  stableJoints:[...stableJoints],stableDraws,observedDraws:stageA.draws.length,
  limits:'Two-frame native world-matrix/identity match only. GX state, material/texture contents, vertex memory and later animation may change; no render callback is skipped.'};
}

// Blank-output cost control for the matrix-stable draw groups observed in the
// checked Yoshi scene. The moving-water draw groups and Randall are untouched.
// This deliberately does not replay FIFO or qualify as a playable renderer.
export function planYoshiStableDrawCostDiagnostic(geometry,enabled){
 if(typeof enabled!=='boolean')throw Error('Yoshi stable-draw diagnostic mode must be boolean');
 const collision=geometry.objects?.find(o=>o.mapId===0),stage=geometry.objects?.find(o=>o.mapId===3);
 if(geometry.objects?.length!==2||collision?.joints.length!==23||collision.draws.length!==0||
    stage?.joints.length!==22||stage.draws.length!==102)
  throw Error('Unexpected Yoshi stage geometry for stable-draw diagnostic');
 const stableJoints=new Set([0,1,2,3,4,5,17,19]);
 const stableDraws=[...Array(50).keys(),...Array.from({length:17},(_,i)=>i+62),...Array.from({length:17},(_,i)=>i+81)];
 if(stableDraws.length!==84)throw Error('Invalid Yoshi stable-draw selection');
 const writes=[];
 for(const index of stableDraws){
  const draw=stage.draws[index],joint=stage.joints[draw?.joint];
  if(!draw||!joint||!stableJoints.has(draw.joint)||joint.worldMatrix?.length!==12||
     joint.worldMatrix.some(v=>!Number.isFinite(v))||!draw.material||!draw.mesh||
     ![2,4,8].includes(draw.flags&~1))throw Error('Yoshi stable-draw identity changed');
  const target=(draw.flags&~1)|(enabled?0:1);
  if(target!==draw.flags)writes.push([draw.address+20,target]);
 }
 return {diagnosticOnly:true,passed:false,enabled,stage:8,selectedDraws:stableDraws,
  dynamicDraws:stage.draws.length-stableDraws.length,writes,
  limits:'Static visual mesh calls are omitted; foreground water and Randall remain. Output is incomplete. Native gameplay/camera continues. This is an opportunity bound, never an accepted rendering mode.'};
}

// Partial, read-only cache feasibility probe. A stable pose and pointer can
// still refer to changing material or mesh memory; these short hashes expose
// that case without copying any game bytes out of the runtime. They do not
// cover texture contents, vertex streams, XF/BP state or all linked structs.
export function inspectYoshiStaticDrawObjectBytes(geometry,read8){
 const selection=planYoshiStableDrawCostDiagnostic(geometry,true);
 const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
 const hash64=p=>{
  if(!valid(p,64))throw Error('Invalid Yoshi material or mesh probe pointer');
  let hash=0x811c9dc5;
  for(let k=0;k<64;k++)hash=Math.imul(hash^read8(p+k),0x01000193)>>>0;
  return hash;
 };
 const stage=geometry.objects.find(o=>o.mapId===3);
 return {diagnosticOnly:true,cacheSafe:false,stage:8,selectedDraws:selection.selectedDraws,
  objects:selection.selectedDraws.map(index=>{
   const draw=stage.draws[index];
   return {index,materialObjectHash64:hash64(draw.material),meshObjectHash64:hash64(draw.mesh)};
  }),limits:'Only the first 64 bytes at each native material and mesh object pointer are hashed. No GX FIFO, texture, linked-object or vertex-memory equivalence is implied.'};
}

// Optional low-detail Yoshi art: keep the four raised-platform displays, the
// 20-draw main-floor group, all animated foreground-water displays, Randall
// and every gameplay object. A broader 80-draw preview hid the main floor in
// a full 720p view and was rejected. Only DOBJ_HIDDEN changes; collision and
// the Melee camera/projection remain native. Full-scene pictures and timing
// still need validation before this can become a default.
export function planYoshiMinimalStage(geometry,enabled){
 if(typeof enabled!=='boolean')throw Error('Yoshi minimal-stage mode must be boolean');
 const collision=geometry.objects?.find(o=>o.mapId===0),stage=geometry.objects?.find(o=>o.mapId===3);
 if(geometry.objects?.length!==2||collision?.joints.length!==23||collision.draws.length||
    stage?.joints.length!==22||stage.draws.length!==102)
  throw Error('Unexpected Yoshi stage structure for minimal visuals');
 const groups=[[4,4,26],[17,62,17],[19,81,17]],writes=[],hiddenDraws=[];
 for(const[jointIndex,first,count]of groups){
  const joint=stage.joints[jointIndex];
  if(!joint||joint.draws?.length!==count||joint.draws.some((index,k)=>index!==first+k)||
     joint.worldMatrix?.length!==12||joint.worldMatrix.some(v=>!Number.isFinite(v)))
   throw Error('Yoshi decorative joint identity changed');
  for(const index of joint.draws){
   const draw=stage.draws[index],base=draw?.flags&~1;
   if(draw?.joint!==jointIndex||![2,4,8].includes(base)||!draw.material||!draw.mesh)
    throw Error('Yoshi decorative mesh identity changed');
   const target=base|(enabled?0:1);
   if(draw.flags!==target)writes.push([draw.address+20,target]);
   hiddenDraws.push(index);
  }
 }
 const floor=stage.joints[5],floorDraws=Array.from({length:20},(_,k)=>k+30);
 if(hiddenDraws.length!==60||!floor||floor.draws?.length!==20||floor.draws.some((index,k)=>index!==floorDraws[k])||
    ![0,1,2,3].every(index=>stage.draws[index]?.flags===2&&stage.draws[index]?.material&&stage.draws[index]?.mesh)||
    !floorDraws.every(index=>stage.draws[index]?.joint===5&&!(stage.draws[index]?.flags&1)&&
      [2,4,8].includes(stage.draws[index]?.flags&~1)&&stage.draws[index]?.material&&stage.draws[index]?.mesh))
  throw Error('Yoshi platform or main-floor displays changed');
 return {objects:[{mapId:3,root:stage.root,hiddenDraws,retainedMainDisplays:[0,1,2,3],retainedFloorDraws:floorDraws,
   retainedDynamicDraws:18,randallPreserved:true}],enabled,writes,
  limits:'Low-detail native Yoshi art only. Raised platforms, main floor, animated water, Randall, collision, game processes and camera remain. Full-scene picture/gameplay/performance acceptance is still required.'};
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
