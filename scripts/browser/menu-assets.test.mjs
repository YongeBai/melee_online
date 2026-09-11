import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readLocalMenuAssets} from '../engine/browser-menu-assets.js';
import {encodePNG} from '../assets/gx-textures.mjs';
test('browser menu reader rejects wrong revision and truncated disc',async()=>{
 await assert.rejects(readLocalMenuAssets(new Blob([new Uint8Array(8)])),/Invalid menu data range/);
 await assert.rejects(readLocalMenuAssets(new Blob([new Uint8Array(0x440)])),/USA 1.02/);
 const b=new Uint8Array(0x440);b.set(new TextEncoder().encode('GALE01'));b[7]=2;const d=new DataView(b.buffer);d.setUint32(0x1c,0xc2339f3d);d.setUint32(0x424,0x440);d.setUint32(0x428,12);
 await assert.rejects(readLocalMenuAssets(new Blob([b])),/Invalid menu data range/);
});
test('browser-decoded local menu art exactly matches existing native extraction',{skip:!process.env.MELEE_TEST_DISC},async()=>{
 const handle=await fs.promises.open(process.env.MELEE_TEST_DISC,'r');
 try{
 const file={size:(await handle.stat()).size,slice:(start,end)=>({async arrayBuffer(){const buffer=Buffer.alloc(end-start);await handle.read(buffer,0,buffer.length,start);return buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.length);}})};
 const assets=await readLocalMenuAssets(file);assert.equal(assets.size,7);
 for(const [name,a] of assets){const png=encodePNG(Buffer.from(a.rgba),a.width,a.height);assert.deepEqual(png,fs.readFileSync(new URL('../../.melee-assets/'+name,import.meta.url)),name);}
 }finally{await handle.close();}
});
