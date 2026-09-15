import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {correctReleaseCoreUrl} from './release-protocol.mjs';

test('hosted loader uses a fresh versioned URL while ordinary candidate URLs remain intact',async()=>{
  const source=fs.readFileSync(new URL('../../engines/wasm-dolphin/src/upstream-worker-protocol.js',import.meta.url),'utf8');
  const {requestedUpstreamCoreBuild}=await import('data:text/javascript,'+encodeURIComponent(correctReleaseCoreUrl(source)));
  const id='a'.repeat(64);
  assert.equal(requestedUpstreamCoreBuild(`?coreid=${id}&depthloader=2`).coreUrl,
    `./build/core-candidates/${id}/dolphin-core-upstream-depth-v2.js`);
  assert.equal(requestedUpstreamCoreBuild(`?coreid=${id}`).coreUrl,
    `./build/core-candidates/${id}/dolphin-core-upstream.js`);
  assert.throws(()=>correctReleaseCoreUrl('unknown source'),/Unknown candidate URL protocol/);
});
