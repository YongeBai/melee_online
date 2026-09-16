import {inspectArchive,archiveRootView,nativeSubgraphImage,initializeArchiveExternals} from './archive.mjs';
import {convertArticleModels} from './item-model-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {readMotionScripts} from './motion-assets.mjs';
import {itemCommandWords} from './article-assets.mjs';

// Original common Articles needed by Peach's unmodified rare-item selection.
// Beam Sword's first three fields are numeric lifetimes despite UNK_T in decomp.
export function convertPeachCommonItems(input) {
  const bytes=initializeArchiveExternals(input,['ItmCommonFFlower_TopN_ACTION_Close_shapeanim_joint','ItmCommonFFlower_TopN_ACTION_Loop_shapeanim_joint','ItmCommonFFlower_TopN_ACTION_Open_shapeanim_joint','ItmCommonFFlower_TopN_ACTION_Wait_shapeanim_joint','ItmCommonSword_TopN_matanim_joint','ItmCommonSword_TopN_shapeanim_joint']),a=inspectArchive(bytes),d=a.data,root=a.publics.get('itPublicData');
  const pointerAt=at=>{if(!Number.isInteger(at)||at<0||at%4||at+4>d.byteLength||!a.relocations.has(at))throw Error('Missing common item pointer');return d.getUint32(at);};
  if(root===undefined)throw Error('Missing common item root');
  const table=pointerAt(root+4),entries=[6,7,12].map(slot=>({slot,article:pointerAt(table+slot*4)})),models=convertArticleModels(bytes,entries);
  const header=new DataView(models.image.buffer),size=header.getUint32(4,true),body=models.image.slice(32,32+size),out=new DataView(body.buffer);
  const pointers=new Set(Array.from({length:header.getUint32(8,true)},(_,i)=>header.getUint32(32+size+i*4,true))),claims=new Map(models.typedClaims),packed=new Set();
  function claim(at,size,type){if(!Number.isInteger(at)||at<0||at%(size<4?size:4)||at+size>d.byteLength)throw Error('Common item descriptor bounds');for(let i=at;i<at+size;i++){const old=claims.get(i);if(packed.has(i)||old&&old!==at+':'+type)throw Error('Common item descriptor overlap');claims.set(i,at+':'+type);}}
  function scalar(at,size=4,float=false){claim(at,size,size===2?'half':'word');if(a.relocations.has(at&~3))throw Error('Common item scalar relocation');if(float&&!Number.isFinite(d.getFloat32(at)))throw Error('Nonfinite Common item parameter');size===2?out.setUint16(at,d.getUint16(at),true):out.setUint32(at,d.getUint32(at),true);}
  function pointer(at){claim(at,4,'ptr');const value=d.getUint32(at);if(!a.relocations.has(at)){if(value)throw Error('Unrelocated Common item pointer');out.setUint32(at,0,true);return null;}if(value%4||value+4>d.byteLength)throw Error('Common item pointer bounds');pointers.add(at);out.setUint32(at,value,true);return value;}
  function raw(at){if(at<0||at>=d.byteLength||claims.has(at)||a.relocations.has(at&~3))throw Error('Common item packed overlap');packed.add(at);}
  function tree(t){for(const at of t.words instanceof Map?t.words.keys():t.words)t.pointers.has(at)?pointer(at):scalar(at);for(const at of t.halves||[])scalar(at,2);for(const at of t.packed||[])raw(at);}
  function shapeTopology(root){
    const seen=new Set();let joints=0,objects=0;
    function visit(at,type){
      if(at===null)return;if(seen.has(at)||seen.size>=4096)throw Error('Cyclic/shared article shape topology');seen.add(at);
      if(type==='joint'){joints++;const child=pointer(at),next=pointer(at+4),object=pointer(at+8);visit(child,'joint');visit(next,'joint');visit(object,'object');}
      else {objects++;const next=pointer(at),animation=pointer(at+4);if(animation!==null)throw Error('Article morph graph pending');visit(next,'object');}
    }
    visit(root,'joint');return {joints,objects};
  }
  const rows=[];
  for(const model of models.rows){
    const {slot:kind,article}=model,special=pointer(article+4),states=pointer(article+12);
    if(special===null||states===null)throw Error('Missing common item attributes/states');
    if(kind===6)for(let i=0;i<11;i++)scalar(special+i*4,4,true);
    if(kind===7)for(let i=0;i<6;i++)scalar(special+i*4,4,i===0||i===2);
    if(kind===12){for(let i=0;i<9;i++)scalar(special+i*4,4,i>=3&&i!==6);for(let i=36;i<45;i++)raw(special+i);}
    const stateCount={6:7,7:4,12:2}[kind],scripts=[],animations=[];
    for(let i=0;i<stateCount;i++){
      const p=states+i*16,joint=pointer(p),material=pointer(p+4),shape=pointer(p+8),script=pointer(p+12);
      if(shape!==null)shapeTopology(shape);
      if(joint!==null){const t=readJointAnimation(a,joint);tree(t);for(const node of t.nodes)if(node.animation)tree(node.animation);}
      if(material!==null)tree(convertMaterialAnimation(archiveRootView(a,'item_Share_matanim_joint',material)));
      if(script!==null)scripts.push(script);animations.push({joint,material,shape,script});
    }
    const script=readMotionScripts(a,scripts,itemCommandWords);tree(script);
    rows.push({...model,kind,special,states,stateCount,animations,script});
  }
  return {rows,pointerSlots:pointers,source:bytes,image:nativeSubgraphImage(body,pointers,new Map(rows.map(r=>['native_common_article_'+r.kind,r.article])))};
}
