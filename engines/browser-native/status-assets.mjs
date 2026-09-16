import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {readAnimationObject} from './animation-object-assets.mjs';

// Original eight countdown/match-status models. The rest of IfAll remains
// unpublished until its own typed import and native initialization are ready.
export function convertStatusModels(input,{hud=false}={}) {
  const a=inspectArchive(input),d=a.data,name='ScInfCnt_scene_models',root=a.publics.get(name);
  if(root===undefined||a.externs.size)throw Error('Missing status model root');
  const data=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(data.buffer),pointers=new Set(),writes=new Map(),models=[];
  const bounds=(at,size)=>{if(!Number.isInteger(at)||at<0||at%size||at+size>d.byteLength)throw Error('Status descriptor bounds');};
  function word(at,size=4){bounds(at,size);if(a.relocations.has(at&~3))throw Error('Status scalar is a pointer');const old=writes.get(at);if(old&&old!==size)throw Error('Status scalar width mismatch');writes.set(at,size);size===4?out.setUint32(at,d.getUint32(at),true):out.setUint16(at,d.getUint16(at),true);}
  function ptr(at){bounds(at,4);const p=d.getUint32(at);if(!a.relocations.has(at)){if(p)throw Error('Unrelocated status pointer');word(at);return null;}bounds(p,4);pointers.add(at);out.setUint32(at,p,true);return p;}
  function tree(t){for(const at of t.words)t.pointers.has(at)?ptr(at):word(at);for(const at of t.halves??[])word(at,2);}
  function list(at,visit){if(at===null)return;for(let i=0;i<256;i++){const p=ptr(at+i*4);if(p===null)return;visit(p);}throw Error('Unterminated status animation list');}
  function model(p) {
    const joint=ptr(p);if(joint===null)throw Error('Missing status joint');
    const scene=convertSceneAsset(archiveRootView(a,'status_Share_joint',joint));
    for(const at of scene.pointerSlots)ptr(at);for(const [at,size] of scene.writes)word(at,size);
    list(ptr(p+4),at=>tree(readJointAnimation(a,at)));
    list(ptr(p+8),at=>tree(convertMaterialAnimation(archiveRootView(a,'status_Share_matanim_joint',at))));
    if(ptr(p+12)!==null)throw Error('Status shape animation needs integration');
    const result={joint,nodes:scene.model.tree.nodes.length,meshes:scene.model.meshes.length};
    models.push(result);return result;
  }
  for(let i=0;i<8;i++) {
    const p=ptr(root+i*4);if(p===null)throw Error('Missing status model');model(p);
  }
  if(ptr(root+32)!==null)throw Error('Unexpected status model count');
  const publics=new Map([[name,root]]),hudModels=[];
  let camera=null;
  if(hud){
    const required=name=>{const p=a.publics.get(name);if(p===undefined)throw Error('Missing HUD root '+name);publics.set(name,p);return p;};
    const empty=at=>{if(ptr(at)!==null)throw Error('Unsupported HUD descriptor '+at);};
    const aobj=p=>{if(p!==null)tree(readAnimationObject(a,p));};
    const wobj=p=>{if(p===null)throw Error('Missing HUD world object');empty(p);for(let i=4;i<16;i+=4)word(p+i);empty(p+16);};
    const wanim=p=>{if(p===null)return;aobj(ptr(p));empty(p+4);};
    const scene=required('ScInfDmg_scene_data');
    list(ptr(scene),p=>hudModels.push({...model(p),kind:'layout'}));
    const cameras=ptr(scene+4);if(cameras===null)throw Error('Missing HUD camera list');
    const c=ptr(cameras);if(c===null)throw Error('Missing HUD camera');empty(c);
    for(let i=4;i<24;i+=2)word(c+i,2);
    wobj(ptr(c+24));wobj(ptr(c+28));word(c+32);
    const up=ptr(c+36);if(up!==null)for(let i=0;i<12;i+=4)word(up+i);
    for(const i of [40,44,48,52])word(c+i);
    if(d.getUint16(c+6)!==1)throw Error('HUD camera must be perspective');
    list(ptr(cameras+4),p=>{aobj(ptr(p));wanim(ptr(p+4));wanim(ptr(p+8));});
    empty(cameras+8);empty(cameras+12);
    camera={offset:c,near:d.getFloat32(c+40),far:d.getFloat32(c+44),fov:d.getFloat32(c+48),aspect:d.getFloat32(c+52)};
    const seen=new Set();
    const light=p=>{if(p===null)return;if(seen.has(p))throw Error('Cyclic HUD lights');seen.add(p);empty(p);light(ptr(p+4));word(p+8,2);word(p+10,2);const position=ptr(p+16);if(position!==null)wobj(position);const interest=ptr(p+20);if(interest!==null)wobj(interest);const extra=ptr(p+24);if(extra!==null){const type=d.getUint16(p+8)&3,attn=d.getUint16(p+10);const size=type===2?(attn&1?24:12):type===3?(attn?24:20):4;for(let i=0;i<size;i+=4)word(extra+i);}};
    const lightAnimations=new Set();
    const lightAnim=p=>{if(p===null)return;if(lightAnimations.has(p))throw Error('Cyclic HUD light animation');lightAnimations.add(p);lightAnim(ptr(p));aobj(ptr(p+4));wanim(ptr(p+8));wanim(ptr(p+12));};
    list(ptr(scene+8),p=>{light(ptr(p));list(ptr(p+4),lightAnim);});empty(scene+12);
    for(const name of ['ScInfTim_scene_models','tdsce'])list(required(name),p=>hudModels.push({...model(p),kind:name}));
  }
  return {models:models.slice(0,8),hudModels,camera,image:nativeSubgraphImage(data,pointers,publics)};
}
