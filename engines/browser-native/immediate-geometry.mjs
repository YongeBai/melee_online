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

// Compare the six captured GX blocks (including fog), including masks and diagnostic counters.
// Only TEV register values transported per vertex may differ. Sizes
// match the static assertions in tev/texture/pixel/model-state and render-context.
export function createImmediateStateMatcher(module,{cacheViews=true}={}) {
  const sizes=[548,724,80,244,158,5],saved=sizes.map(n=>new Uint32Array(n));
  let initialized=false,buffer=null,cachedAddresses=[],views=[];
  return (tev,eligible,vertexRegisters=false)=>{
    const heap=module.HEAPU8,addresses=[tev,module._portMaterialTextureState(),module._portMaterialPixelState(),module._portMaterialModelState(),module._portRenderContextState(),module._portFogState()];
    if(!cacheViews||buffer!==heap.buffer||addresses.some((p,i)=>p!==cachedAddresses[i])){
      views=addresses.map((p,i)=>{if(!p||p%4||p+sizes[i]*4>heap.length)throw Error('Immediate state snapshot bounds');return new Uint32Array(heap.buffer,p,sizes[i]);});
      buffer=heap.buffer;cachedAddresses=addresses;
    }
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

// Fixed ABI: position/color/UV float32x9, uint32 triangles, optionally int32x16
// TEV registers. Programs/uniforms/cameras/native pointers never enter this pool.
export function immediateResourceKey({kind,textured,cull,flatRegisters}) {
  if(![0,1,2].includes(kind)||![0,1,false,true].includes(textured)||![0,1,2,3].includes(cull)||typeof flatRegisters!=='boolean')throw Error('Immediate resource layout');
  return `f32x9-u32tri-i32x16-v1:${kind}:${+textured}:${cull}:${+flatRegisters}`;
}
export function createImmediateResourcePool(gl) {
  const buckets=new Map();let leased=false,closed=false;
  const destroy=r=>{gl.deleteVertexArray(r.vao);for(const b of [r.vertex,r.indices,r.registers])gl.deleteBuffer(b);};
  function create(layout){
    const r={vao:gl.createVertexArray(),vertex:gl.createBuffer(),indices:gl.createBuffer(),registers:gl.createBuffer(),capacity:{vertex:0,indices:0,registers:0},stream:{data:new Float32Array(0),indices:new Uint32Array(0),vertexCount:0,indexCount:0}};
    try{
      gl.bindVertexArray(r.vao);gl.bindBuffer(gl.ARRAY_BUFFER,r.vertex);
      for(const [location,size,offset]of [[0,3,0],[5,4,12],[7,2,28]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,36,offset);}
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,r.indices);gl.bindBuffer(gl.ARRAY_BUFFER,r.registers);
      for(let i=0;i<4;i++){gl.vertexAttribIPointer(i+8,4,gl.INT,64,i*16);if(layout.flatRegisters)gl.enableVertexAttribArray(i+8);}
      return r;
    }catch(e){destroy(r);throw e;}
  }
  return {
    acquire(){
      if(closed||leased||gl.isContextLost())throw Error('Immediate pool unavailable or leased');leased=true;let released=false;const cursors=new Map();
      const check=()=>{if(released)throw Error('Released immediate lease');};
      return {
        // Caller has consumed/discarded its prior queue before starting a frame.
        begin(){check();cursors.clear();},
        take(layout){check();const key=immediateResourceKey(layout),index=cursors.get(key)??0;let bucket=buckets.get(key);if(!bucket)buckets.set(key,bucket=[]);
          const resource=bucket[index]??(bucket[index]=create(layout));cursors.set(key,index+1);
          resource.stream.vertexCount=resource.stream.indexCount=0;
          // No frame-dynamic metadata is retained in resource or bucket.
          return {...resource,resource};
        },
        release(){if(!released){released=true;leased=false;cursors.clear();}}
      };
    },
    snapshot(){return {layouts:buckets.size,slots:[...buckets.values()].reduce((n,b)=>n+b.length,0),gpuBytes:[...buckets.values()].flat().reduce((n,r)=>n+r.capacity.vertex+r.capacity.indices+r.capacity.registers,0),leased};},
    dispose(){if(leased)throw Error('Cannot dispose leased immediate pool');if(closed)return;closed=true;for(const b of buckets.values())for(const r of b)destroy(r);buckets.clear();}
  };
}

export function uploadImmediateResource(gl,plan,flatRegisters) {
  const {resource:r,stream}=plan;
  const upload=(name,target,data)=>{gl.bindBuffer(target,r[name]);if(r.capacity[name]<data.byteLength){r.capacity[name]=Math.max(data.byteLength,r.capacity[name]*2,128);gl.bufferData(target,r.capacity[name],gl.DYNAMIC_DRAW);}gl.bufferSubData(target,0,data);};
  if(flatRegisters)upload('registers',gl.ARRAY_BUFFER,stream.registers.subarray(0,stream.vertexCount*16));
  upload('vertex',gl.ARRAY_BUFFER,stream.data.subarray(0,stream.vertexCount*9));
  upload('indices',gl.ELEMENT_ARRAY_BUFFER,stream.indices.subarray(0,stream.indexCount));
}
