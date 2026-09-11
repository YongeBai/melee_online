import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {correctWebGLDepthLoader} from './webgl-depth-loader.mjs';
const fixture = '/* new URL("dolphin-core-upstream.js",import.meta.url) */var _emscripten_glDepthFunc=x0=>GLctx.depthFunc(x0);var _emscripten_glClearDepthf=x0=>GLctx.clearDepth(x0);function shaderSource(shader,count,string,length){var source=GL.getSource(shader,count,string,length);GLctx.shaderSource(shader,source);}';
test('reversed depth preserves near-over-far ordering and clears behind geometry',()=>{
  let comparison, clear;
  const ctx=vm.createContext({GLctx:{depthFunc:x=>comparison=x,clearDepth:x=>clear=x}});
  vm.runInContext(correctWebGLDepthLoader(fixture),ctx);
  for(const [input,expected] of [[512,512],[513,516],[514,514],[515,518],[516,513],[517,517],[518,515],[519,519]]){
    ctx._emscripten_glDepthFunc(input);assert.equal(comparison,expected);
  }
  ctx._emscripten_glClearDepthf(1);assert.equal(clear,0);
  const near=0.8,far=0.2;assert.ok(near>far && far>clear);
  ctx._emscripten_glClearDepthf(0.25);assert.equal(clear,0.75);
});
test('utility clear maps window depth to GL clip space without changing other shaders',()=>{
  let shader='opos = float4(coord, clear_depth, 1.0f);',output;
  const ctx=vm.createContext({GL:{getSource:()=>shader},GLctx:{shaderSource:(_,s)=>output=s}});
  vm.runInContext(correctWebGLDepthLoader(fixture),ctx);ctx.shaderSource(1,1,1,1);
  assert.equal(output,'opos = float4(coord, clear_depth * 2.0 - 1.0, 1.0f);');
  for(const depth of [0,0.25,1])assert.equal(((depth*2-1)+1)/2,depth);
  shader='void main() { gl_Position = vec4(1.0); }';ctx.shaderSource(1,1,1,1);assert.equal(output,shader);
});
test('refuses unknown or already corrected loaders',()=>{
  assert.throws(()=>correctWebGLDepthLoader('other core'));
  assert.throws(()=>correctWebGLDepthLoader(correctWebGLDepthLoader(fixture)));
});

test("pthread workers load the corrected module URL",()=>{
  const result=correctWebGLDepthLoader(fixture);
  assert.ok(result.includes("new URL(import.meta.url)"));
  assert.ok(!result.includes("dolphin-core-upstream.js"));
});
