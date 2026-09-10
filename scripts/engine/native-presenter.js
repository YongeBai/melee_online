// The stream contains native hand geometry over reserved magenta menu apertures.
// Key just those apertures, revealing the room controls below the game canvas.
// All match pixels take the ordinary opaque path; no CPU pixel readback is used.
export function createNativePresenter(canvas, online) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw Error("WebGL is required to display Melee.");
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(
    program,
    shader(
      gl.VERTEX_SHADER,
      `attribute vec2 position; varying vec2 uv;
    void main(){uv=vec2((position.x+1.0)*.5,(1.0-position.y)*.5);gl_Position=vec4(position,0.,1.);}`,
    ),
  );
  gl.attachShader(
    program,
    shader(
      gl.FRAGMENT_SHADER,
      `precision mediump float;
    uniform sampler2D video; uniform float key; varying vec2 uv;
    void main(){vec3 c=texture2D(video,uv).rgb;float a=1.;
      bool panel=uv.x>.337 && uv.x<.663 && uv.y>.537 && uv.y<.933;
      bool icon=uv.y>.863 && uv.y<.914 && ((uv.x>.282 && uv.x<.320)||(uv.x>.762 && uv.x<.800));
      if(key>0.5 && (panel||icon)){
        float magenta=min(c.r,c.b)-c.g;
        a=1.-smoothstep(.20,.65,magenta);
        // Suppress chroma spill where 4:2:0 encoding mixes the key with the hand edge.
        vec3 original=c; c.r=min(original.r,original.g+max(0.,original.r-original.b));c.b=min(original.b,original.g+max(0.,original.b-original.r));
        if(magenta<.12) c=texture2D(video,uv).rgb;
      }
      gl_FragColor=vec4(c*a,a);}`,
    ),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  const key = gl.getUniformLocation(program, "key");
  gl.viewport(0, 0, 1280, 720);
  return {
    draw(frame, menu) {
      gl.uniform1f(key, online && menu ? 1 : 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, frame);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
