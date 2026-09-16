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
export function loadCostume(module,input,name,kind) {
  const converted=convertCostume(input);installResidentFile(module,name,converted.image);
  const before=module._portFileAllocations(),root=module._portCostumeLoad(kind,0);
  if(!root||module._portFileAllocations()!==before+2)throw Error('Original costume archive load failed');
  const animationRoot=module._portCostumeAnimation(kind,0);
  if(Boolean(animationRoot)!==Boolean(converted.animation))throw Error('Original costume animation symbol mismatch');
  const base=root-converted.rootOffset;
  if(converted.animation&&animationRoot!==base+converted.animation.root)throw Error('Costume roots do not share their archive');
  if(module._portCostumeLoad(kind,0)!==root||module._portFileAllocations()!==before+2)throw Error('Original costume cache allocated twice');
  let disposed=false;
  return {...converted,root,animationRoot,dispose(){if(!disposed){module._portCostumeRelease(kind,0);disposed=true;}}};
}
