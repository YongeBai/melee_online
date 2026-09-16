import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {convertPartsVisibility} from './visibility-assets.mjs';
import {convertArticleEntries} from './article-assets.mjs';

// Original hat constructors and 800F16D0 consume these five-word copy
// descriptors: hat joint, FtPartsDesc, and up to two Articles.
const profiles={
  Mr:{symbol:'Mario',articles:[[1,5]],wrappers:[[0,42836,42844,42852,[0]]]},
  Lg:{symbol:'Luigi',articles:[[1,4]],wrappers:[[0,48148,48156,48164,[0]]]},
  Dr:{symbol:'Drmario',articles:[[6,5]],wrappers:[[0,22712,22720,22728,[0]]]},
  Ns:{symbol:'Ness',articles:[[3,11],[1,5]],wrappers:[[0,54308,null,54320,[0,1]],[1,81960,81968,81976,[0]]]},
  Pe:{symbol:'Peach',articles:[[2,1],[1,4]],wrappers:[[0,35884,35896,35908,[0,1]]]},
  Ca:{symbol:'Captain'},Gn:{symbol:'Ganon'},
};
export function convertKirbyCopy(input,code){
  const profile=profiles[code];if(!profile)throw Error('Kirby copy conversion pending: '+code);
  const symbol='ftDataKirbyCopy'+profile.symbol,a=inspectArchive(input),d=a.data,root=a.publics.get(symbol);
  if(root===undefined||root+20>a.dataSize||a.externs.size)throw Error('Invalid Kirby copy archive');
  const ptr=at=>{if(!a.relocations.has(at))throw Error('Missing Kirby copy pointer');const value=d.getUint32(at);if(value%4||value+4>a.dataSize)throw Error('Kirby copy pointer bounds');return value;};
  const joint=ptr(root),specs=profile.articles??[],entries=specs.map((_,slot)=>({slot,article:ptr(root+12+slot*4)}));
  for(let i=specs.length;i<2;i++)if(a.relocations.has(root+12+i*4)||d.getUint32(root+12+i*4))throw Error('Unexpected copy Article/extra');
  const scene=convertSceneAsset(archiveRootView(a,'hat_Share_joint',joint)),visibility=convertPartsVisibility(input,root+4,1),articles=entries.length?convertArticleEntries(input,entries,Object.fromEntries(specs.map((s,i)=>[i,s]))):{rows:[]};
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),pointers=new Set(),claimed=new Map();
  function merge(image,typed,slots){
    for(const at of typed){if(at<0||at>=a.dataSize)throw Error('Copy typed byte bounds');const value=image[32+at];if(claimed.has(at)&&claimed.get(at)!==value)throw Error('Conflicting Kirby copy descriptors');claimed.set(at,value);body[at]=value;}
    for(const at of slots)if(at<a.dataSize){if(![0,1,2,3].every(i=>typed.has(at+i)))throw Error('Untyped copy pointer');pointers.add(at);}
  }
  const sceneTyped=new Set([...scene.pointerSlots].flatMap(p=>[p,p+1,p+2,p+3]));for(const [at,n]of scene.writes)for(let i=0;i<n;i++)sceneTyped.add(at+i);
  merge(scene.image,sceneTyped,scene.pointerSlots);
  const v=new DataView(visibility.image.buffer),size=v.getUint32(4,true),visPointers=Array.from({length:v.getUint32(8,true)},(_,i)=>v.getUint32(32+size+i*4,true));
  merge(visibility.image,visibility.typedBytes,visPointers);if(entries.length)merge(articles.image,articles.typedBytes,articles.pointerSlots);
  const out=new DataView(body.buffer);for(const at of [root,...entries.map(e=>root+12+e.slot*4)]){if([0,1,2,3].some(i=>claimed.has(at+i)))throw Error('Copy root overlap');out.setUint32(at,d.getUint32(at),true);pointers.add(at);}
  // The exporter retained a trailing scene wrapper around the already imported
  // projectile model/animations. No published copy descriptor points to it.
  const untyped=[...a.relocations].filter(p=>!pointers.has(p));
  const orphan=new Map();
  for(const [slot,joints,materials,model,indices] of profile.wrappers??[]){
    const row=articles.rows[slot],anims=indices.map(i=>row.animations[i]);
    for(const [table,key]of [[joints,'joint'],[materials,'material']]){
      if(table===null){if(anims.some(a=>a[key]!==null))throw Error('Missing exporter animation table');continue;}
      anims.forEach((a,i)=>{if(a[key]!==null)orphan.set(table+i*4,a[key]);});
    }
    orphan.set(model,row.joint);if(anims.some(a=>a.joint!==null))orphan.set(model+4,joints);if(anims.some(a=>a.material!==null))orphan.set(model+8,materials);orphan.set(model+16,model);
  }
  if(untyped.length!==orphan.size||untyped.some(p=>!orphan.has(p)||d.getUint32(p)!==orphan.get(p))||[...pointers].some(p=>orphan.has(d.getUint32(p))))throw Error('Unexpected projectile copy orphan scene');
  return {code,symbol,root,joint,scene,visibility,articles,pointerSlots:pointers,unreferencedRelocations:untyped,image:nativeSubgraphImage(body,pointers,new Map([[symbol,root]]))};
}
