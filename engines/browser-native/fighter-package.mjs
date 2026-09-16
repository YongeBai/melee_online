import {fighterArchives} from './fighter-assets.mjs';
import {convertFighterBase} from './fighter-base-assets.mjs';
import {readFighterMotions} from './motion-assets.mjs';
import {convertMotionAnimations} from './motion-animations.mjs';
import {convertFighterEffects} from './effect-assets.mjs';
import {loadCostume} from './costume-assets.mjs';
import {installResidentFile,installResidentBytes,openResidentArchive} from './resident-files.mjs';

// Prepare each selected fighter before synchronous original constructors run.
// A shared effect archive is installed once even for distinct fighter kinds.
export async function loadFighterPackage(module,code,{asset,models,motionSpec,attributeSpec,effectFiles}){
  const character=fighterArchives[code],kind=motionSpec.codes.indexOf(code);
  if(!character||kind<0)throw Error('Unknown fighter package');
  const baseName='Pl'+code+'.dat',motionName='Pl'+code+'AJ.dat',modelName='Pl'+code+'Nr.dat';
  // Original ftData effect selector is -1 for Game & Watch: common bank only.
  const effectName=code==='Gw'?null:'Ef'+({Sk:'Zd',Fc:'Fx',Dr:'Mr',Pc:'Pk',Cl:'Lk'}[code]??code)+'Data.dat';
  const [baseBytes,animationBytes]=await Promise.all([asset(baseName),asset(motionName)]);
  const modelBytes=models.find(m=>m.name===modelName)?.bytes;if(!modelBytes)throw Error('Missing fighter costume '+modelName);
  const ptr=at=>new DataView(module.HEAPU8.buffer).getUint32(at,true);
  const partCount=ptr(ptr(module._portSharedGlobal(4)+kind*4)+8),costumes=module._portCostumeCount(kind);
  const source=convertFighterBase(baseBytes,baseName,{motionSpec,attributeSpec,partCount,costumes});
  installResidentFile(module,baseName,source.image);
  const file=openResidentArchive(module,baseName,['ftData'+character]),root=file.addresses[0],image=new DataView(source.image.buffer),bodySize=image.getUint32(4,true),relocations=new Set();
  let checks=0;
  try{
    for(let i=0;i<image.getUint32(8,true);i++)relocations.add(image.getUint32(32+bodySize+i*4,true));
    for(let i=0;i<24;i++){checks++;if(ptr(root+i*4)!==(source.fields[i]===null?0:root+source.fields[i]))throw Error('Complete base root relocation '+i);}
    for(let at=0;at<bodySize;){checks++;if(relocations.has(at)){if(ptr(root+at)!==root+image.getUint32(32+at,true))throw Error('Base subgraph relocation '+at);at+=4;}else{if(module.HEAPU8[root+at]!==source.image[32+at])throw Error('Base subgraph payload '+at);at++;}}
  }finally{file.dispose();}
  const baseArchive={passed:true,checks,bytes:source.image.length,partCount,costumes,motionRows:source.motionCount,demoRows:source.demoCount,imports:source.imports,relocations:relocations.size};
  const motions=readFighterMotions(baseBytes,baseName,motionSpec),bundle=convertMotionAnimations(animationBytes,motions.motions);
  installResidentBytes(module,motionName,bundle.image);
  const costume=loadCostume(module,modelBytes,modelName,kind);
  let effect=null;
  if(effectName){
    effect=effectFiles.get(effectName);
    if(!effect){const bytes=await asset(effectName),source=convertFighterEffects(bytes,code);effect={bytes,source};installResidentFile(module,effectName,source.image);effectFiles.set(effectName,effect);}
  }
  return {code,character,kind,baseName,baseBytes,modelBytes,source,partCount,costume,baseArchive,effectName,effect};
}
