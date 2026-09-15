import {inspectArchive} from './archive.mjs';

// Explicit USA 1.02 MapCollData / Vec2 / MapLine / MapJoint conversion. This
// materializes only the collision subgraph, never claims to convert the stage's
// models, animation tracks, camera descriptors, or moving-platform callbacks.
export function convertStageCollision(input) {
  const archive = inspectArchive(input), data = archive.data;
  const root = archive.publics.get('coll_data');
  const check = (ok, message) => { if (!ok) throw Error('Stage collision: ' + message); };
  const range = (offset, size) => check(Number.isSafeInteger(offset) && offset >= 0 &&
    offset + size <= data.byteLength, 'invalid data range');
  check(root !== undefined, 'missing coll_data');
  range(root, 48);
  const definitions = [{slot:0, countAt:4, stride:8}, {slot:8, countAt:12, stride:16},
    {slot:36, countAt:40, stride:40}];
  let size = 48;
  const arrays = definitions.map(({slot, countAt, stride}) => {
    const source = data.getUint32(root+slot), count = data.getInt32(root+countAt), offset = size;
    check(count >= 0 && count <= 100000, 'invalid array count');
    range(source, count*stride);
    check(!count || archive.relocations.has(root+slot), 'unrelocated array pointer');
    size += count*stride;
    return {slot, source, count, stride, offset};
  });
  const relocs = arrays.filter(a => a.count).map(a => a.slot);
  const symbol = new TextEncoder().encode('coll_data\0');
  const image = new Uint8Array(32 + size + relocs.length*4 + 8 + symbol.length);
  const out = new DataView(image.buffer), body = 32;
  [image.length, size, relocs.length, 1, 0].forEach((v,i) => out.setUint32(i*4,v,true));
  const copy32 = (src,dst) => out.setUint32(body+dst,data.getUint32(src),true);
  const copy16 = (src,dst) => out.setUint16(body+dst,data.getUint16(src),true);
  for (const at of [4,12,40,44]) copy32(root+at,at);
  for (let at=16;at<36;at+=2) copy16(root+at,at);
  for (const a of arrays) out.setUint32(body+a.slot, a.count ? a.offset : 0, true);
  const [verts, lines, joints] = arrays;
  let vertexMetric = 0, lineMetric = 0, jointMetric = 0;
  for (let i=0;i<verts.count*2;i++) {
    const v = data.getFloat32(verts.source+i*4);
    check(Number.isFinite(v), 'nonfinite vertex');
    vertexMetric += v*(i+1);
    copy32(verts.source+i*4,verts.offset+i*4);
  }
  for (let i=0;i<lines.count;i++) {
    const at=lines.source+i*16;
    for (let f=0;f<8;f++) {
      const signed = f>=2 && f<=5;
      const v = signed ? data.getInt16(at+f*2) : data.getUint16(at+f*2);
      if (f<2) check(v<verts.count, 'invalid line vertex');
      if (signed) check(v>=-1 && v<lines.count, 'invalid line neighbour');
      lineMetric += v*(f+1);
      copy16(at+f*2,lines.offset+i*16+f*2);
    }
  }
  for (let i=0;i<joints.count;i++) {
    const src=joints.source+i*40, dst=joints.offset+i*40;
    for (let at=0;at<40;) {
      if (at>=20 && at<36) {
        const value=data.getFloat32(src+at);
        check(Number.isFinite(value), 'nonfinite joint bound');
        jointMetric+=value; copy32(src+at,dst+at); at+=4;
      } else {jointMetric+=data.getInt16(src+at); copy16(src+at,dst+at); at+=2;}
    }
  }
  const table=32+size;
  relocs.forEach((offset,i)=>out.setUint32(table+i*4,offset,true));
  // The single public symbol points to the header at data offset zero.
  image.set(symbol,table+relocs.length*4+8);
  return {image, metrics:[verts.count,lines.count,joints.count,vertexMetric,lineMetric,jointMetric],
    dataBytes:size, sourceRoot:root};
}

export function loadStageCollision(module, converted) {
  const image=module._malloc(converted.image.length);
  if (!image) throw Error('Could not allocate collision image');
  module.HEAPU8.set(converted.image,image);
  const archive=module._portArchiveOpen(image,converted.image.length);
  if (!archive) {module._free(image); throw Error('Native archive parser rejected collision image');}
  const name=new TextEncoder().encode('coll_data\0'), namePtr=module._malloc(name.length);
  if (!namePtr) {module._portArchiveClose(archive);module._free(image);throw Error('Could not allocate symbol');}
  module.HEAPU8.set(name,namePtr);
  const pointer=module._portArchiveSymbol(archive,namePtr);
  module._free(namePtr);
  if (!pointer) {module._portArchiveClose(archive);module._free(image);throw Error('Native collision symbol missing');}
  let disposed=false;
  return {pointer, metrics:()=> {
    if(disposed)throw Error('Collision archive disposed');
    return Array.from({length:6},(_,i)=>module._portStageMetric(pointer,i));
  }, dispose:()=> {if(!disposed){module._portArchiveClose(archive);module._free(image);disposed=true;}}};
}
