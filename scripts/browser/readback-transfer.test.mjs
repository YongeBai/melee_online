import test from 'node:test';
import assert from 'node:assert/strict';
import {patchReadbackTransfer} from './patch-readback-transfer.mjs';
const source=`return (x,y,width,height,format,type,pixels)=>{if(GLctx.currentPixelPackBufferBinding){GLctx.readPixels(x,y,width,height,format,type,pixels);return}var heap=heapObjectForWebGLType(type);var target=toTypedArrayIndex(pixels,heap);GLctx.readPixels(x,y,width,height,format,type,heap,target);return};`;
function fixture({pack=0,pbo=0,fail=false}={}) {
  const bytes=960*720*4,heap=new Uint8Array(new SharedArrayBuffer(bytes+32)).fill(31),module={},calls=[];
  const gl={currentPixelPackBufferBinding:pbo,getParameter:()=>pack,readPixels(...args){calls.push(args);if(fail)throw Error('driver failure');const dest=args[6];if(ArrayBuffer.isView(dest))dest.fill(77,args[7]||0,(args[7]||0)+bytes);}};
  const run=new Function('GLctx','Module','heapObjectForWebGLType','toTypedArrayIndex',patchReadbackTransfer(source))(gl,module,()=>heap,x=>x);
  return {run,heap,module,calls,bytes};
}
test('frame staging uses bounded nonshared storage, reuses it and preserves destination guards',()=>{
  const f=fixture();f.run(0,0,960,720,6408,5121,16);
  assert.ok(f.calls[0][6].buffer instanceof ArrayBuffer);assert.equal(f.calls[0][6].length,f.bytes);
  assert.ok(f.heap.subarray(0,16).every(x=>x===31));assert.ok(f.heap.subarray(16,16+f.bytes).every(x=>x===77));assert.ok(f.heap.subarray(16+f.bytes).every(x=>x===31));
  const scratch=f.module._meleeReadbackScratch;f.run(0,0,960,720,6408,5121,16);assert.equal(f.module._meleeReadbackScratch,scratch);
});
test('PBO and nondefault pack layouts retain Emscripten calls',()=>{
  const p=fixture({pbo:1});p.run(0,0,960,720,6408,5121,16);assert.equal(p.calls[0][6],16);assert.equal(p.module._meleeReadbackScratch,undefined);
  const f=fixture({pack:1});f.run(0,0,960,720,6408,5121,16);assert.equal(f.calls[0][6],f.heap);assert.equal(f.calls[0][7],16);
});
test('failed readback leaves shared destination unchanged and unexpected glue is rejected',()=>{
  const f=fixture({fail:true});assert.throws(()=>f.run(0,0,960,720,6408,5121,16),/driver/);assert.ok(f.heap.every(x=>x===31));
  assert.throws(()=>patchReadbackTransfer('unexpected glue'));assert.throws(()=>patchReadbackTransfer(source+source));
});
