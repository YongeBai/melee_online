import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planRenderCostDiagnostic,RENDER_COST_SCOPES} from './melee-render-cost.js';
test('guarded diagnostic changes only one dispatch instruction and rejects foreign code',{skip:!process.env.MELEE_TEST_ISO},()=>{
  const fd=fs.openSync(process.env.MELEE_TEST_ISO,'r'),read=(at,n)=>{const b=Buffer.alloc(n);assert.equal(fs.readSync(fd,b,0,n,at),n);return b;};
  const dol=read(0x420,4).readUInt32BE(),header=read(dol,256),words=new Map();
  for(const {address:PC,bytes}of Object.values(RENDER_COST_SCOPES))for(let i=0;i<18;i++){
    const base=header.readUInt32BE(0x48+i*4),size=header.readUInt32BE(0x90+i*4);
    if(PC>=base&&PC+bytes<=base+size){const b=read(dol+header.readUInt32BE(i*4)+PC-base,bytes);for(let n=0;n<b.length;n+=4)words.set(PC+n,b.readUInt32BE(n));break;}
  }
  fs.closeSync(fd);assert.equal(words.size,Object.values(RENDER_COST_SCOPES).reduce((n,s)=>n+s.bytes/4,0));
  const get=a=>words.get(a)||0,before=new Map(words);
  for(const[scope,{address:PC}]of Object.entries(RENDER_COST_SCOPES)){
  const plan=planRenderCostDiagnostic(get,false,scope);assert.equal(plan.passed,false);assert.equal(plan.diagnosticOnly,true);
  assert.deepEqual(plan.writes,[[PC,0x4e800020]]);assert.deepEqual(words,before);
  words.set(PC,0x4e800020);assert.deepEqual(planRenderCostDiagnostic(get,false,scope).writes,[]);
  assert.deepEqual(planRenderCostDiagnostic(get,true,scope).writes,[[PC,0x7c0802a6]]);
  words.set(PC+4,0);assert.throws(()=>planRenderCostDiagnostic(get,false,scope),/original USA/);
  words.set(PC,before.get(PC));words.set(PC+4,before.get(PC+4));
  }
  assert.throws(()=>planRenderCostDiagnostic(get,0),/boolean/);
  assert.throws(()=>planRenderCostDiagnostic(get,false,'__proto__'),/Unknown/);
});
