import {inspectArchive,archiveRootView,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';
import {convertSceneAsset} from './scene-assets.mjs';

// The auxiliary fighter mesh binds to the existing primary skeleton. Only
// descriptors reached by its typed scene graph become relocated runtime data.
export function convertAuxiliaryAsset(input,name) {
  const archive=inspectArchive(input),d=archive.data;
  const root=archive.publics.get('ftData'+fighterArchives[name.slice(2,4)]);
  if(root===undefined||!archive.relocations.has(root+0x5c))throw Error('Missing auxiliary model');
  const offset=d.getUint32(root+0x5c),externalSlots=new Set();
  for(const start of archive.externs.values()) {
    if(start===0xffffffff)continue;
    let at=start;
    for(;;) {
      if(at%4||at+4>d.byteLength||externalSlots.has(at))throw Error('Invalid auxiliary external chain');
      externalSlots.add(at);const next=d.getUint32(at);if(next===0xffffffff)break;at=next;
    }
  }
  // Unrelated item/animation extern chains exist in several fighter archives.
  // Keep this temporary view private, then reject any typed descriptor that
  // touches them before exposing an image or loading any native object.
  const scene=convertSceneAsset(archiveRootView({...archive,externs:new Map()},'aux_Share_joint',offset));
  for(const at of externalSlots)if(scene.descriptorSlots.has(at)||scene.writes.has(at))throw Error('Auxiliary model requires external linking');
  const body=scene.image.subarray(32,32+archive.dataSize);
  return {...scene,image:nativeSubgraphImage(body,scene.pointerSlots,new Map([['native_auxiliary_model',offset]]))};
}
