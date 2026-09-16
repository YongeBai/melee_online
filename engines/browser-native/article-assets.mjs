import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {convertItemModels} from './item-model-assets.mjs';
import {readMotionScripts} from './motion-assets.mjs';

// Original itanimlist.c handlers 10..25. Sound commands (16) have a second
// dispatch field; their length follows it_8027978C, not fighter command lengths.
export const itemCommandWords=Object.freeze([1,1,1,1,1,2,1,2,1,1,5,6,1,1,1,1,
  word=>[0,1,2,10,11].includes((word>>>18)&255)?3:2,1,1,1,1,1,1,1,1,1]);

// Fox/Falco's original state tables select 2 laser, 9 blaster and 3 illusion
// animations. These archives use script-only state descriptors; a nonnull
// joint/material/shape animation is rejected until its graph is integrated.
// Publish Articles only. Other x48 entries (including Fox's slot 4) are not
// Articles and must not be exposed as an allegedly complete fighter table.
export function convertFighterArticles(input,name) {
  const code=/^Pl(Fx|Fc)\.dat$/.exec(name)?.[1];
  if(!code)throw Error('Complete article conversion pending: '+name);
  const a=inspectArchive(input),d=a.data,models=convertItemModels(input,name),header=new DataView(models.image.buffer);
  const size=header.getUint32(4,true),n=header.getUint32(8,true),bytes=models.image.slice(32,32+size),out=new DataView(bytes.buffer);
  const pointers=new Set(Array.from({length:n},(_,i)=>header.getUint32(32+size+i*4,true))),claims=new Map(),rows=[];
  const bounds=(at,bytes)=>{if(!Number.isInteger(at)||at<0||at%4||at+bytes>a.dataSize)throw Error('Article bounds');};
  function claim(at,type) {
    bounds(at,4);
    for(let i=at;i<at+4;i++) {
      if(models.typedBytes.has(i))throw Error('Article descriptor overlaps model data');
      const previous=claims.get(i);if(previous&&previous!==at+':'+type)throw Error('Article type overlap');
      claims.set(i,at+':'+type);
    }
  }
  function pointer(at) {
    claim(at,'pointer');const value=d.getUint32(at);
    if(!a.relocations.has(at)){if(value)throw Error('Unrelocated article pointer');out.setUint32(at,0,true);return null;}
    bounds(value,4);pointers.add(at);out.setUint32(at,value,true);return value;
  }
  function scalar(at,float=false) {
    claim(at,'word');if(a.relocations.has(at))throw Error('Article scalar relocation');
    if(float&&!Number.isFinite(d.getFloat32(at)))throw Error('Nonfinite article attribute');
    out.setUint32(at,d.getUint32(at),true);
  }
  for(const [index,model] of models.rows.entries()) {
    const stateCount=[2,9,3][index],specialWords=index===2?2:10;
    const special=pointer(model.article+4),states=pointer(model.article+12);
    if(special===null||states===null)throw Error('Missing complete article data');
    bounds(special,specialWords*4);bounds(states,stateCount*16);
    for(let j=0;j<specialWords;j++)scalar(special+j*4,true);
    const scripts=[];
    for(let j=0;j<stateCount;j++) {
      for(let k=0;k<3;k++)if(pointer(states+j*16+k*4)!==null)throw Error('Article animation graph pending');
      const p=pointer(states+j*16+12);if(p!==null)scripts.push(p);
    }
    const script=readMotionScripts(a,scripts,itemCommandWords);
    for(const at of script.words.keys())script.pointers.has(at)?pointer(at):scalar(at);
    rows.push({...model,special,specialWords,states,stateCount,scripts,script});
  }
  return {code,rows,pointerSlots:pointers,image:nativeSubgraphImage(bytes,pointers,new Map(rows.map(r=>['native_article_'+r.slot,r.article])))};
}
