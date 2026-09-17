import {convertSceneAsset} from './scene-assets.mjs';
import {convertMaterialAnimation} from './material-animation-assets.mjs';
import {nativeSubgraphImage} from './archive.mjs';
import {installResidentFile} from './resident-files.mjs';

export function convertCostume(input) {
  const scene=convertSceneAsset(input),animation=convertMaterialAnimation(input),body=Uint8Array.from(scene.image.subarray(32,32+scene.archive.dataSize));
  const pointers=new Set(scene.pointerSlots),publics=new Map([[scene.model.tree.name,scene.rootOffset]]);
  if(animation) {
    const source=animation.image.subarray(32,32+scene.archive.dataSize);
    for(const [slots,width] of [[animation.words,4],[animation.halves,2]])for(const at of slots) {
      if(scene.writes.has(at)&&body.subarray(at,at+width).some((v,i)=>v!==source[at+i]))throw Error('Conflicting costume descriptor conversions');
      body.set(source.subarray(at,at+width),at);
    }
    for(const at of animation.pointers)pointers.add(at);publics.set(animation.name,animation.root);
  }
  return {...scene,animation,image:nativeSubgraphImage(body,pointers,publics)};
}
function costumeSpec(module,kind,index,copy){
 if(!Number.isInteger(kind)||kind<0||kind>=27||!Number.isInteger(index)||index<0||index>=module._portCostumeCount(copy?4:kind)||copy&&![3,15,16,22,24].includes(kind))throw Error('Invalid original costume index');
 const string=field=>{const p=copy?module._portKirbyCostumeString(kind,index,field):module._portCostumeString(kind,index,field);if(!p)return null;const end=module.HEAPU8.indexOf(0,p);if(end<p||end-p>128)throw Error('Invalid original costume string');return new TextDecoder('utf-8',{fatal:true}).decode(module.HEAPU8.subarray(p,end));};
 const requestedName=string(0),spec={kind,index,requestedName,name:requestedName==='PlCaRe.'?'PlCaRe.usd':requestedName,joint:string(1),animation:string(2)};
 if(!(copy?/^PlKb[A-Za-z]{2}Cp[A-Za-z]{2}\.dat$/:/^Pl[A-Za-z]{4}\.(dat|usd)$/).test(spec.name)||!spec.joint)throw Error('Invalid original costume metadata');return spec;
}
export const nativeCostumeSpec=(module,kind,index)=>costumeSpec(module,kind,index,false);
export const nativeKirbyCostumeSpec=(module,kind,index)=>costumeSpec(module,kind,index,true);
export function loadCostume(module,input,name,kind,index=0,{install=true}={}) {
  const spec=nativeCostumeSpec(module,kind,index);if(name!==spec.name)throw Error('Costume filename does not match original index');
  const converted=convertCostume(input);if(converted.model.tree.name!==spec.joint||(converted.animation?.name??null)!==spec.animation)throw Error('Costume symbols differ from original table');if(install)installResidentFile(module,name,converted.image);
  const before=module._portFileAllocations(),root=module._portCostumeLoad(kind,index);
  if(!root||module._portFileAllocations()!==before+2)throw Error('Original costume archive load failed');
  const animationRoot=module._portCostumeAnimation(kind,index);
  if(Boolean(animationRoot)!==Boolean(converted.animation))throw Error('Original costume animation symbol mismatch');
  const base=root-converted.rootOffset;
  if(converted.animation&&animationRoot!==base+converted.animation.root)throw Error('Costume roots do not share their archive');
  if(module._portCostumeLoad(kind,index)!==root||module._portFileAllocations()!==before+2)throw Error('Original costume cache allocated twice');
  let disposed=false;
  return {...converted,index,name,root,animationRoot,dispose(){if(!disposed){module._portCostumeRelease(kind,index);disposed=true;}}};
}
