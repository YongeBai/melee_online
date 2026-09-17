import {initializeStageArchive} from './stage-archive.mjs';
import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {convertSceneAsset} from './scene-assets.mjs';
import {readJointAnimation} from './joint-animation-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {textureByteLength} from './texture.mjs';

// Captain's six model effects are referenced as 4000..4005 by efAlt_Spawn.
// Particle scripts use the original byte stream; psReadFloat handles BE operands.
export function convertCaptainEffects(input) {
  return convertFighterEffects(input,'Ca');
}
export function convertFighterEffects(input,code) {
  const specs={
    Kb:{name:'effKirbyDataTable',bank:5,first:5000,count:19,groups:6,models:9},
    Pp:{name:'effIceclimberDataTable',bank:14,first:14000,count:17,groups:5,models:1},
    Nn:{name:'effIceclimberDataTable',bank:14,first:14000,count:17,groups:5,models:1},
    Pe:{name:'effPeachDataTable',bank:15,first:null,count:0,groups:0,models:1},
    Sk:{name:'effZeldaDataTable',bank:17,first:17000,count:10,groups:5,models:7},
    Zd:{name:'effZeldaDataTable',bank:17,first:17000,count:10,groups:5,models:7},
    Ns:{name:'effNessDataTable',bank:10,first:null,count:0,groups:0,models:3},
    Mt:{name:'effMewtwoDataTable',bank:13,first:13000,count:9,groups:4,models:4},
    Ys:{name:'effYoshiDataTable',bank:9,first:9000,count:4,groups:3,models:1},
    Lk:{name:'effLinkDataTable',bank:6,first:null,count:0,groups:0,models:4},
    Cl:{name:'effLinkDataTable',bank:6,first:null,count:0,groups:0,models:4},
    Kp:{name:'effKoopaDataTable',bank:12,first:12000,count:9,groups:1,models:3},
    Ss:{name:'effSamusDataTable',bank:2,first:2000,count:22,groups:8,models:3},
    Pk:{name:'effPikachuDataTable',bank:7,first:7000,count:10,groups:3,models:5},
    Pc:{name:'effPikachuDataTable',bank:7,first:7000,count:10,groups:3,models:5},
    Mr:{name:'effMarioDataTable',bank:1,first:1000,count:14,groups:6,models:2},
    Dr:{name:'effMarioDataTable',bank:1,first:1000,count:14,groups:6,models:2},
    Lg:{name:'effLuigiDataTable',bank:18,first:18000,count:12,groups:6,models:2},
    Pr:{name:'effPurinDataTable',bank:11,first:11000,count:5,groups:2,models:1},
    Fx:{name:'effFoxDataTable',bank:3,first:3000,count:11,groups:8,models:6},
    Fc:{name:'effFoxDataTable',bank:3,first:3000,count:11,groups:8,models:6},
    Ca:{name:'effCaptainDataTable',bank:4,first:4000,count:17,groups:7,models:6},
    Dk:{name:'effDonkeyDataTable',bank:8,first:null,count:0,groups:0,models:7},
    Ms:{name:'effMarsDataTable',bank:16,first:16000,count:4,groups:3,models:2},
    Gn:{name:'effGanonDataTable',bank:19,first:19000,count:17,groups:7,models:6},
    Fe:{name:'effEmblemDataTable',bank:49,first:49000,count:4,groups:3,models:2},
  };
  if(!specs[code])throw Error('Fighter effect bank conversion pending: '+code);
  return convertEffects(input,specs[code]);
}
export function convertCommonEffects(input) {
  return convertEffects(input,{name:'effCommonDataTable',bank:0,first:0,count:592,groups:36,models:47});
}
export function convertKirbyCopyEffects(input,code){
  const profile={Ms:['Mars',20,0,0,2],Fe:['Emblem',48,0,0,2],Dk:['Donkey',39,0,0,2],Fc:['Fox',33,0,0,1],Ss:['Samus',34,11,7,1],Pk:['Pikachu',36,4,2,0],Pc:['Pikachu',36,4,2,0],Fx:['Fox',33,0,0,1],Mr:['Mario',32,7,3,1],Dr:['Mario',32,7,3,1],Lg:['Luigi',37,7,3,1],Ca:['Captain',38,4,3,2],Gn:['Ganon',47,4,3,2]}[code];
  if(!profile)throw Error('Kirby copy effect conversion pending: '+code);
  return convertEffects(input,{name:'effKirby'+profile[0]+'DataTable',bank:profile[1],first:profile[1]*1000,count:profile[2],groups:profile[3],models:profile[4]});
}
export function convertStageParticles(input,stage) {
  const specs={stadium:[30,10],story:[3,2],battlefield:[6,2],destination:[5,3],dreamland:[3,3],fountain:[14,4]};
  const spec=specs[stage];if(!spec)throw Error('Unsupported stage particle bank '+stage);
  return convertEffects(initializeStageArchive(input,stage),{stage:true,name:'map_ptcl',bank:30,first:30000,count:spec[0],groups:spec[1],models:0});
}
function convertEffects(input,spec) {
  const a=inspectArchive(input),d=a.data,root=a.publics.get(spec.name);
  if(root===undefined||a.externs.size)throw Error('Unsupported effect archive');
  const body=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(body.buffer),pointers=new Set(),claims=new Map(),packed=new Set();
  const bounds=(at,size,align=4)=>{if(!Number.isInteger(at)||at<0||at%align||at+size>d.byteLength)throw Error('Effect data bounds');};
  function claim(at,size){bounds(at,size,size);for(let i=0;i<size;i++){const old=claims.get(at+i);if(packed.has(at+i)||(old&&old!==at+':'+size))throw Error('Overlapping effect descriptor/payload');claims.set(at+i,at+':'+size);}}
  function scalar(at,size=4){claim(at,size);if(a.relocations.has(at&~3))throw Error('Effect scalar has archive relocation');const v=size===2?d.getUint16(at):d.getUint32(at);size===2?out.setUint16(at,v,true):out.setUint32(at,v,true);return v;}
  function pointer(at){claim(at,4);const v=d.getUint32(at);if(!a.relocations.has(at)){if(v)throw Error('Unrelocated effect pointer');out.setUint32(at,0,true);return null;}bounds(v,1,1);pointers.add(at);out.setUint32(at,v,true);return v;}
  function raw(at,size){bounds(at,size,1);for(let i=at;i<at+size;i++){if(claims.has(i)||a.relocations.has(i&~3))throw Error('Effect payload overlaps descriptor');packed.add(i);}}
  function words(tree){for(const at of tree.words)tree.pointers.has(at)?pointer(at):scalar(at);if(tree.halves)for(const at of tree.halves)scalar(at,2);if(tree.packed)for(const at of tree.packed)raw(at,1);}
  const cmd=spec.stage?root:pointer(root),tex=spec.stage?a.publics.get('map_texg'):pointer(root+4),commands=[],textures=[],relocationOnlyPalettes=[];
  if(spec.stage&&(tex===undefined||tex===cmd))throw Error('Missing stage particle texture root');
  let version=null,bank=spec.bank,first=spec.first,count=spec.count;
  if(spec.count){
    if(cmd===null||tex===null||tex<=cmd)throw Error('Missing effect banks');
    version=scalar(cmd,2);bank=scalar(cmd+2,2);first=scalar(cmd+4);count=scalar(cmd+8);
    if(version!==0x42||bank!==spec.bank||first!==spec.first||count!==spec.count)throw Error('Unsupported particle bank');
    bounds(cmd,12+count*4);
    for(let i=0;i<count;i++){const offset=scalar(cmd+12+i*4);if(!offset){commands.push(null);continue;}const at=cmd+offset;if(at<cmd+12+count*4||at+61>tex||at%4)throw Error('Invalid particle command descriptor');commands.push({offset:at,relativeOffset:offset});}
    const order=[...new Set(commands.filter(Boolean).map(c=>c.offset))].sort((x,y)=>x-y);
    for(const c of commands.filter(Boolean)){
      const at=c.offset;c.shorts=[0,2,4,6].map(o=>scalar(at+o,2));c.kind=scalar(at+8);c.floats=[];
      for(let o=12;o<60;o+=4){scalar(at+o);const v=d.getFloat32(at+o);if(!Number.isFinite(v))throw Error('Nonfinite particle parameter');c.floats.push(v);}
      c.scriptStart=at+60;c.scriptEnd=order[order.indexOf(at)+1]??tex;if(c.scriptEnd<=c.scriptStart)throw Error('Overlapping particle commands');raw(c.scriptStart,c.scriptEnd-c.scriptStart);
    }
    const groups=scalar(tex);if(groups!==spec.groups)throw Error('Unsupported texture groups');const groupOffsets=new Set();
    function relative(slot,size,alignment=1){const offset=scalar(slot);if(!offset)return null;const at=tex+offset;bounds(at,size,alignment);return at;}
    for(let i=0;i<groups;i++) {
      const at=relative(tex+4+i*4,24,4);if(at===null){textures.push(null);continue;}
      if(at<tex+4+groups*4||groupOffsets.has(at))throw Error('Aliased particle texture group would relocate twice');groupOffsets.add(at);
      const n=scalar(at),format=scalar(at+4),tlut=scalar(at+8),width=scalar(at+12),height=scalar(at+16),palnum=scalar(at+20,2),palflag=scalar(at+22,2);
      if(n>256||!n||palnum>256)throw Error('Invalid particle texture count');
      const size=textureByteLength(width,height,format),palettes=[8,9,10].includes(format)?((palflag&1)?1:(palnum||n)):0,slots=[];
      for(let t=0;t<n+palettes;t++){
        const slot=at+24+t*4,sizeBytes=t<n?size:2*({8:16,9:256,10:16384}[format]);
        // USA 1.02 EfKbSs retains this invalid palette in texture group 0.
        // psInitDataBankLocate only adds the texture-bank base; it never reads
        // the palette. Preserve that relocation exactly, without manufacturing
        // texture data. Actual selection still fails the runtime texture bounds
        // check. All other palette/image extents remain strictly validated.
        if(spec.name==='effKirbySamusDataTable'&&a.dataSize===41852&&root===0&&cmd===32&&tex===1120&&i===0&&at===1152&&n===1&&format===9&&tlut===2&&width===64&&height===64&&palnum===0&&palflag===0&&t===1&&d.getUint32(at+24)===64&&d.getUint32(slot)===0x80a8812a){
          const offset=scalar(slot);slots.push(tex+offset);relocationOnlyPalettes.push({group:i,slot,relativeOffset:offset});continue;
        }
        const p=relative(slot,sizeBytes);if(p!==null)raw(p,sizeBytes);slots.push(p);
      }
      textures.push({offset:at,count:n,format,tlut,width,height,palnum,palflag,palettes,slots});
    }
    for(const c of commands.filter(Boolean))if(c.shorts[1]>=groups)throw Error('Particle texture group index');
  }else if(cmd!==null||tex!==null)throw Error('Unexpected particle banks in model-only effects');
  const effects=[];
  function shapeTree(root) {
    const seen=new Set(),active=new Set();let joints=0,objects=0;
    function visit(at,type) {
      if(at===null)return;
      if(active.has(at)||seen.has(at))throw Error('Cyclic/shared shape animation node');
      seen.add(at);active.add(at);if(seen.size>4096)throw Error('Shape animation capacity');
      if(type==='joint') {
        bounds(at,12);joints++;
        const child=pointer(at),next=pointer(at+4),object=pointer(at+8);
        visit(child,'joint');visit(next,'joint');visit(object,'object');
      } else {
        bounds(at,8);objects++;const next=pointer(at),animation=pointer(at+4);
        // Common effects contain an empty shape-animation topology. A real
        // morph track needs the corresponding shape geometry importer too.
        if(animation!==null)throw Error('Shape morph tracks require typed geometry');
        visit(next,'object');
      }
      active.delete(at);
    }
    visit(root,'joint');return {joints,objects};
  }
  for(let i=0;i<spec.models;i++) {
    const at=root+8+i*20;scalar(at);const lifetime=d.getFloat32(at);if(!Number.isFinite(lifetime))throw Error('Invalid effect lifetime');
    const joint=pointer(at+4),animation=pointer(at+8),material=pointer(at+12),shape=pointer(at+16);
    if(joint===null)throw Error('Unsupported effect model');
    const scene=convertSceneAsset(archiveRootView(a,'effect_Share_joint',joint));
    for(const p of scene.pointerSlots)pointer(p);for(const [p,size] of scene.writes)scalar(p,size);
    const anim=animation===null?null:readJointAnimation(a,animation,new Set(scene.model.tree.nodes.map(n=>n.offset)));if(anim){words(anim);for(const n of anim.nodes)if(n.animation)for(const p of n.animation.packed)raw(p,1);}
    const mat=material===null?null:convertMaterialAnimation(archiveRootView(a,'effect_Share_matanim_joint',material));if(mat)words(mat);
    const shapeTopology=shape===null?null:shapeTree(shape);
    effects.push({offset:at,lifetime,joint,animation,material,shape,shapeTopology,scene,anim,mat});
  }
  const untyped=[...a.relocations].filter(p=>!pointers.has(p));
  // EfCo and EfDk retain orphan export-time shape trees whose effect-table shape
  // pointers are null. Only the graph reachable through the typed table is
  // exposed to HSD; never relocate or expose those unused archive records.
  if(spec.bank===8&&untyped.length&&(untyped.length!==42||effects.some(e=>e.shape!==null)))throw Error('Unexpected Donkey orphan shape layout');
  // Mario retains two unreachable export-time shape trees; both effect-table
  // shape pointers are null. Validate this pinned archive layout without making
  // those orphan records reachable through the published effect table.
  if(spec.bank===1&&untyped.length&&(effects.some(e=>e.shape!==null)||JSON.stringify(untyped)!==JSON.stringify([73192,73212,77816,77840,77856,77872,77876,77880,77884,77900,77912])))throw Error('Unexpected Mario orphan shape layout');
  if(untyped.length&&!spec.stage&&![0,1,8].includes(spec.bank))throw Error('Untyped effect archive relocations: '+untyped.join(','));
  return {stage:!!spec.stage,root,cmd,tex,bank,version,first,count,commands,textures,effects,relocationOnlyPalettes,pointerSlots:pointers,unreferencedRelocations:untyped,packedBytes:packed.size,
    image:nativeSubgraphImage(body,pointers,new Map(spec.stage?[['native_stage_particles',cmd],['native_stage_particle_textures',tex]]:[[spec.name,root]]))};
}
