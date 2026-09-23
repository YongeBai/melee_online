import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {convertAudioHeader,decodeAdpcm} from '../../engines/browser-native/native-sfx.mjs';
import {adaptAxDriverClock,adaptSynthBankFill} from './portable-source.mjs';

const upstream=path.resolve(import.meta.dirname,'../../engines/melee-decomp');

test('sound bank headers become native words and 32-bit nibble addresses',()=>{
 // One sound with one channel: header words, table (channels, rate) and a
 // 0x40-byte channel header, all big-endian as on the disc.
 const b=new Uint8Array(0x10+8+0x40),v=new DataView(b.buffer);
 v.setUint32(0,8+0x40);v.setUint32(4,0x100);v.setUint32(8,1);v.setUint32(12,516);
 v.setUint32(0x10,1);v.setUint32(0x14,32000);
 const ch=0x18;v.setUint16(ch,1);v.setUint16(ch+2,0);v.setUint32(ch+4,0x12345);v.setUint32(ch+8,0x23456);v.setUint32(ch+12,2);
 for(let i=0;i<16;i++)v.setInt16(ch+0x10+i*2,-i*100);v.setInt16(ch+0x34,-7);
 const out=new DataView(convertAudioHeader('/audio/us/test.ssm',b).buffer);
 assert.deepEqual([out.getUint32(0,true),out.getUint32(8,true),out.getUint32(12,true)],[8+0x40,1,516]);
 assert.deepEqual([out.getUint32(0x10,true),out.getUint32(0x14,true)],[1,32000]);
 assert.equal(out.getUint16(ch,true),1);
 assert.deepEqual([out.getUint32(ch+4,true),out.getUint32(ch+8,true),out.getUint32(ch+12,true)],[0x12345,0x23456,2]);
 assert.equal(out.getInt16(ch+0x10+3*2,true),-300);assert.equal(out.getInt16(ch+0x34,true),-7);
 assert.equal(v.getUint32(0),8+0x40,'the source bytes are not modified');
 const sem=new Uint8Array([0,0,0,2,1,2,3,4]),semOut=new DataView(convertAudioHeader('/audio/us/smash2.sem',sem).buffer);
 assert.deepEqual([semOut.getUint32(0,true),semOut.getUint32(4,true)],[2,0x01020304]);
 const truncated=new Uint8Array(0x18);new DataView(truncated.buffer).setUint32(8,3);
 assert.throws(()=>convertAudioHeader('/audio/us/bad.ssm',truncated),/overrun/);
});

test('DSP-ADPCM decoding follows frame headers, history and saturation',()=>{
 // Frame 0: scale 2^1, coefficient pair 0 = (2048,0) i.e. y = x + prev.
 const data=new Uint8Array(16);data[0]=0x01;data[1]=0x11;data[2]=0x7F;
 const coefs=[2048,0,...Array(14).fill(0)];
 const pcm=decodeAdpcm(data,coefs,2,5);
 assert.deepEqual(Array.from(pcm,x=>Math.round(x*32768)),[2,4,18,16]);
 // History seeds the predictor; nibble 8..15 are negative.
 assert.equal(Math.round(decodeAdpcm(new Uint8Array([0x01,0xF0]),coefs,2,2,100,0)[0]*32768),98);
 // Crossing a frame boundary skips the next frame's two header nibbles.
 const two=new Uint8Array(16);two[0]=0x00;two[8]=0x00;two[9]=0x10;
 assert.equal(decodeAdpcm(two,coefs,15,18).length,2);
 const loud=new Uint8Array([0x0B,0x77,0x77]);
 assert.ok(decodeAdpcm(loud,coefs,2,5).every(x=>x<=32767/32768),'saturates at the 16-bit range');
});

test('portable adapters keep the original sound driver and synthesizer layout',{skip:!fs.existsSync(upstream)},()=>{
 const driver=fs.readFileSync(path.join(upstream,'src/sysdolphin/baselib/axdriver.c'),'utf8'),adapted=adaptAxDriverClock(driver);
 assert.match(adapted,/static void portMasterClock\(int frame\)\n\{\n    \(void\) frame;\n    fn_8038CC1C\(\);\n\}/);
 assert.ok(adapted.includes('HSD_SynthSFXSetDriverMasterClockCallback(portMasterClock);')&&!adapted.includes('SetDriverMasterClockCallback(fn_8038CC1C)'));
 const synth=fs.readFileSync(path.join(upstream,'src/sysdolphin/baselib/synth.c'),'utf8'),fill=adaptSynthBankFill(synth);
 assert.ok(fill.includes('hsd_SynthSFXBank[bank_id] = (int) offset;')&&!fill.includes('[bank_id + 0x80 / 4]'));
 assert.throws(()=>adaptSynthBankFill(fill),/changed/);
});
