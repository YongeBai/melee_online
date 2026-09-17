import {inspectArchive,nativeArchiveImage} from './archive.mjs';
// CARD consumes three RGB5A3 banners and the packed icon/palette bytes. They
// remain in console order; the native loader only relocates the four pointers.
export function convertCardIconAsset(input){
 const a=inspectArchive(input),d=a.data,root=a.publics.get('MemCardIconData'),names=['MemCardBanner_01','MemCardBanner_02','MemCardBanner_03','MemCardIcon_01'];
 if(root===undefined||root+20!==a.dataSize||a.externs.size||a.publics.size!==5||a.relocations.size!==4)throw Error('Invalid native card icon archive');
 const images=[];for(let i=0;i<4;i++){
  const p=a.publics.get(names[i]),size=i===3?1536:6144;
  if(p!==i*6144||!a.relocations.has(root+i*4)||d.getUint32(root+i*4)!==p||p+size>root)throw Error('Invalid card image bounds/table');images.push({symbol:names[i],offset:p,size});
 }
 if(root!==19968||d.getUint32(root+16))throw Error('Invalid card icon terminator');
 return {root,images,image:nativeArchiveImage(a,a.publics)};
}
