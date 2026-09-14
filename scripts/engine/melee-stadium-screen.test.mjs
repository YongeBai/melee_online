import test from 'node:test';import assert from 'node:assert/strict';
import {planStadiumScreen,inspectStadiumPlatforms,STADIUM_SCREEN_CALLS} from './melee-stadium-screen.js';
function fixture(){
 const words=new Map([[0x801d5074,0x7c0802a6],[0x801d5090,0x4bffce69],[0x804d782c,0x81000000],[0x81000014,0x81000100],[0x8100012c,0x81000200],[0x81000204,0x81000100],[0x81000214,1],[0x8100011c,0x801d5074],[0x81000128,0x81000500],[0x810002d4,0x81001000],[0x810002d8,0x81002000],[0x810002dc,0x81003000]]);
 for(const[a,w,b,n]of STADIUM_SCREEN_CALLS){words.set(a,w);words.set(a-4,b);words.set(a+4,n);}
 const read32=a=>words.get(a)||0,read8=a=>a===0x81000101?3:0;
 return {words,read32,read8,apply:p=>{for(const[a,w]of[...p.codeWrites,...p.writes])words.set(a,w);}};
}
test('Stadium gameplay probe excludes the video board and observes terrain state and joint changes',()=>{
 const f=fixture();f.words.set(0x81000108,0x81004000);f.words.set(0x8100402c,0x81004100);f.words.set(0x81004104,0x81004000);f.words.set(0x81004114,2);f.words.set(0x81004028,0x81005000);
 const read8=a=>a===0x81004001?3:f.read8(a),before=inspectStadiumPlatforms(f.read32,read8);
 assert.equal(before.length,1);assert.equal(before[0].mapId,2);assert.equal(before[0].joints.length,1);
 f.words.set(0x810041c4,7);f.words.set(0x81005050,0x3f800000);
 const after=inspectStadiumPlatforms(f.read32,read8);assert.equal(after[0].modeWords[0],7);assert.equal(after[0].joints[0].matrix[3],0x3f800000);assert.notDeepEqual(after,before);
 f.words.set(0x81005010,0x81005000);assert.throws(()=>inspectStadiumPlatforms(f.read32,read8),/joint tree/);
});
test('Stadium disables only three copy calls and the board draw, and restores exactly',()=>{
 const f=fixture(),original=new Map(f.words),off=planStadiumScreen(f.read32,f.read8,false);
 assert.equal(off.codeWrites.length,4);assert.deepEqual(off.writes,[]);
 for(const[a,w]of off.codeWrites){assert.equal(w,0x60000000);const bl=original.get(a),delta=(bl&0x03fffffc)<<6>>6;assert.equal(a+delta,STADIUM_SCREEN_CALLS.find(([address])=>address===a)[4]);assert.equal(bl&3,1);}
 f.apply(off);const unchanged=planStadiumScreen(f.read32,f.read8,false);assert.deepEqual(unchanged.codeWrites,[]);assert.deepEqual(unchanged.writes,[]);
 f.apply(planStadiumScreen(f.read32,f.read8,true));assert.deepEqual(f.words,original);
});
test('Stadium rejects unknown code, callbacks, ownership, wrappers and cyclic lists before any plan is returned',()=>{
 for(const address of [...STADIUM_SCREEN_CALLS.flatMap(([a])=>[a-4,a,a+4]),0x801d5074,0x801d5090,0x8100011c,0x81000204,0x810002d4]){
  const f=fixture();f.words.set(address,0xdeadbeef);const before=new Map(f.words);assert.throws(()=>planStadiumScreen(f.read32,f.read8,false));assert.deepEqual(f.words,before);
 }
 const f=fixture();f.words.set(0x81000108,0x81000100);assert.throws(()=>planStadiumScreen(f.read32,f.read8,false),/chain/);
});
