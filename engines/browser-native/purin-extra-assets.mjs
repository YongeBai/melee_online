import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {convertPartsVisibility} from './visibility-assets.mjs';

// USA 1.02 Purin x48: an unused null slot and the costume-attachment record.
// ftPr_Init_8013C360 resolves each hat joint from its costume archive; this
// record has a null joint followed by the original eight-byte FtPartsDesc.
export function convertPurinExtra(input,costumes) {
  const a=inspectArchive(input),d=a.data,root=a.publics.get('ftDataPurin');
  const bounds=(p,n)=>{if(!Number.isInteger(p)||p<0||p%4||p+n>d.byteLength)throw Error('Purin extra bounds');};
  function pointer(p){bounds(p,4);if(!a.relocations.has(p))throw Error('Purin extra pointer');const value=d.getUint32(p);bounds(value,4);return value;}
  const empty=p=>{bounds(p,4);if(a.relocations.has(p)||d.getUint32(p)!==0)throw Error('Unexpected Purin extra slot');};
  if(root===undefined||a.externs.size||costumes!==5)throw Error('Purin extra archive or costumes');
  bounds(root,96);const table=pointer(root+72),hat=pointer(table+4);empty(table);empty(hat);bounds(hat,12);
  const visibility=convertPartsVisibility(input,hat+4,costumes),header=new DataView(visibility.image.buffer),size=header.getUint32(4,true),n=header.getUint32(8,true);
  const body=visibility.image.slice(32,32+size),out=new DataView(body.buffer),pointers=new Set(Array.from({length:n},(_,i)=>header.getUint32(32+size+i*4,true)));
  if(table<hat+12&&hat<table+8)throw Error('Overlapping Purin extra records');
  for(const p of [table,table+4,hat])for(let i=0;i<4;i++)if(visibility.typedBytes.has(p+i))throw Error('Purin extra overlaps visibility graph');
  out.setUint32(table+4,hat,true);pointers.add(table+4);
  return {table,hat,models:visibility.models,rows:visibility.rows,image:nativeSubgraphImage(body,pointers,new Map([['native_purin_extra',table]]))};
}
