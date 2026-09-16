// The native match selects eye, interest, FOV and projection aspect. This bridge
// only changes matrix storage order; GPU code owns GX-to-WebGL depth conversion.
export function createNativeCamera(module) {
  const pointer=module._malloc(38*4);if(!pointer)throw Error('Camera snapshot allocation');let disposed=false;
  const column=rows=>Float32Array.from({length:16},(_,i)=>rows[(i%4)*4+(i>>2)]);
  return {
    snapshot(){
      if(disposed)throw Error('Camera snapshot after release');
      module._portStageCameraSnapshot(pointer);
      const raw=Float32Array.from(module.HEAPF32.subarray(pointer/4,pointer/4+38));
      if(!raw.every(Number.isFinite))throw Error('Nonfinite camera snapshot');
      return {raw,view:column([...raw.subarray(0,12),0,0,0,1]),projection:column(raw.subarray(12,28)),eye:raw.slice(28,31),interest:raw.slice(31,34),fov:raw[34],aspect:raw[35],near:raw[36],far:raw[37]};
    },
    dispose(){if(!disposed){module._free(pointer);disposed=true;}},
  };
}
export function checkNativeCamera(s) {
  const check=(ok,message)=>{if(!ok)throw Error('Native camera: '+message);};
  check(s.fov>0&&s.fov<180&&s.near>0&&s.far>s.near,'perspective range');
  check(s.near===Math.fround(0.1)&&s.far===16384,'Battlefield native clip planes');
  check(s.aspect===Math.fround(1.2173333),'original Melee projection aspect');
  const rows=[s.raw.slice(0,3),s.raw.slice(4,7),s.raw.slice(8,11)],dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)check(Math.abs(dot(rows[i],rows[j])-(i===j?1:0))<0.00002,'orthonormal native view');
  for(let i=0;i<3;i++)check(Math.abs(dot(rows[i],s.eye)+s.raw[i*4+3])<0.0001,'native eye maps to view origin');
  check(Math.abs(dot(rows[0],s.interest)+s.raw[3])<0.0001&&Math.abs(dot(rows[1],s.interest)+s.raw[7])<0.0001&&dot(rows[2],s.interest)+s.raw[11]<0,'interest lies on forward view axis');
  const cot=1/Math.tan(s.fov*Math.PI/360),p=s.raw.subarray(12,28);
  check(Math.abs(p[0]-cot/s.aspect)<0.00001&&Math.abs(p[5]-cot)<0.00001&&p[14]===-1&&p[15]===0,'native perspective coefficients');
  check(Math.abs(p[10]+s.near/(s.far-s.near))<1e-6&&Math.abs(p[11]+s.far*s.near/(s.far-s.near))<1e-6,'original GX depth coefficients');
}
