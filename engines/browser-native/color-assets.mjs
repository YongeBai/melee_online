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
  const options={terminalOpcodes:[0,6,7,10]},reachable=readMotionScripts(archive,starts,colorCommandWords,options);
  // Retail PlCo retains two self-looping tails after terminating commands.
  // They have relocation entries although no table entry reaches them. Validate
  // their branch records before importing them; never guess ordinary data words.
  const first=Math.min(...starts),end=Math.min(...tables.map(t=>t.offset)),orphanRoots=new Set();
  for(const slot of archive.relocations)if(slot>=first&&slot<end&&!reachable.pointers.has(slot)) {
    const opcode=d.getUint32(slot-4)>>>26,target=d.getUint32(slot);
    if(![5,7].includes(opcode)||target<first||target>=end)throw Error('Unclassified color-region pointer');
    orphanRoots.add(target);
  }
  const scripts=orphanRoots.size?readMotionScripts(archive,[...starts,...orphanRoots],colorCommandWords,options):reachable;
  return {tables,scripts,reachableCommands:reachable.commands.size,orphanRoots:[...orphanRoots]};
}
