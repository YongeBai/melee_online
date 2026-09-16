import {animationArchives,validateTrack} from './animation-assets.mjs';
export function runTrack(module,track,frames,timeline=null) {
  const stride=timeline?4:2;
  const data=module._malloc(track.bytes.length), out=module._malloc(frames*stride*4);
  if(!data||!out)throw Error('Animation allocation failed');
  let handle=0;
  try {
    module.HEAPU8.set(track.bytes,data);
    handle=module._portAnimationCreate(data,track.bytes.length,track.start,
      track.objType,track.fracValue,track.fracSlope);
    if(!handle)throw Error('Native animation creation failed');
    const run=()=>timeline?module._portAnimationTimeline(handle,timeline.end,timeline.loop,frames,out):
      module._portAnimationRun(handle,frames,out);
    run();
    const values=module.HEAPF32.slice(out/4,out/4+frames*stride);
    if(values.some(x=>!Number.isFinite(x)))throw Error('Nonfinite animation output');
    run();
    const replay=module.HEAPF32.subarray(out/4,out/4+frames*stride);
    if(values.some((x,i)=>!Object.is(x,replay[i])))throw Error('Animation rewind differs');
    return values;
  } finally {if(handle)module._portAnimationDestroy(handle);module._free(out);module._free(data);}
}
export function verifyAnimations(module,files,all=false) {
  // Two linear floating-point keys: value 0 at frame 0, value 10 at frame 10.
  const bytes=new Uint8Array(10), d=new DataView(bytes.buffer);
  bytes[0]=0x12;d.setFloat32(1,0,true);bytes[5]=10;d.setFloat32(6,10,true);
  validateTrack(bytes,0,0);
  const line=runTrack(module,{bytes,start:0,objType:1,fracValue:0,fracSlope:0},12);
  // FObj itself extrapolates; its parent AObj owns clip-end/loop behavior.
  for(let i=0;i<12;i++)if(line[i*2]!==i)throw Error('Linear animation vector mismatch: '+Array.from(line));
  for(const loop of [0,1]) {
    const timeline=runTrack(module,{bytes,start:0,objType:1,fracValue:0,fracSlope:0},32,{end:10,loop});
    for(let i=0;i<32;i++) {
      const expected=loop?i%10:Math.min(i,10);
      if(timeline[i*4]!==expected||timeline[i*4+2]!==expected||timeline[i*4+3]!==(!loop&&i>=10?1:0))
        throw Error('Native animation loop/end mismatch at '+i);
    }
  }
  const results=[];
  for(const {name,bytes} of files) {
    for(const {offset,tree} of animationArchives(bytes,all)) {
    const frames=Math.ceil(tree.frames)+1;
    let updates=0;
    for(const track of tree.tracks) {
      const result=runTrack(module,track,frames,{end:tree.frames,loop:!!(tree.flags&0x20000000)});
      for(let i=1;i<result.length;i+=4)updates+=result[i];
    }
    results.push({name,offset,animation:tree.name,classicalScale:!!(tree.type&1),bones:tree.bones,tracks:tree.tracks.length,
      frames,updates,rewindPassed:true,finiteOutput:true,gameplayParity:false});
    }
  }
  return {linearVector:true,nativeLoopAndEnd:true,allAnimations:all,clips:results};
}
