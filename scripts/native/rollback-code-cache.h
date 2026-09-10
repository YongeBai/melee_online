// Retain compiled blocks across rollback only when their source bytes are unchanged.
#pragma once
#include <cstring>
#include <vector>
#include "Common/RangeSet.h"
#include "Core/Core.h"
#include "Core/System.h"
#include "Core/HW/Memmap.h"
#include "Core/PowerPC/PowerPC.h"
#include "Core/PowerPC/JitInterface.h"
#include "Core/PowerPC/JitCommon/JitCache.h"
#include "Core/MeleeRollback.h"
namespace MeleeBridge {
inline bool CoherentInstructionCache(Core::System& system) {
  const auto& cache=system.GetPPCState().iCache;
  auto& memory=system.GetMemory();
  for (u32 set=0;set<PowerPC::CACHE_SETS;++set)
    for (u32 way=0;way<PowerPC::CACHE_WAYS;++way) {
      if (!(cache.valid[set] & (1u<<way))) continue;
      const u32 address=cache.addrs[set][way];
      if (address>memory.GetRamSize()-32 ||
          std::memcmp(cache.data[set][way].data(),memory.GetRAM()+address,32)!=0) return false;
    }
  return true;
}
class CodeRestoreGuard {
  Core::System& system;
  struct Range {u32 from; std::vector<u8> bytes;};
  std::vector<Range> saved;
public:
  explicit CodeRestoreGuard(Core::System& s):system(s) {
    keep_jit = !std::getenv("MELEE_DISABLE_FAST_JIT") && CoherentInstructionCache(s);
    if (!keep_jit) return;
    Core::CPUThreadGuard guard(s);
    Common::RangeSet<u32> ranges;
    s.GetJitInterface().RunOnBlocks(guard,[&](const JitBlock& block){
      for (auto [from,to]:block.physical_addresses) ranges.insert(from,to);
    });
    auto& memory=s.GetMemory();
    for (auto [from,to]:ranges) {
      if (to>memory.GetRamSize()) {keep_jit=false;break;}
      saved.push_back({from,{memory.GetRAM()+from,memory.GetRAM()+to}});
    }
  }
  ~CodeRestoreGuard() {
    if (keep_jit) {
      bool valid=CoherentInstructionCache(system);
      const auto* ram=system.GetMemory().GetRAM();
      for (const auto& range:saved)
        if (std::memcmp(range.bytes.data(),ram+range.from,range.bytes.size())!=0) {valid=false;break;}
      if (!valid) {
        Core::CPUThreadGuard guard(system);
        system.GetJitInterface().ClearCache(guard);
      }
      if (std::getenv("MELEE_PROFILE_STATE")) std::printf("MELEE_JIT=%d,%zu\n",valid,saved.size());
    }
    keep_jit=false;
  }
};
}
