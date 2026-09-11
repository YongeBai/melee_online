import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const engine = new URL('../../engines/wasm-dolphin/', import.meta.url);
const cpp = readFileSync(new URL('vendor/dolphin/Source/Core/Common/GL/GLInterface/Emscripten.cpp',engine),'utf8');
const marker = cpp.indexOf('// BEGIN BOUNDED BITMAP EXPORT');
assert.ok(marker > 0, 'Production bounded export must exist');
const start = cpp.lastIndexOf('EM_ASM({', marker) + 'EM_ASM({'.length;
const end = cpp.indexOf('\n    });', marker);
const produce = new Function('Module','GL','self','console',cpp.slice(start,end));
const source = readFileSync(new URL('src/upstream-worker-adapter.js',engine),'utf8');
const ackStart = source.indexOf('      if (message.credit) {');
assert.ok(ackStart > 0);
const ackEnd = source.indexOf('      // Worker has rendered',ackStart);
const receive = new Function('message',source.slice(ackStart,ackEnd));
function setup() {
  const module={}, images=[], messages=[], sink={};
  const canvas={transferToImageBitmap(){const image={width:960,height:720,closed:0,close(){this.closed++;}};images.push(image);return image;}};
  const sender={postMessage(message){messages.push(message);}};
  return {module,images,messages,sink,canvas,sender,
    send(){produce(module,{currentContext:{GLctx:{canvas}}},sender,{log(){}});},
    consume(){const m=messages.shift();receive.call(sink,m);m.bitmap.close();},
  };
}
test('a stalled page cannot accumulate an unbounded image message backlog',()=>{
  const f=setup();for(let i=0;i<10000;i++) f.send();
  assert.equal(f.images.length,4);assert.equal(f.messages.length,4);
  assert.deepEqual([...f.module._detachedOglCredit],[4,4,9996]);
  f.consume();f.send();assert.equal(f.messages.length,4);
  assert.equal(f.images.length,5);assert.equal(f.images[0].closed,1);
});
test('healthy delivery keeps exporting every frame and returns every credit',()=>{
  const f=setup();for(let i=0;i<1000;i++){f.send();f.consume();}
  assert.deepEqual([...f.module._detachedOglCredit],[0,1000,0]);
  assert.ok(f.images.every(image=>image.closed===1));
  assert.equal(f.sink.bitmapTransport.capacity,4);
});
test('failed transfer closes the owned bitmap and returns its credit',()=>{
  const f=setup();f.sender.postMessage=()=>{throw Error('closed recipient');};
  for(let i=0;i<20;i++) f.send();
  assert.deepEqual([...f.module._detachedOglCredit],[0,0,0]);
  assert.ok(f.images.every(image=>image.closed===1));
});
test('empty or failed canvas snapshot does not exhaust the export budget',()=>{
  const f=setup();f.canvas.transferToImageBitmap=()=>null;f.send();
  f.canvas.transferToImageBitmap=()=>{throw Error('lost context');};f.send();
  assert.deepEqual([...f.module._detachedOglCredit],[0,0,0]);
});
