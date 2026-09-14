import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('GPU async loop preserves wakeup, bounded work, wait and shutdown semantics', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'melee-gpu-yield-'));
  try {
    mkdirSync(resolve(dir, 'emscripten'));
    writeFileSync(resolve(dir, 'emscripten/eventloop.h'), `#pragma once
using TimerCallback = bool (*)(double, void*);
inline TimerCallback timer;
inline void* timer_data;
inline void emscripten_set_timeout_loop(TimerCallback fn, double, void* data) {
  timer = fn; timer_data = data;
}
`);
    writeFileSync(resolve(dir, 'emscripten/atomic.h'), '#pragma once\ninline std::atomic<int> notify_count{0};\ninline int emscripten_atomic_notify(void*, unsigned){return ++notify_count;}\n');
    writeFileSync(resolve(dir, 'emscripten/emscripten.h'), '#pragma once\n#define EM_ASM(...) ((void)0)\n');
    writeFileSync(resolve(dir, 'test.cpp'), `#include "Common/BlockingLoop.h"
#include <cassert>
#include <future>
int main() {
  Common::BlockingLoop loop;
  int runs = 0, stops = 0;
  bool keep_waking = false;
  loop.RunAsync([&] { ++runs; if (keep_waking) loop.Wakeup(); }, [&] { ++stops; });
  assert(!loop.IsDone());
  assert(timer(0, timer_data));
  assert(runs == 1 && loop.IsDone());
  loop.Wakeup();
  assert(notify_count == 1);
  keep_waking = true;
  assert(timer(0, timer_data));
  assert(runs == 9 && !loop.IsDone());
  keep_waking = false;
  auto waiter = std::async(std::launch::async, [&] { loop.Wait(); });
  assert(timer(0, timer_data));
  assert(runs == 10 && loop.IsDone());
  assert(waiter.wait_for(std::chrono::seconds(1)) == std::future_status::ready);
  loop.Wakeup();
  auto stop_waiter = std::async(std::launch::async, [&] { loop.Stop(); });
  while (loop.IsRunning()) std::this_thread::yield();
  assert(!timer(0, timer_data));
  assert(stops == 1 && runs == 10 && loop.IsDone());
  assert(stop_waiter.wait_for(std::chrono::seconds(1)) == std::future_status::ready);
  loop.Stop();
  assert(stops == 1);
}
`);
    const compile = spawnSync('c++', ['-std=c++17', '-pthread', '-D__EMSCRIPTEN__', '-I', dir,
      '-I', resolve('engines/wasm-dolphin/vendor/dolphin/Source/Core'), resolve(dir, 'test.cpp'), '-o', resolve(dir, 'test')], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(resolve(dir, 'test'), [], { encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 0, run.stderr || String(run.error || ''));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
