// Original CPU scripts are byte-coded; attack entries contain s32/f32 words.
// Their nested arrays must not share the color-script numeric-word treatment.
export function readCpuTables(archive) {
  const d=archive.data,root=archive.publics.get('ftLoadCommonData'),pointers=new Set(),words=new Set(),raw=new Set();
  const bounds=(at,n)=>{if(!Number.isInteger(at)||at<0||at+n>d.byteLength)throw Error('CPU table exceeds archive');};
  function word(at){bounds(at,4);if(at%4)throw Error('Unaligned CPU word');words.add(at);return d.getUint32(at);}
  function ptr(at) {const v=word(at);if(!archive.relocations.has(at)){if(v)throw Error('Unrelocated CPU pointer');return null;}pointers.add(at);bounds(v,1);return v;}
  const at=ptr(root+22*4);if(at===null)throw Error('Missing shared CPU root');
  const roots=Array.from({length:10},(_,i)=>ptr(at+i*4));if(roots.some(v=>v===null))throw Error('Missing CPU subtable');
  const scripts=[];
  for(let index=0;index<62;index++) {
    const start=ptr(roots[0]+index*4);if(start===null){scripts.push({index,start,bytes:new Uint8Array()});continue;}
    let cursor=start;
    for(;;) {
      bounds(cursor,1);const opcode=d.getUint8(cursor),length=opcode>191?3:opcode>127?2:1;
      if(!((opcode>=1&&opcode<=25)||opcode===127||(opcode>=128&&opcode<=149)||(opcode>=192&&opcode<=194)))throw Error('Unknown CPU script opcode');
      bounds(cursor,length);if(cursor+length-start>256)throw Error('CPU script exceeds original buffer');
      for(let i=0;i<length;i++)raw.add(cursor+i);cursor+=length;if(opcode===127)break;
    }
    scripts.push({index,start,bytes:archive.bytes.slice(32+start,32+cursor)});
  }
  const lists=new Map(),tables=[];
  for(let table=1;table<8;table++) {
    const rows=[];
    for(let kind=0;kind<32;kind++) {
      const list=ptr(roots[table]+kind*4);if(list===null)throw Error('Missing CPU attack list');rows.push(list);
      if(lists.has(list))continue;const entries=[];let cursor=list;
      for(;;cursor+=36) {
        const cmd=word(cursor);if(!cmd)break;if(entries.length>=32)throw Error('CPU attack list exceeds native capacity');
        const entry={offset:cursor,cmd,weight:d.getFloat32(cursor+24)};
        for(let i=1;i<9;i++){word(cursor+i*4);if(i>=2&&i<=6&&!Number.isFinite(d.getFloat32(cursor+i*4)))throw Error('Nonfinite CPU attack data');}
        entries.push(entry);
      }
      lists.set(list,{offset:list,entries});
    }
    tables.push(rows);
  }
  for(const [table,count] of [[8,32],[9,6]])for(let i=0;i<count;i++){const slot=roots[table]+i*4;word(slot);if(!Number.isFinite(d.getFloat32(slot)))throw Error('Nonfinite CPU threshold');}
  for(const slot of raw)if(words.has(slot&~3))throw Error('CPU byte/numeric data overlap');
  for(const slot of words)if(archive.relocations.has(slot)&&!pointers.has(slot))throw Error('Unclassified CPU pointer');
  return {root:at,roots,pointers,words,raw,scripts,lists,tables};
}
