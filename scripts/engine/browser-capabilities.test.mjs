import { test } from "node:test";
import assert from "node:assert/strict";
import { requireBrowserBackend } from "./browser-capabilities.js";
const supported = { crossOriginIsolated: true, sharedMemory: true, webgl2: true, webgpu: true };
test("browser backend preflight refuses unsupported execution instead of silently falling back", () => {
  assert.throws(() => requireBrowserBackend({ ...supported, crossOriginIsolated: false }, "OGL"), /isolation/);
  assert.throws(() => requireBrowserBackend({ ...supported, webgpu: false }, "WebGPU-Real"), /adapter/);
  assert.throws(() => requireBrowserBackend({ ...supported, webgl2: false }, "OGL"), /WebGL 2/);
  assert.throws(() => requireBrowserBackend(supported, "OGL", "main"), /mount local discs/);
  assert.doesNotThrow(() => requireBrowserBackend({ ...supported, webgpu: false }, "Software"));
  assert.doesNotThrow(() => requireBrowserBackend(supported, "OGL", "worker"));
});
