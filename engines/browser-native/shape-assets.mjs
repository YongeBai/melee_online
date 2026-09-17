// Descriptor conversion for original HSD shape animation. Unlike GX display
// arrays, these position/normal samples are read by native CPU interpolation.
export function readShapeSet(a,root){
 const d=a.data,words=new Set(),halves=new Set(),pointers=new Set(),rows=[];
 const bounds=(at,n,align=4)=>{if(!Number.isInteger(at)||at<0||at%align||at+n>d.byteLength)throw Error('Shape bounds');};
 function word(at){bounds(at,4);if(a.relocations.has(at))throw Error('Shape scalar relocation');words.add(at);return d.getUint32(at);}
 function ptr(at){bounds(at,4);words.add(at);const p=d.getUint32(at);if(!a.relocations.has(at)){if(p)throw Error('Unrelocated shape pointer');return null;}bounds(p,1,1);pointers.add(at);return p;}
 bounds(root,28);halves.add(root);halves.add(root+2);const flags=d.getUint16(root),count=d.getUint16(root+2),additive=!!(flags&2);
 if(!count||count>256||((flags&3)!==1&&(flags&3)!==2))throw Error('Unsupported shape blend');
 for(const [countAt,descAt,listAt,attribute]of [[4,8,12,9],[16,20,24,10]]){
  const vertices=word(root+countAt),desc=ptr(root+descAt),list=ptr(root+listAt);if(!vertices){if(desc!==null||list!==null)throw Error('Empty shape stream has payload');continue;}
  if(vertices>4096||desc===null||list===null)throw Error('Invalid shape stream');bounds(desc,24);
  const attr=word(desc),indexType=word(desc+4),components=word(desc+8),type=word(desc+12),frac=d.getUint8(desc+16),stride=d.getUint16(desc+18),data=ptr(desc+20);halves.add(desc+18);
  if(attr!==attribute||components!==(attribute===9?1:0)||![2,3].includes(indexType)||type>4||frac>31||data===null)throw Error('Unsupported shape sample descriptor');
  const width=type===4?4:type>=2?2:1;if(stride<width*3)throw Error('Shape sample stride');
  const indices=[];
  // drawShapeAnim clamps average indices to nb_shape - 1; additive mode
  // consumes a base plus nb_shape deltas. Some archives contain spare pointer
  // entries after an average list. They are outside the consumed graph.
  for(let shape=0;shape<count+Number(additive);shape++){
   const p=ptr(list+shape*4);if(p===null)throw Error('Missing shape indices');bounds(p,vertices*(indexType===3?2:1),1);const row=[];
   for(let i=0;i<vertices;i++){
    const index=indexType===3?d.getUint16(p+i*2):d.getUint8(p+i);row.push(index);const at=data+index*stride;bounds(at,3*width,width);
    for(let k=0;k<3;k++){const v=at+k*width;if(width===4){if(!Number.isFinite(d.getFloat32(v)))throw Error('Nonfinite shape sample');word(v);}else if(width===2){if(a.relocations.has(v&~3))throw Error('Relocated shape sample');halves.add(v);}}
   }
   indices.push(row);
  }
  rows.push({attribute,vertices,desc,indexType,type,frac,stride,data,indices});
 }
 if(!rows.some(r=>r.attribute===9))throw Error('Shape has no positions');
 return {root,flags,count,rows,words,halves,pointers};
}
