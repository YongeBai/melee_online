import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readAnimationObject} from './animation-object-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';

const profiles={stage:{symbol:'MnSelectStageDataTable',count:12},character:{symbol:'MnSelectChrDataTable',count:9}};
// Native menu tables own one camera, two lights, fog and fixed StaticModelDesc
// rows. Keep texture/display-list payloads in their original GX byte order.
function menuGraph(input){
 const a=inspectArchive(input),d=a.data;if(a.externs.size)throw Error('Menu external linking is unsupported');
 const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(body.buffer),pointers=new Set(),writes=new Map(),claims=new Map(),seen=new Set(),active=new Set(),owned=new Set(),models=[];
 const range=(at,size,align=4)=>{if(!Number.isSafeInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Menu descriptor bounds '+at);};
 function claim(at,size){range(at,size,size);for(let i=0;i<size;i++){const key=at+':'+size,old=claims.get(at+i);if(old&&old!==key)throw Error('Menu descriptor overlap');claims.set(at+i,key);}}
 function word(at,size=4){claim(at,size);if(a.relocations.has(at&~3))throw Error('Menu scalar is a pointer');const v=size===2?d.getUint16(at):d.getUint32(at);size===2?out.setUint16(at,v,true):out.setUint32(at,v,true);writes.set(at,size);return v;}
 function ptr(at){claim(at,4);const v=d.getUint32(at);if(!a.relocations.has(at)){if(v)throw Error('Unrelocated menu pointer '+at);return null;}range(v,1,1);pointers.add(at);out.setUint32(at,v,true);return v;}
 function empty(at){if(ptr(at)!==null)throw Error('Unsupported menu descriptor '+at);}
 function once(kind,at,fn){if(at===null)return;const key=kind+':'+at;if(active.has(key))throw Error('Cyclic menu graph');if(seen.has(key))return;seen.add(key);active.add(key);fn(at);active.delete(key);}
 function tree(t){for(const at of t.words instanceof Map?t.words.keys():t.words)t.pointers.has(at)?ptr(at):word(at);for(const at of t.halves??[])word(at,2);}
 function model(at){if(at===null)throw Error('Missing menu model');once('model',at,p=>{const s=convertSceneAsset(archiveRootView(a,'menu_Share_joint',p),{shapes:true});for(const n of s.model.tree.nodes)owned.add(n.offset);for(const q of s.pointerSlots)ptr(q);for(const [q,size]of s.writes)word(q,size);models.push({joint:p,nodes:s.model.tree.nodes.length,meshes:s.model.meshes.length});});}
 function wobj(at){once('wobj',at,p=>{empty(p);for(let i=4;i<16;i+=4)word(p+i);empty(p+16);});}
 function camera(at){if(at===null)throw Error('Missing menu camera');once('camera',at,p=>{empty(p);for(let i=4;i<24;i+=2)word(p+i,2);wobj(ptr(p+24));wobj(ptr(p+28));word(p+32);const up=ptr(p+36);if(up!==null)for(let i=0;i<12;i+=4)word(up+i);word(p+40);word(p+44);const type=d.getUint16(p+6);if(type<1||type>3)throw Error('Menu camera projection');for(let i=48;i<(type===1?56:64);i+=4)word(p+i);});}
 function light(at){once('light',at,p=>{empty(p);light(ptr(p+4));const flags=word(p+8,2),attn=word(p+10,2);wobj(ptr(p+16));wobj(ptr(p+20));const u=ptr(p+24);if(u!==null){const type=flags&3,size=type===2?(attn&1?24:12):type===3?(attn?24:20):4;for(let i=0;i<size;i+=4)word(u+i);}});}
 function fog(at){once('fog',at,p=>{word(p);const adj=ptr(p+4);if(adj!==null){word(adj,2);word(adj+2,2);for(let i=4;i<68;i+=4)word(adj+i);}word(p+8);word(p+12);});}
 function shapeAnim(p){once('shapeanim',p,p=>{shapeAnim(ptr(p));const animation=ptr(p+4);if(animation!==null)tree(readAnimationObject(a,animation));});}
 function shapeDObj(p){once('shapedobj',p,p=>{shapeDObj(ptr(p));shapeAnim(ptr(p+4));});}
 function shapeJoint(p){once('shapejoint',p,p=>{shapeJoint(ptr(p));shapeJoint(ptr(p+4));shapeDObj(ptr(p+8));});}
 function jointAnimation(p){if(p!==null)tree(readJointAnimation(a,p,owned));}
 function materialAnimation(p){if(p!==null)tree(convertMaterialAnimation(archiveRootView(a,'menu_Share_matanim_joint',p)));}
 function animations(row){jointAnimation(row.animation);materialAnimation(row.material);shapeJoint(row.shape);}
 function list(at,visit){if(at===null)return 0;for(let i=0;i<4096;i++){const p=ptr(at+i*4);if(p===null)return i;visit(p,i);}throw Error('Unterminated menu pointer list');}
 function animationObject(p){if(p!==null)tree(readAnimationObject(a,p));}
 function wanim(p){once('wanim',p,p=>{animationObject(ptr(p));empty(p+4);});}
 function cameraAnimation(p){once('cameraanimation',p,p=>{animationObject(ptr(p));wanim(ptr(p+4));wanim(ptr(p+8));});}
 function lightAnimation(p){once('lightanimation',p,p=>{lightAnimation(ptr(p));animationObject(ptr(p+4));wanim(ptr(p+8));wanim(ptr(p+12));});}
 function lightList(p){list(p,p=>{light(ptr(p));list(ptr(p+4),lightAnimation);});}
 const dynamicModels=new Map();
 function dynamicModel(p){
  if(dynamicModels.has(p))return dynamicModels.get(p);
  const row={descriptor:p,joint:null,jointAnimations:[],materialAnimations:[],shapeAnimations:[]};dynamicModels.set(p,row);
  row.joint=ptr(p);model(row.joint);
  list(ptr(p+4),at=>{jointAnimation(at);row.jointAnimations.push(at);});
  list(ptr(p+8),at=>{materialAnimation(at);row.materialAnimations.push(at);});
  list(ptr(p+12),at=>{shapeJoint(at);row.shapeAnimations.push(at);});
  return row;
 }
 function scene(root){
  const rows=[];list(ptr(root),p=>rows.push(dynamicModel(p)));
  const cameras=ptr(root+4);if(cameras===null)throw Error('Missing scene camera list');
  const cameraRoot=ptr(cameras);camera(cameraRoot);list(ptr(cameras+4),cameraAnimation);
  lightList(ptr(root+8));const fogs=ptr(root+12);if(fogs!==null){fog(ptr(fogs));list(ptr(fogs+4),cameraAnimation);}
  return {root,rows,camera:cameraRoot};
 }
 function finish(publics){return {models,pointerSlots:pointers,writes,image:nativeSubgraphImage(body,pointers,publics)};}
 return {a,d,range,word,ptr,empty,once,model,camera,light,fog,shapeJoint,jointAnimation,materialAnimation,animations,list,cameraAnimation,lightList,dynamicModel,scene,finish};
}
export function convertMenuAsset(input,{menu='stage'}={}){
 const spec=profiles[menu];if(!spec)throw Error('Unsupported native menu');
 const g=menuGraph(input),{a,ptr,model,camera,light,fog,animations}=g,root=a.publics.get(spec.symbol);if(root===undefined)throw Error('Missing menu table');
 const cameraRoot=ptr(root);camera(cameraRoot);light(ptr(root+4));light(ptr(root+8));fog(ptr(root+12));
 const rows=[];for(let i=0;i<spec.count;i++){const at=root+16+i*16,joint=ptr(at);model(joint);rows.push({joint,animation:ptr(at+4),material:ptr(at+8),shape:ptr(at+12)});}
 for(const row of rows)animations(row);
 return {menu,root,symbol:spec.symbol,camera:cameraRoot,rows,...g.finish(new Map([[spec.symbol,root]]))};
}

// The original CSS preloads this archive for its native rules/name submenus.
// Public model descriptors share data; visit every root before animation targets.
export function convertExtraMenuAsset(input){
 const g=menuGraph(input),{a,d,range,ptr,model}=g,rows=[],publics=new Map();
 for(const [name,joint]of a.publics)if(name.endsWith('_joint')&&!name.endsWith('_matanim_joint')&&!name.endsWith('_shapeanim_joint')){
  const stem=name.slice(0,-6),row={name:stem,joint};model(joint);publics.set(name,joint);
  for(const [field,suffix]of [['animation','_animjoint'],['material','_matanim_joint'],['shape','_shapeanim_joint']]){const n=stem+suffix,p=a.publics.get(n);if(p===undefined)throw Error('Missing extra-menu animation '+n);row[field]=p;publics.set(n,p);}rows.push(row);
 }
 if(!rows.length)throw Error('Missing extra-menu models');for(const row of rows)g.animations(row);
 const requireRoot=name=>{const p=a.publics.get(name);if(p===undefined)throw Error('Missing extra-menu root '+name);publics.set(name,p);return p;};
 const camera=requireRoot('ScMenMain_cam_int1_camera');g.camera(camera);
 const lights=requireRoot('ScMenMain_scene_lights');g.lightList(lights);g.fog(requireRoot('ScMenMain_fog'));
 const names=[];
 for(const symbol of ['mnNameAutoName','mnNameAutoNameUs','mnNameDefaultName','mnNameDefaultNameUs','mnNameRefuseName','mnNameRefuseNameUs']){
  const root=requireRoot(symbol);let count=0,done=false;
  for(let i=0;i<1024;i++){
   const p=ptr(root+i*4);if(p===null)throw Error('Missing native menu name');let length=0;
   for(;length<=128;length++){range(p+length,1,1);if(!d.getUint8(p+length))break;}
   if(length>128)throw Error('Unterminated native menu name');count++;
   if(symbol.includes('Default')||!length){done=true;break;}
  }
  if(!done)throw Error('Unterminated native menu name list');names.push({symbol,root,count});
 }
 if(publics.size!==a.publics.size)throw Error('Unknown extra-menu public root');
 return {rows,camera,lights,names,...g.finish(publics)};
}

// SceneDesc used by the original memory-card notice callback, including its
// camera/light animation lists. Preserve all roots rather than flattening it.
export function convertCardNoticeAsset(input){
 const g=menuGraph(input),{a,ptr}=g,symbol='ScNtcCommon_scene_data',root=a.publics.get(symbol),rows=[];
 if(root===undefined||a.publics.size!==1)throw Error('Missing card-notice scene');
 g.list(ptr(root),p=>{const joint=ptr(p);g.model(joint);rows.push({descriptor:p,joint,jointAnimations:[],materialAnimations:[],shapeAnimations:[]});});
 for(const row of rows){const p=row.descriptor;g.list(ptr(p+4),at=>{g.jointAnimation(at);row.jointAnimations.push(at);});g.list(ptr(p+8),at=>{g.materialAnimation(at);row.materialAnimations.push(at);});g.list(ptr(p+12),at=>{g.shapeJoint(at);row.shapeAnimations.push(at);});}
 const cameras=ptr(root+4);if(cameras===null)throw Error('Missing card-notice camera');const camera=ptr(cameras);g.camera(camera);g.list(ptr(cameras+4),g.cameraAnimation);
 g.lightList(ptr(root+8));g.empty(root+12);
 return {root,symbol,rows,camera,...g.finish(new Map([[symbol,root]]))};
}

// GmRst owns two complete SceneDesc graphs rather than the fixed StaticModelDesc
// tables used by CSS/SSS. Retain every original dynamic animation list and the
// native camera/light/fog descriptors so later presentation code cannot replace
// the result camera with a browser approximation.
export function convertResultSceneAsset(input){
 const g=menuGraph(input),expected=['pnlsce','flmsce'];
 if(g.a.publics.size!==expected.length||expected.some(name=>!g.a.publics.has(name)))throw Error('Missing result scene root');
 const scenes=expected.map(symbol=>({symbol,...g.scene(g.a.publics.get(symbol))}));
 return {scenes,rows:scenes.flatMap(scene=>scene.rows),...g.finish(new Map(expected.map(name=>[name,g.a.publics.get(name)])))};
}
