import test from 'node:test';
import assert from 'node:assert/strict';
import {gxAlphaTest,gxAlphaTestRejectsAny,readNativePixel,createNativePixelReader} from '../../engines/browser-native/native-pixel.mjs';
import {verifyNativePixel} from '../../engines/browser-native/verify-material-state.mjs';
function fixture() {
  const heap=new Uint8Array(512),w=new Uint32Array(heap.buffer,64,80);
  w.set([511,1,0,4,5,15,1,3,1,1,1,0,0,0,0,7,0,0,7,0,5,0,5]);w.fill(255,68,72);
  return {w,module:{HEAPU8:heap,_portMaterialPixelState:()=>64}};
}
test('captured default material state preserves opaque and alpha/depth policies',()=>{
  const f=fixture(),p=readNativePixel(f.module);verifyNativePixel({renderMode:0,pixelEngine:null},p);
  f.w[2]=1;f.w[9]=0;f.w[15]=4;f.w[18]=4;verifyNativePixel({renderMode:0x40000000},readNativePixel(f.module));
  f.w[8]=0;f.w[9]=1;f.w[15]=7;f.w[18]=7;verifyNativePixel({renderMode:0x60000000},readNativePixel(f.module));
  assert.equal(p.blend.type,0);assert.equal(p.depth.update,1);
});
test('custom original pixel descriptor is checked field-for-field',()=>{
  const f=fixture();f.w.set([3,1,0,6],2);f.w.set([1,5,0,1,1,1,1,99,1,2,100,2,6,200],6);
  const descriptor=Uint8Array.from([95,100,200,99,3,1,0,6,5,2,2,6]);
  verifyNativePixel({renderMode:0,pixelEngine:descriptor},readNativePixel(f.module));
  descriptor[6]=1;assert.throws(()=>verifyNativePixel({renderMode:0,pixelEngine:descriptor},readNativePixel(f.module)),/blend/);
});
test('renderer pixel reader reuses equal state without aliasing queued native writes',()=>{
  const f=fixture(),read=createNativePixelReader(f.module),first=read();
  assert.equal(read(),first);
  f.w[68]=123;const second=read();assert.notEqual(second,first);
  assert.equal(first.colors[0].material[0],255);assert.equal(second.colors[0].material[0],123);
  assert.deepEqual(second,readNativePixel(f.module));assert.equal(read(),second);
  // A relocated or grown WASM memory must be read anew, even at the same offset.
  const grown=new Uint8Array(1024);grown.set(f.module.HEAPU8);f.module.HEAPU8=grown;
  assert.equal(read(),second);new Uint32Array(grown.buffer,64,80)[68]=42;
  const third=read();assert.equal(third.colors[0].material[0],42);assert.equal(second.colors[0].material[0],123);
  // One renderer's cache and the uncached public snapshots remain independent.
  const independent=createNativePixelReader(f.module)();assert.notEqual(independent,third);
  const publicSnapshot=readNativePixel(f.module);publicSnapshot.colors[0].material[0]=0;
  assert.equal(read().colors[0].material[0],42);
});
test('renderer pixel reader validates changed data and does not cache a failure',()=>{
  const f=fixture(),read=createNativePixelReader(f.module),valid=read();
  f.w[68]=256;assert.throws(read,/color/);assert.throws(read,/color/);
  f.w[68]=255;assert.equal(read(),valid);
  f.module._portMaterialPixelState=()=>0;assert.throws(read,/bounds/);
});
test('GX alpha functions and logical combinations preserve exact thresholds',()=>{
  const expected=[[],[0,127],[128],[0,127,128],[129,255],[0,127,129,255],[128,129,255],[0,127,128,129,255]];
  for(let compare=0;compare<8;compare++)for(const alpha of [0,127,128,129,255]) {
    const s={compare0:compare,reference0:128,operation:0,compare1:7,reference1:0};
    assert.equal(gxAlphaTest(alpha,s),expected[compare].includes(alpha));
  }
  for(const a of [false,true])for(const b of [false,true])for(let op=0;op<4;op++) {
    const truth=[[false,false,false,true],[false,true,true,false],[false,true,true,false],[true,true,false,true]][Number(a)*2+Number(b)][op];
    assert.equal(gxAlphaTest(128,{compare0:a?7:0,reference0:0,operation:op,compare1:b?7:0,reference1:0}),truth);
  }
  assert.throws(()=>gxAlphaTest(256,{compare0:7,reference0:0,operation:0,compare1:7,reference1:0}),/input/);
});
test('pixel snapshot rejects incomplete state, invalid channels and unavailable colors',()=>{
  for(const [index,value] of [[0,255],[1,3],[2,4],[7,8],[10,2],[16,256],[17,4],[20,16],[22,0],[32,2],[68,256]]) {
    const f=fixture();f.w[index]=value;assert.throws(()=>readNativePixel(f.module),/Native|native/);
  }
});
test('alpha rejection classifier matches all 256 inputs for every comparison and combination',()=>{
  for(let compare0=0;compare0<8;compare0++)for(let compare1=0;compare1<8;compare1++)for(let operation=0;operation<4;operation++)
    for(const reference0 of [0,1,2,63,127,128,254,255])for(const reference1 of [0,1,2,63,127,128,254,255]){
      const state={compare0,compare1,operation,reference0,reference1};
      let rejects=false;for(let alpha=0;alpha<256;alpha++)if(!gxAlphaTest(alpha,state)){rejects=true;break;}
      assert.equal(gxAlphaTestRejectsAny(state),rejects,JSON.stringify(state));
    }
});
