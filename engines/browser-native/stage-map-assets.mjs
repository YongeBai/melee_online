import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {readAnimationObject} from './animation-object-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';

// Typed Battlefield map graph. This deliberately publishes a private root until
// the remaining stage roots (scripts, particle banks and collision) are assembled.
export function convertBattlefieldMap(input) {
  const a=inspectArchive(input),d=a.data,root=a.publics.get('map_head'),param=a.publics.get('grGroundParam');
  if(root===undefined||param===undefined||a.externs.size)throw Error('Missing stage map roots or unsupported externs');
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(body.buffer),pointers=new Set(),writes=new Map(),claims=new Map(),packed=new Set(),seen=new Set();
  const rows=[],cameras=[],lights=[],fogs=[],active=new Set();
  const range=(at,size,align=4)=>{if(!Number.isSafeInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Stage map bounds '+at);};
  function claim(at,size){range(at,size,size);for(let i=0;i<size;i++){const key=at+':'+size,old=claims.get(at+i);if(packed.has(at+i)||(old&&old!==key))throw Error('Stage map descriptor overlap '+at);claims.set(at+i,key);}}
  function word(at,size=4){claim(at,size);if(a.relocations.has(at&~3))throw Error('Relocated stage scalar '+at);const v=size===2?d.getUint16(at):d.getUint32(at);size===2?out.setUint16(at,v,true):out.setUint32(at,v,true);writes.set(at,size);return v;}
  function ptr(at){claim(at,4);const v=d.getUint32(at);if(!a.relocations.has(at)){if(v)throw Error('Unrelocated stage pointer '+at);return null;}range(v,1,1);pointers.add(at);out.setUint32(at,v,true);return v;}
  function raw(at,size){range(at,size,1);for(let i=at;i<at+size;i++){if(claims.has(i)||a.relocations.has(i&~3))throw Error('Stage packed payload overlap '+i);packed.add(i);}}
  function once(kind,at,fn){if(at===null)return;const key=kind+':'+at;if(active.has(key))throw Error('Cyclic stage descriptor '+key);if(seen.has(key))return;seen.add(key);active.add(key);fn(at);active.delete(key);}
  function empty(at){if(ptr(at)!==null)throw Error('Unsupported non-null stage descriptor '+at);}
  function tree(t){for(const at of t.words instanceof Map?t.words.keys():t.words)t.pointers.has(at)?ptr(at):word(at);for(const at of t.halves||[])word(at,2);for(const at of t.packed||[])raw(at,1);}
  function aobj(at){once('aobj',at,p=>tree(readAnimationObject(a,p)));}
  function jointAnim(at){once('jointanim',at,p=>{const t=readJointAnimation(a,p);tree(t);for(const n of t.nodes)if(n.animation)tree(n.animation);});}
  function materialAnim(at){once('matanim',at,p=>tree(convertMaterialAnimation(archiveRootView(a,'stage_Share_matanim_joint',p))));}
  function model(at){once('model',at,p=>{const s=convertSceneAsset(archiveRootView(a,'stage_Share_joint',p));for(const q of s.pointerSlots)ptr(q);for(const [q,size] of s.writes)word(q,size);rows.push({root:p,nodes:s.model.tree.nodes.length,meshes:s.model.meshes.length,metrics:s.metrics});});}
  function list(at,fn){if(at===null)return;for(let i=0;i<4096;i++){const p=ptr(at+i*4);if(p===null)return i;fn(p);}throw Error('Unterminated stage pointer list');}
  function wobj(at){once('wobj',at,p=>{empty(p);for(let i=4;i<16;i+=4)word(p+i);empty(p+16);});}
  function wanim(at){once('wanim',at,p=>{aobj(ptr(p));empty(p+4);});}
  function camera(at){once('camera',at,p=>{empty(p);for(let i=4;i<24;i+=2)word(p+i,2);wobj(ptr(p+24));wobj(ptr(p+28));word(p+32);const up=ptr(p+36);if(up!==null)for(let i=0;i<12;i+=4)word(up+i);word(p+40);word(p+44);const type=d.getUint16(p+6);if(type<1||type>3)throw Error('Stage camera projection');for(let i=48;i<(type===1?56:64);i+=4)word(p+i);cameras.push({offset:p,type,near:d.getFloat32(p+40),far:d.getFloat32(p+44)});});}
  function cameraAnim(at){once('cameraanim',at,p=>{aobj(ptr(p));wanim(ptr(p+4));wanim(ptr(p+8));});}
  function light(at){once('light',at,p=>{empty(p);light(ptr(p+4));const flags=word(p+8,2),attn=word(p+10,2);raw(p+12,4);wobj(ptr(p+16));wobj(ptr(p+20));const u=ptr(p+24);if(u!==null){const type=flags&3,bytes=type===2?(attn&1?24:12):type===3?(attn?24:20):4;for(let i=0;i<bytes;i+=4)word(u+i);}lights.push({offset:p,flags,attn});});}
  function lightAnim(at){once('lightanim',at,p=>{lightAnim(ptr(p));aobj(ptr(p+4));wanim(ptr(p+8));wanim(ptr(p+12));});}
  function lightList(at){list(at,p=>{light(ptr(p));list(ptr(p+4),lightAnim);});}
  function fog(at){once('fog',at,p=>{word(p);const adj=ptr(p+4);if(adj!==null){word(adj,2);word(adj+2,2);for(let i=4;i<68;i+=4)word(adj+i);}word(p+8);word(p+12);raw(p+16,4);fogs.push(p);});}
  const binding=ptr(root),bindingCount=word(root+4),table=ptr(root+8),count=word(root+12);
  if(count!==7||bindingCount!==1||table===null||binding===null)throw Error('Only the seven-model Battlefield map is integrated');
  for(let i=0;i<bindingCount;i++){const p=binding+i*12;model(ptr(p));const pairs=ptr(p+4),n=word(p+8);if(n>261||pairs===null)throw Error('Invalid stage joint binding');for(let j=0;j<n*2;j++)word(pairs+j*2,2);}
  const animations=[];
  for(let i=0;i<count;i++){
    const p=table+i*52;model(ptr(p));const ja=list(ptr(p+4),jointAnim)||0,ma=list(ptr(p+8),materialAnim)||0;empty(p+12);camera(ptr(p+16));list(ptr(p+20),cameraAnim);lightList(ptr(p+24));fog(ptr(p+28));empty(p+32);if(word(p+36)!==0)throw Error('Unsupported GrJoint count');const flags=ptr(p+40);if(flags!==null)raw(flags,Math.max(ja,ma));const indices=ptr(p+44),n=word(p+48);if(n>4096||(n&&indices===null))throw Error('Invalid stage update joints');if(indices!==null)for(let j=0;j<n;j++)word(indices+j*2,2);animations.push({joint:ja,material:ma});
  }
  empty(root+16);if(word(root+20)!==0)throw Error('Battlefield splines unexpected');
  const overrides=ptr(root+24),declaredOverrides=word(root+28),shadow=ptr(root+32),shadowCount=word(root+36),special=ptr(root+40),specialCount=word(root+44);
  if(shadow!==null||shadowCount)throw Error('Battlefield shadow animation table unexpected');
  // Retail has 17 initialized rows but declares 34. Its original lookup uses an
  // eight-byte stride and exits on a match. Import every referenced light row;
  // reject a map whose lights could require the retail out-of-table scan.
  if(overrides===null||special===null||declaredOverrides!==34||special-overrides!==17*8||specialCount!==4)throw Error('Unexpected Battlefield light override layout');
  const overrideLights=new Set();for(let i=0;i<17;i++){const p=overrides+i*8,q=ptr(p);if(q===null)throw Error('Null stage light override');light(q);raw(p+4,4);overrideLights.add(q);}
  if(lights.some(l=>!overrideLights.has(l.offset)))throw Error('Light is absent from bounded retail override prefix');
  for(let i=0;i<specialCount;i++){const p=ptr(special+i*4);if(p===null||!claims.has(p+4))throw Error('Untyped stage special joint');}
  // GroundParam's packed colors and padding stay bytes. Every numeric field and
  // nested StageParam row has an explicit source layout.
  for(const p of [0,12,16,20,24,28,32,36,40,48,52,56,60,64,68,72,76,80,84,88,92,96,100,180])word(param+p);
  for(const p of [4,8,10,46])word(param+p,2);for(let p=104;p<176;p+=2)word(param+p,2);raw(param+184,36);
  const params=ptr(param+176),n=word(param+180);if(params===null||n<1||n>512)throw Error('Invalid stage parameters');
  for(let i=0;i<n;i++){const p=params+i*100;for(let j=0;j<20;j+=4)word(p+j);for(let j=20;j<100;j+=2)word(p+j,2);}
  if(d.getUint32(params)!==31)throw Error('Battlefield stage parameter row required');
  return {root,param,table,count,models:rows,animations,cameras,lights,fogs,declaredOverrides,typedOverrideRows:17,pointerSlots:pointers,writes,packed,
    image:nativeSubgraphImage(body,pointers,new Map([['native_stage_map',root],['native_stage_parameters',param]]))};
}
