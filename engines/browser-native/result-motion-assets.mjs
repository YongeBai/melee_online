import {inspectArchive,nativeArchiveImage} from './archive.mjs';
import {animationArchives} from './animation-assets.mjs';
import {convertMotionAnimations} from './motion-animations.mjs';

// Each public in GmRstM??.dat points at a 32-byte-aligned concatenation of
// ordinary HSD FigaTree archives. Validate every nested archive and retain its
// exact source extent; these bytes are consumed later by ftDemo_SetArchiveData.
export function inspectResultMotions(input,name){
 const archive=inspectArchive(input),roots=[...archive.publics].sort((a,b)=>a[1]-b[1]);
 if(archive.externs.size||archive.relocations.size||!/^GmRstM[A-Za-z]{2}\.dat$/.test(name)||!roots.length||roots.some(([symbol,offset],i)=>!symbol.startsWith('ftDemoResultMotionFile')||offset%32||(i&&offset<=roots[i-1][1])))throw Error('Invalid result motion archive '+name);
 const motions=[];
 for(let i=0;i<roots.length;i++){
  const [symbol,start]=roots[i],end=roots[i+1]?.[1]??archive.dataSize,bytes=archive.bytes.subarray(32+start,32+end),clips=[];
  for(const {offset,tree} of animationArchives(bytes,true))clips.push({offset,frames:tree.frames,bones:tree.bones,tracks:tree.tracks.length,commands:tree.tracks.reduce((sum,track)=>sum+track.commands,0)});
  if(!clips.length)throw Error('Empty result motion public '+symbol);motions.push({symbol,start,end,bytes:end-start,clips});
 }
 return {name,bytes:archive.bytes.length,motions,clips:motions.reduce((sum,row)=>sum+row.clips.length,0),tracks:motions.reduce((sum,row)=>sum+row.clips.reduce((n,clip)=>n+clip.tracks,0),0),commands:motions.reduce((sum,row)=>sum+row.clips.reduce((n,clip)=>n+clip.commands,0),0)};
}

// Each public is a concatenation of nested FigaTree DATs. Convert their typed
// headers/descriptors in place while preserving their sizes, offsets, and
// packed animation command streams; then convert only the outer DAT metadata.
export function convertResultMotionAsset(input,name){
 const archive=inspectArchive(input),inspection=inspectResultMotions(input,name);
 const image=nativeArchiveImage(archive,archive.publics);
 for(const motion of inspection.motions){
  const bytes=archive.bytes.subarray(32+motion.start,32+motion.end),converted=convertMotionAnimations(bytes,[]);
  if(converted.image.length!==bytes.length)throw Error('Result motion import changed public offsets');
  image.set(converted.image,32+motion.start);
 }
 return {...inspection,image};
}
