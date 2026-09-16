// HSD archives carry big-endian metadata and relative pointers. Payloads require
// per-type conversion; never word-swap an archive containing packed bytes.
export function inspectArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const check = (ok, message) => { if (!ok) throw Error('HSD archive: ' + message); };
  check(bytes.length >= 32, 'truncated header');
  const fileSize = view.getUint32(0), dataSize = view.getUint32(4);
  const counts = [8,12,16].map(at => view.getUint32(at));
  const [relocCount, publicCount, externCount] = counts;
  const relocStart = 32 + dataSize, publicStart = relocStart + relocCount * 4;
  const externStart = publicStart + publicCount * 8, stringStart = externStart + externCount * 8;
  check(fileSize === bytes.length && stringStart <= fileSize, 'invalid section sizes');
  const relocations = new Set();
  for (let i = 0; i < relocCount; i++) {
    const offset = view.getUint32(relocStart + i * 4);
    check(offset % 4 === 0 && offset + 4 <= dataSize, 'invalid relocation slot');
    check(!relocations.has(offset), 'duplicate relocation');
    check(view.getUint32(32 + offset) < dataSize, 'relocation outside data');
    relocations.add(offset);
  }
  const decoder = new TextDecoder('utf-8', {fatal:true});
  function symbols(start, count, external) {
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      const offset = view.getUint32(start + i*8), nameAt = stringStart + view.getUint32(start + i*8 + 4);
      check(offset < dataSize || (external && offset === 0xffffffff), 'symbol outside data');
      check(nameAt < bytes.length, 'symbol name outside string table');
      const end = bytes.indexOf(0, nameAt);
      check(end > nameAt, 'unterminated or empty symbol');
      const name = decoder.decode(bytes.subarray(nameAt, end));
      check(!entries.has(name), 'duplicate symbol name');
      entries.set(name, offset);
    }
    return entries;
  }
  return {bytes, data:new DataView(bytes.buffer, bytes.byteOffset + 32, dataSize),
    dataSize, relocations, publics:symbols(publicStart, publicCount, false),
    externs:symbols(externStart, externCount, true)};
}

// lbArchive_InitializeDAT explicitly binds every external symbol to NULL.
// Use only at that game-loader boundary, with the expected symbols supplied
// by the caller. This is not a substitute for an archive's later extern links.
export function initializeArchiveExternals(input,allowedSymbols) {
  const a=inspectArchive(input),allowed=new Set(allowedSymbols);
  if([...a.externs.keys()].some(name=>!allowed.has(name)))throw Error('Unexpected archive external symbol');
  if(!a.externs.size)return a.bytes;
  const bytes=Uint8Array.from(a.bytes),out=new DataView(bytes.buffer),seen=new Set();
  for(const start of a.externs.values())for(let at=start;at!==0xffffffff;){
    if(at%4||at<0||at+4>a.dataSize||seen.has(at)||a.relocations.has(at))throw Error('Invalid archive external chain');
    seen.add(at);const next=a.data.getUint32(at);out.setUint32(32+at,0);at=next;
  }
  // Keep the existing public string table offsets; remove only the extern rows.
  const start=32+a.dataSize+a.relocations.size*4+a.publics.size*8,end=start+a.externs.size*8;
  const image=new Uint8Array(bytes.length-(end-start));image.set(bytes.subarray(0,start));image.set(bytes.subarray(end),start);
  const header=new DataView(image.buffer);header.setUint32(0,image.length);header.setUint32(16,0);
  return image;
}

// Prepare the container for the original native HSD parser. Descriptor scalars
// still require a typed importer; packed payloads and strings are untouched.
export function nativeArchiveImage(archive,publics) {
  if(archive.externs.size)throw Error('Native archives require explicit extern linking');
  if(!(publics instanceof Map)||!publics.size)throw Error('Typed native public symbols required');
  for(const [name,offset] of publics)if(archive.publics.get(name)!==offset)
    throw Error('Native public symbol is not in the source archive');
  const strings=[...publics.keys()].map(name=>new TextEncoder().encode(name+'\0'));
  const table=32+archive.dataSize,symbolStart=table+archive.relocations.size*4+publics.size*8;
  const image=new Uint8Array(symbolStart+strings.reduce((n,b)=>n+b.length,0)),out=new DataView(image.buffer);
  image.set(archive.bytes.subarray(0,32+archive.dataSize));
  [image.length,archive.dataSize,archive.relocations.size,publics.size,0].forEach((v,i)=>out.setUint32(i*4,v,true));
  const source=new DataView(archive.bytes.buffer,archive.bytes.byteOffset,archive.bytes.length);
  for(const at of [24,28])out.setUint32(at,source.getUint32(at),true);
  let index=0;
  for(const at of archive.relocations) {
    out.setUint32(table+index++*4,at,true);out.setUint32(32+at,archive.data.getUint32(at),true);
  }
  let textOffset=0;index=0;
  for(const offset of publics.values()) {
    const at=table+archive.relocations.size*4+index*8;
    out.setUint32(at,offset,true);out.setUint32(at+4,textOffset,true);
    image.set(strings[index],symbolStart+textOffset);textOffset+=strings[index++].length;
  }
  return image;
}

// Build a native archive for an explicitly imported subgraph. The caller
// supplies typed native data and only the pointers/publics it has validated.
export function nativeSubgraphImage(data,relocations,publics) {
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),slots=[...relocations];
  if(new Set(slots).size!==slots.length||!publics.size)throw Error('Invalid native subgraph metadata');
  for(const at of slots)if(!Number.isInteger(at)||at<0||at%4||at+4>data.length||view.getUint32(at,true)>=data.length)
    throw Error('Invalid native subgraph relocation');
  const strings=[];
  for(const [name,at] of publics) {
    if(!name||name.includes('\0')||!Number.isInteger(at)||at<0||at>=data.length)throw Error('Invalid native subgraph symbol');
    strings.push(new TextEncoder().encode(name+'\0'));
  }
  const start=32+data.length,textStart=start+slots.length*4+publics.size*8;
  const image=new Uint8Array(textStart+strings.reduce((n,s)=>n+s.length,0)),out=new DataView(image.buffer);
  [image.length,data.length,slots.length,publics.size,0].forEach((v,i)=>out.setUint32(i*4,v,true));image.set(data,32);
  slots.forEach((at,i)=>out.setUint32(start+i*4,at,true));let index=0,text=0;
  for(const at of publics.values()) {
    out.setUint32(start+slots.length*4+index*8,at,true);out.setUint32(start+slots.length*4+index*8+4,text,true);
    image.set(strings[index],textStart+text);text+=strings[index++].length;
  }
  return image;
}

// A private BE view lets an existing typed importer visit an explicitly known
// nested root. Body offsets and relocation metadata retain their identities.
export function archiveRootView(archive,name,offset) {
  if(archive.externs.size||!name||name.includes('\0')||!Number.isInteger(offset)||offset<0||offset>=archive.dataSize)
    throw Error('Invalid nested archive root');
  const text=new TextEncoder().encode(name+'\0'),start=32+archive.dataSize+archive.relocations.size*4;
  const bytes=new Uint8Array(start+8+text.length),view=new DataView(bytes.buffer);
  bytes.set(archive.bytes.subarray(0,start));view.setUint32(0,bytes.length);view.setUint32(12,1);view.setUint32(16,0);
  view.setUint32(start,offset);bytes.set(text,start+8);return bytes;
}
