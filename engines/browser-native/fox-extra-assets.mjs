import {inspectArchive,nativeSubgraphImage} from './archive.mjs';

// USA 1.02 Fox x48[4] has the archive's terminated signed-word choice layout,
// with no nested references. The pinned
// Fox code reads only x48[0..2]; do not misclassify this extra as an Article or
// a joint. Preserve its source values without assigning new gameplay use.
export function convertFoxExtra(input,motionCount) {
  const a=inspectArchive(input),d=a.data,root=a.publics.get('ftDataFox');
  const pointer=at=>{if(at%4||at<0||at+4>d.byteLength||!a.relocations.has(at))throw Error('Fox extra pointer');const p=d.getUint32(at);if(p%4||p+4>d.byteLength)throw Error('Fox extra bounds');return p;};
  if(root===undefined||a.externs.size||!Number.isInteger(motionCount)||motionCount<1)throw Error('Fox extra archive');
  const table=pointer(root+0x48),at=pointer(table+16),words=[];let total=0;
  for(let row=0;;row++){
    const slot=at+row*8;if(row>=64||slot+8>d.byteLength||a.relocations.has(slot)||a.relocations.has(slot+4))throw Error('Fox extra extent or relocation');
    const index=d.getInt32(slot),weight=d.getInt32(slot+4);words.push(index,weight);
    if(index===-1){if(weight!==-1||total!==100)throw Error('Fox extra terminator or total');break;}
    if(index<0||index>=motionCount||weight<1||weight>100)throw Error('Unrecognized Fox extra record');total+=weight;
  }
  const bytes=new Uint8Array(words.length*4),v=new DataView(bytes.buffer);words.forEach((word,i)=>v.setInt32(i*4,word,true));
  return {sourceOffset:at,words,image:nativeSubgraphImage(bytes,[],new Map([['native_fox_extra',0]]))};
}
