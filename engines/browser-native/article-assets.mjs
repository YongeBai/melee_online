import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertItemModels} from './item-model-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {readMotionScripts} from './motion-assets.mjs';

// Original itanimlist.c handlers 10..25. Sound commands (16) have a second
// dispatch field; their length follows it_8027978C, not fighter command lengths.
export const itemCommandWords=Object.freeze([1,1,1,1,1,2,1,2,1,1,5,6,1,1,1,1,
  word=>[0,1,2,10,11].includes((word>>>18)&255)?3:2,1,1,1,1,1,1,1,1,1]);

// Counts follow the original item state tables, including Dr. Mario's six
// descriptors shared by seven runtime states. Non-Article x48 entries remain
// the fighter base importer's responsibility.
export const fighterArticleProfiles=Object.freeze({
  Fx:{slots:5,articles:{0:[2,10],1:[9,10],2:[3,2]}},
  Fc:{slots:5,articles:{0:[2,10],1:[9,10],3:[3,2]}},
  Mr:{slots:4,articles:{0:[1,5],2:[2,1]}},
  Lg:{slots:1,articles:{0:[1,4]}},
  Dr:{slots:4,articles:{1:[6,5],3:[2,1]}},
});
export function convertFighterArticles(input,name) {
  const code=/^Pl([A-Za-z]{2})\.dat$/.exec(name)?.[1];
  if(!fighterArticleProfiles[code])throw Error('Complete article conversion pending: '+name);
  const a=inspectArchive(input),d=a.data,models=convertItemModels(input,name),header=new DataView(models.image.buffer);
  const size=header.getUint32(4,true),n=header.getUint32(8,true),bytes=models.image.slice(32,32+size),out=new DataView(bytes.buffer);
  const pointers=new Set(Array.from({length:n},(_,i)=>header.getUint32(32+size+i*4,true))),claims=new Map(models.typedClaims),packed=new Set(),rows=[];
  const bounds=(at,bytes)=>{if(!Number.isInteger(at)||at<0||at%4||at+bytes>a.dataSize)throw Error('Article bounds');};
  function claim(at,size,type) {
    if(!Number.isInteger(at)||at<0||at%(size<4?size:4)||at+size>a.dataSize)throw Error('Article bounds');
    for(let i=at;i<at+size;i++) {
      const previous=claims.get(i);if(packed.has(i)||previous&&previous!==at+':'+type)throw Error('Article type overlap');
      claims.set(i,at+':'+type);
    }
  }
  function pointer(at) {
    claim(at,4,'ptr');const value=d.getUint32(at);
    if(!a.relocations.has(at)){if(value)throw Error('Unrelocated article pointer');out.setUint32(at,0,true);return null;}
    bounds(value,4);pointers.add(at);out.setUint32(at,value,true);return value;
  }
  function scalar(at,size=4,float=false) {
    claim(at,size,size===2?'half':'word');if(a.relocations.has(at&~3))throw Error('Article scalar relocation');
    if(float&&!Number.isFinite(d.getFloat32(at)))throw Error('Nonfinite article attribute');
    size===2?out.setUint16(at,d.getUint16(at),true):out.setUint32(at,d.getUint32(at),true);
  }
  function raw(at){if(at<0||at>=a.dataSize||claims.has(at)||a.relocations.has(at&~3))throw Error('Article packed overlap');packed.add(at);}
  function tree(t){for(const at of t.words instanceof Map?t.words.keys():t.words)t.pointers.has(at)?pointer(at):scalar(at);for(const at of t.halves||[])scalar(at,2);for(const at of t.packed||[])raw(at);}
  for(const model of models.rows) {
    const [stateCount,specialWords]=fighterArticleProfiles[code].articles[model.slot];
    const special=pointer(model.article+4),states=pointer(model.article+12);
    if(special===null||states===null)throw Error('Missing complete article data');
    bounds(special,specialWords*4);bounds(states,stateCount*16);
    for(let j=0;j<specialWords;j++)scalar(special+j*4,4,true);
    const scripts=[],animations=[];
    for(let j=0;j<stateCount;j++) {
      const at=states+j*16,joint=pointer(at),material=pointer(at+4),shape=pointer(at+8),script=pointer(at+12);
      if(shape!==null)throw Error('Article morph graph pending');
      if(joint!==null){const t=readJointAnimation(a,joint);tree(t);for(const node of t.nodes)if(node.animation)tree(node.animation);}
      if(material!==null)tree(convertMaterialAnimation(archiveRootView(a,'item_Share_matanim_joint',material)));
      if(script!==null)scripts.push(script);animations.push({joint,material,shape,script});
    }
    const script=readMotionScripts(a,scripts,itemCommandWords);
    tree(script);
    rows.push({...model,special,specialWords,states,stateCount,animations,scripts,script});
  }
  return {code,rows,pointerSlots:pointers,image:nativeSubgraphImage(bytes,pointers,new Map(rows.map(r=>['native_article_'+r.slot,r.article])))};
}
