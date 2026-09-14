import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{planShadowDiagnostic,SHADOW_DIAGNOSTIC_PROC as PROC}from'./melee-shadow-diagnostic.js';
test('shadow diagnostic validates the original routine and reverses only its entry instruction',{skip:!process.env.MELEE_TEST_ISO},()=>{
 const fd=fs.openSync(process.env.MELEE_TEST_ISO,'r');const read=(a,n)=>{const b=Buffer.alloc(n);fs.readSync(fd,b,0,n,a);return b;};const dol=read(0x420,4).readUInt32BE(),h=read(dol,256);let bytes;
 for(let i=0;i<18;i++){const base=h.readUInt32BE(0x48+i*4),size=h.readUInt32BE(0x90+i*4);if(PROC>=base&&PROC+0x66c<=base+size)bytes=read(dol+h.readUInt32BE(i*4)+PROC-base,0x66c);}fs.closeSync(fd);assert.ok(bytes);
 const words=new Map();for(let i=0;i<bytes.length;i+=4)words.set(PROC+i,bytes.readUInt32BE(i));const rd=a=>words.get(a)||0,original=new Map(words);
 assert.deepEqual(planShadowDiagnostic(rd,true).writes,[]);const off=planShadowDiagnostic(rd,false);assert.equal(off.diagnosticOnly,true);assert.deepEqual(off.writes,[[PROC,0x4e800020]]);assert.deepEqual(words,original);for(const[a,v]of off.writes)words.set(a,v);assert.deepEqual(planShadowDiagnostic(rd,false).writes,[]);for(const[a,v]of planShadowDiagnostic(rd,true).writes)words.set(a,v);assert.deepEqual(words,original);
 words.set(PROC+100,0);const modified=new Map(words);assert.throws(()=>planShadowDiagnostic(rd,false),/original USA/);assert.deepEqual(words,modified);words.set(PROC,0);assert.throws(()=>planShadowDiagnostic(rd,false),/entry/);
});
