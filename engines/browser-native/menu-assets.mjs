import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readAnimationObject} from './animation-object-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';

const profiles={stage:{symbol:'MnSelectStageDataTable',count:12},character:{symbol:'MnSelectChrDataTable',count:9}};
// Native menu tables own one camera, two lights, fog and fixed StaticModelDesc
// rows. Keep texture/display-list payloads in their original GX byte order.
export function convertMenuAsset(input,{menu='stage'}={}){
 const spec=profiles[menu];if(!spec)throw Error('Unsupported native menu');
 const a=inspectArchive(input),d=a.data,root=a.publics.get(spec.symbol);if(root===undefined||a.externs.size)throw Error('Missing menu table');
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
 const cameraRoot=ptr(root);camera(cameraRoot);light(ptr(root+4));light(ptr(root+8));fog(ptr(root+12));
 function shapeAnim(p){once('shapeanim',p,p=>{shapeAnim(ptr(p));const animation=ptr(p+4);if(animation!==null)tree(readAnimationObject(a,animation));});}
 function shapeDObj(p){once('shapedobj',p,p=>{shapeDObj(ptr(p));shapeAnim(ptr(p+4));});}
 function shapeJoint(p){once('shapejoint',p,p=>{shapeJoint(ptr(p));shapeJoint(ptr(p+4));shapeDObj(ptr(p+8));});}
 const rows=[];for(let i=0;i<spec.count;i++){const at=root+16+i*16,joint=ptr(at);model(joint);rows.push({joint,animation:ptr(at+4),material:ptr(at+8),shape:ptr(at+12)});}
 for(const row of rows){if(row.animation!==null)tree(readJointAnimation(a,row.animation,owned));if(row.material!==null)tree(convertMaterialAnimation(archiveRootView(a,'menu_Share_matanim_joint',row.material)));shapeJoint(row.shape);}
 return {menu,root,symbol:spec.symbol,camera:cameraRoot,rows,models,pointerSlots:pointers,writes,image:nativeSubgraphImage(body,pointers,new Map([[spec.symbol,root]]))};
}
