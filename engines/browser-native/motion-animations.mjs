import {animationArchives} from './animation-assets.mjs';
import {convertSceneAnimation} from './scene-assets.mjs';
export function convertMotionAnimations(bytes,motions) {
  const image=Uint8Array.from(bytes),clips=new Map();
  for(const {offset,tree} of animationArchives(bytes,true)) {
    const size=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);
    const converted=convertSceneAnimation(bytes.subarray(offset,offset+size),tree);
    if(converted.image.length!==size)throw Error('Native animation import changed original file offsets');
    image.set(converted.image,offset);clips.set(offset,{tree,size});
  }
  for(const m of motions)if(m.animationSize) {
    const clip=clips.get(m.animationOffset);
    if(!clip||clip.size!==m.animationSize||clip.tree.name!==m.name)throw Error('Motion table does not reference the expected animation: '+m.index);
  }
  return {image,clips};
}
