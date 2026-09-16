// Preserve GX primitive winding when expressing immediate geometry as triangles.
export function immediateTriangles(primitive,count) {
  if(!Number.isInteger(count)||count<1||count>4096)throw Error('Immediate vertex capacity');
  const out=[];
  if(primitive===0x80){if(count%4)throw Error('Incomplete GX quad');for(let i=0;i<count;i+=4)out.push(i,i+1,i+2,i,i+2,i+3);}
  else if(primitive===0x90){if(count%3)throw Error('Incomplete GX triangle');for(let i=0;i<count;i++)out.push(i);}
  else if(primitive===0x98){if(count<3)throw Error('Incomplete GX strip');for(let i=2;i<count;i++)out.push(i%2?i-1:i-2,i%2?i-2:i-1,i);}
  else if(primitive===0xa0){if(count<3)throw Error('Incomplete GX fan');for(let i=2;i<count;i++)out.push(0,i-1,i);}
  else throw Error('Unsupported immediate primitive '+primitive);
  return Uint32Array.from(out);
}

// Compare the five captured GX blocks, including masks and diagnostic counters.
// Only TEV register values transported per vertex may differ. Sizes
// match the static assertions in tev/texture/pixel/model-state and render-context.
export function createImmediateStateMatcher(module) {
  const sizes=[548,724,80,244,158],saved=sizes.map(n=>new Uint32Array(n));
  let initialized=false;
  return (tev,eligible,vertexRegisters=false)=>{
    const addresses=[tev,module._portMaterialTextureState(),module._portMaterialPixelState(),module._portMaterialModelState(),module._portRenderContextState()];
    const heap=module.HEAPU8,views=addresses.map((p,i)=>{
      if(!p||p%4||p+sizes[i]*4>heap.length)throw Error('Immediate state snapshot bounds');
      return new Uint32Array(heap.buffer,p,sizes[i]);
    });
    let same=initialized&&eligible;
    if(same)outer:for(let block=0;block<views.length;block++)for(let i=0;i<sizes[block];i++){
      if(vertexRegisters&&block===0&&i>=4&&i<20)continue;
      if(views[block][i]!==saved[block][i]){same=false;break outer;}
    }
    if(!same)for(let block=0;block<views.length;block++)saved[block].set(views[block]);
    initialized=true;return same;
  };
}

// Retained CPU streams belong to one queued draw. Appending offsets only the
// new primitive's indices, keeping triangle order and strip/fan boundaries.
export function appendImmediateGeometry(stream,data,triangles,registers=null) {
  const count=data.length/9;
  if(!Number.isInteger(count)||count<1||stream.vertexCount+count>4096)throw Error('Immediate batch vertex capacity');
  if(registers!==null&&registers.length!==16)throw Error('Immediate batch register count');
  for(const index of triangles)if(index>=count)throw Error('Immediate batch index bounds');
  const grow=(array,needed,used)=>{
    if(array.length>=needed)return array;
    const next=new array.constructor(Math.max(needed,array.length*2,32));next.set(array.subarray(0,used));return next;
  };
  stream.data=grow(stream.data,(stream.vertexCount+count)*9,stream.vertexCount*9);
  stream.indices=grow(stream.indices,stream.indexCount+triangles.length,stream.indexCount);
  if(registers!==null){
    stream.registers=grow(stream.registers??new Int32Array(0),(stream.vertexCount+count)*16,stream.vertexCount*16);
    for(let i=0;i<count;i++)stream.registers.set(registers,(stream.vertexCount+i)*16);
  }
  stream.data.set(data,stream.vertexCount*9);
  for(let i=0;i<triangles.length;i++)stream.indices[stream.indexCount+i]=triangles[i]+stream.vertexCount;
  stream.vertexCount+=count;stream.indexCount+=triangles.length;
}
