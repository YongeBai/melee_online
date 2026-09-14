import assert from "node:assert/strict";
import test from "node:test";

import { prewarmBrowserMatch } from "./browser-match-prewarm.js";

test("prewarms native frames and restores the captured match before resuming", async () => {
  const calls = [];
  let samples = 0;
  let cleared = 0;
  const host = {
    adapter: {
      presentationQueue: { clear: () => { cleared += 1; } },
      request: async (type, payload) => {
        calls.push([type, payload]);
        if (payload?.action === "frameInputStats") {
          samples += 1;
          return samples === 1
            ? { ok: true, active: true, valid: true, completed: false, startFrame: 10, lastFrame: 130 }
            : { ok: true, active: false, valid: true, completed: true, startFrame: 10, lastFrame: 250 };
        }
        return { ok: true };
      },
    },
  };
  const result = await prewarmBrowserMatch(host, 240, { sleep: async () => {} });
  assert.equal(result.restored, true);
  assert.equal(cleared, 1);
  assert.deepEqual(calls.map(([, payload]) => payload?.action || "start"), [
    "pause", "step", "capture", "frameInput", "frameInputStop", "unthrottled", "start",
    "frameInputStats", "frameInputStats", "pause", "frameInput", "restore", "unthrottled",
    "release", "start",
  ]);
});
