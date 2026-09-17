const encode=new TextEncoder();
function withStrings(module,strings,callback) {
  const pointers=[];
  try {
    for(const string of strings) {
      if(typeof string!=='string'||string.includes('\0'))throw Error('Invalid native asset string');
      const bytes=encode.encode(string+'\0'),pointer=module._malloc(bytes.length);
      if(!pointer)throw Error('Native string allocation failed');
      pointers.push(pointer);module.__dirtyMark?.(pointer,bytes.length);module.HEAPU8.set(bytes,pointer);
    }
    return callback(...pointers);
  } finally {for(const p of pointers)module._free(p);}
}
// Only native-layout images from a typed importer belong here, never raw DATs.
export function installResidentFile(module,name,image) {
  if(!(image instanceof Uint8Array)||image.length<32||new DataView(image.buffer,image.byteOffset,image.byteLength).getUint32(0,true)!==image.length)
    throw Error('Resident archive must have native metadata from a typed importer');
  return installResidentBytes(module,name,image);
}
// A bundle contains multiple individually converted archives at fixed offsets.
export function installResidentBytes(module,name,image) {
  if(!(image instanceof Uint8Array)||!image.length)throw Error("Invalid resident bundle");
  return withStrings(module,[name],namePointer=>{
    const pointer=module._malloc(image.length);if(!pointer)throw Error('Resident image allocation failed');
    try {
      module.__dirtyMark?.(pointer,image.length);module.HEAPU8.set(image,pointer);
      const code=module._portFileInstall(namePointer,pointer,image.length);
      if(code!==0)throw Error('Native file install rejected '+name+': '+code);
    } finally {module._free(pointer);}
  });
}
export function openResidentArchive(module,name,symbols) {
  if(!Array.isArray(symbols)||symbols.length<1||symbols.length>2)throw Error('Expected one or two native symbols');
  return withStrings(module,[name,...symbols],(namePointer,first,second)=>{
    const output=module._malloc(8);if(!output)throw Error('Native symbol result allocation failed');
    let archive;
    try {
      archive=symbols.length===1?module._portFileArchive(namePointer,first,output):module._portFileArchivePair(namePointer,first,second,output);
      if(!archive)throw Error('Native archive load failed');
      const view=new DataView(module.HEAPU8.buffer);
      const addresses=symbols.map((_,i)=>view.getUint32(output+i*4,true));let disposed=false;
      if(addresses.some(p=>!p))throw Error('Native archive symbol missing');
      return {archive,addresses,dispose(){if(!disposed){module._portFileArchiveClose(archive);disposed=true;}}};
    } catch(error){if(archive)module._portFileArchiveClose(archive);throw error;}
    finally {module._free(output);}
  });
}
