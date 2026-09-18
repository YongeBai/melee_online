import test from 'node:test';
import assert from 'node:assert/strict';
import {gxTextureLod,readNativeTextures,createNativeTextureReader,decodeNativeTexture} from '../../engines/browser-native/native-texture.mjs';
function fixture() {
  const heap=new Uint8Array(8192),words=new Uint32Array(heap.buffer,64,724),floats=new Float32Array(heap.buffer,64,724);
  words.set([1,1,1024,1]);words.set([4096,2,2,0,0,0,0,0xffffffff,1,1,0,0,0,0,0,0],4);words[4+23]=1;
  words.set([1,4,60,0,64,0],196);words.set([64,0,0,0],244+10*16);floats.set([1,0,0,0,0,1,0,0,0,0,1,0],244+10*16+4);
  heap[4096]=0xf8;heap[4100]=0x40;
  return {heap,words,floats,module:{HEAPU8:heap,_portMaterialTextureState:()=>64}};
}
test('native texture capture decodes runtime bytes and preserves original texgen matrices',()=>{
  const f=fixture(),s=readNativeTextures(f.module),levels=decodeNativeTexture(f.module,s.textures[0]);
  assert.deepEqual(s.generators,[{id:0,type:1,source:4,matrix:60,normalize:0,postMatrix:64}]);
  assert.deepEqual(s.matrices,[{id:64,type:0,values:[1,0,0,0,0,1,0,0,0,0,1,0]}]);
  assert.deepEqual(Array.from(levels[0].pixels),[255,255,255,255,136,136,136,136,68,68,68,68,0,0,0,0]);
  f.heap[4096]=0;assert.equal(levels[0].pixels[0],255);assert.equal(decodeNativeTexture(f.module,s.textures[0])[0].pixels[0],0);
});
test('runtime indexed palette selection remains big endian and owned after decode',()=>{
  const f=fixture();f.words[4+3]=9;f.words[4+7]=0;f.words[4+13]=7000;f.words[4+14]=1;f.words[4+15]=2;
  f.heap.fill(0,4096,4128);f.heap.set([0xf8,0,0,0x1f],7000);f.heap[4097]=1;
  const s=readNativeTextures(f.module),p=decodeNativeTexture(f.module,s.textures[0])[0].pixels;
  assert.deepEqual(Array.from(p.slice(0,8)),[255,0,0,255,0,0,255,255]);
});
test('mipmap levels use GX tile allocation rather than contiguous decoded pixels',()=>{
  const f=fixture();f.words[4+6]=1;f.floats[4+17]=1;f.heap[4128]=0xa0;
  const levels=decodeNativeTexture(f.module,readNativeTextures(f.module).textures[0]);
  assert.equal(levels.length,2);assert.deepEqual([levels[1].width,levels[1].height],[1,1]);assert.deepEqual(Array.from(levels[1].pixels),[170,170,170,170]);
});
test('SDK LOD quantization retains signed bias and clamps representable limits',()=>{
  assert.deepEqual(gxTextureLod(-1,12,-5),{min:0,max:10,bias:-4});
  assert.deepEqual(gxTextureLod(1.12,3.99,4),{min:1.0625,max:3.9375,bias:3.96875});
  assert.deepEqual(gxTextureLod(0,0,-0.1),{min:0,max:0,bias:-0.09375});
  assert.throws(()=>gxTextureLod(0,NaN,0),/nonfinite/);
});
test('native texture boundary rejects malformed masks, missing matrices and image memory',()=>{
  for(const [index,value] of [[0,256],[1,2],[2,0],[3,9],[4+1,0],[4+4,3],[4+23,0],[196+3,2]]) {
    const f=fixture();f.words[index]=value;assert.throws(()=>readNativeTextures(f.module),/Native|texture/);
  }
  const f=fixture(),t=readNativeTextures(f.module).textures[0];t.address=8190;assert.throws(()=>decodeNativeTexture(f.module,t),/memory bounds/);
});
test('texgen enable count preserves initialized registers across particle mode changes',()=>{
  const f=fixture();f.words[3]=0;
  assert.deepEqual(readNativeTextures(f.module).generators,[]);
  f.words[3]=1;assert.equal(readNativeTextures(f.module).generators.length,1);
  f.words[1]=0;assert.throws(()=>readNativeTextures(f.module),/resource masks/);
});

test('renderer-local texture reader rebinds after memory growth and pointer changes',()=>{
  const f=fixture(),read=createNativeTextureReader(f.module);assert.deepEqual(read(),readNativeTextures(f.module));
  const grown=new Uint8Array(16384);grown.set(f.module.HEAPU8);f.module.HEAPU8=grown;new Uint32Array(grown.buffer,64,724)[4+1]=4;assert.equal(read().textures[0].width,4);
  grown.copyWithin(8256,64,64+2896);f.module._portMaterialTextureState=()=>8256;new Uint32Array(grown.buffer,8256,724)[4+2]=4;assert.equal(read().textures[0].height,4);
  f.module._portMaterialTextureState=()=>16380;assert.throws(read,/bounds/);
  const uncached=createNativeTextureReader({...f.module,_portMaterialTextureState:()=>8256},{cacheView:false});assert.equal(uncached().textures[0].height,4);
});

test('an actually selected out-of-heap particle palette fails before texture decoding',()=>{
  const f=fixture(),t={...readNativeTextures(f.module).textures[0],format:9,paletteAddress:1120+0x80a8812a,paletteEntries:256,paletteFormat:2};
  assert.throws(()=>decodeNativeTexture(f.module,t),/memory bounds/);
});
