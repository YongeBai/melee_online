import {referenceFma as fma} from './math-reference.mjs';
import {estimateVectors} from './estimate-vectors.mjs';
const f=Math.fround;
const equal=(a,b,label)=>{if(a.length!==b.length||a.some((x,i)=>!Object.is(x,b[i])))
  throw Error(label+': '+JSON.stringify({actual:a,expected:b}));};
export function verifyMath(module) {
  const storage=module._malloc(256),a=storage,b=a+64,out=b+64,src=out+64,dst=src+16;
  const put=(ptr,values)=>module.HEAPF32.set(values,ptr/4);
  const get=(ptr,count)=>Array.from(module.HEAPF32.subarray(ptr/4,ptr/4+count));
  let seed=17;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return f(((seed%20001)-10000)/997);};
  try {
    for(const [input,expected] of estimateVectors) {
      const view=new DataView(module.HEAPU8.buffer);
      view.setBigUint64(a,BigInt(input),true);
      module._portEstimateBits(a,b);
      if(view.getBigUint64(b,true)!==BigInt(expected))throw Error('Hardware reciprocal-root golden mismatch: '+input);
    }
    module._PSMTXIdentity(out);equal(get(out,12),[1,0,0,0,0,1,0,0,0,0,1,0],'matrix identity');
    module._PSMTXScale(out,2,3,4);equal(get(out,12),[2,0,0,0,0,3,0,0,0,0,4,0],'matrix scale');
    module._PSMTXTrans(out,2,3,4);equal(get(out,12),[1,0,0,2,0,1,0,3,0,0,1,4],'matrix translation');
    for(let iteration=0;iteration<128;iteration++) {
      const ma=Array.from({length:12},random),mb=Array.from({length:12},random),v=Array.from({length:3},random),w=Array.from({length:3},random);
      const product=ma.map((_,i)=> {
        const r=Math.floor(i/4),c=i%4;
        let n=f(mb[c]*ma[r*4]);n=fma(mb[4+c],ma[r*4+1],n);n=fma(mb[8+c],ma[r*4+2],n);
        return c>=2?fma(c===3?1:0,ma[r*4+3],n):n;
      });
      for(const target of [out,a,b]) {
        put(a,ma);put(b,mb);module._PSMTXConcat(a,b,target);
        equal(get(target,12),product,'matrix concatenation/alias');
      }
      put(a,ma);module._PSMTXTranspose(a,a);
      equal(get(a,12),ma.map((_,i)=>i%4===3?0:ma[(i%4)*4+Math.floor(i/4)]),'matrix transpose alias');
      put(a,ma);module._PSMTXCopy(a,out);equal(get(out,12),ma,'matrix copy');
      put(src,v);
      const transformed=[0,1,2].map(r=>f(fma(ma[r*4+2],v[2],f(ma[r*4]*v[0]))+fma(ma[r*4+3],1,f(ma[r*4+1]*v[1]))));
      module._PSMTXMultVec(a,src,src);equal(get(src,3),transformed,'matrix-vector alias');
      put(src,v);module._PSMTXMultVecSR(a,src,dst);
      equal(get(dst,3),[0,1,2].map(r=>fma(ma[r*4+2],v[2],f(f(ma[r*4]*v[0])+f(ma[r*4+1]*v[1])))),'matrix-vector rotation');
      put(src,v);put(dst,w);
      equal([module._PSVECDotProduct(src,dst)],[f(fma(v[0],w[0],f(v[1]*w[1]))+f(v[2]*w[2]))],'vector dot');
      equal([module._PSVECSquareMag(src)],[f(fma(v[2],v[2],f(v[0]*v[0]))+f(v[1]*v[1]))],'vector magnitude square');
      module._PSVECCrossProduct(src,dst,src);
      equal(get(src,3),[fma(v[1],w[2],-f(w[1]*v[2])),-fma(v[0],w[2],-f(w[0]*v[2])),-fma(v[1],w[0],-f(w[1]*v[0]))],'vector cross alias');
      put(src,v);module._PSVECAdd(src,dst,out);equal(get(out,3),v.map((x,i)=>f(x+w[i])),'vector add');
      module._PSVECSubtract(src,dst,out);equal(get(out,3),v.map((x,i)=>f(x-w[i])),'vector subtract');
      module._PSVECScale(src,src,0.5);equal(get(src,3),v.map(x=>f(x*0.5)),'vector scale alias');
      put(src,v);
      const sum=f(fma(v[2],v[2],f(v[0]*v[0]))+f(v[1]*v[1])),estimate=module._portFrsqrte(sum);
      const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,estimate);
      const bits=view.getBigUint64(0);
      view.setBigUint64(0,(bits&0xfffffffff8000000n)+(bits&0x8000000n));
      const rounded=view.getFloat64(0);
      equal([module._portRound25(estimate)],[rounded],'25-bit multiplication operand rounding');
      const factor=f(-fma(f(estimate*rounded),sum,-3)*f(estimate*0.5));
      equal([module._PSVECMag(src)],[f(sum*factor)],'vector magnitude');
      module._PSVECNormalize(src,src);equal(get(src,3),v.map(x=>f(x*factor)),'vector normalization alias');
      if(Math.abs(module._portFres(sum)*sum-1)>0.0005)throw Error('Reciprocal estimate accuracy');
      const stable=ma.map((x,i)=>f(x+([0,5,10].includes(i)?40:0)));
      for(const destination of [out,a]) {
        put(a,stable);
        if(module._PSMTXInverse(a,destination)!==1)throw Error('Invertible matrix rejected');
        const inverse=get(destination,12);
        for(let r=0;r<3;r++)for(let c=0;c<4;c++) {
          let value=c===3?stable[r*4+3]:0;
          for(let k=0;k<3;k++)value+=stable[r*4+k]*inverse[k*4+c];
          if(Math.abs(value-(r===c?1:0))>0.00002)throw Error('Matrix inverse residual: '+value);
        }
      }
      const q=[...v,random()],norm=q.reduce((n,x)=>n+x*x,0),[qx,qy,qz,qw]=q,k=2/norm;
      put(src,q);module._PSMTXQuat(a,src);
      const expectedQuat=[1-k*(qy*qy+qz*qz),k*(qx*qy-qz*qw),k*(qx*qz+qy*qw),0,
        k*(qx*qy+qz*qw),1-k*(qx*qx+qz*qz),k*(qy*qz-qx*qw),0,
        k*(qx*qz-qy*qw),k*(qy*qz+qx*qw),1-k*(qx*qx+qy*qy),0];
      if(get(a,12).some((v,i)=>Math.abs(v-expectedQuat[i])>0.000002))throw Error('Quaternion geometry mismatch');
      const angle=f(0.7),sin=module._sinf(angle),cos=module._cosf(angle),one=1-cos;
      const length=Math.hypot(...v),[nx,ny,nz]=v.map(x=>x/length);
      const expectedAxis=[cos+one*nx*nx,one*nx*ny-sin*nz,one*nx*nz+sin*ny,0,
        one*ny*nx+sin*nz,cos+one*ny*ny,one*ny*nz-sin*nx,0,
        one*nz*nx-sin*ny,one*nz*ny+sin*nx,cos+one*nz*nz,0];
      put(src,v);module._PSMTXRotAxisRad(a,src,angle);
      if(get(a,12).some((v,i)=>Math.abs(v-expectedAxis[i])>0.000002))throw Error('Axis rotation geometry mismatch');
    }
    put(a,Array(12).fill(0));put(out,Array(12).fill(17));
    equal([module._PSMTXInverse(a,out)],[0],'Singular matrix rejection');
    equal(get(out,12),Array(12).fill(17),'Singular inverse preserves destination');
    put(src,[0,0,0]);equal([module._PSVECMag(src)],[0],'zero-vector magnitude');
    // This cancellation distinguishes fused multiplication from two rounded operations.
    put(src,[1+2**-23,1,0]);put(dst,[1-2**-23,-1,0]);
    equal([module._PSVECDotProduct(src,dst)],[-(2**-46)],'fused cancellation');
    // Independent geometric checks for the original C SRT builder, including
    // parent scale compensation. These are tolerance checks, not PPC parity.
    let maxSrtError=0,maxTrigError=0;
    for(let i=0;i<256;i++) {
      const rotation=Array.from({length:3},()=>f(random()*0.3));
      const scale=Array.from({length:3},()=>f(0.5+Math.abs(random())));
      const translation=Array.from({length:3},random);
      const parent=i%2?Array.from({length:3},()=>f(0.5+Math.abs(random()))):[1,1,1];
      for(const angle of rotation) {
        maxTrigError=Math.max(maxTrigError,Math.abs(module._sinf(angle)-Math.sin(angle)),
          Math.abs(module._cosf(angle)-Math.cos(angle)));
      }
      put(a,scale);put(a+16,rotation);put(a+32,translation);put(b,parent);
      module._HSD_MtxSRT(out,a,a+16,a+32,i%2?b:0);
      const [x,y,z]=rotation,[sx,cx,sy,cy,sz,cz]=[module._sinf(x),module._cosf(x),module._sinf(y),module._cosf(y),module._sinf(z),module._cosf(z)];
      const rot=[cy*cz,cz*sx*sy-cx*sz,cz*cx*sy+sx*sz,
        cy*sz,sz*sx*sy+cx*cz,sz*cx*sy-sx*cz,-sy,sx*cy,cx*cy];
      const expected=Array.from({length:12},(_,j)=>j%4===3?translation[Math.floor(j/4)]:
        rot[Math.floor(j/4)*3+j%4]*scale[j%4]*parent[j%4]/parent[Math.floor(j/4)]);
      const actual=get(out,12);
      for(let j=0;j<12;j++) {
        const error=Math.abs(actual[j]-expected[j])/Math.max(1,Math.abs(expected[j]));
        maxSrtError=Math.max(maxSrtError,error);
        if(!Number.isFinite(error)||error>0.00002)throw Error('SRT geometry mismatch: '+JSON.stringify({error,rotation,scale,parent,j,actual:actual[j],expected:expected[j]}));
      }
      module._HSD_MkRotationMtx(out,a+16);
      const rotationOnly=get(out,12);
      if(rotationOnly.some((value,j)=>Math.abs(value-(j%4===3?0:rot[Math.floor(j/4)*3+j%4]))>0.000002))
        throw Error('Rotation geometry mismatch');
    }
    // Original cosf's near-quadrant shortcut uses the reduced y directly,
    // without the pi/4 polynomial factor. Preserve this source behavior.
    const quarter=f(Math.PI/2+0.0001),n=1;
    let reduced=f(quarter-n*2);
    for(const coefficient of [0.25,0.0232393741608,1.70555722434e-7,1.86736494323e-11])
      reduced=f(reduced+f(f(coefficient)*quarter));
    equal([module._cosf(quarter)],[-reduced],'MSL near-quadrant shortcut');
    if(maxTrigError>0.0001)throw Error('MSL trig initialization/accuracy failed');
    // GX projects the near plane to -1 and the far plane to 0. The future
    // WebGL boundary must remap depth without changing x/y or the camera.
    const close=(actual,expected,label)=>{
      if(!Number.isFinite(actual)||Math.abs(actual-expected)>0.000002*Math.max(1,Math.abs(expected)))
        throw Error(label+': '+actual+' != '+expected);
    };
    for(const fov of [30,45,60])for(const near of [0.1,1]) {
      const far=1000,aspect=f(4/3),n=f(near),angle=f(f(fov*0.5)*f(0.017453293));
      module._MTXPerspective(a,fov,aspect,n,far);
      const m=get(a,16),cot=1/(module._sinf(angle)/module._cosf(angle));
      close(m[0],cot/aspect,'Perspective 4:3 aspect');close(m[5],cot,'Perspective FOV');
      close((m[10]*(-n)+m[11])/n,-1,'Perspective near depth');
      close((m[10]*(-far)+m[11])/far,0,'Perspective far depth');
      module._MTXFrustum(a,n,-n,-n*aspect,n*aspect,n,far);
      const frustum=get(a,16);close(frustum[0],1/aspect,'Frustum aspect');close(frustum[5],1,'Frustum FOV');
      close((frustum[10]*(-n)+frustum[11])/n,-1,'Frustum near depth');
      close((frustum[10]*(-far)+frustum[11])/far,0,'Frustum far depth');
      module._MTXOrtho(a,3,-3,-4,4,n,far);
      const ortho=get(a,16);close(ortho[0]*4,1,'Ortho right edge');close(ortho[5]*3,1,'Ortho top edge');
      close(ortho[10]*(-n)+ortho[11],-1,'Ortho near depth');close(ortho[10]*(-far)+ortho[11],0,'Ortho far depth');
    }
    // Camera at +Z looking at the origin: no arbitrary pitch or yaw offset.
    put(src,[0,0,10]);put(dst,[0,1,0]);put(b,[0,0,0]);
    module._C_MTXLookAt(a,src,dst,b);
    get(a,12).forEach((value,i)=>close(value,[1,0,0,0,0,1,0,0,0,0,1,-10][i],'Look-at basis'));
    for(const axis of ['x','y','z','X','Y','Z']) {
      module._MTXRotRad(a,axis.charCodeAt(0),0);
      get(a,12).forEach((value,i)=>close(value,[1,0,0,0,0,1,0,0,0,0,1,0][i],'Axis rotation identity'));
    }
    // Texture coordinates have inverse scaling and a mirror-specific T offset.
    for(const wrap of [0,1,2]) {
      put(a,[0,0,0,2,4,1,0.25,0.5,0]);
      if(module._portTextureMatrix(a,4,2,wrap,out)!==0)throw Error('Texture matrix rejected');
      get(out,12).forEach((v,i)=>close(v,[2,0,0,-0.5,0,0.5,0,wrap===2?-1.25:-0.25,0,0,1,0][i],'Texture scale/wrap'));
    }
    const angle=f(0.7),tc=module._cosf(angle),ts=module._sinf(angle);
    put(a,[0,0,angle,1,1,1,0,0,0]);module._portTextureMatrix(a,1,1,0,out);
    get(out,12).forEach((v,i)=>close(v,[tc,ts,0,0,-ts,tc,0,0,0,0,1,0][i],'Texture rotation sign'));
    put(a,[0,0,0,0,0,1,0,0,0]);module._portTextureMatrix(a,1,1,2,out);
    get(out,12).forEach((v,i)=>close(v,[0,0,0,0,0,0,0,0,0,0,1,0][i],'Zero texture scale'));
    if(module._portTextureMatrix(a,0,1,0,out)!==-1)throw Error('Zero texture repeat accepted');
    return {passed:true,cases:128,estimateGoldenCases:estimateVectors.length,normalizationCases:128,textureMatrixCases:6,
      projectionCases:18,lookAtCases:1,
      quaternionCases:128,inverseCases:256,axisRotationCases:128,
      fusedCancellation:true,inPlaceAliases:true,srtCases:256,maxSrtError,maxTrigError,
      oracle:'Exact BigInt binary32 arithmetic applied in SDK instruction order',
      limitations:'Finite normal input corpus; not Dolphin gameplay parity or FPSCR/denormal validation'};
  } finally {module._free(storage);}
}
