import test from 'node:test';import assert from 'node:assert/strict';
import {keyboardNativeSample,standardNativeSample,completeNativeSample,neutralNativeSample} from '../../engines/browser-native/native-input.mjs';
import {startNativeLive} from '../../engines/browser-native/native-live.mjs';
const pad=()=>({connected:true,mapping:'standard',axes:[.25,-.4,-.65,.8],buttons:Array.from({length:16},()=>({pressed:false,value:0}))});
test('native keyboard separates main stick, C-stick, grab and shoulder channels',()=>{
  const keys=new Set(['ArrowRight','ArrowUp','AltLeft','KeyJ','KeyI','KeyC','ShiftRight']);const s=keyboardNativeSample(keys);
  assert.equal(s[0],0x50);assert.equal(s[1],.5/Math.SQRT2);assert.equal(s[2],.5/Math.SQRT2);assert.deepEqual(s.slice(3),[-1,1,1,0]);assert.deepEqual(keyboardNativeSample(new Set()),neutralNativeSample());
});
test('keyboard Start and gamepad Start share the original native button',()=>{
  for(const key of ['Enter','Escape'])assert.equal(keyboardNativeSample(new Set([key]))[0],0x1000);
  assert.equal(keyboardNativeSample(new Set(['Enter','Escape']))[0],0x1000);
  const p=pad();p.buttons[9].pressed=true;assert.equal(standardNativeSample(p)[0],0x1000);
});
test('native gamepad retains analog magnitudes and distinguishes soft shoulders from digital clicks',()=>{
  const p=pad();p.buttons[6]={pressed:true,value:.6};p.buttons[7]={pressed:true,value:.35};let s=standardNativeSample(p);
  assert.deepEqual(s,[0,.25,.4,-.65,-.8,.6,.35]);p.buttons[6].value=1;p.buttons[0].pressed=true;p.buttons[5].pressed=true;s=standardNativeSample(p);assert.equal(s[0],0x150);assert.equal(s[5],1);assert.equal(s[6],.35);
  p.axes=[.05,-.08,NaN,2];assert.deepEqual(standardNativeSample(p).slice(1,5),[.05,.08,0,-1]);
});
test('disconnected or unmapped gamepads release every channel and malformed scripted samples fail',()=>{
  for(const p of [null,{...pad(),connected:false},{...pad(),mapping:''}])assert.deepEqual(standardNativeSample(p),neutralNativeSample());
  assert.deepEqual(completeNativeSample([16,.5,0]),[16,.5,0,0,0,0,0]);
  for(const s of [[0],[0,0,NaN],[128,0,0],[0,0,0,0,0,-.1,0],[0,0,0,1.01,0,0,0],[0x100000000,0,0]])assert.throws(()=>completeNativeSample(s));
});
test('live input samples both ports immediately before simulation and releases on blur, disconnect and stop',()=>{
  const names=['document','navigator','requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener'],saved=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  const events=new Map(),calls=[],docEvents=new Map();let callback,gamepads=[pad(),pad()],steps=0;
  const values={document:{hidden:false,addEventListener:(n,fn)=>docEvents.set(n,fn),removeEventListener:n=>docEvents.delete(n)},navigator:{getGamepads:()=>gamepads},requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{},addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)};
  for(const [name,value]of Object.entries(values))Object.defineProperty(globalThis,name,{configurable:true,value});
  let live;
  try{
    const state=[14,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,1,60,4];
    const module={_portFighterConstructRead:(o,i)=>state[i],_Player_80031848:()=>{},_portControllerSample:(i,...s)=>calls.push({i,s,step:steps})};
    live=startNativeLive(module,{draw:()=>({})},[1,2],{step:()=>steps++,onError:error=>{throw error;}});
    let now=performance.now()+20;callback(now);const tick=()=>callback(now+=1000/60);tick();
    assert.equal(steps,1);assert.deepEqual(calls.slice(-2).map(c=>c.s),gamepads.map(standardNativeSample));assert(calls.every(c=>c.step===0));
    events.get('keydown')({code:'KeyL',type:'keydown',preventDefault(){}});tick();assert.equal(calls.at(-2).s[3],1);assert.equal(calls.at(-1).s[3],-.65);
    events.get('blur')();tick();tick();assert(calls.slice(-2).every(c=>c.s.every(v=>v===0)));
    events.get('focus')();tick();tick();assert.deepEqual(calls.at(-2).s,standardNativeSample(gamepads[0]));
    gamepads=[null,gamepads[1]];tick();assert.deepEqual(calls.at(-2).s,neutralNativeSample());assert.equal(calls.at(-1).s[3],-.65);
    live.stop();assert(calls.slice(-2).every(c=>c.s.every(v=>v===0)));assert.equal(events.size,0);assert.equal(docEvents.size,0);
  }finally{live?.stop();for(const n of names){const d=saved.get(n);if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}}
});

