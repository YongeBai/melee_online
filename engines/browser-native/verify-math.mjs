import {referenceFma as fma} from './math-reference.mjs';
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
    module._PSMTXIdentity(out);equal(get(out,12),[1,0,0,0,0,1,0,0,0,0,1,0],'matrix identity');
    module._PSMTXScale(out,2,3,4);equal(get(out,12),[2,0,0,0,0,3,0,0,0,0,4,0],'matrix scale');
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
    }
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
    return {passed:true,cases:128,fusedCancellation:true,inPlaceAliases:true,srtCases:256,maxSrtError,maxTrigError,
      oracle:'Exact BigInt binary32 arithmetic applied in SDK instruction order',
      limitations:'Finite normal input corpus; not Dolphin gameplay parity or FPSCR/denormal validation'};
  } finally {module._free(storage);}
}
