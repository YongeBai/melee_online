// Decodes every DSP-ADPCM channel of one original sound bank off the main
// thread. Keys are file nibble ranges "start:end", the same ranges the mixer
// derives from a voice's audio RAM addresses, so playback never decodes inline.
import {decodeAdpcm} from './native-sfx.mjs';
onmessage=({data:{id,bytes}})=>{
 try{
  const b=new Uint8Array(bytes),v=new DataView(b.buffer),headerSize=v.getUint32(0),count=v.getUint32(8),dataStart=(headerSize+0x10+31)&~31,data=b.subarray(dataStart);
  const decoded={},transfer=[];let p=0x10;
  for(let i=0;i<count;i++){
   const channels=v.getUint32(p);p+=8;
   for(let c=0;c<channels;c++,p+=0x40){
    const end=v.getUint32(p+8),current=v.getUint32(p+12),coefs=Array.from({length:16},(_,k)=>v.getInt16(p+0x10+k*2));
    // Voices always start at the channel's initial address with zero history.
    const key=(current+dataStart*2)+':'+(end+dataStart*2);if(decoded[key])continue;
    const pcm=decodeAdpcm(data,coefs,current,end,v.getInt16(p+0x34),v.getInt16(p+0x36)).slice();decoded[key]=pcm;transfer.push(pcm.buffer);
   }
  }
  postMessage({id,decoded},transfer);
 }catch(error){postMessage({id,error:String(error)});}
};
