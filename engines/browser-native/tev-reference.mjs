// Test oracle only: scalar arithmetic, independent of GLSL expression emission.
// GX TEV semantics/provenance: TEV-NOTES.md, GPL-2.0-or-later.
import {explicitTevStages} from './native-tev.mjs';
const fractions=[255,223,191,159,128,96,64,32];
const swaps=[[0,1,2,3],[0,0,0,3],[1,1,1,3],[2,2,2,3]];
export function evaluateTev(program,textures,rasters,{swapTable=swaps}={}) {
  const stages=explicitTevStages(program.stages),r=program.registers.map(v=>v.slice());
  const constant=(selector,channel)=>selector<8?fractions[selector]:selector<12?0:selector<16?
    channel===3?0:program.konst[selector-12][channel]:program.konst[selector%4][Math.floor((selector-16)/4)];
  let output;
  for(const [index,s] of stages.entries()) {
    const t=swapTable[s[23]].map(c=>textures[index][c]),v=swapTable[s[22]].map(c=>rasters[index][c]);
    const k=[0,1,2,3].map(c=>constant(c===3?s[25]:s[24],c));
    const colors=[r[0],Array(3).fill(r[0][3]),r[1],Array(3).fill(r[1][3]),r[2],Array(3).fill(r[2][3]),r[3],Array(3).fill(r[3][3]),
      t,Array(3).fill(t[3]),v,Array(3).fill(v[3]),[255,255,255],[128,128,128],k,[0,0,0]];
    const alpha=[...r.map(v=>v[3]),t[3],v[3],k[3],0];
    const inputs=[0,1,2,3].map(i=>[...colors[s[9+i]].slice(0,3),alpha[s[18+i]]].map(x=>i<3?((x%256)+256)%256:x));
    const [a,b,c,d]=inputs;
    output=d.map((value,channel)=>{
      const at=channel===3?13:4,op=s[at],scale=s[at+2];let n;
      if(op<2) {
        const factor=scale===3?1:2**scale;
        const weight=(c[channel]+Math.floor(c[channel]/128))/256;
        const interpolated=Math.floor(((1-weight)*a[channel]+weight*b[channel])*factor+(scale===3?0:op?127/256:0.5));
        n=(value+[0,128,-128][s[at+1]])*factor+(op?-interpolated:interpolated);
        if(scale===3)n=Math.floor(n/2);
      } else {
        const mode=Math.floor((op-8)/2),pack=v=>mode===3?v[channel]:v.slice(0,mode+1).reduce((sum,x,i)=>sum+x*256**i,0);
        const av=pack(a),bv=pack(b),condition=op%2?av===bv:av>bv;
        n=value+(condition?c[channel]:0);
      }
      return Math.min(s[at+3]?255:1023,Math.max(s[at+3]?0:-1024,n));
    });
    r[s[8]].splice(0,3,...output.slice(0,3));r[s[17]][3]=output[3];
  }
  return output;
}

export function tevTestStage({color=[15,8,10,15],alpha=[7,4,5,7],op=0,bias=0,scale=0,clamp=1,out=0,alphaOp=op}={}) {
  const s=Array(32).fill(0);s.splice(0,4,0,0,4,-1);s.splice(4,9,op,bias,scale,clamp,out,...color);
  s.splice(13,9,alphaOp,bias,scale,clamp,out,...alpha);return s;
}
export function tevTestPrograms() {
  const rows=[],add=(name,stages)=>rows.push({name,stages});
  for(const op of [0,1])for(const bias of [0,1,2])for(const scale of [0,1,2,3])for(const clamp of [0,1])
    add(`arithmetic ${op}/${bias}/${scale}/${clamp}`,[tevTestStage({op,bias,scale,clamp,color:[2,4,8,6],alpha:[1,2,4,3]})]);
  for(let op=8;op<16;op++)for(let clamp=0;clamp<2;clamp++)
    add(`compare ${op}/${clamp}`,[tevTestStage({op,clamp,color:[2,4,8,6],alpha:[1,2,4,3]})]);
  for(let alphaOp=8;alphaOp<16;alphaOp++)add(`alpha compare after color writes ${alphaOp}`,[tevTestStage({alphaOp,color:[2,4,8,6],alpha:[1,2,4,3],out:1})]);
  for(let color=0;color<16;color++)for(const pos of [0,1,2,3]) {
    const s=tevTestStage();s[9+pos]=color;s[18+pos]=color%8;
    add(`selector ${color}/${pos}`,[s]);
  }
  for(let selector=0;selector<32;selector++) {
    const s=tevTestStage({color:[15,15,15,14],alpha:[7,7,7,6]});s[24]=s[25]=selector;
    add(`constant ${selector}`,[s]);
  }
  for(let swap=0;swap<4;swap++) {const s=tevTestStage();s[22]=swap;s[23]=3-swap;add(`swap ${swap}`,[s]);}
  for(let mode=0;mode<5;mode++) {const s=tevTestStage();s[3]=mode;add(`preset ${mode}`,[s]);add(`later preset ${mode}`,[tevTestStage(),s]);}
  for(let dest=0;dest<4;dest++) {
    const s=tevTestStage({color:[15,15,15,1],alpha:[7,7,7,1],out:dest});s[17]=3-dest;
    add(`read before write and final destination ${dest}`,[s]);
  }
  add('sixteen dependent stages',Array.from({length:16},(_,i)=>tevTestStage({color:[0,2,8,6],alpha:[0,1,4,3],out:i%4,clamp:i%2,scale:i%4})));
  return rows;
}

export function tevTestInputs(count,seed) {
  let state=seed>>>0;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  const edges=[-1024,-1023,-256,-129,-128,-1,0,1,31,127,128,129,223,254,255,256,511,1023];
  const vector=signed=>Array.from({length:4},()=>signed?edges[next()%edges.length]:next()>>>24);
  return {registers:Array.from({length:4},()=>vector(true)),konst:Array.from({length:4},()=>vector(false)),
    textures:Array.from({length:count},()=>vector(false)),rasters:Array.from({length:count},()=>vector(false))};
}
