import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';

// Original eight countdown/match-status models. The rest of IfAll remains
// unpublished until its own typed import and native initialization are ready.
export function convertStatusModels(input) {
  const a=inspectArchive(input),d=a.data,name='ScInfCnt_scene_models',root=a.publics.get(name);
  if(root===undefined||a.externs.size)throw Error('Missing status model root');
  const data=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(data.buffer),pointers=new Set(),writes=new Map(),models=[];
  const bounds=(at,size)=>{if(!Number.isInteger(at)||at<0||at%size||at+size>d.byteLength)throw Error('Status descriptor bounds');};
  function word(at,size=4){bounds(at,size);if(a.relocations.has(at&~3))throw Error('Status scalar is a pointer');const old=writes.get(at);if(old&&old!==size)throw Error('Status scalar width mismatch');writes.set(at,size);size===4?out.setUint32(at,d.getUint32(at),true):out.setUint16(at,d.getUint16(at),true);}
  function ptr(at){bounds(at,4);const p=d.getUint32(at);if(!a.relocations.has(at)){if(p)throw Error('Unrelocated status pointer');word(at);return null;}bounds(p,4);pointers.add(at);out.setUint32(at,p,true);return p;}
  function tree(t){for(const at of t.words)t.pointers.has(at)?ptr(at):word(at);for(const at of t.halves??[])word(at,2);}
  function list(at,visit){if(at===null)return;for(let i=0;i<256;i++){const p=ptr(at+i*4);if(p===null)return;visit(p);}throw Error('Unterminated status animation list');}
  for(let i=0;i<8;i++) {
    const p=ptr(root+i*4);if(p===null)throw Error('Missing status model');
    const joint=ptr(p);if(joint===null)throw Error('Missing status joint');
    const scene=convertSceneAsset(archiveRootView(a,'status_Share_joint',joint));
    for(const at of scene.pointerSlots)ptr(at);for(const [at,size] of scene.writes)word(at,size);
    list(ptr(p+4),at=>tree(readJointAnimation(a,at)));
    list(ptr(p+8),at=>tree(convertMaterialAnimation(archiveRootView(a,'status_Share_matanim_joint',at))));
    if(ptr(p+12)!==null)throw Error('Status shape animation needs integration');
    models.push({joint,nodes:scene.model.tree.nodes.length,meshes:scene.model.meshes.length});
  }
  if(ptr(root+32)!==null)throw Error('Unexpected status model count');
  return {models,image:nativeSubgraphImage(data,pointers,new Map([[name,root]]))};
}