test('shared browser input retains held controls across scene ownership and releases hidden or disconnected devices',async()=>{
  const {createBrowserNativeInput}=await import('../../engines/browser-native/browser-input.mjs');
  const target=new EventTarget(),document=new EventTarget();document.hidden=false;
  let pads=[pad(),pad()];const input=createBrowserNativeInput({target,document,getGamepads:()=>pads});
  const send=(type,code)=>{const e=new Event(type,{cancelable:true});e.code=code;target.dispatchEvent(e);return e;};
  try{
    assert(send('keydown','KeyZ').defaultPrevented);assert.equal(input.samples()[0][0],256);
    // New scene takes the same owner, without clearing a held Zelda form toggle.
    const nextScene=input;assert.equal(nextScene.samples()[0][0],256);
    send('keyup','KeyZ');assert.deepEqual(nextScene.samples()[0],standardNativeSample(pads[0]));
    input.setKeyboardPort(1);send('keydown','ArrowLeft');assert.equal(input.samples()[1][1],-1);assert.equal(input.samples()[0][1],.25);
    target.dispatchEvent(new Event('blur'));assert(input.samples().flat().every(v=>v===0));
    target.dispatchEvent(new Event('focus'));assert.deepEqual(input.samples()[1],standardNativeSample(pads[1]));
    send('keydown','KeyZ');document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert(input.samples().flat().every(v=>v===0));
    document.hidden=false;pads=[null,null];assert(input.samples().flat().every(v=>v===0));
    assert.throws(()=>input.setKeyboardPort(2));input.dispose();send('keydown','KeyZ');assert(input.samples().flat().every(v=>v===0));
  }finally{input.dispose();}
});

test('player controls retain WASD, attacks, independent shields, C-stick and half-stick',async()=>{
 const {meleeKeyboardSample:sample}=await import('../../engines/browser-native/native-input.mjs');
 const one=key=>sample(new Set([key]));
 for(const [key,button]of [['KeyP',0x100],['KeyO',0x200],['Space',0x400],['KeyU',0x10],['Enter',0x1000],['Escape',0x1000]])assert.equal(one(key)[0],button);
 assert.equal(sample(new Set(['KeyI','KeyL','KeyP','Enter']))[0],0x1160);
 assert.deepEqual(one('KeyI'),[0x40,0,0,0,0,1,0]);assert.deepEqual(one('KeyL'),[0x20,0,0,0,0,0,1]);
 assert.deepEqual(sample(new Set(['KeyD','KeyW','ShiftLeft'])).slice(1,3),[.5/Math.SQRT2,.5/Math.SQRT2]);
 assert.deepEqual(sample(new Set(['KeyM','KeyK'])).slice(3,5),[-1,1]);assert.deepEqual(sample(new Set(['Period','Comma'])).slice(3,5),[1,-1]);
 assert.deepEqual(sample(new Set(['KeyA','KeyD','KeyW','KeyS'])),neutralNativeSample());
});
test('a guest uses its local first gamepad and keyboard only on its assigned seat',async()=>{
 const {createBrowserNativeInput}=await import('../../engines/browser-native/browser-input.mjs');const target=new EventTarget(),document=new EventTarget();document.hidden=false;
 const input=createBrowserNativeInput({layout:'melee',target,document,getGamepads:()=>[pad()]});
 try{input.setNetworkSeat(1);assert.equal(input.keyboardPort,1);assert.deepEqual(input.samples(),[neutralNativeSample(),standardNativeSample(pad())]);input.suspend(true);assert(input.samples().flat().every(v=>v===0));input.suspend(false);
 const event=new Event('keydown',{cancelable:true});event.code='KeyP';target.dispatchEvent(event);assert.equal(input.samples()[1][0],256);assert.deepEqual(input.samples()[0],neutralNativeSample());
 }finally{input.dispose();}
});
