import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';

// Import ftData.x8: visibility, costume texture indices and five bone IDs.
// Texture animation objects themselves live in the corresponding model archive.
export function convertVisibility(input,name,costumes) {
  return convertVisibilityData(input,name,costumes,null);
}
// The same FtPartsDesc is embedded in costume attachments, without the
// fighter-only texture-selection table and bone IDs that follow ftData.x8.
export function convertPartsVisibility(input,descriptor,costumes) {
  if(!Number.isInteger(descriptor)||descriptor<0)throw Error('Invalid part visibility descriptor');
  return convertVisibilityData(input,null,costumes,descriptor);
}
function convertVisibilityData(input,name,costumes,descriptor) {
  if(!Number.isInteger(costumes)||costumes<1||costumes>6)throw Error('Invalid costume count');
  const a=inspectArchive(input),d=a.data,root=name?a.publics.get('ftData'+fighterArchives[name.slice(2,4)]):null;
  const bytes=Uint8Array.from(a.bytes.subarray(32,32+a.dataSize)),out=new DataView(bytes.buffer),pointers=new Set(),words=new Set(),packed=new Set(),halves=new Set();
  const bounds=(at,n,align=4)=>{if(!Number.isInteger(at)||at<0||at%align||at+n>d.byteLength)throw Error('Visibility descriptor out of bounds');};
  function word(at){bounds(at,4);if(a.relocations.has(at))throw Error('Visibility scalar is a pointer');words.add(at);out.setUint32(at,d.getUint32(at),true);return d.getUint32(at);}
  function pointer(at){bounds(at,4);const value=d.getUint32(at);if(!a.relocations.has(at)){if(value)throw Error('Unresolved visibility pointer');return null;}bounds(value,1,1);pointers.add(at);out.setUint32(at,value,true);return value;}
  if(root===undefined)throw Error('Missing fighter visibility root');
  const desc=descriptor??pointer(root+8);if(desc===null)throw Error('Missing fighter part descriptor');bounds(desc,descriptor===null?24:8);
  const models=word(desc),table=pointer(desc+4);if(models<1||models>11||table===null)throw Error('Invalid visibility group count');
  bounds(table,costumes*16);const rows=[];
  for(let costume=0;costume<costumes;costume++) {
    const channels=[];
    for(let channel=0;channel<4;channel++) {
      const lookup=pointer(table+costume*16+channel*4);if(lookup===null){channels.push(null);continue;}
      bounds(lookup,models*8);const groups=[];
      for(let group=0;group<models;group++) {
        const count=word(lookup+group*8),alternatives=pointer(lookup+group*8+4);
        if(count>128||(count&&alternatives===null))throw Error('Invalid visibility alternatives');
        if(count)bounds(alternatives,count*8);const variants=[];
        for(let variant=0;variant<count;variant++) {
          const n=word(alternatives+variant*8),indices=pointer(alternatives+variant*8+4);
          if(n>124||(n&&indices===null))throw Error('Invalid visibility index count');
          if(n)bounds(indices,n,1);const values=[];
          for(let j=0;j<n;j++){packed.add(indices+j);const value=d.getUint8(indices+j);if(value>=(channel===2?32:124))throw Error('Visibility index exceeds display capacity');values.push(value);}
          variants.push(values);
        }
        groups.push(variants);
      }
      channels.push(groups);
    }
    rows.push(channels);
  }
  if(descriptor!==null){
    for(const at of packed)if(words.has(at&~3)||a.relocations.has(at&~3))throw Error('Visibility indices overlap typed descriptors');
    const typedBytes=new Set([...packed,...[...words,...pointers].flatMap(p=>[p,p+1,p+2,p+3])]);
    return {image:nativeSubgraphImage(bytes,pointers,new Map([['native_visibility',desc]])),models,rows,typedBytes};
  }
  const textureCount=word(desc+8),textureTable=pointer(desc+12),textureRows=[];
  if(textureCount>5||textureTable===null)throw Error('Invalid costume texture selection table');
  bounds(textureTable,costumes*4);
  for(let costume=0;costume<costumes;costume++) {
    const at=pointer(textureTable+costume*4);if(at===null){textureRows.push(null);continue;}
    bounds(at,textureCount*2,2);const row=[];
    for(let i=0;i<textureCount;i++){const slot=at+i*2;halves.add(slot);row.push(d.getUint16(slot));out.setUint16(slot,d.getUint16(slot),true);}
    textureRows.push(row);
  }
  const bones=Array.from(a.bytes.subarray(32+desc+16,32+desc+21));
  for(let i=16;i<21;i++)packed.add(desc+i);
  for(const at of halves)if(words.has(at&~3)||a.relocations.has(at&~3))throw Error('Costume texture indices overlap descriptors');
  for(const at of packed)if(words.has(at&~3)||halves.has(at&~1)||a.relocations.has(at&~3))throw Error('Visibility indices overlap typed descriptors');
  // The root+8 pointer is used only to find the subgraph, not exposed in it.
  pointers.delete(root+8);
  return {image:nativeSubgraphImage(bytes,pointers,new Map([['native_visibility',desc]])),models,rows,textureCount,textureRows,bones};
}
