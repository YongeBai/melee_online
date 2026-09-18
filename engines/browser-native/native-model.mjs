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

// Frame-scoped JS staging storage. Slots may be reused only after the previous
// queue has been consumed. No native pointer or heap view enters the shared pool.
export function createPackedModelReader(module,getSlot){
  const local=[];getSlot??=((i,create)=>local[i]??=create());
  let cursor=0,buffer=null,words,values;
  const create=()=>{
    const positionRows=new Float32Array(120),normalRows=new Float32Array(120);
    return {positionRows,normalRows,positions:Array(10).fill(null),normals:Array(10).fill(null),current:null,
      positionViews:Array.from({length:10},(_,i)=>positionRows.subarray(i*12,i*12+12)),normalViews:Array.from({length:10},(_,i)=>normalRows.subarray(i*12,i*12+12))};
  };
  return {reset(){cursor=0;},read(){
    const p=module._portMaterialModelState(),heap=module.HEAPU8;
    if(!p||p%4||p+976>heap.length)throw Error('Native model snapshot bounds');
    if(buffer!==heap.buffer){buffer=heap.buffer;words=new Uint32Array(buffer,0,Math.floor(buffer.byteLength/4));values=new Float32Array(buffer,0,words.length);}
    const at=p/4,positionMask=words[at],normalMask=words[at+1],current=words[at+2],currentSet=words[at+3];
    if(!positionMask||positionMask>1023||normalMask>1023||(normalMask&~positionMask)||current>9||currentSet>1)throw Error('Native model matrix masks');
    const row=getSlot(cursor++,create);row.current=currentSet?current:null;row.positionRows.fill(0);row.normalRows.fill(0);row.positions.fill(null);row.normals.fill(null);
    for(let bits=positionMask;bits;bits&=bits-1){const i=31-Math.clz32(bits&-bits),offset=i*12;row.positions[i]=row.positionViews[i];
      for(let j=0;j<12;j++){const v=values[at+4+offset+j];if(!Number.isFinite(v))throw Error('Native model nonfinite matrix');row.positionRows[offset+j]=v;}
    }
    for(let bits=normalMask;bits;bits&=bits-1){const i=31-Math.clz32(bits&-bits),offset=i*12;row.normals[i]=row.normalViews[i];
      for(let j=0;j<12;j++){const v=values[at+124+offset+j];if(!Number.isFinite(v))throw Error('Native model nonfinite matrix');row.normalRows[offset+j]=v;}
    }
    return row;
  }};
}
