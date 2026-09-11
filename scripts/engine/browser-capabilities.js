export async function browserCapabilities() {
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext("webgl2");
  const webgl2 = Boolean(gl);
  const rendererExtension = gl?.getExtension("WEBGL_debug_renderer_info");
  const webglRenderer = gl ? gl.getParameter(rendererExtension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : null;
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  let webgpu = false, webgpuError;
  try {
    webgpu = Boolean(await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" }));
  } catch (error) { webgpuError = error.message; }
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated,
    sharedMemory: typeof SharedArrayBuffer === "function",
    webgl2, webglRenderer, webgpu, webgpuError,
  };
}

export function requireBrowserBackend(capabilities, backend, proxyMode) {
  if (!capabilities.crossOriginIsolated || !capabilities.sharedMemory)
    throw Error("Browser emulation needs cross-origin isolation (COOP/COEP headers) and shared memory.");
  if (backend === "OGL" && proxyMode === "main")
    throw Error("The main-thread engine cannot mount local discs. Use the worker renderer.");
  if (backend === "OGL" && !capabilities.webgl2)
    throw Error("WebGL 2 is unavailable in this browser.");
  if (backend === "WebGPU-Real" && !capabilities.webgpu)
    throw Error("This browser did not provide a WebGPU adapter. The WebGPU engine cannot start here.");
}
