import {inspectArchive,archiveRootView,nativeSubgraphImage,initializeArchiveExternals} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {convertItemModels,convertArticleModels} from './item-model-assets.mjs';
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
  Kb:{slots:5,articles:{0:[1,4],1:[1,0],2:[1,1],3:[1,0]}},
  Fx:{slots:5,articles:{0:[2,10],1:[9,10],2:[3,2]}},
  Fc:{slots:5,articles:{0:[2,10],1:[9,10],3:[3,2]}},
  Mr:{slots:4,articles:{0:[1,5],2:[2,1]}},
  Lg:{slots:1,articles:{0:[1,4]}},
  Dr:{slots:4,articles:{1:[6,5],3:[2,1]}},
  Pk:{slots:3,articles:{0:[1,3],1:[2,4],2:[1,1]}},
  Pc:{slots:3,articles:{0:[1,3],1:[2,4],2:[1,1]}},
  Kp:{slots:1,articles:{0:[1,6]}},
  Ys:{slots:4,articles:{0:[2,2],1:[1,2],2:[0,0]}},
  Sk:{slots:6,articles:{0:[5,3],1:[1,1],2:[1,0],3:[0,25]}},
  Pp:{slots:3,articles:{0:[1,13],1:[1,5],2:[0,9]}},
  Nn:{slots:3,articles:{0:[1,13],1:[1,5],2:[0,9]}},
  Pe:{slots:5,articles:{0:[2,0],1:[3,18],2:[2,1],3:[2,1],4:[1,4]}},
  Zd:{slots:2,articles:{0:[2,12],1:[1,5]}},
  Ns:{slots:11,articles:{0:[1,2],1:[1,3],2:[3,11],3:[1,5],4:[1,1],5:[1,1],6:[1,1],7:[1,1],8:[1,5],9:[1,1],10:[0,20]}},
  Mt:{slots:2,articles:{0:[1,2],1:[10,16]}},
  // Ten move Articles and a fighter outline visibility lookup in slot 10.
  Gw:{slots:11,articles:{0:[4,1],1:[1,1],2:[1,1],3:[2,1],4:[2,1],5:[2,1],6:[1,1],7:[2,1],8:[2,29],9:[2,1]}},
  Lk:{slots:7,articles:{0:[3,16],1:[3,17],2:[0,21],3:[1,9],4:[6,1]}},
  Cl:{slots:7,articles:{0:[3,16],1:[3,17],2:[0,21],3:[1,9],4:[6,1],5:[2,1]}},
  Ss:{slots:5,articles:{0:[2,7],1:[9,8],2:[4,16],3:[0,25]}},
});
export function initializeFighterArticleArchive(input,code){
  if(code==='Kb')return initializeArchiveExternals(input,['PlyKirby5K_LHaveN_ACTION_HandLMiddle_animjoint','PlyKirby5K_RHaveN_ACTION_HandRMiddle_animjoint']);
  if(code==='Pp')return initializeArchiveExternals(input,['ItmIceclimberGumStrings_TopN_joint']);
  if(code==='Nn')return initializeArchiveExternals(input,['ItmIceclimberGumStrings_TopN_joint','ItmIceclimberGum_TopN_joint','ItmIceclimberIceShot_TopN_animjoint','ItmIceclimberIceShot_TopN_joint']);
  if(code==='Gw')return initializeArchiveExternals(input,['ItmGamewatchBreath_TopN_ACTION_LandingAirHi_animjoint','ItmGamewatchRescue_TopN_ACTION_SpecialHiAir_animjoint']);
  if(['Lk','Cl'].includes(code))return initializeArchiveExternals(input,['ItmLinkHShot_TopN_ACTION_Out_matanim_joint','ItmLinkHShot_TopN_ACTION_Out_shapeanim_joint']);
  return code==='Ss'?initializeArchiveExternals(input,[
    'ItmSamusGBeamChainA_TopN_shapeanim_joint','ItmSamusGBeamChainB_TopN_shapeanim_joint','ItmSamusGBeamChainC_TopN_shapeanim_joint',
    'ItmSamusGBeamStart_TopN_matanim_joint','ItmSamusGBeamStart_TopN_shapeanim_joint','ItmSamusGBeamTop_TopN_matanim_joint','ItmSamusGBeamTop_TopN_shapeanim_joint',
  ]):input;
}
export function convertFighterArticles(input,name) {
  return convertArticles(input,name,null);
}
// Copy-ability archives embed Articles directly, without an ftData x48 table.
// This entry point accepts explicit, independently known descriptor extents.
export function convertArticleEntries(input,entries,profiles,{arrowSlots=[],outlineSlots=[]}={}) {
  if(!Array.isArray(entries)||!entries.length||entries.some(e=>!Array.isArray(profiles[e.slot])||profiles[e.slot].length!==2||profiles[e.slot].some(n=>!Number.isInteger(n)||n<0||n>64)))throw Error('Invalid explicit Article profile');
  if(!Array.isArray(arrowSlots)||new Set(arrowSlots).size!==arrowSlots.length||arrowSlots.some(slot=>!Number.isInteger(slot)||!entries.some(e=>e.slot===slot)||profiles[slot][1]!==9))throw Error('Invalid arrow Article profile');
  if(!Array.isArray(outlineSlots)||new Set(outlineSlots).size!==outlineSlots.length||outlineSlots.some(slot=>!Number.isInteger(slot)||!entries.some(e=>e.slot===slot)||![1,29].includes(profiles[slot][1])))throw Error('Invalid outline Article profile');
  return convertArticles(input,null,{entries,profiles,arrowSlots,outlineSlots});
}
function convertArticles(input,name,custom) {
  const code=/^Pl([A-Za-z]{2})\.dat$/.exec(name)?.[1];
  if(!custom&&!fighterArticleProfiles[code])throw Error('Complete article conversion pending: '+name);
  input=initializeFighterArticleArchive(input,code);
  const a=inspectArchive(input),d=a.data,models=custom?convertArticleModels(input,custom.entries):convertItemModels(input,name),header=new DataView(models.image.buffer);
  const size=header.getUint32(4,true),n=header.getUint32(8,true),bytes=models.image.slice(32,32+size),out=new DataView(bytes.buffer);
  const pointers=new Set(Array.from({length:n},(_,i)=>header.getUint32(32+size+i*4,true))),claims=new Map(models.typedClaims),packed=new Set(),rows=[],extraRows=[],attachments=[];
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
  function shapeTopology(root){
    const seen=new Set();let joints=0,objects=0;
    function visit(at,type){
      if(at===null)return;if(seen.has(at)||seen.size>=4096)throw Error('Cyclic/shared article shape topology');seen.add(at);
      if(type==='joint'){bounds(at,12);joints++;const child=pointer(at),next=pointer(at+4),object=pointer(at+8);visit(child,'joint');visit(next,'joint');visit(object,'object');}
      else {bounds(at,8);objects++;const next=pointer(at),animation=pointer(at+4);if(animation!==null)throw Error('Article morph graph pending');visit(next,'object');}
    }
    visit(root,'joint');return {joints,objects};
  }
  function jointAnimation(root){if(root!==null){const t=readJointAnimation(a,root);tree(t);for(const node of t.nodes)if(node.animation)tree(node.animation);}}
  function materialAnimation(root){if(root!==null)tree(convertMaterialAnimation(archiveRootView(a,'item_Share_matanim_joint',root)));}
  function attachment(joint,label){
    if(joint===null)throw Error('Missing Article attachment model');
    const scene=convertSceneAsset(archiveRootView(a,'item_Share_joint',joint));
    for(const at of scene.pointerSlots)pointer(at);for(const [at,size]of scene.writes)scalar(at,size);
    attachments.push({joint,label,nodes:scene.model.tree.nodes.length});
  }
  for(const model of models.rows) {
    const outlineItem=code==='Gw'||custom?.outlineSlots.includes(model.slot);
    const [stateCount,specialWords]=(custom?.profiles??fighterArticleProfiles[code].articles)[model.slot];
    const special=pointer(model.article+4),states=pointer(model.article+12);
    if((specialWords>0?special===null:special!==null)||stateCount>0&&states===null||stateCount===0&&states!==null)throw Error('Missing complete article data');
    if(specialWords)bounds(special,specialWords*4);if(stateCount)bounds(states,stateCount*16);
    for(let j=outlineItem?1:0;j<specialWords;j++)scalar(special+j*4,4,!(['Pp','Nn'].includes(code)&&(model.slot===0&&j>=11||model.slot===2&&[0,1,6,7,8].includes(j))||code==='Pe'&&(model.slot===1&&j>0||[2,3].includes(model.slot))||code==='Sk'&&model.slot===3&&j===0||code==='Ns'&&(model.slot===9||model.slot===10&&(j<3||j>=16))||code==='Mt'&&model.slot===1&&j===8||code==='Ss'&&(model.slot===1&&j===1||model.slot===3&&[3,13].includes(j))));
    if(['Pp','Nn'].includes(code)&&model.slot===2)for(const off of [0x24,0x28]){const joint=pointer(special+off);if(joint!==null)attachment(joint,'climbers rope '+off);else if(code==='Pp')throw Error('Missing Popo rope model');}
    if(code==='Sk'&&model.slot===3)for(const off of [0x64,0x68])attachment(pointer(special+off),'chain '+off);
    if(code==='Ns'&&model.slot===10){
      // itYoyoAttributes: twenty scalar words, two joints, material animation,
      // and a final signed word. The original callbacks own all twenty links.
      for(const off of [0x50,0x54])attachment(pointer(special+off),'yo-yo '+off);
      materialAnimation(pointer(special+0x58));scalar(special+0x5C);
    }
    if(outlineItem){
      // it_266F_ItemVars: two u16 counts plus packed joint-index arrays.
      // Chef's remaining 28 floats are three common fields and five entries.
      const outline=pointer(special);if(outline===null)throw Error('Missing Game & Watch item outline');
      bounds(outline,16);
      for(const offset of [0,8]){
        scalar(outline+offset,2);const count=d.getUint16(outline+offset),indices=pointer(outline+offset+4);
        if(count>model.boneCount||count&&indices===null)throw Error('Invalid item outline count');
        for(let i=0;i<count;i++){raw(indices+i);if(d.getUint8(indices+i)>=model.boneCount)throw Error('Invalid item outline bone');}
      }
    }
    if(code==='Ss'&&model.slot===3){
      for(let off=0x64;off<=0x70;off+=4)attachment(pointer(special+off),'grapple '+((off-0x64)/4));
      for(let off=0x74;off<=0xAC;off+=12){
        const roots=[0,4,8].map(i=>{const table=pointer(special+off+i);return table===null?null:pointer(table);});
        jointAnimation(roots[0]);materialAnimation(roots[1]);if(roots[2]!==null)shapeTopology(roots[2]);
      }
    }
    if(['Lk','Cl'].includes(code)){
      if(model.slot===1){
        for(const off of [0x44,0x48])attachment(pointer(special+off),'boomerang '+off);
        for(const off of [0x4C,0x58]){jointAnimation(pointer(special+off));materialAnimation(pointer(special+off+4));const shape=pointer(special+off+8);if(shape!==null)shapeTopology(shape);}
      }
      if(model.slot===2)for(const off of [0x54,0x58,0x5C])attachment(pointer(special+off),'hookshot '+off);
    }
    // Link's copied arrow keeps the same attribute structure in copy slot 0.
    // The two trailing joints and final float are outside its nine scalars.
    if(['Lk','Cl'].includes(code)&&model.slot===3||custom?.arrowSlots.includes(model.slot)){
      for(const off of [0x24,0x28])attachment(pointer(special+off),'arrow '+off);
      scalar(special+0x2C,4,true);
      if(custom?.arrowSlots.includes(model.slot)){
        // Copy archives also retain duplicate attachment roots immediately
        // after the 16-byte ItemModelDesc. Keep and check those references.
        for(let i=0;i<2;i++)if(pointer(model.model+16+i*4)!==d.getUint32(special+0x24+i*4))throw Error('Copy arrow attachment reference mismatch');
      }
    }
    const scripts=[],animations=[];
    for(let j=0;j<stateCount;j++) {
      const at=states+j*16,joint=pointer(at),material=pointer(at+4),shape=pointer(at+8),script=pointer(at+12);
      const shapeTree=shape===null?null:shapeTopology(shape);
      jointAnimation(joint);
      materialAnimation(material);
      if(script!==null)scripts.push(script);animations.push({joint,material,shape,shapeTree,script});
    }
    const script=readMotionScripts(a,scripts,itemCommandWords);
    tree(script);
    rows.push({...model,special,specialWords,states,stateCount,animations,scripts,script});
  }
  if(code==='Sk'){
    // Chain blending uses item[2], the child of each original reference skeleton.
    // These two x48 entries are joint graphs, not Articles or visible items.
    const root=a.publics.get('ftDataSeak'),table=pointer(root+0x48);
    for(const slot of [4,5]){
      const joint=pointer(table+slot*4);if(joint===null)throw Error('Missing Sheik chain pose');
      const scene=convertSceneAsset(archiveRootView(a,'chain_pose_Share_joint',joint));
      for(const at of scene.pointerSlots)pointer(at);for(const [at,size]of scene.writes)scalar(at,size);
      extraRows.push({slot,source:joint,joint,nodes:scene.model.tree.nodes.length});
    }
  }
  if(code==='Kb'){
    // ftKb_SpecialN_800F5898 returns the fifth x48 entry as a joint.
    const root=a.publics.get('ftDataKirby'),table=pointer(root+0x48),joint=pointer(table+16);
    attachment(joint,'Kirby capture accessory');extraRows.push({slot:4,source:joint,joint});
  }
  if(code==='Ys'){
    const root=a.publics.get('ftDataYoshi'),table=pointer(root+0x48),joint=pointer(table+12);
    attachment(joint,'captured egg');extraRows.push({slot:3,source:joint,joint});
  }
  if(code==='Gw'){
    // FtPartsVisLookup uses DObj indices, distinct from the item joint lists.
    const root=a.publics.get('ftDataGamewatch'),table=pointer(root+0x48),lookup=pointer(table+40),parts=d.getUint32(root+8);
    bounds(parts,4);const count=d.getUint32(parts);
    if(!a.relocations.has(root+8)||lookup===null||count<1||count>11)throw Error('Invalid Game & Watch fighter outline');
    bounds(lookup,count*8);
    for(let i=0;i<count;i++){
      const row=lookup+i*8;scalar(row);const variants=d.getUint32(row),entries=pointer(row+4);
      if(variants>128||variants&&entries===null)throw Error('Invalid fighter outline variants');
      for(let j=0;j<variants;j++){
        const at=entries+j*8;scalar(at);const n=d.getUint32(at),indices=pointer(at+4);
        if(n>124||n&&indices===null)throw Error('Invalid fighter outline indices');
        for(let k=0;k<n;k++){raw(indices+k);if(d.getUint8(indices+k)>=124)throw Error('Invalid fighter outline display index');}
      }
    }
    extraRows.push({slot:10,source:lookup,models:count});
  }
  if(code==='Ss'){
    const root=a.publics.get('ftDataSamus'),table=pointer(root+0x48),extra=pointer(table+16);
    if(extra===null)throw Error('Missing Samus throw accessory');
    const joint=pointer(extra),motions=pointer(extra+4),animation=pointer(extra+8),material=pointer(extra+12);
    if(motions===null)throw Error('Missing Samus throw motion table');
    attachment(joint,'throw');for(let i=0;i<4;i++)jointAnimation(pointer(motions+i*4));jointAnimation(animation);materialAnimation(material);
    extraRows.push({slot:4,source:extra,joint,motions,animation,material});
  }
  if(['Lk','Cl'].includes(code)){
    const root=a.publics.get(code==='Lk'?'ftDataLink':'ftDataClink'),table=pointer(root+0x48),joint=pointer(table+24);
    attachment(joint,'fighter part');extraRows.push({slot:6,source:joint,joint});
  }
  return {code,source:input,rows,extraRows,attachments,typedBytes:new Set([...claims.keys(),...packed]),pointerSlots:pointers,image:nativeSubgraphImage(bytes,pointers,new Map(rows.map(r=>['native_article_'+r.slot,r.article])))};
}
