import {convertStageCollision, loadStageCollision} from './stage-collision.mjs';
import {verifyRuntime} from './verify-runtime.mjs';
import {verifyFighters} from './verify-fighters.mjs';
import {verifyAnimations} from './verify-animations.mjs';
import {verifyMath} from './verify-math.mjs';
import {verifyPoses} from './verify-poses.mjs';
import {verifyMeshes} from './verify-meshes.mjs';
const equal=(a,b,message)=>{if(a.length!==b.length || a.some((x,i)=>!Object.is(x,b[i])))
  throw Error(message+': '+JSON.stringify({actual:a,expected:b}));};
const stageKinds={'GrNBa.dat':36,'GrNLa.dat':37,'GrOp.dat':28,'GrSt.dat':10,'GrIz.dat':12,'GrPs.usd':16};
function referencePrune(image) {
  const bytes=image.slice(), v=new DataView(bytes.buffer), root=32;
  const verts=root+v.getUint32(root,true), lines=root+v.getUint32(root+8,true), count=v.getInt32(root+12,true);
  let empty=0;
  for(let i=0;i<count;i++) {
    const line=lines+i*16, a=verts+v.getUint16(line,true)*8, b=verts+v.getUint16(line+2,true)*8;
    if(v.getFloat32(a,true)!==v.getFloat32(b,true)||v.getFloat32(a+4,true)!==v.getFloat32(b+4,true))continue;
    empty++;
    for(let j=0;j<count;j++)for(const field of [4,6,8,10]) {
      const at=lines+j*16+field;
      if(v.getInt16(at,true)===i)v.setInt16(at,v.getInt16(line+(field===4||field===8?4:6),true),true);
    }
    v.setUint16(line+12,v.getUint16(line+12,true)|128,true);
    for(const field of [4,6,8,10])v.setInt16(line+field,-1,true);
  }
  return {lines:bytes.slice(lines,lines+count*16),empty};
}
export async function verifyNative(module, stageFiles=[], fighterFiles=[], animationFiles=[],options={}) {
  let seed=0x12345678;
  module._portSeed(seed);
  for(let i=0;i<4096;i++) {
    seed=(Math.imul(seed,214013)+2531011)>>>0;
    equal([module._portRandom()],[seed>>>16],'RNG mismatch');
  }
  const storage=module._malloc(41*4), result=storage+24*4;
  const f=Math.fround;
  let vectors=0;
  try {
    for(const time of [0,0.125,0.5,1,1.25]) for(const override of [false,true]) {
      const current=[-8,4,0,-2,-3,-1,3,1], desired=[-3,6,1,-5,-7,2,8,4], reset=[0,1,2,3,4,5,6,7];
      module.HEAPF32.set([...current,...desired,...reset],storage/4);
      module._portInterpolate(storage,storage+32,override?storage+64:0,time,result);
      const from=override?reset:current;
      const expected=from.map((v,i)=>f(v+f(f(time)*f(desired[i]-v))));
      equal(Array.from(module.HEAPF32.subarray(result/4,result/4+17)),[...expected,...current,0],'ECB mismatch');
      vectors++;
    }
  } finally {module._free(storage);}
  const stages=[];
  for(const {name,bytes} of stageFiles) {
    const converted=convertStageCollision(bytes), loaded=loadStageCollision(module,converted);
    try {
      equal(loaded.metrics(),converted.metrics,'Stage ABI mismatch: '+name);
      const kind=stageKinds[name];
      if(kind===undefined)throw Error('Stage kind not mapped: '+name);
      const expected=referencePrune(converted.image);
      module._portStagePrune(loaded.pointer,kind);
      const memory=new DataView(module.HEAPU8.buffer), lines=memory.getUint32(loaded.pointer+8,true);
      equal(Array.from(module.HEAPU8.subarray(lines,lines+expected.lines.length)),Array.from(expected.lines),
        'Native collision pruning mismatch: '+name);
      stages.push({name,vertices:converted.metrics[0],lines:converted.metrics[1],joints:converted.metrics[2],
        convertedBytes:converted.dataBytes,abiPassed:true,pruningPassed:true,emptyLines:expected.empty});
    } finally {loaded.dispose();}
    // Real tournament data has no empty lines here. Inject one into a private
    // copy so verification also exercises native rewiring, not only its no-op path.
    const altered={...converted,image:converted.image.slice()}, v=new DataView(altered.image.buffer);
    const verts=32+v.getUint32(32,true), lines=32+v.getUint32(40,true);
    const first=verts+v.getUint16(lines,true)*8, second=verts+v.getUint16(lines+2,true)*8;
    altered.image.copyWithin(second,first,first+8);
    const expected=referencePrune(altered.image);
    if(!expected.empty)throw Error('Degenerate-line test did not exercise pruning');
    const mutation=loadStageCollision(module,altered);
    try {
      const memory=new DataView(module.HEAPU8.buffer), at=memory.getUint32(mutation.pointer+8,true);
      const before=module.HEAPU8.slice(at,at+expected.lines.length);
      module._portStagePrune(mutation.pointer,17); // Original Poke Floats exemption.
      equal(Array.from(module.HEAPU8.subarray(at,at+before.length)),Array.from(before),'Poke Floats exemption');
      module._portStagePrune(mutation.pointer,stageKinds[name]);
      equal(Array.from(module.HEAPU8.subarray(at,at+expected.lines.length)),Array.from(expected.lines),'Degenerate line rewiring');
      stages.at(-1).degenerateLineCasePassed=true;
    } finally {mutation.dispose();}
  }
  const runtime=verifyRuntime(module);
  const fighters=verifyFighters(module,fighterFiles);
  const animations=verifyAnimations(module,animationFiles,!!options.allAnimations);
  const math=verifyMath(module);
  const poses=verifyPoses(module,options.models||[],animationFiles);
  const meshes=verifyMeshes(module,options.models||[],animationFiles);
  return {passed:true,rngValues:4096,ecbVectors:vectors,stages,runtime,fighters,animations,math,poses,meshes,emulator:false,
    playable:false,gameplayParity:false,performanceMeasured:false};
}
