import {inspectArchive} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';

export function convertSpecialAttributes(input,name,spec) {
  const code=/^Pl([A-Za-z]{2})\.dat$/.exec(name)?.[1],character=spec.characters.find(c=>c.callback==='ft'+code+'_Init_LoadSpecialAttrs');
  if(!character||!fighterArchives[code])throw Error('Unknown fighter attribute archive');
  const record=spec.records[character.record],archive=inspectArchive(input),d=archive.data,root=archive.publics.get('ftData'+fighterArchives[code]);
  if(root===undefined||!archive.relocations.has(root+4)||root+8>d.byteLength)throw Error('Missing special attribute pointer');
  const at=d.getUint32(root+4);if(at%4||at+record.size>d.byteLength)throw Error('Special attributes exceed archive');
  for(const p of archive.relocations)if(p>=at&&p<at+record.size)throw Error('Pointer graph inside character attributes needs explicit import');
  // Some unknown decomp fields have void* types but are unrelocated integer
  // words in retail. Keep those bits opaque; never rebase them as pointers.
  const bytes=Uint8Array.from(archive.bytes.subarray(32+at,32+at+record.size)),out=new DataView(bytes.buffer);
  for(const f of record.fields) {
    if(f.kind==='float'&&!Number.isFinite(d.getFloat32(at+f.offset)))throw Error('Nonfinite special attribute');
    if(f.width===4)out.setUint32(f.offset,d.getUint32(at+f.offset),true);
    else if(f.width===2)out.setUint16(f.offset,d.getUint16(at+f.offset),true);
    else if(f.width!==1)throw Error('Unsupported attribute scalar width');
  }
  return {bytes,character,record};
}
