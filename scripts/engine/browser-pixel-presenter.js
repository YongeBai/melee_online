// One persistent texture for the bounded pixel transport. This avoids a new
// Canvas2D image upload/conversion for each frame; it does not queue images.
export function createBrowserPixelPresenter(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha:false, antialias:false, depth:false, stencil:false,
    preserveDrawingBuffer:true, desynchronized:true,
  });
  if (!gl) return null;
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  };
  const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
    out vec2 uv;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      uv = vec2(p.x, 1.0 - p.y);
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`);
  const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    uniform sampler2D pixels;
    in vec2 uv;
    out vec4 color;
    void main() { color = vec4(texture(pixels, uv).rgb, 1.0); }`);
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'pixels'), 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let width = 0, height = 0, framesDrawn = 0;
  return {
    get framesDrawn() { return framesDrawn; },
    draw(pixels, w, h) {
      if (gl.isContextLost()) throw Error('Browser pixel presenter lost its graphics context');
      if (pixels.byteLength !== w * h * 4) throw Error('Pixel dimensions do not match the frame');
      if (w !== width || h !== height) {
        width = w; height = h;
        gl.viewport(0, 0, w, h);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      framesDrawn++;
    },
  };
}
