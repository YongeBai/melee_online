// Compatibility bridge for the pinned WebGL core: its shaders use reversed
// depth, while the generated OpenGL comparison and clear bindings do not.
// Keep this separate from the immutable original loader and WASM artifact.
export const WEBGL_DEPTH_CORE = 'b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52';
export function correctWebGLDepthLoader(source) {
  const replace = (from, to) => {
    if (source.split(from).length !== 2) throw Error('Unexpected core loader: ' + from);
    source = source.replace(from, to);
  };
  replace('var _emscripten_glDepthFunc=x0=>GLctx.depthFunc(x0);',
    'var _emscripten_glDepthFunc=x0=>GLctx.depthFunc(({513:516,515:518,516:513,518:515})[x0]??x0);');
  replace('var _emscripten_glClearDepthf=x0=>GLctx.clearDepth(x0);',
    'var _emscripten_glClearDepthf=x0=>GLctx.clearDepth(1-x0);');
  // Utility clear shaders bypass the normal vertex shader's [0,1] to [-1,1]
  // conversion. Their clear_depth uniform is already reversed by AbstractGfx.
  replace('var source=GL.getSource(shader,count,string,length);GLctx.shaderSource',
    'var source=GL.getSource(shader,count,string,length);source=source.replace(", clear_depth, 1.0f);",", clear_depth * 2.0 - 1.0, 1.0f);");GLctx.shaderSource');
  // Emscripten pthreads must load this same corrected module, not the original
  // sibling filename baked into the generated loader.
  replace('new URL("dolphin-core-upstream.js",import.meta.url)',
    'new URL(import.meta.url)');
  return source;
}
