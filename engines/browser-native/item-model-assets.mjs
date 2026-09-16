import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';
import {convertSceneAsset} from './scene-assets.mjs';

// Article slots registered by the playable characters' original OnLoad callbacks.
// Other x48 entries have different types (e.g. hats and part tables), so they
// must not be traversed as Articles. Nana uses Popo's registered articles.
export const characterArticleSlots=Object.freeze(Object.fromEntries(Object.entries({
  Mr:[0,2],Dr:[1,3],Fx:[0,1,2],Fc:[0,1,3],Pp:[0,1,2],Kb:[0,1,2,3],Kp:[0],Lk:[0,1,2,3,4],Cl:[0,1,2,3,4,5],
  Ns:[0,1,2,3,4,5,6,7,8,9,10],Sk:[0,1,2,3],Pe:[0,1,2,3,4],Pk:[0,1,2],Pc:[0,1,2],Ys:[0,1,2],Zd:[0,1],Mt:[0,1],
  Gw:[0,1,2,3,4,5,6,7,8,9],Ss:[0,1,2,3],Lg:[0],Ca:[],Dk:[],Gn:[],Ms:[],Fe:[],Nn:[],Pr:[],
}).map(([code,slots])=>[code,Object.freeze(slots)])));

// Publish only complete model/common-attribute/hurtbox subgraphs, not an Article
// or ftData root whose special attributes, animation states and scripts are pending.
export function convertItemModels(input,name) {
  const a=inspectArchive(input),d=a.data,code=/^Pl([A-Za-z]{2})\.dat$/.exec(name)?.[1],slots=characterArticleSlots[code],source=a.publics.get('ftData'+fighterArchives[code]);
  if(!slots||source===undefined)throw Error('Unknown item model archive');
  const root=(a.dataSize+3)&~3,bytes=new Uint8Array(root+8+slots.length*12),out=new DataView(bytes.buffer);bytes.set(a.bytes.subarray(32,32+a.dataSize));
  const pointers=new Set(),types=new Map(),external=new Map(),rows=[];
  const bounds=(at,size,align=4)=>{if(!Number.isInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Item model bounds');};
  for(const [symbol,start] of a.externs)for(let at=start;at!==0xffffffff;){bounds(at,4);if(external.has(at))throw Error('Invalid item external chain');external.set(at,symbol);at=d.getUint32(at);}
  function claim(at,size,type,allowExternal=false){bounds(at,size,size<4?size:4);for(let i=0;i<size;i++){if(!allowExternal&&external.has((at+i)&~3))throw Error('Item model external reference');const old=types.get(at+i);if(old&&old!==at+':'+type)throw Error('Overlapping item model types');types.set(at+i,at+':'+type);}}
  function pointer(at,modelRoot=false){
    const allowed=modelRoot&&code==='Pp'&&external.get(at)==='ItmIceclimberGumStrings_TopN_joint';
    claim(at,4,'ptr',allowed);if(allowed){out.setUint32(at,0,true);return null;}const value=d.getUint32(at);if(!a.relocations.has(at)){if(value)throw Error('Unrelocated item model pointer');out.setUint32(at,0,true);return null;}bounds(value,1,1);pointers.add(at);out.setUint32(at,value,true);return value;}
  function word(at,float=false){claim(at,4,'word');if(a.relocations.has(at))throw Error('Item model scalar relocation');if(float&&!Number.isFinite(d.getFloat32(at)))throw Error('Nonfinite item model parameter');out.setUint32(at,d.getUint32(at),true);return float?d.getFloat32(at):d.getUint32(at);}
  function packed(at){claim(at,1,'byte');if(a.relocations.has(at&~3))throw Error('Item model packed relocation');return d.getUint8(at);}
  const table=slots.length?pointer(source+0x48):null;if(slots.length&&table===null)throw Error('Missing character article table');
  for(const [i,slot] of slots.entries()) {
    const article=pointer(table+slot*4);if(article===null)throw Error('Missing character article');bounds(article,24);
    const attributes=pointer(article),model=pointer(article+16),hurt=pointer(article+8),dynamics=pointer(article+20);
    if(attributes===null||model===null||dynamics!==null)throw Error('Unsupported item model graph');
    bounds(attributes,0x84);const flags=[packed(attributes),packed(attributes+1)],scalars=[];packed(attributes+2);packed(attributes+3);
    for(let at=4;at<0x84;at+=4)scalars.push(word(attributes+at,at!==8&&at<0x64));
    bounds(model,16);const joint=pointer(model,true),boneCount=word(model+4),attachId=word(model+8)|0,modelFlags=packed(model+12);for(let at=13;at<16;at++)packed(model+at);
    let scene=null;
    if(joint!==null) {
      scene=convertSceneAsset(archiveRootView({...a,externs:new Map()},'item_Share_joint',joint));
      for(const at of external.keys())if(scene.descriptorSlots.has(at)||scene.writes.has(at))throw Error('Item scene requires external linking');
      for(const at of scene.descriptorSlots)if(a.relocations.has(at))pointer(at);
      for(const [at,size] of scene.writes){claim(at,size,size===2?'half':'word');if(a.relocations.has(at))throw Error('Item scene scalar relocation');if(size===2)out.setUint16(at,d.getUint16(at),true);else out.setUint32(at,d.getUint32(at),true);}
    }
    const nodeCount=scene?.model.tree.nodes.length??1;
    if(boneCount>100||(boneCount&&boneCount!==nodeCount)||attachId<0||attachId>=nodeCount)throw Error('Invalid item bone table');
    const hurtboxes=[];
    if(hurt!==null) {
      const count=word(hurt),descs=pointer(hurt+4);if(count>2||(count&&descs===null))throw Error('Invalid item hurtbox count');
      for(let h=0;h<count;h++){const at=descs+h*32,bone=word(at);if(bone>=nodeCount||(bone&&!boneCount))throw Error('Invalid item hurtbox bone');hurtboxes.push({bone,a:[4,8,12].map(x=>word(at+x,true)),b:[16,20,24].map(x=>word(at+x,true)),scale:word(at+28,true)});}
    }
    const at=root+8+i*12;[attributes,model,hurt].forEach((p,j)=>{out.setUint32(at+j*4,p??0,true);if(p!==null)pointers.add(at+j*4);});
    rows.push({slot,article,attributes,model,hurt,flags,scalars,joint,boneCount,attachId,modelFlags,hurtboxes,scene});
  }
  out.setUint32(root,rows.length,true);out.setUint32(root+4,rows.length?root+8:0,true);if(rows.length)pointers.add(root+4);
  return {root,rows,typedBytes:new Set(types.keys()),image:nativeSubgraphImage(bytes,pointers,new Map([['native_item_models',root]]))};
}
