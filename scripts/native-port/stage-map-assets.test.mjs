import test from 'node:test';
import assert from 'node:assert/strict';
import {convertBattlefieldMap,convertStageMap} from '../../engines/browser-native/stage-map-assets.mjs';
function fixture(change=()=>{},size=1792) {
  const body=new Uint8Array(size),d=new DataView(body.buffer),relocs=new Set(),root=0,param=800,joint=1300,camera=1400,light=1500;
  const ptr=(p,q)=>{relocs.add(p);d.setUint32(p,q);};
  ptr(0,48);d.setUint32(4,1);ptr(8,64);d.setUint32(12,7);ptr(24,500);d.setUint32(28,34);ptr(40,636);d.setUint32(44,4);
  ptr(48,joint);ptr(52,1560);d.setUint32(56,1);
  for(let i=0;i<7;i++){const p=64+i*52;ptr(p,joint);ptr(p+16,camera);ptr(p+24,1536);}
  for(let i=0;i<17;i++){ptr(500+i*8,light);body[504+i*8]=0xe0;}
  for(let i=0;i<4;i++)ptr(636+i*4,joint);
  d.setFloat32(param,1);ptr(param+176,1100);d.setUint32(param+180,1);d.setUint32(1100,31);
  d.setUint32(joint+4,1);for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  d.setUint16(camera+6,1);d.setFloat32(camera+40,0.1);d.setFloat32(camera+44,1000);d.setFloat32(camera+48,40);d.setFloat32(camera+52,4/3);
  d.setUint16(light+8,4);body.set([10,20,30,255],light+12);ptr(1536,1544);ptr(1544,light);
  ptr(1600,1620);ptr(1604,1632);d.setUint32(1620,9<<26);d.setUint32(1632,10<<26);
  change({d,body,relocs,param,joint,camera,light,ptr});
  const names=new TextEncoder().encode('map_head\0grGroundParam\0yakumono_param\0'),start=32+body.length+relocs.size*4,image=new Uint8Array(start+24+names.length),out=new DataView(image.buffer);
  [image.length,body.length,relocs.size,3,0].forEach((n,i)=>out.setUint32(i*4,n));image.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(start,root);out.setUint32(start+8,param);out.setUint32(start+12,9);out.setUint32(start+16,1600);out.setUint32(start+20,23);image.set(names,start+24);return image;
}
test('stage map imports typed camera, light and model data while preserving packed flags/colors',()=>{
  const b=fixture(),copy=b.slice(),r=convertBattlefieldMap(b),d=new DataView(r.image.buffer,32);
  assert.deepEqual(b,copy);assert.equal(r.count,7);assert.equal(r.typedOverrideRows,17);assert.equal(r.declaredOverrides,34);
  assert.equal(d.getUint16(1406,true),1);assert.equal(d.getFloat32(1452,true),Math.fround(4/3));assert.equal(r.image[32+504],0xe0);assert.deepEqual([...r.image.subarray(1544,1548)],[10,20,30,255]);
  assert.equal(r.models.length,1);assert.equal(r.cameras.length,1);assert.equal(r.lights.length,1);
});
test('stage callbacks import typed color scripts and reject unsafe script roots',()=>{
  const converted=convertBattlefieldMap(fixture(),{callbacks:true}),d=new DataView(converted.image.buffer,32);
  assert.equal(converted.yakumono,1600);assert.equal(d.getUint32(1620,true),9<<26);assert.equal(d.getUint32(1632,true),10<<26);
  for(const change of [a=>a.relocs.delete(1600),a=>a.ptr(1604,1792),a=>a.d.setUint32(1620,63<<26)])assert.throws(()=>convertBattlefieldMap(fixture(change),{callbacks:true}));
});
test('stage map refuses unsupported graphs and unsafe descriptor interpretation',()=>{
  for(const change of [
    a=>a.d.setUint32(12,8),a=>a.d.setUint32(28,17),a=>a.d.setUint16(a.camera+6,9),
    a=>a.ptr(a.camera,1300),a=>a.ptr(64+12,1600),a=>a.ptr(64+32,1300),
    a=>a.d.setUint32(64+36,1),a=>a.ptr(a.param+176,1788),
    a=>a.relocs.delete(64),a=>a.ptr(a.light+16,1790),
    a=>a.ptr(a.light+4,a.light),a=>a.d.setUint32(1100,32),
  ])assert.throws(()=>convertBattlefieldMap(fixture(change)));
});

