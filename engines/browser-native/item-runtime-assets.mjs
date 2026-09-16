import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {convertItemCommon} from './item-common-assets.mjs';
import {readMotionScripts} from './motion-assets.mjs';
import {colorCommandWords} from './color-assets.mjs';

// Common parameters plus the seven USA 1.02 item color descriptors. Articles
// are loaded separately by kind; the incomplete itPublicData root is not exposed.
export function convertItemRuntime(input) {
  const a=inspectArchive(input),d=a.data,common=convertItemCommon(input),root=a.publics.get('itPublicData');
  const header=new DataView(common.image.buffer),size=header.getUint32(4,true),bytes=common.image.slice(32,32+size),out=new DataView(bytes.buffer);
  if(!a.relocations.has(root+20))throw Error('Missing item colors');
  const colors=d.getUint32(root+20),pointers=new Set(),occupied=new Set([...common.words.flatMap(p=>[p,p+1,p+2,p+3]),...common.packed]),claimed=new Map(),starts=[];
  function claim(at,type){if(at%4||at<0||at+4>d.byteLength)throw Error('Item color bounds');for(let i=at;i<at+4;i++){if(occupied.has(i)||claimed.has(i)&&claimed.get(i)!==at+':'+type)throw Error('Item color type overlap');claimed.set(i,at+':'+type);}}
  function pointer(at){claim(at,'pointer');const p=d.getUint32(at);if(!a.relocations.has(at)){if(p)throw Error('Unrelocated item color script');out.setUint32(at,0,true);return null;}if(p%4||p+4>d.byteLength)throw Error('Item color script bounds');out.setUint32(at,p,true);pointers.add(at);return p;}
  const entries=[];
  for(let i=0;i<7;i++){const at=colors+i*8,p=pointer(at);claim(at+4,'packed');if(a.relocations.has(at+4))throw Error('Item color flags relocation');if(p!==null)starts.push(p);entries.push({index:i,offset:at,script:p,priority:d.getUint8(at+4),secondary:d.getUint8(at+5)});}
  const scripts=readMotionScripts(a,starts,colorCommandWords,{terminalOpcodes:[0,6,7,10]});
  for(const at of scripts.words.keys())if(scripts.pointers.has(at))pointer(at);else {claim(at,'word');if(a.relocations.has(at))throw Error('Item color word relocation');out.setUint32(at,d.getUint32(at),true);}
  for(const start of a.externs.values())for(let at=start;at!==0xffffffff;){if(claimed.has(at))throw Error('Item color external dependency');at=d.getUint32(at);}
  return {...common,archive:a,colors,scripts,colorTable:{section:0,offset:colors,entries},image:nativeSubgraphImage(bytes,pointers,new Map([['native_item_common',common.common],['native_item_parameters',common.parameters],['native_item_colors',colors]]))};
}
