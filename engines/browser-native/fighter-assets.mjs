import {inspectArchive} from './archive.mjs';

export const fighterArchives = {
  Mr:'Mario',Fx:'Fox',Ca:'Captain',Dk:'Donkey',Kb:'Kirby',Kp:'Koopa',Lk:'Link',Sk:'Seak',
  Ns:'Ness',Pe:'Peach',Pp:'Popo',Nn:'Nana',Pk:'Pikachu',Pr:'Purin',Ss:'Samus',Ys:'Yoshi',
  Zd:'Zelda',Lg:'Luigi',Mt:'Mewtwo',Ms:'Mars',Gw:'Gamewatch',Dr:'Drmario',Cl:'Clink',
  Pc:'Pichu',Fe:'Emblem',Gn:'Ganon',Fc:'Falco'
};

// ftCo_DatAttrs is explicitly typed: 96 four-byte scalar slots followed by
// one byte of throw flags and three padding bytes. Five slots are integers.
const integers=new Set([0x58,0x98,0xa0,0xa4,0x16c]);
export const attributeProbeOffsets=[0,0x18,0x1c,0x28,0x38,0x40,0x4c,0x58,
  0x5c,0x60,0x64,0x68,0x6c,0x70,0x74,0x88,0x8c,0xe4,0x16c,0x180];
export function convertFighterAttributes(input, filename) {
  const match=/^Pl([A-Za-z]{2})\.dat$/.exec(filename), kind=match&&fighterArchives[match[1]];
  if(!kind)throw Error('Unsupported fighter archive: '+filename);
  const archive=inspectArchive(input), root=archive.publics.get('ftData'+kind), data=archive.data;
  if(root===undefined || root+0x60>data.byteLength || !archive.relocations.has(root))
    throw Error('Missing or invalid fighter data root');
  const at=data.getUint32(root);
  if(at%4 || at+0x184>data.byteLength)throw Error('Invalid common fighter attributes');
  for(const slot of archive.relocations)if(slot>=at && slot<at+0x184)
    throw Error('Unexpected pointer inside scalar fighter attributes');
  const bytes=new Uint8Array(0x184), out=new DataView(bytes.buffer);
  for(let i=0;i<0x180;i+=4) {
    if(!integers.has(i)&&!Number.isFinite(data.getFloat32(at+i)))
      throw Error('Nonfinite fighter attribute at '+i);
    out.setUint32(i,data.getUint32(at+i),true);
  }
  // Packed flags are byte-oriented, never swapped as a 32-bit value.
  bytes.set(archive.bytes.subarray(32+at+0x180,32+at+0x184),0x180);
  const values=attributeProbeOffsets.map(offset=>offset===0x180?data.getUint8(at+offset):
    integers.has(offset)?data.getInt32(at+offset):data.getFloat32(at+offset));
  return {bytes,kind,values};
}
