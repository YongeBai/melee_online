// The native match selects eye, interest, FOV and projection aspect. This bridge
// only changes matrix storage order; GPU code owns GX-to-WebGL depth conversion.
export function createNativeCamera(module,{read=pointer=>module._portStageCameraSnapshot(pointer)}={}) {
  const pointer=module._malloc(38*4);if(!pointer)throw Error('Camera snapshot allocation');let disposed=false;
  const column=rows=>Float32Array.from({length:16},(_,i)=>rows[(i%4)*4+(i>>2)]);
  return {
    snapshot(){
      if(disposed)throw Error('Camera snapshot after release');
      read(pointer);
      const raw=Float32Array.from(module.HEAPF32.subarray(pointer/4,pointer/4+38));
      if(!raw.every(Number.isFinite))throw Error('Nonfinite camera snapshot');
      return {raw,view:column([...raw.subarray(0,12),0,0,0,1]),projection:column(raw.subarray(12,28)),eye:raw.slice(28,31),interest:raw.slice(31,34),fov:raw[34],aspect:raw[35],near:raw[36],far:raw[37]};
    },
    dispose(){if(!disposed){module._free(pointer);disposed=true;}},
  };
}
export function checkNativeCamera(s,{hud=false,clipPlanes=[0.1,16384],aspect=Math.fround(hud?1.2166670560836792:1.2173333)}={}) {
  const check=(ok,message)=>{if(!ok)throw Error('Native camera: '+message);};
  check(s.fov>0&&s.fov<180&&s.near>0&&s.far>s.near,'perspective range');
  check(hud?s.near===1&&s.far===3500:s.near===Math.fround(clipPlanes[0])&&s.far===Math.fround(clipPlanes[1]),'native clip planes');
  check(s.aspect===Math.fround(aspect),'original Melee projection aspect');
  const rows=[s.raw.slice(0,3),s.raw.slice(4,7),s.raw.slice(8,11)],dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)check(Math.abs(dot(rows[i],rows[j])-(i===j?1:0))<0.00002,'orthonormal native view');
  for(let i=0;i<3;i++)check(Math.abs(dot(rows[i],s.eye)+s.raw[i*4+3])<0.0001,'native eye maps to view origin');
  check(Math.abs(dot(rows[0],s.interest)+s.raw[3])<0.0001&&Math.abs(dot(rows[1],s.interest)+s.raw[7])<0.0001&&dot(rows[2],s.interest)+s.raw[11]<0,'interest lies on forward view axis');
  const cot=1/Math.tan(s.fov*Math.PI/360),p=s.raw.subarray(12,28);
  check(Math.abs(p[0]-cot/s.aspect)<0.00001&&Math.abs(p[5]-cot)<0.00001&&p[14]===-1&&p[15]===0,'native perspective coefficients');
  check(Math.abs(p[10]+s.near/(s.far-s.near))<1e-6&&Math.abs(p[11]+s.far*s.near/(s.far-s.near))<1e-6,'original GX depth coefficients');
}

// Hand-computed SDK projection cases, including viewport offsets and depth.
export function verifyNativeProjection(module) {
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0],cases=[
    {point:[1,2,-4],matrix:identity,projection:[0,2,0,2,0,0,-1],viewport:[10,20,640,480,0,1],expected:[490,20,.75]},
    {point:[1,2,-4],matrix:identity,projection:[1,.5,0,.25,0,.125,-.5],viewport:[10,20,640,480,0,1],expected:[490,140,0]},
    {point:[1,0,-2],matrix:[1,0,0,1,0,1,0,-1,0,0,1,-2],projection:[0,1,.25,2,-.5,0,-2],viewport:[10,20,640,480,0,1],expected:[410,260,.5]},
    {point:[0,0,-2],matrix:identity,projection:[0,1,0,1,0,0,-1],viewport:[0,0,960,720,.2,.8],expected:[480,360,.5]},
  ];
  const ptr=module._malloc(128);if(!ptr)throw Error('Projection check allocation');
  try {
    for(const c of cases){
      new Uint32Array(module.HEAPU8.buffer,ptr,32).fill(0x76543210);module.HEAPF32.set([...c.matrix,...c.projection,...c.viewport],ptr/4);
      module._GXProject(...c.point,ptr,ptr+48,ptr+76,ptr+104,ptr+108,ptr+112);
      const actual=module.HEAPF32.subarray(ptr/4+26,ptr/4+29);
      if(actual.some((v,i)=>!Number.isFinite(v)||Math.abs(v-c.expected[i])>1e-4))throw Error('Original SDK projection mismatch: '+actual);
      for(const i of [25,29,30,31])if(new Uint32Array(module.HEAPU8.buffer,ptr,32)[i]!==0x76543210)throw Error('Original SDK projection output bounds');
    }
    return {passed:true,cases:cases.length,components:cases.length*3};
  }finally{module._free(ptr);}
}
