// HALPST blocks contain planar GameCube DSP ADPCM. Container/reference:
// https://github.com/vgmstream/vgmstream/blob/master/src/meta/halpst.c
// https://github.com/vgmstream/vgmstream/blob/master/src/coding/ngc_dsp_decoder.c
export function decodeHps(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const need=(offset,size)=>{if(!Number.isSafeInteger(offset)||offset<0||size<0||offset+size>b.length)throw Error('Truncated HPS');};
 need(0,0x80);if(String.fromCharCode(...b.subarray(0,8))!==' HALPST\0')throw Error('Invalid HPS signature');
 const rate=v.getUint32(8),channels=v.getUint32(12);if(rate<8000||rate>48000||channels<1||channels>2)throw Error('Unsupported HPS format');
 const samples=n=>Math.floor(n/16)*14+Math.max(0,n%16-2),length=samples(v.getUint32(0x18))+1;
 if(length<1||length>rate*600)throw Error('Invalid HPS duration');
 const blocks=[],seen=new Map();let offset=0x80,count=0,loopStart=null;
 while(offset!==0xffffffff){
  if(seen.has(offset)){loopStart=seen.get(offset);break;}
  need(offset,0x20);const size=v.getUint32(offset),nibbles=v.getUint32(offset+4)+1,n=samples(nibbles);
  if(!size||size%channels||size/channels%8||!n||n>size/channels/8*14||count+n>length+14)throw Error('Invalid HPS block');
  need(offset+0x20,size);seen.set(offset,count);blocks.push({offset,size:size/channels,n});count+=n;offset=v.getUint32(offset+8);
 }
 if(count<length||loopStart!==null&&loopStart>=length)throw Error('Incomplete HPS stream');
 const pcm=Array.from({length:channels},()=>new Float32Array(length));
 for(let ch=0;ch<channels;ch++){
  const coefficients=Array.from({length:16},(_,i)=>v.getInt16(0x20+ch*0x38+i*2));let h1=0,h2=0,out=0;
  for(const block of blocks){
   const start=block.offset+0x20+ch*block.size;
   for(let i=0;i<block.n&&out<length;i++){
    const frame=start+Math.floor(i/14)*8,head=b[frame],prediction=head>>4;if(prediction>7)throw Error('Invalid DSP predictor');
    const packed=b[frame+1+Math.floor(i%14/2)],raw=i%2?packed&15:packed>>4,nibble=raw<8?raw:raw-16;
    const value=Math.max(-32768,Math.min(32767,Math.floor((nibble*2**(head&15)*2048+coefficients[prediction*2]*h1+coefficients[prediction*2+1]*h2+1024)/2048)));
    pcm[ch][out++]=value/32768;h2=h1;h1=value;
   }
  }
 }
 return {rate,length,loopStart,pcm};
}
