import {inspectArchive,nativeArchiveImage} from './archive.mjs';

// SIS keeps byte-coded commands, glyph I4 tiles and kerning pairs in console
// order. Only the pointer table is native-endian. Its first two entries name
// the custom glyph atlas and kerning bytes, despite the upstream member names.
export function convertSisAsset(input,{symbol='SIS_SelCharData'}={}){
 const a=inspectArchive(input),d=a.data,root=a.publics.get(symbol);
 if(root!==0||a.publics.size!==1||a.externs.size)throw Error('Unsupported SIS table');
 let end=0;while(a.relocations.has(end))end+=4;
 if(end<12||end/4!==a.relocations.size)throw Error('SIS pointers must form one complete table');
 const atlas=d.getUint32(0),kerning=d.getUint32(4),count=end/4;
 if(atlas%32||atlas<end||kerning<end||kerning>=atlas||(d.byteLength-atlas)%512)throw Error('Invalid SIS atlas/kerning bounds');
 const customGlyphs=(d.byteLength-atlas)/512;
 if(kerning+customGlyphs*2>atlas)throw Error('Truncated SIS kerning');
 const entries=[],opcodes=new Set(),glyphs=new Set();
 const sizes=new Map([[5,3],[6,5],[7,5],[10,5],[12,4],[14,5]]);
 for(let index=2;index<count;index++){
  const start=d.getUint32(index*4);if(start<end||start>=kerning)throw Error('SIS entry outside command region');
  let at=start,done=false,commands=0;
  while(at<kerning){
   const op=d.getUint8(at);opcodes.add(op);commands++;
   // Archive jumps require a separate typed relocation scheme. The USA CSS
   // table has none. Never accept an unconverted address embedded in bytes.
   if(op===8||op===9||op>26&&op<32)throw Error('Unsupported SIS opcode '+op);
   const size=op>=32?2:sizes.get(op)??1;if(at+size>kerning)throw Error('Truncated SIS command');
   if(op>=32){const glyph=d.getUint16(at),id=glyph-(glyph<0x4000?0x2000:0x4000);if(id<0||id>=(glyph<0x4000?287:customGlyphs))throw Error('SIS glyph outside atlas');glyphs.add(glyph);}
   at+=size;if(op===0){done=true;break;}
  }
  if(!done)throw Error('Unterminated SIS entry');entries.push({index,start,end:at,commands});
 }
 return {symbol,root,count,customGlyphs,atlas,kerning,entries,opcodes:[...opcodes].sort((a,b)=>a-b),glyphs:[...glyphs].sort((a,b)=>a-b),image:nativeArchiveImage(a,new Map([[symbol,root]]))};
}
