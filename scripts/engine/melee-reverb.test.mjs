import test from 'node:test';import assert from 'node:assert/strict';
import {planAuxReverb,AX_AUX_A_CALLBACK as CALLBACK,AX_AUX_A_CONTEXT as CONTEXT,AX_AUX_A_BUFFER as BUFFER,AX_AUX_A_BUFFER_BYTES as BYTES,AX_REVERB_STD_CALLBACK as REVERB,AX_REVERB_STD_WORK as WORK,AX_DRIVER_STATE as FLAGS} from './melee-reverb.js';
function fixture({callback=REVERB,context=WORK,flags=0x4200,fill=1}={}){
 const words=new Map([[FLAGS,flags],[CALLBACK,callback],[CONTEXT,context],[REVERB,0x7c0802a6],[REVERB+0x0c,0x8804013c],[REVERB+0x14,0x4082000c],[REVERB+0x1c,0x4bfffa7d],[REVERB+0x2c,0x4e800020]]);
 for(let o=0;o<BYTES;o+=4)words.set(BUFFER+o,fill);return{words,plan:e=>planAuxReverb(a=>words.get(a)||0,e),apply:p=>p.writes.forEach(([a,v])=>words.set(a,v))};
}
test('disconnects only AUX A wet reverb, clears all rotating buffers, and restores callback',()=>{
 const f=fixture(),off=f.plan(false);assert.equal(off.objects[0].channel,0);assert.equal(off.dryMixPreserved,true);
 assert.deepEqual(off.writes.slice(0,2),[[CALLBACK,0],[CONTEXT,0]]);assert.equal(off.writes.length,2+BYTES/4);f.apply(off);
 assert.deepEqual(f.plan(false).writes,[]);const on=f.plan(true);assert.deepEqual(on.writes,[[CALLBACK,REVERB],[CONTEXT,WORK]]);
});
test('already-zero wet buffers do not generate redundant writes',()=>{assert.equal(fixture({fill:0}).plan(false).writes.length,2);});
test('rejects a wrong effect, revision, pointer, or half-disabled callback before mutation',()=>{
 assert.throws(()=>fixture({flags:0x4400}).plan(false),/standard reverb/);assert.throws(()=>fixture({callback:1}).plan(false),/Unexpected AUX/);
 assert.throws(()=>fixture({callback:0,context:WORK}).plan(false),/Inconsistent/);const f=fixture();f.words.set(REVERB,0);assert.throws(()=>f.plan(false),/unmodified USA 1.02/);
 assert.throws(()=>fixture().plan(0),/boolean/);
});
