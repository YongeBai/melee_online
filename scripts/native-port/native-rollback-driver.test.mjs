import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeRollbackDriver} from '../../engines/browser-native/native-rollback-driver.mjs';

test('rollback driver arms transport, preserves the neutral prefix and submits exact local frames',()=>{
 const calls=[],session={frame:0,confirmed:-1,receive(){},acknowledge(){},reconcile(){calls.push(['reconcile']);},advance(input){calls.push(['advance',this.frame,input]);this.frame++;return true;},snapshot(){return {frame:this.frame};}};
 let sink,unbound=false;const network={active:true,seat:1,tapJump:0,begin:phase=>calls.push(['begin',phase]),bindRollback(value){calls.push(['bind',value]);sink=value;return ()=>{unbound=true;};},sendInput(frame,pad){calls.push(['send',frame,pad]);return true;},snapshot:()=>({phase:'match'})};
 const driver=createNativeRollbackDriver({network,session});assert.equal(sink,session);
 const samples=[[0,.5,0],[256,-.5,0]];for(let frame=0;frame<4;frame++)assert.equal(driver.advance(frame,samples),true);
 const advances=calls.filter(c=>c[0]==='advance');assert.deepEqual(advances.slice(0,3).map(c=>c[2]),Array.from({length:3},()=>({pad:[0,0,0,0,0,0,0],tap:0})));assert.deepEqual(advances[3][2],{pad:[256,-.5,0,0,0,0,0],tap:0});
 assert.deepEqual(calls.filter(c=>c[0]==='send'),[['send',3,[256,-.5,0,0,0,0,0]]]);session.confirmed=3;assert.equal(driver.canFinish(3),true);driver.dispose();assert.equal(unbound,true);assert.throws(()=>driver.advance(4,samples),/closed/);
});

test('rollback driver freezes a transmitted input while its prediction window is stalled',()=>{
 const attempts=[],session={frame:3,confirmed:2,receive(){},acknowledge(){},reconcile(){},advance(input){attempts.push(input);return false;},snapshot(){return {};}};const sends=[];
 const network={active:true,seat:0,tapJump:1,begin(){},bindRollback(){return ()=>{};},sendInput(frame,pad){sends.push([frame,[...pad]]);return true;},snapshot(){return {};}};
 const driver=createNativeRollbackDriver({network,session});assert.equal(driver.advance(3,[[256,.5,0],[0,0,0]]),false);network.tapJump=0;assert.equal(driver.advance(3,[[0,-1,0],[0,0,0]]),false);
 assert.deepEqual(sends,[[3,[256,.5,0,0,0,0,0]],[3,[256,.5,0,0,0,0,0]]]);assert.deepEqual(attempts,[{pad:[256,.5,0,0,0,0,0],tap:1},{pad:[256,.5,0,0,0,0,0],tap:1}]);driver.dispose();
});
