import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';

// fn_801A1134 consumes only SceneDesc.models[0]. Camera, lights and fog in this
// archive are authoring metadata: the original callback uses the match's HUD
// camera. Publish only its consumed model graph, with those unused roots null.
export function convertPauseModels(input){
  const a=inspectArchive(input),d=a.data,name='ScGamPause_scene_data',root=a.publics.get(name);
  if(root===undefined||a.externs.size)throw Error('Missing native pause scene');
  const data=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(data.buffer),pointers=new Set(),writes=new Map();
  const bounds=(at,size=4)=>{if(!Number.isInteger(at)||at<0||at%size||at+size>d.byteLength)throw Error('Pause descriptor bounds');};
  function word(at,size=4){bounds(at,size);if(a.relocations.has(at&~3))throw Error('Pause scalar is a pointer');if(writes.has(at)&&writes.get(at)!==size)throw Error('Pause scalar width mismatch');writes.set(at,size);size===4?out.setUint32(at,d.getUint32(at),true):out.setUint16(at,d.getUint16(at),true);}
  function ptr(at){bounds(at);const p=d.getUint32(at);if(!a.relocations.has(at)){if(p)throw Error('Unrelocated pause pointer');word(at);return null;}bounds(p);pointers.add(at);out.setUint32(at,p,true);return p;}
  function tree(t){for(const at of t.words)t.pointers.has(at)?ptr(at):word(at);for(const at of t.halves??[])word(at,2);}
  function list(at,visit){if(at===null)return;for(let i=0;i<256;i++){const p=ptr(at+4*i);if(p===null)return;visit(p);}throw Error('Unterminated pause animation list');}
  const listRoot=ptr(root);if(listRoot===null)throw Error('Missing pause model list');
  const model=ptr(listRoot);if(model===null||ptr(listRoot+4)!==null)throw Error('Expected one native pause model');
  const joint=ptr(model);if(joint===null)throw Error('Missing pause joint');
  const scene=convertSceneAsset(archiveRootView(a,'pause_Share_joint',joint));
  for(const at of scene.pointerSlots)ptr(at);for(const [at,size]of scene.writes)word(at,size);
  let jointAnimations=0,materialAnimations=0;
  list(ptr(model+4),at=>{tree(readJointAnimation(a,at));jointAnimations++;});
  list(ptr(model+8),at=>{tree(convertMaterialAnimation(archiveRootView(a,'pause_Share_matanim_joint',at)));materialAnimations++;});
  if(ptr(model+12)!==null)throw Error('Pause shape animation needs integration');
  for(const offset of [4,8,12]){bounds(root+offset);out.setUint32(root+offset,0,true);}
  return {root,joint,nodes:scene.model.tree.nodes.length,meshes:scene.model.meshes.length,jointAnimations,materialAnimations,image:nativeSubgraphImage(data,pointers,new Map([[name,root]]))};
}
