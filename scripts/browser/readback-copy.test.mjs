import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('actual native RGBA copy preserves every channel, opacity, row orientation and resize fallback',()=>{
  const source=fs.readFileSync(new URL('../../engines/wasm-dolphin/core/upstream/dolphin_web_discio.cpp',import.meta.url),'utf8');
  const begin=source.indexOf('void CopyRgbaToPresentationBuffer('),end=source.indexOf('\nvoid PublishFrameSignal()',begin);
  assert.ok(begin>0&&end>begin);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'melee-rgba-'));
  try{
    fs.writeFileSync(path.join(dir,'test.cpp'),`#include <array>
#include <cstdint>
#include <cstring>
#include <vector>
std::array<std::uint32_t, 960*720> s_framebuffer;
${source.slice(begin,end)}
int main() {
  for (auto dimensions : {std::array<int,4>{960,720,960,720}, {7,3,7,3}, {9,5,4,2}, {4,2,9,5}}) {
    const auto [w,h,tw,th] = dimensions;
    std::vector<std::uint8_t> rgba(w*h*4+1);
    // Misaligned input and non-opaque alpha exercise byte-copy correctness.
    for (int i=0;i<w*h*4;i++) rgba[i+1]=(i*97+i/13)%256;
    CopyRgbaToPresentationBuffer(rgba.data()+1,w,h,tw,th);
    for(int y=0;y<th;y++) for(int x=0;x<tw;x++) {
      const int sy=h-1-y*h/th, sx=x*w/tw, p=1+(sy*w+sx)*4;
      const std::uint32_t expected=0xff000000u|rgba[p]|(rgba[p+1]<<8)|(rgba[p+2]<<16);
      if(s_framebuffer[y*tw+x]!=expected) return 1;
    }
  }
}
`);
    const binary=path.join(dir,'test');
    const build=spawnSync('c++',['-std=c++17','-O2',path.join(dir,'test.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(build.status,0,build.stderr||build.error?.message);
    assert.equal(spawnSync(binary).status,0,'Native output differs from byte-wise reference');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
