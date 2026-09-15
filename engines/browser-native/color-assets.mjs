import {readMotionScripts} from './motion-assets.mjs';
// lb_80014258 dispatch: shared control words, 11 color/light handlers, then
// fighter GFX (5 words), SFX (3 words), and rumble (1 word).
export const colorCommandWords=[1,1,1,1,1,2,1,2,1,1,1,1,1,2,2,2,1,1,2,2,1,5,3,1];
export function readColorTables(archive) {
  const d=archive.data,root=archive.publics.get('ftLoadCommonData');
  if(root===undefined)throw Error('Missing shared color root');
  const tables=[],starts=[];
  for(const [section,count] of [[6,123],[7,6]]) {
    if(!archive.relocations.has(root+section*4))throw Error('Unrelocated color table');
    const at=d.getUint32(root+section*4);if(at%4||at+count*8>d.byteLength)throw Error('Invalid color table bounds');
    const entries=[];
    for(let index=0;index<count;index++) {
      const offset=at+index*8,value=d.getUint32(offset),script=archive.relocations.has(offset)?value:null;
      if(script===null&&value!==0)throw Error('Unrelocated color script');
      if(script!==null)starts.push(script);
      entries.push({index,offset,script,priority:d.getUint8(offset+4),secondary:d.getUint8(offset+5)});
    }
    tables.push({section,offset:at,entries});
  }
  const scripts=readMotionScripts(archive,starts,colorCommandWords,{terminalOpcodes:[0,6,7,10]});
  return {tables,scripts};
}
