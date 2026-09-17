import test from 'node:test';import assert from 'node:assert/strict';
import {nativeCostumeSpec,nativeKirbyCostumeSpec} from '../../engines/browser-native/costume-assets.mjs';
function moduleFor(names){const bytes=new Uint8Array(1024),pointers=[];let offset=32;for(const name of names){if(name===null){pointers.push(0);continue;}pointers.push(offset);const text=new TextEncoder().encode(name+'\0');bytes.set(text,offset);offset+=text.length;}return {HEAPU8:bytes,_portCostumeCount:()=>4,_portCostumeString:(kind,index,field)=>pointers[field]};}
test('costume metadata retains original index and names, including the exact USA Falcon alias',()=>{
 assert.deepEqual(nativeCostumeSpec(moduleFor(['PlFxLa.dat','PlyFox5KLa_Share_joint','PlyFox5KLa_Share_matanim_joint']),1,2),{kind:1,index:2,requestedName:'PlFxLa.dat',name:'PlFxLa.dat',joint:'PlyFox5KLa_Share_joint',animation:'PlyFox5KLa_Share_matanim_joint'});
 assert.equal(nativeCostumeSpec(moduleFor(['PlCaRe.','PlyCaptain5KRe_Share_joint',null]),2,2).name,'PlCaRe.usd');
});
test('Kirby copy metadata uses Kirby color count and the original copy table, including shared Game & Watch files',()=>{
 const m=moduleFor(['PlKbBuCpFc.dat','PlyKirbyFcBu_Share_joint','PlyKirbyFcBu_Share_matanim_joint']);
 m._portCostumeCount=kind=>{assert.equal(kind,4);return 6;};
 m._portKirbyCostumeString=(kind,index,field)=>{assert.equal(kind,22);assert.equal(index,2);return m._portCostumeString(kind,index,field);};
 assert.equal(nativeKirbyCostumeSpec(m,22,2).name,'PlKbBuCpFc.dat');
 for(const [kind,index]of [[1,2],[22,6],[22,-1],[NaN,0]])assert.throws(()=>nativeKirbyCostumeSpec(m,kind,index),/Invalid original costume index/);
 const gw=moduleFor(['PlKbNrCpGw.dat','PlyKirbyGw_Share_joint','PlyKirbyGw_Share_matanim_joint']);gw._portCostumeCount=()=>6;gw._portKirbyCostumeString=gw._portCostumeString;
 assert.equal(nativeKirbyCostumeSpec(gw,24,5).name,'PlKbNrCpGw.dat');
});
test('costume metadata rejects invalid indices before calling into C and does not guess arbitrary locale names',()=>{
 const m=moduleFor(['PlFxLa.dat','joint',null]);m._portCostumeString=()=>{throw Error('must not reach C');};
 for(const [kind,index]of [[-1,0],[27,0],[1.5,0],[1,-1],[1,4],[1,NaN]])assert.throws(()=>nativeCostumeSpec(m,kind,index),/Invalid original costume index/);
 assert.throws(()=>nativeCostumeSpec(moduleFor(['PlFxLa.','joint',null]),1,2),/metadata/);
 assert.throws(()=>nativeCostumeSpec(moduleFor(['PlFxLa.dat',null,null]),1,2),/metadata/);
});