function destination(change=()=>{}) {
  return fixture(a=>{
    const {d,body,ptr,light,joint}=a;
    ptr(8,1800);d.setUint32(12,10);
    for(let i=0;i<10;i++)for(let j=0;j<52;j+=4){const from=64+j,to=1800+i*52+j;d.setUint32(to,d.getUint32(from));if(a.relocs.has(from))a.relocs.add(to);}
    ptr(24,2400);d.setUint32(28,32);
    for(let i=0;i<16;i++){ptr(2400+i*8,light);body[2404+i*8]=0xe0;}
    ptr(32,2528);d.setUint32(36,3);ptr(40,2552);d.setUint32(44,1);ptr(2552,joint);
    for(let i=0;i<3;i++){ptr(2528+i*8,2800);body[2532+i*8]=i?0x80:0;}
    ptr(16,2560);d.setUint32(20,2);ptr(2560,2600);ptr(2564,2600);
    d.setUint16(2602,2);d.setFloat32(2612,1);ptr(2608,2700);ptr(2616,2724);
    ptr(1608,1620);ptr(1612,1632);d.setUint32(1100,32);
    change(a);
  },4096);
}
test('Final Destination imports spline arrays, shadow flags and four original callback scripts',()=>{
  const source=destination(),copy=source.slice(),map=convertStageMap(source,{stage:'destination',callbacks:true}),d=new DataView(map.image.buffer,32);
  assert.deepEqual(source,copy);assert.equal(map.count,10);assert.equal(map.splineCount,2);assert.equal(map.shadowCount,3);assert.equal(map.typedOverrideRows,16);
  assert.equal(d.getUint16(2602,true),2);assert.equal(d.getUint32(2608,true),2700);assert.equal(d.getUint8(2540),0x80);assert.equal(d.getUint32(1612,true),1632);
  for(const change of [a=>a.d.setUint16(2602,1),a=>a.d.setFloat32(2700,NaN),a=>a.d.setUint32(20,3),a=>a.d.setUint32(36,4),a=>a.d.setUint32(28,34),a=>a.relocs.delete(1612)])assert.throws(()=>convertStageMap(destination(change),{stage:'destination',callbacks:true}));
  assert.throws(()=>convertBattlefieldMap(source));assert.throws(()=>convertStageMap(source,{stage:'unknown'}));
});
test('stage light animation imports its referenced spline joint with explicit ownership',()=>{
  const source=destination(a=>{a.ptr(2804,2850);a.ptr(2862,2900);});
  // An unaligned object-pointer slot must never be treated as a valid AObj.
  assert.throws(()=>convertStageMap(source,{stage:'destination'}));
  const valid=destination(a=>{
    a.ptr(2804,2852);a.ptr(2864,2900);a.d.setUint32(2904,0x4000);a.ptr(2916,2600);
    for(let i=0;i<3;i++)a.d.setFloat32(2932+i*4,1);
  });
  const map=convertStageMap(valid,{stage:'destination'});
  assert.ok(map.models.some(m=>m.root===2900&&m.nodes===1));assert.ok(map.pointerSlots.has(2864));
});

function dreamland(change=()=>{}) {
  return fixture(a=>{
    const {d,body,ptr,light,joint}=a;
    ptr(8,1800);d.setUint32(12,8);
    for(let i=0;i<8;i++)for(let j=0;j<52;j+=4){const from=64+j,to=1800+i*52+j;d.setUint32(to,d.getUint32(from));if(a.relocs.has(from))a.relocs.add(to);}
    ptr(24,2400);d.setUint32(28,38);
    for(let i=0;i<19;i++){ptr(2400+i*8,light);body[2404+i*8]=0xe0;}
    ptr(32,2552);d.setUint32(36,10);ptr(40,2632);d.setUint32(44,8);
    for(let i=0;i<10;i++){ptr(2552+i*8,2800);body[2556+i*8]=0x80;}
    for(let i=0;i<8;i++)ptr(2632+i*4,joint);
    a.relocs.delete(1600);a.relocs.delete(1604);
    for(let i=0;i<4;i++)d.setInt16(1600+i*2,[-4,12,30,0][i]);
    d.setInt32(1608,600);d.setInt32(1612,1200);
    for(let i=16;i<52;i+=4)d.setFloat32(1600+i,i===16?.2:-17);
    d.setUint32(1100,28);change(a);
  },4096);
}
test('Dream Land imports signed timer halves and exact float wind parameters, without script reinterpretation',()=>{
  const source=dreamland(),copy=source.slice(),map=convertStageMap(source,{stage:'dreamland',callbacks:true}),d=new DataView(map.image.buffer,32);
  assert.deepEqual(source,copy);assert.equal(map.count,8);assert.equal(map.shadowCount,10);assert.equal(map.typedOverrideRows,19);
  assert.equal(d.getInt16(1600,true),-4);assert.equal(d.getInt16(1602,true),12);assert.equal(d.getInt32(1608,true),600);
  assert.equal(d.getFloat32(1616,true),Math.fround(.2));assert.equal(d.getFloat32(1620,true),-17);assert.equal(map.pointerSlots.has(1600),false);
  for(const change of [a=>a.d.setUint32(12,9),a=>a.d.setUint32(36,9),a=>a.d.setUint32(28,19),a=>a.d.setFloat32(1616,NaN),a=>a.ptr(1608,1300)])assert.throws(()=>convertStageMap(dreamland(change),{stage:'dreamland',callbacks:true}));
});

