import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {readAnimationObject} from './animation-object-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {readMotionScripts} from './motion-assets.mjs';
import {colorCommandWords} from './color-assets.mjs';

// Typed Battlefield map graph. This deliberately publishes a private root until
// the remaining stage roots (scripts, particle banks and collision) are assembled.
export function convertBattlefieldMap(input,options={}) {return convertStageMap(input,{...options,stage:'battlefield'});}
export const nativeStages=Object.freeze({
  fountain:Object.freeze({name:'Fountain of Dreams',file:'GrIz.dat',kind:2,count:5,overrideRows:17,specialCount:4,shadowCount:6,splineCount:1,callbackScripts:0,initial:[0,1,2,3,4],mandatory:[0,1,2,3,4]}),
  battlefield:Object.freeze({name:'Battlefield',file:'GrNBa.dat',kind:31,count:7,overrideRows:17,specialCount:4,callbackScripts:2,initial:[0,3,1,6],mandatory:[0,3,6]}),
  dreamland:Object.freeze({name:'Dream Land',file:'GrOp.dat',kind:28,count:8,overrideRows:19,specialCount:8,shadowCount:10,callbackScripts:0,initial:[0,3,7,5,4,6,1],mandatory:[0,1,3,4,5,6,7]}),
  destination:Object.freeze({name:'Final Destination',file:'GrNLa.dat',kind:32,count:10,overrideRows:16,specialCount:1,callbackScripts:4,initial:[0,1,2,3,4,5,6,7,8],mandatory:[0,1,2,3]}),
});
export function convertStageMap(input,{callbacks=false,stage='battlefield'}={}) {
  const spec=nativeStages[stage];if(!spec)throw Error('Unsupported native stage '+stage);
  const a=inspectArchive(input),d=a.data,root=a.publics.get('map_head'),param=a.publics.get('grGroundParam');
  if(root===undefined||param===undefined||a.externs.size)throw Error('Missing stage map roots or unsupported externs');
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(body.buffer),pointers=new Set(),writes=new Map(),claims=new Map(),packed=new Set(),seen=new Set();
  const rows=[],cameras=[],lights=[],fogs=[],active=new Set(),ownedObjects=new Set();
  const range=(at,size,align=4)=>{if(!Number.isSafeInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Stage map bounds '+at);};
  function claim(at,size){range(at,size,size);for(let i=0;i<size;i++){const key=at+':'+size,old=claims.get(at+i);if(packed.has(at+i)||(old&&old!==key))throw Error('Stage map descriptor overlap '+at);claims.set(at+i,key);}}
  function word(at,size=4){claim(at,size);if(a.relocations.has(at&~3))throw Error('Relocated stage scalar '+at);const v=size===2?d.getUint16(at):d.getUint32(at);size===2?out.setUint16(at,v,true):out.setUint32(at,v,true);writes.set(at,size);return v;}
  function ptr(at){claim(at,4);const v=d.getUint32(at);if(!a.relocations.has(at)){if(v)throw Error('Unrelocated stage pointer '+at);return null;}range(v,1,1);pointers.add(at);out.setUint32(at,v,true);return v;}
  function raw(at,size){range(at,size,1);for(let i=at;i<at+size;i++){if(claims.has(i)||a.relocations.has(i&~3))throw Error('Stage packed payload overlap '+i);packed.add(i);}}
  function once(kind,at,fn){if(at===null)return;const key=kind+':'+at;if(active.has(key))throw Error('Cyclic stage descriptor '+key);if(seen.has(key))return;seen.add(key);active.add(key);fn(at);active.delete(key);}
  function empty(at){if(ptr(at)!==null)throw Error('Unsupported non-null stage descriptor '+at);}
  function tree(t){for(const at of t.words instanceof Map?t.words.keys():t.words)t.pointers.has(at)?ptr(at):word(at);for(const at of t.halves||[])word(at,2);for(const at of t.packed||[])raw(at,1);}
  function aobj(at){once('aobj',at,p=>{const object=ptr(p+12);if(object!==null&&!ownedObjects.has(object))model(object);tree(readAnimationObject(a,p,0,ownedObjects));});}
  function jointAnim(at){once('jointanim',at,p=>{const t=readJointAnimation(a,p);tree(t);for(const n of t.nodes)if(n.animation)tree(n.animation);});}
  function shapeAnimObject(at){once('shapeobject',at,p=>{shapeAnimObject(ptr(p));empty(p+4);});}
  function shapeAnimJoint(at){once('shapejoint',at,p=>{shapeAnimJoint(ptr(p));shapeAnimJoint(ptr(p+4));shapeAnimObject(ptr(p+8));});}
  function materialAnim(at){once('matanim',at,p=>tree(convertMaterialAnimation(archiveRootView(a,'stage_Share_matanim_joint',p))));}
  function model(at){once('model',at,p=>{const s=convertSceneAsset(archiveRootView(a,'stage_Share_joint',p));for(const n of s.model.tree.nodes)ownedObjects.add(n.offset);for(const q of s.pointerSlots)ptr(q);for(const [q,size] of s.writes)word(q,size);rows.push({root:p,nodes:s.model.tree.nodes.length,meshes:s.model.meshes.length,metrics:s.metrics});});}
  function list(at,fn){if(at===null)return;for(let i=0;i<4096;i++){const p=ptr(at+i*4);if(p===null)return i;fn(p);}throw Error('Unterminated stage pointer list');}
  function wobj(at){once('wobj',at,p=>{empty(p);for(let i=4;i<16;i+=4)word(p+i);empty(p+16);});}
  function wanim(at){once('wanim',at,p=>{aobj(ptr(p));empty(p+4);});}
  function camera(at){once('camera',at,p=>{empty(p);for(let i=4;i<24;i+=2)word(p+i,2);wobj(ptr(p+24));wobj(ptr(p+28));word(p+32);const up=ptr(p+36);if(up!==null)for(let i=0;i<12;i+=4)word(up+i);word(p+40);word(p+44);const type=d.getUint16(p+6);if(type<1||type>3)throw Error('Stage camera projection');for(let i=48;i<(type===1?56:64);i+=4)word(p+i);cameras.push({offset:p,type,near:d.getFloat32(p+40),far:d.getFloat32(p+44)});});}
  function cameraAnim(at){once('cameraanim',at,p=>{aobj(ptr(p));wanim(ptr(p+4));wanim(ptr(p+8));});}
  function light(at){once('light',at,p=>{empty(p);light(ptr(p+4));const flags=word(p+8,2),attn=word(p+10,2);raw(p+12,4);wobj(ptr(p+16));wobj(ptr(p+20));const u=ptr(p+24);if(u!==null){const type=flags&3,bytes=type===2?(attn&1?24:12):type===3?(attn?24:20):4;for(let i=0;i<bytes;i+=4)word(u+i);}lights.push({offset:p,flags,attn});});}
  function lightAnim(at){once('lightanim',at,p=>{lightAnim(ptr(p));aobj(ptr(p+4));wanim(ptr(p+8));wanim(ptr(p+12));});}
  function lightList(at){list(at,p=>{light(ptr(p));list(ptr(p+4),lightAnim);});}
  function fog(at){once('fog',at,p=>{word(p);const adj=ptr(p+4);if(adj!==null){word(adj,2);word(adj+2,2);for(let i=4;i<68;i+=4)word(adj+i);}word(p+8);word(p+12);raw(p+16,4);fogs.push(p);});}
  function spline(at){once('spline',at,p=>{
    raw(p,2);const type=d.getUint8(p),n=word(p+2,2);word(p+4);word(p+12);
    if(type>3||n<2||n>4096||!Number.isFinite(d.getFloat32(p+4))||!Number.isFinite(d.getFloat32(p+12))||d.getFloat32(p+12)<0)throw Error('Invalid stage spline');
    const sizes=[(type===1?3*(n-1)+1:type>=2?n+2:n)*3,n,(n-1)*5];
    for(let k=0;k<3;k++){const q=ptr(p+[8,16,20][k]);if(q===null){if(k===2&&type===0)continue;throw Error('Missing stage spline array');}range(q,sizes[k]*4);for(let j=0;j<sizes[k];j++){if(!Number.isFinite(d.getFloat32(q+j*4)))throw Error('Nonfinite stage spline');word(q+j*4);}}
  });}
  const binding=ptr(root),bindingCount=word(root+4),table=ptr(root+8),count=word(root+12);
  if(count!==spec.count||bindingCount!==1||table===null||binding===null)throw Error('Unexpected '+spec.name+' map layout');
  for(let i=0;i<bindingCount;i++){const p=binding+i*12;model(ptr(p));const pairs=ptr(p+4),n=word(p+8);if(n>261||pairs===null)throw Error('Invalid stage joint binding');for(let j=0;j<n*2;j++)word(pairs+j*2,2);}
  const animations=[];
  for(let i=0;i<count;i++){
    const p=table+i*52;model(ptr(p));const ja=list(ptr(p+4),jointAnim)||0,ma=list(ptr(p+8),materialAnim)||0,sa=list(ptr(p+12),shapeAnimJoint)||0;camera(ptr(p+16));list(ptr(p+20),cameraAnim);lightList(ptr(p+24));fog(ptr(p+28));empty(p+32);if(word(p+36)!==0)throw Error('Unsupported GrJoint count');const flags=ptr(p+40);if(flags!==null)raw(flags,Math.max(ja,ma,sa));const indices=ptr(p+44),n=word(p+48);if(n>4096||(n&&indices===null))throw Error('Invalid stage update joints');if(indices!==null)for(let j=0;j<n;j++)word(indices+j*2,2);animations.push({joint:ja,material:ma,shape:sa});
  }
  const splines=ptr(root+16),splineCount=word(root+20);
  if(splineCount!==(spec.splineCount??(stage==='destination'?2:0))||(splineCount>0)!==(splines!==null))throw Error('Unexpected stage spline table');
  for(let i=0;i<splineCount;i++){const p=ptr(splines+i*4);if(p===null)throw Error('Missing stage spline');spline(p);}
  const overrides=ptr(root+24),declaredOverrides=word(root+28),shadow=ptr(root+32),shadowCount=word(root+36),special=ptr(root+40),specialCount=word(root+44);
  if(shadowCount!==(spec.shadowCount??(stage==='destination'?3:0))||(shadowCount>0)!==(shadow!==null))throw Error('Unexpected stage shadow table');
  for(let i=0;i<shadowCount;i++){const p=shadow+i*8;lightAnim(ptr(p));raw(p+4,4);}
  // Retail has 17 initialized rows but declares 34. Its original lookup uses an
  // eight-byte stride and exits on a match. Import every referenced light row;
  // reject a map whose lights could require the retail out-of-table scan.
  if(overrides===null||special===null||declaredOverrides!==spec.overrideRows*2||(shadow??special)-overrides!==spec.overrideRows*8||specialCount!==spec.specialCount)throw Error('Unexpected stage light override layout');
  const overrideLights=new Set();for(let i=0;i<spec.overrideRows;i++){const p=overrides+i*8,q=ptr(p);if(q===null)throw Error('Null stage light override');light(q);raw(p+4,4);overrideLights.add(q);}
  if(lights.some(l=>!overrideLights.has(l.offset)))throw Error('Light is absent from bounded retail override prefix');
  for(let i=0;i<specialCount;i++){const p=ptr(special+i*4);if(p===null||!claims.has(p+4))throw Error('Untyped stage special joint');}
  // GroundParam's packed colors and padding stay bytes. Every numeric field and
  // nested StageParam row has an explicit source layout.
  for(const p of [0,12,16,20,24,28,32,36,40,48,52,56,60,64,68,72,76,80,84,88,92,96,100,180])word(param+p);
  for(const p of [4,8,10,46])word(param+p,2);for(let p=104;p<176;p+=2)word(param+p,2);raw(param+184,36);
  const params=ptr(param+176),n=word(param+180);if(params===null||n<1||n>512)throw Error('Invalid stage parameters');
  for(let i=0;i<n;i++){const p=params+i*100;for(let j=0;j<20;j+=4)word(p+j);for(let j=20;j<100;j+=2)word(p+j,2);}
  if(d.getUint32(params)!==spec.kind)throw Error('Selected stage parameter row required');
  const publics=new Map([['native_stage_map',root],['native_stage_parameters',param]]);let yakumono=null;
  if(callbacks){
    yakumono=a.publics.get('yakumono_param');if(yakumono===undefined)throw Error('Missing stage callback parameters');
    if(stage==='dreamland'){
      // grOldpupupu_YakumonoParam: four signed halfwords, two signed timers,
      // then nine floats. These drive wind strength, bounds and original timing.
      for(let i=0;i<8;i+=2)word(yakumono+i,2);
      for(let i=8;i<52;i+=4){word(yakumono+i);if(i>=16&&!Number.isFinite(d.getFloat32(yakumono+i)))throw Error('Nonfinite Dream Land parameter');}
    }
    if(stage==='fountain'){
      // grIzumi_YakumonoParam: 21 four-byte fields; x4 is an unused integer
      // field. Preserve its bits; all other fields are platform float parameters.
      for(let i=0;i<84;i+=4){word(yakumono+i);if(i!==4&&!Number.isFinite(d.getFloat32(yakumono+i)))throw Error('Nonfinite Fountain parameter');}
    }
    const starts=Array.from({length:spec.callbackScripts},(_,i)=>ptr(yakumono+i*4));if(starts.includes(null))throw Error('Missing stage color script');
    const scripts=readMotionScripts(a,starts,colorCommandWords,{terminalOpcodes:[0,6,7,10]});
    tree(scripts);publics.set('native_stage_callbacks',yakumono);
  }
  const extraModels=[];
  if(stage==='fountain'){
    const name='GrdIzumiStar_TopN_joint',at=a.publics.get(name);
    if(at===undefined)throw Error('Missing Fountain star model');model(at);publics.set(name,at);extraModels.push({name,root:at});
    const imageName='GrdIzumi_cd_wt_GrdIzumiDummy1_1_image_desc',image=a.publics.get(imageName);
    if(image===undefined||!pointers.has(image)||!writes.has(image+4)||writes.get(image+4)!==2||writes.get(image+8)!==4)throw Error('Untyped Fountain reflection image');
    publics.set(imageName,image);
  }
  return {extraModels,stage,root,param,table,count,models:rows,animations,cameras,lights,fogs,splineCount,shadowCount,declaredOverrides,typedOverrideRows:spec.overrideRows,pointerSlots:pointers,writes,packed,yakumono,
    image:nativeSubgraphImage(body,pointers,publics)};
}
