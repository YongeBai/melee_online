import {uploadMesh} from './gpu-mesh.mjs';
export function verifyGpuConventions(gl,pipeline) {
  // A clockwise triangle and hand-specified GX clip depths, independent of
  // asset decoding and native camera builders. Readback catches cull reversal
  // and a missing [-1,0] -> [-1,+1] depth conversion.
  const positions=Float32Array.from([-0.8,-0.8,0,0,0.8,0,0.8,-0.8,0]);
  const model={totalVertices:3,meshes:[{joint:0,flags:0x8000,material:0,
    vertices:Array.from({length:3},()=>({})),triangles:[0,1,2]}]};
  const skin={positions,indices:new Uint32Array(3),groupCount:1};
  const gpu=uploadMesh(gl,pipeline,model,skin,{materials:new Map([[0,{texture:null}]])},new Map());
  const identity=Float32Array.from([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const matrix=Float32Array.from([1,0,0,0,0,1,0,0,0,0,1,-0.5]),pixel=new Uint8Array(4),cases=[];
  try {
    for(const [name,cull,depth,hidden,visible] of [
      ['clockwise front',0x8000,-0.5,0,true],['cull front',0x4000,-0.5,0,false],
      ['GX far clip',0x8000,0.25,0,false],['GX near clip',0x8000,-1.25,0,false],
      ['hidden joint',0x8000,-0.5,16,false]]) {
      gpu.draws[0].flags=cull;matrix[11]=depth;gpu.updatePalette(matrix);
      gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.clearColor(0,0,0,1);gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gpu.draw(identity,identity,Uint32Array.of(hidden));
      gl.readPixels(gl.drawingBufferWidth>>1,gl.drawingBufferHeight>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const expected=visible?[255,255,255,255]:[0,0,0,255];
      if(pixel.some((v,i)=>v!==expected[i])||gl.getError()!==gl.NO_ERROR)throw Error('GPU convention failed: '+name+' '+pixel);
      cases.push(name);
    }
    return {passed:true,cases};
  } finally {gpu.dispose();}
}
