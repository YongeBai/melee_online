import test from 'node:test';
import assert from 'node:assert/strict';
import {createGcAdapter,gcNativeSample,gcOrigin,gcPortConnected} from '../../engines/browser-native/native-gc-adapter.mjs';

const block=(status,b1,b2,x,y,cx,cy,l,r)=>new Uint8Array([status,b1,b2,x,y,cx,cy,l,r]);
const origin=gcOrigin(block(0x10,0,0,128,127,129,128,30,31));

test('adapter buttons map to the native controller bits',()=>{
 assert.equal(gcPortConnected(block(0,0,0,0,0,0,0,0,0)),false);
 assert.equal(gcPortConnected(block(0x14,0,0,0,0,0,0,0,0)),true);
 const all=gcNativeSample(block(0x10,0xFF,0x0F,128,127,129,128,30,31),origin);
 assert.equal(all[0],0x100|0x200|0x400|0x800|1|2|4|8|0x1000|0x10|0x20|0x40);
 assert.deepEqual(gcNativeSample(block(0x10,0x01,0x02,128,127,129,128,30,31),origin),[0x110,0,0,0,0,0,0]);
});

test('sticks subtract the origin and follow Melee clamp and scale',()=>{
 // 40 units right of origin: inside the 80-unit circle.
 assert.deepEqual(gcNativeSample(block(0x10,0,0,168,127,129,128,30,31),origin).slice(1,3),[.5,0]);
 // Beyond the circle: scaled back to radius 80 with truncation of each axis.
 const [,x,y]=gcNativeSample(block(0x10,0,0,228,227,129,128,30,31),origin);
 assert.deepEqual([x*80,y*80],[56,56]);
 // Raw values saturate as signed bytes before clamping.
 assert.equal(gcNativeSample(block(0x10,0,0,0,127,129,128,30,31),origin)[1],-1);
 // C-stick uses the same clamp; Y is not inverted by the adapter.
 assert.deepEqual(gcNativeSample(block(0x10,0,0,128,127,129,188,30,31),origin).slice(3,5),[0,.75]);
});

test('triggers subtract their origin, clamp at 140 and scale by 140',()=>{
 assert.deepEqual(gcNativeSample(block(0x10,0,0,128,127,129,128,100,31),origin).slice(5),[70/140,0]);
 assert.deepEqual(gcNativeSample(block(0x10,0,0,128,127,129,128,255,10),origin).slice(5),[1,0]);
});

test('reports establish per-port origins and release on disconnect',async()=>{
 const listeners={};let sent=null;
 const device={vendorId:0x057E,productId:0x0337,opened:false,async open(){this.opened=true;},addEventListener(type,f){listeners[type]=f;},removeEventListener(){},async sendReport(id,data){sent=id;},async close(){}};
 const hid={async requestDevice(){return [device];},async getDevices(){return [device];},addEventListener(){}};
 const adapter=createGcAdapter({hid});assert.equal(await adapter.request(),true);assert.equal(sent,0x13);
 const report=bytes=>listeners.inputreport({reportId:0x21,data:new DataView(bytes.buffer)});
 const frame=new Uint8Array(36);frame.set(block(0x10,0,0,120,130,128,128,20,20),0);report(frame);
 assert.deepEqual(adapter.samples(),[[0,0,0,0,0,0,0]],'first report is the resting origin');
 frame.set(block(0x10,0x01,0,160,130,128,128,20,20),0);report(frame);
 assert.deepEqual(adapter.samples(),[[0x100,.5,0,0,0,0,0]]);
 frame.set(block(0,0,0,0,0,0,0,0,0),0);report(frame);assert.deepEqual(adapter.samples(),[]);
 assert.deepEqual(adapter.snapshot().ports,[false,false,false,false]);
});
