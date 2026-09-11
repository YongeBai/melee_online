// Host-controlled, frame-boundary rollback for the private Melee worker.
// MELEE_STREAM extensions; full emulator snapshots live in State.cpp.
#pragma once
#include <atomic>
#include <array>
#include <mutex>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include "InputCommon/GCPadStatus.h"
namespace MeleeBridge {
inline std::atomic<bool> suppress_output{false};
inline std::atomic<bool> stepping{false};
inline std::mutex pad_mutex;
inline std::array<GCPadStatus, 2> pads;
inline std::array<bool, 2> pad_override{};
inline thread_local bool state_active = false;
inline thread_local bool keep_jit = false;
inline thread_local bool state_loading = false;
inline thread_local std::chrono::steady_clock::time_point profile_at;
inline void MarkState(const char* name) {
  static const bool enabled = std::getenv("MELEE_PROFILE_STATE") != nullptr;
  if (!state_active || !enabled) return;
  auto now = std::chrono::steady_clock::now();
  auto us = std::chrono::duration_cast<std::chrono::microseconds>(now-profile_at).count();
  std::printf("MELEE_PROFILE=%s,%s,%lld\n",state_loading?"load":"save",name,static_cast<long long>(us));
  profile_at=now;
}
struct StateScope {
  explicit StateScope(bool loading) { state_active=true;state_loading=loading;profile_at=std::chrono::steady_clock::now(); }
  ~StateScope() { MarkState("end");state_active=false; }
};
inline void SetPad(int port, const GCPadStatus& pad) {
  if(port<0 || port>1)return;
  std::lock_guard lock(pad_mutex);pads[port]=pad;pad_override[port]=true;
}
inline bool GetPad(int port, GCPadStatus& pad) {
  if(port<0 || port>1)return false;
  std::lock_guard lock(pad_mutex);if(!pad_override[port])return false;
  pad=pads[port];return true;
}
}