test('stage imports empty shape-animation topology and refuses morph tracks or cycles',()=>{
  const make=change=>fixture(a=>{a.ptr(64+12,1640);a.ptr(1640,1656);a.ptr(1656,1668);a.ptr(1664,1680);change?.(a);});
  const source=make(),before=source.slice(),map=convertBattlefieldMap(source),d=new DataView(map.image.buffer,32);
  assert.deepEqual(source,before);assert.equal(map.animations[0].shape,1);assert.equal(d.getUint32(1656,true),1668);assert.equal(d.getUint32(1664,true),1680);
  for(const change of [a=>a.ptr(1656,1656),a=>a.ptr(1680,1680),a=>a.ptr(1684,1700)])assert.throws(()=>convertBattlefieldMap(make(change)));
});

function fountain(change=()=>{}) {
  const bytes=destination(a=>{
    const {d,body,ptr,light,joint,relocs}=a;
    for(let at=2400;at<3000;at+=4){d.setUint32(at,0);relocs.delete(at);}
    d.setUint32(12,5);ptr(24,2400);d.setUint32(28,34);
    for(let i=0;i<17;i++){ptr(2400+i*8,light);body[2404+i*8]=0xe0;}
    ptr(32,2536);d.setUint32(36,6);ptr(40,2584);d.setUint32(44,4);
    for(let i=0;i<6;i++)body[2540+i*8]=0x80;
    for(let i=0;i<4;i++)ptr(2584+i*4,joint);
    ptr(16,2640);d.setUint32(20,1);ptr(2640,2680);
    d.setUint16(2682,2);d.setFloat32(2692,1);ptr(2688,2736);ptr(2696,2760);
    for(let at=1600;at<1684;at+=4){relocs.delete(at);d.setFloat32(at,at===1600?20:at===1608?28:.25);}
    d.setUint32(1604,0xdeadbeef);d.setUint32(1100,2);
    // Empty valid geometry still references a real typed material/texture graph.
    ptr(joint+16,3000);ptr(3008,3216);ptr(3012,3040);ptr(3048,3100);
    d.setUint16(3054,1);ptr(3056,3168);
    [9,1,1,4].forEach((v,i)=>d.setUint32(3100+i*4,v));d.setUint32(3124,255);
    ptr(3224,3296);ptr(3228,3256);d.setFloat32(3268,1);
    for(let i=0;i<3;i++)d.setFloat32(3324+i*4,1);body[3356]=body[3357]=1;ptr(3372,3400);
    ptr(3400,3456);d.setUint16(3404,8);d.setUint16(3406,8);
    change(a);
  });
  const v=new DataView(bytes.buffer),size=v.getUint32(4),count=v.getUint32(8),pub=32+size+count*4;
  const names=['map_head','grGroundParam','yakumono_param','GrdIzumiStar_TopN_joint','GrdIzumi_cd_wt_GrdIzumiDummy1_1_image_desc'];
  const encoded=names.map(n=>new TextEncoder().encode(n+'\0')),image=new Uint8Array(pub+names.length*8+encoded.reduce((n,b)=>n+b.length,0)),out=new DataView(image.buffer);
  image.set(bytes.subarray(0,pub));out.setUint32(0,image.length);out.setUint32(12,names.length);
  let text=0;[0,800,1600,1300,3400].forEach((offset,i)=>{out.setUint32(pub+i*8,offset);out.setUint32(pub+i*8+4,text);image.set(encoded[i],pub+names.length*8+text);text+=encoded[i].length;});return image;
}
test('Fountain imports platform float parameters, unused integer bits and typed extra public roots',()=>{
  const source=fountain(),before=source.slice(),map=convertStageMap(source,{stage:'fountain',callbacks:true}),d=new DataView(map.image.buffer,32);
  assert.deepEqual(source,before);assert.equal(map.count,5);assert.equal(map.shadowCount,6);assert.equal(map.splineCount,1);
  assert.equal(d.getFloat32(1600,true),20);assert.equal(d.getFloat32(1608,true),28);assert.equal(d.getUint32(1604,true),0xdeadbeef);
  assert.deepEqual(map.extraModels,[{name:'GrdIzumiStar_TopN_joint',root:1300}]);assert.equal(d.getUint16(3404,true),8);assert.equal(d.getUint32(3400,true),3456);
  for(const change of [a=>a.d.setFloat32(1608,NaN),a=>a.ptr(1608,1300),a=>a.d.setUint32(36,5),a=>a.d.setUint32(20,2),a=>a.d.setUint16(3404,0)])assert.throws(()=>convertStageMap(fountain(change),{stage:'fountain',callbacks:true}));
});

