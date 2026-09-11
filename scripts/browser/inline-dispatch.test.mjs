import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual inline dispatch rejects collisions, flag changes and invalidated entries',()=>{
  const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
  const start=source.indexOf('static inline const u8* LookupBrowserCachedBlock('),end=source.indexOf('\n#endif',start);
  assert.ok(start>0&&end>start);
  const method=source.slice(start,end),dir=mkdtempSync(join(tmpdir(),'melee-dispatch-'));
  try {
    const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
    writeFileSync(cpp,`
#include <cstdint>
#include <cstddef>
#include <cassert>
#include <array>
#include <vector>
using u32=uint32_t;using u8=uint8_t;using CPUEmuFeatureFlags=u32;
struct JitBlock {u32 effectiveAddress,feature_flags;const u8* normalEntry;};
struct JitBaseBlockCache {static constexpr size_t FAST_BLOCK_MAP_FALLBACK_MASK=(1u<<18)-1;};
${method}
int main(){
 std::vector<JitBlock*> map(1u<<18,nullptr);std::array<u8,4> entries{};u32 rng=98765;
 auto random=[&](){rng=rng*1664525+1013904223;return rng;};
 for(int i=0;i<200000;i++){
   u32 pc=random()&~3u,flags=random()&7,index=(pc>>2)&JitBaseBlockCache::FAST_BLOCK_MAP_FALLBACK_MASK;
   JitBlock b{pc,flags,&entries[0]},collision{pc^(1u<<20),flags,&entries[1]};
   assert(LookupBrowserCachedBlock(map.data(),pc,flags)==nullptr);
   map[index]=&b;assert(LookupBrowserCachedBlock(map.data(),pc,flags)==&entries[0]);
   // PC aliases have the same array index but must go to the slow path.
   map[index]=&collision;assert(LookupBrowserCachedBlock(map.data(),pc,flags)==nullptr);
   map[index]=&b;assert(LookupBrowserCachedBlock(map.data(),pc,flags^1)==nullptr);
   b.feature_flags^=1;assert(LookupBrowserCachedBlock(map.data(),pc,flags)==nullptr);
   b.feature_flags=flags;b.normalEntry=&entries[2];
   assert(LookupBrowserCachedBlock(map.data(),pc,flags)==&entries[2]);
   // Code invalidation and cache clear remove the live map entry. No copy is retained.
   map[index]=nullptr;assert(LookupBrowserCachedBlock(map.data(),pc,flags)==nullptr);
 }
}
`);
    execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});
    execFileSync(exe,[],{stdio:'pipe'});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
