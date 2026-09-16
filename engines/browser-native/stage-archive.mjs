import {inspectArchive,initializeArchiveExternals} from './archive.mjs';

// Match lbArchive_InitializeDAT before importing stage subgraphs. Stadium's
// transformation archives are linked later by grDatFiles; the frozen profile
// never loads them. Only their known descriptor slots may be extern chains.
export function initializeStageArchive(input,stage) {
  if(stage==='story')return initializeArchiveExternals(input,['GrdStoryHeiho_TopN_shapeanim_joint']);
  if(stage!=='stadium')return input;
  const a=inspectArchive(input),d=a.data;if(!a.externs.size)return a.bytes;
  const root=a.publics.get('map_head');if(root===undefined||root+48>d.byteLength)throw Error('Missing Stadium map head');
  const table=d.getUint32(root+8),overrides=d.getUint32(root+24),special=d.getUint32(root+40);
  if(d.getUint32(root+12)!==10||d.getUint32(root+28)!==48||d.getUint32(root+44)!==44||a.externs.size!==75)throw Error('Unexpected Stadium external layout');
  const slots=new Set();
  for(const row of [3,4,6,7,8,9])for(const field of [0,4,8,16,24])slots.add(table+row*52+field);
  for(let i=0;i<24;i++)slots.add(overrides+i*8);
  for(let i=0;i<44;i++)slots.add(special+i*4);
  for(const [name,start] of a.externs){
    if(!/^GrdPStadium(?:Fire_|Grass_|Rock_|Water|_(?:Fire|Grass|Rock|Water)_)/.test(name))throw Error('Unexpected Stadium external name');
    const seen=new Set();for(let at=start;at!==0xffffffff;){
      if(!slots.has(at)||seen.has(at)||at%4||at+4>d.byteLength)throw Error('Stadium external outside transformation descriptors');
      seen.add(at);at=d.getUint32(at);
    }
  }
  return initializeArchiveExternals(a.bytes,[...a.externs.keys()]);
}