function story(change=()=>{}) {
  return destination(a=>{
    const {d,ptr,light,joint,relocs}=a;
    d.setUint32(4,2);ptr(60,joint);ptr(64,1560);d.setUint32(68,1);d.setUint32(12,4);
    for(let at=2400;at<2552;at+=4){d.setUint32(at,0);relocs.delete(at);}
    d.setUint32(28,20);ptr(32,0);relocs.delete(32);d.setUint32(36,0);ptr(40,2480);d.setUint32(44,7);
    for(let i=0;i<10;i++)ptr(2400+i*8,light);
    for(let i=0;i<7;i++)ptr(2480+i*4,joint);
    d.setUint32(20,1);ptr(1800+2*52+32,2840);d.setUint32(1800+2*52+36,1);
    d.setInt16(2840,-1);d.setInt16(2842,-1);d.setInt16(2844,1);
    for(let i=0;i<36;i+=4){relocs.delete(1600+i);d.setFloat32(1600+i,i?30:600);}
    d.setUint32(1100,8);change(a);
  });
}
test('Story imports both binding tables, signed collision-joint triples and stage timers',()=>{
  const source=story(),copy=source.slice(),r=convertStageMap(source,{stage:'story',callbacks:true}),d=new DataView(r.image.buffer,32);
  assert.deepEqual(source,copy);assert.equal(r.count,4);assert.equal(d.getUint32(4,true),2);assert.equal(d.getInt16(2840,true),-1);assert.equal(d.getInt16(2844,true),1);assert.equal(d.getFloat32(1600,true),600);
  for(const change of [a=>a.d.setUint32(4,1),a=>a.d.setUint32(1800+2*52+36,2),a=>a.ptr(2840,1300),a=>a.d.setFloat32(1600,NaN)])assert.throws(()=>convertStageMap(story(change),{stage:'story',callbacks:true}));
});

test('Stadium preserves active models, null transformation descriptors and packed callback colors',()=>{
  const build=change=>fixture(a=>{
    const {d,ptr,joint,light,body}=a;ptr(8,1800);d.setUint32(12,10);
    for(let i=0;i<10;i++)for(let j=0;j<52;j+=4){const from=64+j,to=1800+i*52+j;d.setUint32(to,d.getUint32(from));if(a.relocs.has(from))a.relocs.add(to);}
    for(const i of [3,4,6,7,8,9])for(const j of [0,16,24]){const p=1800+i*52+j;d.setUint32(p,0);a.relocs.delete(p);}
    ptr(1800+9*52+32,2900);d.setUint32(1800+9*52+36,1);d.setInt16(2900,7);d.setInt16(2902,-1);d.setInt16(2904,0);
    ptr(24,2400);d.setUint32(28,48);for(let i=0;i<24;i++){if(i<4)ptr(2400+i*8,light);body[2404+i*8]=0xe0;}
    ptr(40,2592);d.setUint32(44,44);for(let i=0;i<2;i++)ptr(2592+i*4,joint);
    a.relocs.delete(1600);a.relocs.delete(1604);for(let i=0;i<84;i++)body[1600+i]=0;
    for(let i=0;i<28;i+=4)d.setInt32(1600+i,3600+i);body.set([150,180,200,255],1628);for(let i=72;i<82;i+=2)d.setInt16(1600+i,i-80);
    d.setUint32(1100,3);change?.(a);
  },4096);
  const source=build(),copy=source.slice(),r=convertStageMap(source,{stage:'stadium',callbacks:true}),v=new DataView(r.image.buffer,32);
  assert.deepEqual(source,copy);assert.equal(r.count,10);assert.equal(v.getInt32(1600,true),3600);assert.equal(v.getInt16(1672,true),-8);assert.deepEqual([...r.image.subarray(1660,1664)],[150,180,200,255]);assert.equal(v.getInt16(2902,true),-1);
  for(const change of [a=>a.d.setUint32(28,24),a=>a.d.setUint32(44,43),a=>a.d.setUint32(1800+9*52+36,2),a=>a.ptr(1628,1300)])assert.throws(()=>convertStageMap(build(change),{stage:'stadium',callbacks:true}));
});
