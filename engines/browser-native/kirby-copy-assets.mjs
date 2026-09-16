import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {convertPartsVisibility} from './visibility-assets.mjs';
import {convertArticleEntries} from './article-assets.mjs';

// Original hat constructors and 800F16D0 consume these five-word copy
// descriptors: hat joint, FtPartsDesc, projectile Article, null extra slot.
const profiles={
  Mr:{symbol:'Mario',states:1,special:5,wrapper:42836},
  Lg:{symbol:'Luigi',states:1,special:4,wrapper:48148},
  Dr:{symbol:'Drmario',states:6,special:5,wrapper:22712},
  Ca:{symbol:'Captain'},Gn:{symbol:'Ganon'},
};
export function convertKirbyCopy(input,code){
  const profile=profiles[code];if(!profile)throw Error('Kirby copy conversion pending: '+code);
  const symbol='ftDataKirbyCopy'+profile.symbol,a=inspectArchive(input),d=a.data,root=a.publics.get(symbol);
  if(root===undefined||root+20>a.dataSize||a.externs.size)throw Error('Invalid Kirby copy archive');
  const ptr=at=>{if(!a.relocations.has(at))throw Error('Missing Kirby copy pointer');const value=d.getUint32(at);if(value%4||value+4>a.dataSize)throw Error('Kirby copy pointer bounds');return value;};
  const joint=ptr(root),article=profile.states?ptr(root+12):null;
  if(article===null&&(a.relocations.has(root+12)||d.getUint32(root+12)))throw Error('Unexpected melee-copy Article');
  if(a.relocations.has(root+16)||d.getUint32(root+16))throw Error('Unexpected projectile copy extra');
  const scene=convertSceneAsset(archiveRootView(a,'hat_Share_joint',joint)),visibility=convertPartsVisibility(input,root+4,1),articles=article===null?{rows:[]}:convertArticleEntries(input,[{slot:0,article}],{0:[profile.states,profile.special]});
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),pointers=new Set(),claimed=new Map();
  function merge(image,typed,slots){
    for(const at of typed){if(at<0||at>=a.dataSize)throw Error('Copy typed byte bounds');const value=image[32+at];if(claimed.has(at)&&claimed.get(at)!==value)throw Error('Conflicting Kirby copy descriptors');claimed.set(at,value);body[at]=value;}
    for(const at of slots)if(at<a.dataSize){if(![0,1,2,3].every(i=>typed.has(at+i)))throw Error('Untyped copy pointer');pointers.add(at);}
  }
  const sceneTyped=new Set([...scene.pointerSlots].flatMap(p=>[p,p+1,p+2,p+3]));for(const [at,n]of scene.writes)for(let i=0;i<n;i++)sceneTyped.add(at+i);
  merge(scene.image,sceneTyped,scene.pointerSlots);
  const v=new DataView(visibility.image.buffer),size=v.getUint32(4,true),visPointers=Array.from({length:v.getUint32(8,true)},(_,i)=>v.getUint32(32+size+i*4,true));
  merge(visibility.image,visibility.typedBytes,visPointers);if(article!==null)merge(articles.image,articles.typedBytes,articles.pointerSlots);
  const out=new DataView(body.buffer);for(const at of article===null?[root]:[root,root+12]){if([0,1,2,3].some(i=>claimed.has(at+i)))throw Error('Copy root overlap');out.setUint32(at,d.getUint32(at),true);pointers.add(at);}
  // The exporter retained a trailing scene wrapper around the already imported
  // projectile model/animations. No published copy descriptor points to it.
  const untyped=[...a.relocations].filter(p=>!pointers.has(p));
  const row=articles.rows[0],anim=row?.animations[0],w=profile.wrapper;
  const orphan=article===null?new Map():new Map([[w,anim.joint],[w+8,anim.material],[w+16,row.joint],[w+20,anim.joint===null?null:w],[w+24,anim.material===null?null:w+8],[w+32,w+16]].filter(([,to])=>to!==null));
  if(untyped.length!==orphan.size||untyped.some(p=>!orphan.has(p)||d.getUint32(p)!==orphan.get(p))||[...pointers].some(p=>orphan.has(d.getUint32(p))))throw Error('Unexpected projectile copy orphan scene');
  return {code,symbol,root,joint,scene,visibility,articles,pointerSlots:pointers,unreferencedRelocations:untyped,image:nativeSubgraphImage(body,pointers,new Map([[symbol,root]]))};
}
