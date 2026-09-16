import {inspectArchive,archiveRootView,nativeSubgraphImage,initializeArchiveExternals} from './archive.mjs';
import {convertArticleModels} from './item-model-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {readMotionScripts} from './motion-assets.mjs';
import {itemCommandWords} from './article-assets.mjs';

// Yoshi's Story's original stage Article. Three animation descriptors cover
// it_803F83F0's states. lbArchive_InitializeDAT clears the two external shape
// pointers before the original stage/item loaders consume this archive.
export function convertStoryItem(input) {
  const bytes=initializeArchiveExternals(input,['GrdStoryHeiho_TopN_shapeanim_joint']),a=inspectArchive(bytes),d=a.data,root=a.publics.get('itemdata');
  const pointerAt=at=>{if(!Number.isInteger(at)||at<0||at%4||at+4>d.byteLength||!a.relocations.has(at))throw Error('Missing Story item pointer');return d.getUint32(at);};
  if(root===undefined)throw Error('Missing Story itemdata');
  const entry=pointerAt(root);if(d.getUint32(root+4)!==0||a.relocations.has(root+4)||d.getUint32(entry)!==210||a.relocations.has(entry))throw Error('Unexpected Story item table');
  const article=pointerAt(entry+4),models=convertArticleModels(bytes,[{slot:210,article}]),model=models.rows[0];
  const header=new DataView(models.image.buffer),size=header.getUint32(4,true),body=models.image.slice(32,32+size),out=new DataView(body.buffer);
  const pointers=new Set(Array.from({length:header.getUint32(8,true)},(_,i)=>header.getUint32(32+size+i*4,true))),claims=new Map(models.typedClaims),packed=new Set();
  function claim(at,size,type){if(!Number.isInteger(at)||at<0||at%(size<4?size:4)||at+size>d.byteLength)throw Error('Story item descriptor bounds');for(let i=at;i<at+size;i++){const old=claims.get(i);if(packed.has(i)||old&&old!==at+':'+type)throw Error('Story item descriptor overlap');claims.set(i,at+':'+type);}}
  function scalar(at,size=4,float=false){claim(at,size,size===2?'half':'word');if(a.relocations.has(at&~3))throw Error('Story item scalar relocation');if(float&&!Number.isFinite(d.getFloat32(at)))throw Error('Nonfinite Story item parameter');size===2?out.setUint16(at,d.getUint16(at),true):out.setUint32(at,d.getUint32(at),true);}
  function pointer(at){claim(at,4,'ptr');const value=d.getUint32(at);if(!a.relocations.has(at)){if(value)throw Error('Unrelocated Story item pointer');out.setUint32(at,0,true);return null;}if(value%4||value+4>d.byteLength)throw Error('Story item pointer bounds');pointers.add(at);out.setUint32(at,value,true);return value;}
  function raw(at){if(at<0||at>=d.byteLength||claims.has(at)||a.relocations.has(at&~3))throw Error('Story item packed overlap');packed.add(at);}
  function tree(t){for(const at of t.words instanceof Map?t.words.keys():t.words)t.pointers.has(at)?pointer(at):scalar(at);for(const at of t.halves||[])scalar(at,2);for(const at of t.packed||[])raw(at);}
  const special=pointer(article+4),states=pointer(article+12);if(special===null||states===null)throw Error('Missing Story item attributes/states');
  const zako=pointer(special);if(zako===null)throw Error('Missing Story enemy attributes');
  // Original enemy parameter record: integer, three floats, integer.
  // Preserve numeric bits; no descriptor or packed-byte inference.
  for(let i=0;i<20;i+=4)scalar(zako+i,4,i>0&&i<16);
  for(let i=4;i<28;i+=4)scalar(special+i,4,true);
  const scripts=[],animations=[];
  for(let i=0;i<3;i++){
    const p=states+i*16,joint=pointer(p),material=pointer(p+4),shape=pointer(p+8),script=pointer(p+12);
    if(shape!==null)throw Error('Story item morph graph pending');
    if(joint!==null){const t=readJointAnimation(a,joint);tree(t);for(const node of t.nodes)if(node.animation)tree(node.animation);}
    if(material!==null)tree(convertMaterialAnimation(archiveRootView(a,'item_Share_matanim_joint',material)));
    if(script!==null)scripts.push(script);animations.push({joint,material,shape,script});
  }
  const script=readMotionScripts(a,scripts,itemCommandWords);tree(script);
  return {kind:210,article,model,states,stateCount:3,animations,script,pointerSlots:pointers,source:bytes,image:nativeSubgraphImage(body,pointers,new Map([['native_story_article',article]]))};
}
