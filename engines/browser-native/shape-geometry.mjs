// Snapshot original HSD interpolation results. Its scratch arrays are reused
// by the next PObj, so queued WebGL draws must own their values.
export function snapshotShapeGeometry(module,mesh,positions,count,normals,normalCount,{reference=false}={}){
  function samples(pointer,n){
    if(!Number.isInteger(n)||n<0||n>4096||pointer%4||pointer<0||pointer+n*12>module.HEAPU8.length||n&&!pointer)throw Error('Native shape buffer bounds');
    const data=new Float32Array(module.HEAPU8.buffer,pointer,n*3);
    if(!data.every(Number.isFinite))throw Error('Nonfinite native shape sample');return data;
  }
  if((mesh.flags&0x3000)!==0x1000||count===0)throw Error('Unexpected native shape submission');
  const p=samples(positions,count),n=samples(normals,normalCount),out={positions:new Float32Array(mesh.vertices.length*3),normals:normalCount?new Float32Array(mesh.vertices.length*3):null};
  function copy(source,target,index,limit,i){if(!Number.isInteger(index)||index<0||index>=limit)throw Error('Shape display index out of bounds');for(let c=0;c<3;c++)target[i*3+c]=source[index*3+c];}
  mesh.vertices.forEach((v,i)=>{copy(p,out.positions,v.shapeIndices?.[9],count,i);if(out.normals)copy(n,out.normals,v.shapeIndices?.[10],normalCount,i);});
  if(reference)out.vertices=mesh.vertices.map((v,i)=>({...v,9:Array.from(out.positions.subarray(i*3,i*3+3)),...(out.normals?{10:Array.from(out.normals.subarray(i*3,i*3+3))}:{})}));
  return out;
}
