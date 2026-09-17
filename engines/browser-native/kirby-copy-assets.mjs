import {inspectArchive,archiveRootView,nativeSubgraphImage,initializeArchiveExternals} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {convertPartsVisibility} from './visibility-assets.mjs';
import {convertArticleEntries} from './article-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';

// Hat roots contain the joint, FtPartsDesc and up to two Articles.
// Some copies append the original hat-bone dynamics descriptor.
// Sword copies use +12 for a joint and +16 for dynamics, without Articles.
// Ice Climbers uses +12 for its ice Article and +16 for its hammer joint.
// Body copies instead embed visibility/texture selection first and reference
// an extra model; their main model comes from a separate costume archive.
const profiles={
  Mr:{symbol:'Mario',articles:[[1,5]],wrappers:[[0,42836,42844,42852,[0]]]},
  Lg:{symbol:'Luigi',articles:[[1,4]],wrappers:[[0,48148,48156,48164,[0]]]},
  Dr:{symbol:'Drmario',articles:[[6,5]],wrappers:[[0,22712,22720,22728,[0]]]},
  Pk:{symbol:'Pikachu',dynamics:20,articles:[[2,4],[1,3]],wrappers:[[1,103488,103496,103512,[0],103504]]},
  Pc:{symbol:'Pichu',dynamics:20,articles:[[2,4],[1,3]],wrappers:[[1,115744,115752,115768,[0],115760]]},
  Fx:{symbol:'Fox',articles:[[2,10],[9,10]],wrappers:[[0,null,null,49320,[0]],[1,null,null,75392,[0]]]},
  Mt:{symbol:'Mewtwo',bodyCopy:true,bodyMask:0x7f0,articles:[[10,16]],dynamics:28,wrappers:[[0,44632,44644,44656,[1,0]]]},
  Pr:{symbol:'Purin',bodyCopy:true,bodyMask:15,dynamics:24},
  Gw:{symbol:'Gamewatch',bodyCopy:true,bodyMask:0,emptyExtra:true,articleOffset:32,articles:[[2,29],[0,1]],outlineSlots:[0,1],fighterOutline:24,colors:28,wrappers:[[0,null,null,2152,[0]],[1,null,null,3272,[]]]},
  Dk:{symbol:'Donkey',bodyCopy:true,bodyMask:0},
  Fc:{symbol:'Falco',bodyCopy:true,bodyMask:0x1800,articles:[[2,10],[9,10]],wrappers:[[0,null,null,2216,[0]],[1,null,null,28288,[0]]]},
  Ss:{symbol:'Samus',articles:[[9,8]],externals:['ItmKirbySsChargeShot_TopN_matanim_joint','ItmKirbySsChargeShot_TopN_shapeanim_joint'],wrappers:[[0,52664,null,52672,[0]]]},
  Ns:{symbol:'Ness',articles:[[3,11],[1,5]],wrappers:[[0,54308,null,54320,[0,1]],[1,81960,81968,81976,[0]]]},
  Pe:{symbol:'Peach',articles:[[2,1],[1,4]],wrappers:[[0,35884,35896,35908,[0,1]]]},
  Lk:{symbol:'Link',dynamics:20,articles:[[1,9],[6,1]],arrowSlots:[0],wrappers:[[0,null,null,16864,[0]],[1,40268,null,40296,[0,1,2,3,4,5]]],attachmentWrappers:[[18944,0],[21024,1]]},
  Cl:{symbol:'Clink',dynamics:20,articles:[[1,9],[6,1]],arrowSlots:[0],wrappers:[[0,null,null,16704,[0]],[1,40108,null,40136,[0,1,2,3,4,5]]],attachmentWrappers:[[18784,0],[20864,1]]},
  Ys:{symbol:'Yoshi',rootBytes:40,articleOffset:32,articles:[[0,0]],captureJoint:12,animations:[16,20,24,28],orphanSceneList:{table:109456,models:[[98080,'capture'],[109440,101032]]}},
  Pp:{symbol:'Popo',accessory:16,accessoryWrapper:65216,articles:[[1,13]],wrappers:[[0,46228,null,46236,[0]]]},
  Kp:{symbol:'Koopa',dynamics:16,articles:[[1,6]]},
  Zd:{symbol:'Zelda',dynamics:12},Sk:{symbol:'Seak',dynamics:20,articles:[[5,3],[1,1]],wrappers:[[0,null,null,66016,[0]],[1,null,null,70464,[0]]]},
  Ca:{symbol:'Captain'},Gn:{symbol:'Ganon'},
  Ms:{symbol:'Mars',accessory:12,accessoryWrapper:65952,dynamics:16},Fe:{symbol:'Emblem',accessory:12,accessoryWrapper:87392,dynamics:16},
};
export function convertKirbyCopy(input,code){
  const profile=profiles[code];if(!profile)throw Error('Kirby copy conversion pending: '+code);
  if(profile.externals)input=initializeArchiveExternals(input,profile.externals);
  const symbol='ftDataKirbyCopy'+profile.symbol,a=inspectArchive(input),d=a.data,root=a.publics.get(symbol);
  if(root===undefined||root+(profile.rootBytes??(profile.bodyCopy?(profile.articleOffset??24)+(profile.articles?.length??0)*4:Math.max(20,(profile.dynamics??0)+4)))>a.dataSize||a.externs.size)throw Error('Invalid Kirby copy archive');
  const ptr=at=>{if(!a.relocations.has(at))throw Error('Missing Kirby copy pointer');const value=d.getUint32(at);if(value%4||value+4>a.dataSize)throw Error('Kirby copy pointer bounds');return value;};
  const jointSlot=root+(profile.bodyCopy?20:0),articleOffset=profile.articleOffset??(profile.bodyCopy?24:12);
  if(profile.emptyExtra&&(a.relocations.has(jointSlot)||d.getUint32(jointSlot)))throw Error('Unexpected copy extra body model');
  const joint=profile.emptyExtra?null:ptr(jointSlot),specs=profile.articles??[],entries=specs.map((_,slot)=>({slot,article:ptr(root+articleOffset+slot*4)}));
  if(!profile.bodyCopy)for(let i=specs.length;i<2;i++)if(articleOffset+i*4!==profile.dynamics&&articleOffset+i*4!==profile.accessory&&(a.relocations.has(root+articleOffset+i*4)||d.getUint32(root+articleOffset+i*4)))throw Error('Unexpected copy Article/extra');
  const scene=joint===null?null:convertSceneAsset(archiveRootView(a,'hat_Share_joint',joint)),visibility=convertPartsVisibility(input,root+(profile.bodyCopy?0:4),profile.bodyCopy?6:1),articles=entries.length?convertArticleEntries(input,entries,Object.fromEntries(specs.map((s,i)=>[i,s])),{arrowSlots:profile.arrowSlots??[],outlineSlots:profile.outlineSlots??[]}):{rows:[],attachments:[]};
  const accessory=profile.accessory?{joint:ptr(root+profile.accessory),scene:convertSceneAsset(archiveRootView(a,'accessory_Share_joint',ptr(root+profile.accessory)))}:null;
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),pointers=new Set(),claimed=new Map();
  function merge(image,typed,slots){
    for(const at of typed){if(at<0||at>=a.dataSize)throw Error('Copy typed byte bounds');const value=image[32+at];if(claimed.has(at)&&claimed.get(at)!==value)throw Error('Conflicting Kirby copy descriptors');claimed.set(at,value);body[at]=value;}
    for(const at of slots)if(at<a.dataSize){if(![0,1,2,3].every(i=>typed.has(at+i)))throw Error('Untyped copy pointer');pointers.add(at);}
  }
  if(scene){const sceneTyped=new Set([...scene.pointerSlots].flatMap(p=>[p,p+1,p+2,p+3]));for(const [at,n]of scene.writes)for(let i=0;i<n;i++)sceneTyped.add(at+i);
  merge(scene.image,sceneTyped,scene.pointerSlots);}
  if(accessory){const s=accessory.scene,typed=new Set([...s.pointerSlots].flatMap(p=>[p,p+1,p+2,p+3]));for(const [at,n]of s.writes)for(let i=0;i<n;i++)typed.add(at+i);merge(s.image,typed,s.pointerSlots);}
  const v=new DataView(visibility.image.buffer),size=v.getUint32(4,true),visPointers=Array.from({length:v.getUint32(8,true)},(_,i)=>v.getUint32(32+size+i*4,true));
  merge(visibility.image,visibility.typedBytes,visPointers);if(entries.length)merge(articles.image,articles.typedBytes,articles.pointerSlots);
  const out=new DataView(body.buffer);for(const at of [...(joint===null?[]:[jointSlot]),...(accessory?[root+profile.accessory]:[]),...entries.map(e=>root+articleOffset+e.slot*4)]){if([0,1,2,3].some(i=>claimed.has(at+i)))throw Error('Copy root overlap');out.setUint32(at,d.getUint32(at),true);pointers.add(at);}
  const captureJoint=profile.captureJoint?ptr(root+profile.captureJoint):null;
  if(captureJoint!==null){if(articles.rows[0]?.joint!==captureJoint)throw Error('Copy capture model/Article mismatch');const at=root+profile.captureJoint;if([0,1,2,3].some(i=>claimed.has(at+i)))throw Error('Copy capture root overlap');out.setUint32(at,captureJoint,true);pointers.add(at);}
  const jointAnimations=[];
  if(profile.animations){
    const words=new Set(),packed=new Set(),slots=new Set();
    for(const offset of profile.animations){
      const at=root+offset,animationRoot=ptr(at),tree=readJointAnimation(a,animationRoot);words.add(at);slots.add(at);
      if(tree.nodes.length!==scene.model.tree.nodes.length)throw Error('Copy hat animation topology');
      for(const p of tree.words)words.add(p);for(const p of tree.pointers)slots.add(p);
      for(const node of tree.nodes)for(const p of node.animation?.packed??[])packed.add(p);
      jointAnimations.push({offset,root:animationRoot,nodes:tree.nodes.length,tracks:tree.nodes.reduce((n,node)=>n+(node.animation?.tracks.length??0),0)});
    }
    const image=new Uint8Array(32+a.dataSize),v=new DataView(image.buffer,32),typed=new Set(packed);image.set(a.bytes.subarray(32,32+a.dataSize),32);
    for(const p of words){if(a.relocations.has(p)&&!slots.has(p))throw Error('Copy animation scalar relocation');v.setUint32(p,d.getUint32(p),true);for(let i=0;i<4;i++)typed.add(p+i);}
    for(const p of packed)if(words.has(p&~3)||a.relocations.has(p&~3))throw Error('Copy animation payload overlap');
    merge(image,typed,slots);
  }
  const textureRows=[];
  if(profile.bodyCopy){
    function scalar(at,width=4){
      if(at<0||at%width||at+width>a.dataSize||a.relocations.has(at&~3)||Array.from({length:width},(_,i)=>at+i).some(p=>claimed.has(p)))throw Error('Copy body texture scalar bounds/overlap');
      const value=width===2?d.getUint16(at):d.getUint32(at);width===2?out.setUint16(at,value,true):out.setUint32(at,value,true);
      for(let i=0;i<width;i++)claimed.set(at+i,body[at+i]);return value;
    }
    function ownPointer(at){
      if(at%4||at<0||at+4>a.dataSize||[0,1,2,3].some(i=>claimed.has(at+i)))throw Error('Copy body texture pointer overlap');
      const value=a.relocations.has(at)?ptr(at):null;if(value===null&&d.getUint32(at))throw Error('Unrelocated copy texture table');
      out.setUint32(at,value??0,true);if(value!==null)pointers.add(at);for(let i=0;i<4;i++)claimed.set(at+i,body[at+i]);return value;
    }
    const count=scalar(root+8),table=ownPointer(root+12),mask=scalar(root+16);
    if(count!==2||table===null||mask!==profile.bodyMask)throw Error('Unsupported copy body layout');
    for(let costume=0;costume<6;costume++){const row=ownPointer(table+costume*4);textureRows.push(row===null?null:Array.from({length:count},(_,i)=>scalar(row+i*2,2)));}
  }
  let fighterOutline=null,colors=null,outlinePadding=null;
  if(profile.fighterOutline){
    const own=new Map();
    function word(at,pointer=false){
      const type=pointer?'pointer':'scalar';
      if(!Number.isInteger(at)||at<0||at%4||at+4>a.dataSize)throw Error('Copy outline bounds');
      if(own.has(at)){if(own.get(at)!==type)throw Error('Copy outline type conflict');return d.getUint32(at);}
      if([0,1,2,3].some(i=>claimed.has(at+i))||pointers.has(at))throw Error('Copy outline overlap');
      const value=pointer?ptr(at):d.getUint32(at);if(!pointer&&a.relocations.has(at))throw Error('Copy outline scalar relocation');
      out.setUint32(at,value,true);if(pointer)pointers.add(at);own.set(at,type);for(let i=0;i<4;i++)claimed.set(at+i,body[at+i]);return value;
    }
    const lookup=word(root+profile.fighterOutline,true),count=d.getUint32(root);fighterOutline=[];
    // Retail Kirby has two normal visibility groups but this copy supplies one
    // outline row. Its next row aliases the first visibility-table pointer.
    // A relocated MEM1 pointer is a negative signed variant count on PPC, so
    // the original loops skip it. A low WASM pointer would instead overrun.
    // Preserve the skipped row explicitly without altering either callback.
    if(count!==1||lookup+8!==d.getUint32(root+4)||!a.relocations.has(lookup+8))throw Error('Unsupported copy outline alias');
    outlinePadding={source:lookup,skippedPointerSlot:lookup+8,expanded:(a.dataSize+3)&~3};
    for(let i=0;i<count;i++){
      const at=lookup+i*8,n=word(at),entries=word(at+4,true);if(n>128)throw Error('Copy outline variants');const variants=[];
      for(let j=0;j<n;j++){
        const row=entries+j*8,size=word(row),indices=word(row+4,true);if(size>124||indices+size>a.dataSize)throw Error('Copy outline display count');const values=[];
        for(let k=0;k<size;k++){const p=indices+k;if(claimed.has(p)||a.relocations.has(p&~3)||d.getUint8(p)>=124)throw Error('Copy outline packed overlap/index');claimed.set(p,body[p]);values.push(d.getUint8(p));}variants.push(values);
      }fighterOutline.push(variants);
    }
    const color=word(root+profile.colors,true);word(color);const scale=d.getFloat32(color);if(!Number.isFinite(scale)||scale<=0)throw Error('Copy outline scale');
    if(color+12>a.dataSize)throw Error('Copy colors bounds');
    // RGBA words are copied through u32 lvalues by native C. Preserve their
    // byte order; only the leading model-depth float changes endianness.
    for(let p=color+4;p<color+12;p++){if(claimed.has(p)||a.relocations.has(p&~3))throw Error('Copy color overlap');claimed.set(p,body[p]);}
    colors={scale,diffuse:[...body.subarray(color+4,color+8)],outline:[...body.subarray(color+8,color+12)]};
  }
  const dynamics=[];
  if(profile.dynamics){
    // These copy hats use ftDynamics with no collider or animation-selector
    // tables. Parameters are original 60-byte float records, with shared rows.
    const own=new Map();
    function word(at,type='scalar'){
      if(!Number.isInteger(at)||at<0||at%4||at+4>a.dataSize)throw Error('Hat dynamics bounds');
      if(own.has(at)){if(own.get(at)!==type)throw Error('Hat dynamics type conflict');return d.getUint32(at);}
      if([0,1,2,3].some(i=>claimed.has(at+i)||pointers.has(at)))throw Error('Hat dynamics graph overlap');
      if(type==='pointer'){ptr(at);pointers.add(at);}else if(a.relocations.has(at))throw Error('Hat dynamics scalar relocation');
      if(type==='float'&&!Number.isFinite(d.getFloat32(at)))throw Error('Nonfinite hat dynamics');
      own.set(at,type);out.setUint32(at,d.getUint32(at),true);return d.getUint32(at);
    }
    const dyn=word(root+profile.dynamics,'pointer'),count=word(dyn),rows=word(dyn+4,'pointer');
    if(!count||count>=10)throw Error('Hat dynamics count');
    for(const off of [8,12,16])if(word(dyn+off)!==0)throw Error('Unsupported hat dynamics tables');
    for(let i=0;i<count;i++){
      const at=rows+24*i,bone=word(at),parameters=word(at+4,'pointer'),nodes=word(at+8),position=[12,16,20].map(off=>{word(at+off,'float');return d.getFloat32(at+off);});
      if(!nodes||nodes>140||bone+nodes>scene.model.tree.nodes.length)throw Error('Hat dynamics bone chain');
      const values=Array.from({length:nodes*15},(_,j)=>{word(parameters+j*4,'float');return d.getFloat32(parameters+j*4);});
      dynamics.push({bone,nodes,position,parameters,values});
    }
  }
  // The exporter retained a trailing scene wrapper around the already imported
  // projectile model/animations. No published copy descriptor points to it.
  const untyped=[...a.relocations].filter(p=>!pointers.has(p));
  const orphan=new Map();
  if(profile.orphanSceneList){
    const {table,models}=profile.orphanSceneList;
    if(table+models.length*4+4>a.dataSize||d.getUint32(table+models.length*4)||a.relocations.has(table+models.length*4))throw Error('Copy exporter scene list terminator');
    for(const [i,[model,sourceJoint]]of models.entries()){
      const joint=sourceJoint==='capture'?captureJoint:sourceJoint;
      if(joint===null||!a.relocations.has(model)||d.getUint32(model)!==joint)throw Error('Copy exporter model root');
      for(const off of [4,8,12])if(d.getUint32(model+off)||a.relocations.has(model+off))throw Error('Copy exporter model animations');
      const extra=convertSceneAsset(archiveRootView(a,'exporter_Share_joint',joint));
      for(const p of extra.pointerSlots)if(!pointers.has(p))orphan.set(p,d.getUint32(p));
      orphan.set(model,joint);orphan.set(table+i*4,model);
    }
  }
  if(profile.accessoryWrapper){orphan.set(profile.accessoryWrapper,accessory.joint);orphan.set(profile.accessoryWrapper+16,profile.accessoryWrapper);}
  for(const [slot,joints,materials,model,indices,shapes=null] of profile.wrappers??[]){
    const row=articles.rows[slot],anims=indices.map(i=>row.animations[i]);
    for(const [table,key]of [[joints,'joint'],[materials,'material'],[shapes,'shape']]){
      if(table===null){if(anims.some(a=>a[key]!==null))throw Error('Missing exporter animation table');continue;}
      anims.forEach((a,i)=>{if(a[key]!==null)orphan.set(table+i*4,a[key]);});
    }
    orphan.set(model,row.joint);if(anims.some(a=>a.joint!==null))orphan.set(model+4,joints);if(anims.some(a=>a.material!==null))orphan.set(model+8,materials);if(anims.some(a=>a.shape!==null))orphan.set(model+12,shapes);orphan.set(model+16,model);
  }
  for(const [model,index] of profile.attachmentWrappers??[]){
    const attachment=articles.attachments[index];if(!attachment)throw Error('Missing copy exporter attachment');
    orphan.set(model,attachment.joint);orphan.set(model+16,model);
  }
  if(untyped.length!==orphan.size||untyped.some(p=>!orphan.has(p)||d.getUint32(p)!==orphan.get(p))||[...pointers].some(p=>orphan.has(d.getUint32(p))))throw Error('Unexpected projectile copy orphan scene: '+JSON.stringify({untyped:untyped.map(p=>[p,d.getUint32(p)]),expected:[...orphan],reachable:[...pointers].filter(p=>orphan.has(d.getUint32(p)))}));
  let imageBody=body;
  if(outlinePadding){
    const at=outlinePadding.expanded;imageBody=new Uint8Array(at+16);imageBody.set(body);imageBody.set(body.subarray(outlinePadding.source,outlinePadding.source+8),at);
    const v=new DataView(imageBody.buffer);v.setUint32(root+profile.fighterOutline,at,true);v.setInt32(at+8,-1,true);pointers.add(at+4);
  }
  return {code,symbol,root,joint,captureJoint,jointAnimations,outlinePadding,bodyCopy:!!profile.bodyCopy,textureRows,fighterOutline,colors,bytes:a.bytes,scene,accessory,visibility,articles,dynamics,pointerSlots:pointers,unreferencedRelocations:untyped,image:nativeSubgraphImage(imageBody,pointers,new Map([[symbol,root]]))};
}
