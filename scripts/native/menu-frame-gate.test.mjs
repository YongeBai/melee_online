import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
test("native capture never releases CSS before layout and hand foreground render", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "melee-menu-gate-"));
  try {
    const file = path.join(dir, "test.cpp"),
      binary = path.join(dir, "test");
    writeFileSync(
      file,
      `#include "menu-frame-gate.h"
#include <vector>
#include <cassert>
int main(){std::vector<unsigned char> ram(0x1800000);auto* p=ram.data();
auto w=[&](unsigned a,unsigned n){a-=0x80000000;for(int i=0;i<4;i++)p[a+i]=n>>(24-i*8);};
assert(MeleeBridge::MenuFrameReady(p));p[0x479d30]=2;
assert(!MeleeBridge::MenuFrameReady(p));
w(0x804d6720,0x81000000);p[0x1000000]=8;
w(0x804d6cbc,0x81001000);w(0x804a0bc0,0x81002000);w(0x81002000,0x81003000);
w(0x81001000+28,0x80391070);w(0x81003000+28,0x80391070);
assert(!MeleeBridge::MenuFrameReady(p));
w(0x81001000+28,0x80001c00);w(0x81003000+28,0x80001840);
assert(!MeleeBridge::MenuFrameReady(p));w(0x80001b40,1);assert(MeleeBridge::MenuFrameReady(p));
w(0x81003000+28,0x80391070);assert(!MeleeBridge::MenuFrameReady(p));
p[0x479d33]=2;assert(MeleeBridge::MenuFrameReady(p));
p[0x479d33]=0;w(0x804a0bc0,0xffffffff);assert(!MeleeBridge::MenuFrameReady(p));
}`,
    );
    const compile = spawnSync(
      "c++",
      ["-std=c++17", "-I", import.meta.dirname, file, "-o", binary],
      { encoding: "utf8" },
    );
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(binary, [], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
