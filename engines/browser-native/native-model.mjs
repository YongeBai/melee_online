export function readNativeModelMatrices(module) {
  const p=module._portMaterialModelState();
  if(!p||p%4||p+976>module.HEAPU8.length)throw Error('Native model snapshot bounds');
  const words=new Uint32Array(module.HEAPU8.buffer,p,244),values=new Float32Array(module.HEAPU8.buffer,p,244);
  const [positionMask,normalMask,current,currentSet]=words;
  if(!positionMask||positionMask>1023||normalMask>1023||(normalMask&~positionMask)||current>9||currentSet>1)throw Error('Native model matrix masks');
  const matrices=(offset,mask)=>Array.from({length:10},(_,i)=>{
    if(!(mask&(1<<i)))return null;const matrix=Float32Array.from(values.subarray(offset+i*12,offset+(i+1)*12));
    if(!matrix.every(Number.isFinite))throw Error('Native model nonfinite matrix');return matrix;
  });
  return {positions:matrices(4,positionMask),normals:matrices(124,normalMask),current:currentSet?current:null};
}
