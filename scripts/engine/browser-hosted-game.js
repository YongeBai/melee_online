const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
export function validateGameManifest(manifest) {
  if(manifest?.schemaVersion!==1 || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    !Number.isSafeInteger(manifest.size) || manifest.size<32 || manifest.size>2*1024**3 ||
    !Array.isArray(manifest.parts) || !manifest.parts.length || manifest.parts.length>128)
    throw Error('Invalid game manifest');
  let total=0;
  for(const p of manifest.parts) {
    if(!/^[a-f0-9]{64}$/.test(p.sha256) || !/^[a-f0-9]{64}$/.test(p.rawSha256) ||
      p.name!==`${p.sha256}.gz` || !Number.isSafeInteger(p.bytes) || p.bytes<=0 || p.bytes>20*1024**2 ||
      !Number.isSafeInteger(p.rawBytes) || p.rawBytes<=0 || p.rawBytes>16*1024**2)
      throw Error('Invalid game chunk');
    if(p.brotli && (!/^[a-f0-9]{64}$/.test(p.brotli.sha256) ||
      p.brotli.name!==`${p.brotli.sha256}.br` || !Number.isSafeInteger(p.brotli.bytes) ||
      p.brotli.bytes<=0 || p.brotli.bytes>20*1024**2))throw Error('Invalid Brotli game chunk');
    total+=p.rawBytes;
  }
  if(total!==manifest.size) throw Error('Incomplete game manifest');
  return manifest;
}
export async function decodeGamePart(response, part, decodeBrotli) {
  if(!response.ok) throw Error(`Game download failed (${response.status}). Please retry.`);
  const packed=await response.arrayBuffer();
  if(packed.byteLength!==part.bytes || await digest(packed)!==part.sha256)
    throw Error('Game download checksum failed. Please retry.');
  if(part.encoding && part.encoding!=='brotli')throw Error('Invalid game compression');
  const bytes=part.encoding==='brotli'&&decodeBrotli?await decodeBrotli(packed,part.rawBytes):
    await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream(part.encoding||'gzip'))).arrayBuffer();
  if(bytes.byteLength!==part.rawBytes || await digest(bytes)!==part.rawSha256)
    throw Error('Game decompression checksum failed. Please retry.');
  return bytes;
}
export async function loadHostedGame(manifestUrl, onProgress=()=>{}) {
  const started=performance.now();
  let cacheHit=false;
  const url=new URL(manifestUrl, location.href);
  if(url.origin!==location.origin) throw Error('The bundled game must use this website’s origin');
  const response=await fetch(url,{cache:'no-cache'});
  if(!response.ok) throw Error(`Game is unavailable (${response.status}). Please retry.`);
  const manifest=validateGameManifest(await response.json());
  let brotli=false,decoder,parts=manifest.parts;
  try{new DecompressionStream('brotli');brotli=true;}catch{/* Compatible gzip fallback. */}
  const partBase=manifest.downloadBase ? new URL(manifest.downloadBase) : url;
  if(partBase.origin!==location.origin &&
    (partBase.protocol!=='https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(partBase.hostname)))
    throw Error('Invalid game storage origin');
  const run=async()=>{
    let root, writable, handle;
    const cacheName=`melee-${manifest.sha256}.iso`;
    try {
      root=await navigator.storage?.getDirectory();
      if(root) {
        try {
          const marker=await (await root.getFileHandle(`${cacheName}.complete`)).getFile();
          const file=await (await root.getFileHandle(cacheName)).getFile();
          if(await marker.text()===manifest.sha256 && file.size===manifest.size) {
            cacheHit=true; return file;
          }
        } catch { /* First visit or interrupted download. */ }
        handle=await root.getFileHandle(cacheName,{create:true});
        writable=await handle.createWritable();
      }
    } catch { root=undefined; writable=undefined; }
    if(!brotli&&typeof Worker==='function'&&manifest.parts.some(p=>p.brotli)){
      try{decoder=await (await import('./browser-brotli.js')).createBrotliDecoder();brotli=true;}
      catch{/* The mandatory gzip representation remains usable. */}
    }
    parts=manifest.parts.map(p=>brotli&&p.brotli&&p.brotli.bytes<p.bytes?{...p,...p.brotli,encoding:'brotli'}:p);
    const blobs=[];
    let downloaded=0;
    const total=parts.reduce((sum,p)=>sum+p.bytes,0);
    try {
      // Keep three requests flowing instead of waiting for the slowest member
      // of each batch. Explicit offsets preserve disc order; each worker holds
      // at most one decoded chunk until its write finishes.
      let cursor=0,position=0,failure;
      const offsets=parts.map(part=>{const offset=position;position+=part.rawBytes;return offset;});
      const abort=new AbortController();
      onProgress('Loading Melee… 0%');
      await Promise.allSettled(Array.from({length:Math.min(3,parts.length)},async()=>{
        try {
          while(!failure&&cursor<parts.length){
            const index=cursor++,part=parts[index];
            const decoded=await decodeGamePart(await fetch(new URL(part.name,partBase),{signal:abort.signal}),part,decoder?.decode);
            if(failure)return;
            if(writable)await writable.write({type:'write',position:offsets[index],data:decoded});
            else blobs[index]=new Blob([decoded]);
            downloaded+=part.bytes;
            onProgress(`Loading Melee… ${Math.round(downloaded/total*100)}%`);
          }
        }catch(error){if(!failure){failure=error;abort.abort();}}
      }));
      if(failure)throw failure;
      if(writable) {
        await writable.close(); writable=undefined;
        const file=await handle.getFile();
        if(file.size!==manifest.size) throw Error('Incomplete game cache');
        const marker=await (await root.getFileHandle(`${cacheName}.complete`,{create:true})).createWritable();
        await marker.write(manifest.sha256); await marker.close();
        return file;
      }
      return new File(blobs,manifest.name,{type:'application/octet-stream'});
    } catch(error) { await writable?.abort().catch(()=>{}); throw error; }
  };
  let file;
  try{file=await (navigator.locks ? navigator.locks.request(`melee-download-${manifest.sha256}`,run) : run());}
  finally{decoder?.close();}
  onProgress('Opening Melee…',{
    cacheHit,downloadBytes:cacheHit?0:parts.reduce((sum,p)=>sum+p.bytes,0),
    storageBytes:file.size,loadMs:Math.round(performance.now()-started),
    brotliChunks:cacheHit?0:parts.filter(p=>p.encoding==='brotli').length,
  });
  return file;
}
