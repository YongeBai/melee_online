// Browser mixer for the original sound effects. The C audio device
// (audio-device.c) runs the original lbAudio/AXDriver/synth code in fixed
// 5 ms DSP frames and reports voice parameters here; this module decodes the
// hosted original DSP-ADPCM banks and plays them with Web Audio. Nothing here
// feeds back into the simulation, so peers stay deterministic.
const PB={state:0x0E,mix:0x12,ve:0x64,addr:0x6E,adpcm:0x7E,src:0xA6,adpcmLoop:0xB4};
const swap32=(v,o)=>v.setUint32(o,v.getUint32(o,false),true);
const swap16=(v,o)=>v.setUint16(o,v.getUint16(o,false),true);

// Convert an original big-endian audio file prefix to the layout the C code
// reads: native 32-bit words, and 32-bit nibble addresses over Hi/Lo pairs.
export function convertAudioHeader(path,source){
 const bytes=source.slice(),view=new DataView(bytes.buffer);
 if(path.endsWith('.sem')){for(let o=0;o+4<=bytes.length;o+=4)swap32(view,o);return bytes;}
 for(let o=0;o<0x10;o+=4)swap32(view,o);
 const headerSize=view.getUint32(0,true),count=view.getUint32(8,true);let p=0x10;
 for(let i=0;i<count;i++){
  if(p+8>0x10+headerSize)throw Error('Sound bank table overrun '+path);
  const channels=view.getUint32(p,false);swap32(view,p);swap32(view,p+4);p+=8;
  for(let c=0;c<channels;c++,p+=0x40){
   swap16(view,p);swap16(view,p+2);for(const o of [4,8,12])swap32(view,p+o);
   for(let o=0x10;o<0x3E;o+=2)swap16(view,p+o);
  }
 }
 return bytes;
}
// DSP-ADPCM decode of nibbles [start, end] (inclusive sample nibble addresses).
export function decodeAdpcm(data,coefs,start,end,hist1=0,hist2=0){
 let out=new Float32Array(Math.max(0,Math.ceil((end-start+2)*14/16)+16)),n=0;
 for(let addr=start;addr<=end;){
  const frame=addr>>4,header=data[frame*8];if(header===undefined)break;
  const scale=1<<(header&15),coef=(header>>4)&7,c1=coefs[coef*2],c2=coefs[coef*2+1];
  for(let nib=addr&15;nib<16&&addr<=end;nib++,addr++){
   const byte=data[frame*8+(nib>>1)];let s=nib&1?byte&15:byte>>4;if(s>=8)s-=16;
   let sample=Math.floor((s*scale*2048+1024+c1*hist1+c2*hist2)/2048);sample=Math.max(-32768,Math.min(32767,sample));
   hist2=hist1;hist1=sample;out[n++]=sample/32768;
  }
  if((addr&15)===0)addr+=2;
 }
 return out.subarray(0,n);
}
const signed16=v=>v>=32768?v-65536:v;

export async function createNativeSfx({module,base='./',context=null,volume=1}={}){
 const manifest=await(await fetch(base+'sfx-fixtures.json')).json(),headers=new Uint8Array(await(await fetch(base+'sfx/headers.bin')).arrayBuffer());
 const paths=Object.keys(manifest.files),installed=[];
 for(const path of paths){
  const f=manifest.files[path],bytes=convertAudioHeader(path,headers.subarray(f.headerOffset,f.headerOffset+f.headerBytes));
  const pointer=module._malloc(bytes.length),name=module._malloc(path.length+1);module.HEAPU8.set(bytes,pointer);module.HEAPU8.set(new TextEncoder().encode(path+'\0'),name);
  const index=module._portAudioFileInstall(name,pointer,bytes.length,f.size);module._free(name);if(index<0)throw Error('Audio file install failed '+path);installed[index]={path,...f};
 }
 const aram=[],aramLog=[],banks=new Map(),voices=new Map(),stats={starts:0,stops:0,updates:0,lateStarts:0,skippedStale:0,mispredictedStops:0,missingSamples:0,errors:0};
 let ctx=context,master=null,frame=null,replaying=false,replaySeen=null,replayFrom=0,live=0,muted=false;
 function audio(){if(ctx)return ctx;ctx=new AudioContext({latencyHint:'interactive'});master=ctx.createGain();master.gain.value=volume;master.connect(ctx.destination);
  const unlock=()=>{if(ctx.state==='suspended')void ctx.resume().catch(()=>{});};addEventListener('pointerdown',unlock,{capture:true});addEventListener('keydown',unlock,{capture:true});return ctx;}
 // Banks decode in a worker as soon as they arrive; playback only wraps PCM.
 let worker=null,workerId=0;const pendingDecode=new Map();
 function decodeBank(b){try{worker??=new Worker(new URL('./native-sfx-worker.mjs',import.meta.url),{type:'module'});worker.onmessage??=({data})=>{const target=pendingDecode.get(data.id);pendingDecode.delete(data.id);if(!target)return;if(data.error){stats.errors++;stats.lastError=data.error;return;}for(const [key,pcm] of Object.entries(data.decoded))if(!target.pcm.has(key))target.pcm.set(key,pcm);stats.banksDecoded=(stats.banksDecoded??0)+1;};const id=++workerId;pendingDecode.set(id,b);const copy=b.bytes.slice();worker.postMessage({id,bytes:copy.buffer},[copy.buffer]);}catch(e){stats.errors++;stats.lastError=String(e);}}
 function bank(file){let b=banks.get(file);if(!b){const f=installed[file];b={bytes:null,promise:fetch(base+f.url).then(r=>{if(!r.ok)throw Error('Hosted sound bank unavailable '+f.url);return r.arrayBuffer();}).then(a=>{b.bytes=new Uint8Array(a);decodeBank(b);}).catch(e=>{b.error=String(e);stats.errors++;}),decoded:new Map(),pcm:new Map()};banks.set(file,b);}return b;}
 function locate(nibble){const byte=nibble>>>1;for(const m of aram)if(byte>=m.dest&&byte<m.dest+m.size)return m;return null;}
 function read(pb){const H=module.HEAPU8,v=new DataView(H.buffer,H.byteOffset+pb,0xC0),u16=o=>v.getUint16(o,true),u32=o=>v.getUint32(o,true);
  return {loop:u16(PB.addr),loopAddr:u32(PB.addr+4),endAddr:u32(PB.addr+8),currentAddr:u32(PB.addr+12),coefs:Array.from({length:16},(_,i)=>signed16(u16(PB.adpcm+i*2))),yn1:signed16(u16(PB.adpcm+0x24)),yn2:signed16(u16(PB.adpcm+0x26)),ratio:u32(PB.src)/65536,volume:u16(PB.ve)/32767,left:u16(PB.mix)/32767,right:u16(PB.mix+4)/32767};}
 function buffer(p){
  const m=locate(p.currentAddr);if(!m){stats.missingSamples++;return null;}const b=bank(m.file);if(!b.bytes)return null;
  const offsetNibbles=(m.src-m.dest)*2,start=p.currentAddr+offsetNibbles,end=p.endAddr+offsetNibbles,key=start+':'+end;
  let d=b.decoded.get(key);if(!d){let pcm=b.pcm.get(key);if(pcm)stats.workerDecoded=(stats.workerDecoded??0)+1;else{pcm=decodeAdpcm(b.bytes,p.coefs,start,end,p.yn1,p.yn2);stats.inlineDecoded=(stats.inlineDecoded??0)+1;}const sampleIndex=a=>(a>>>4)*14+(a&15)-2,loopAt=p.loop?Math.max(0,sampleIndex(p.loopAddr)-sampleIndex(p.currentAddr)):0;
   const ab=audio().createBuffer(1,Math.max(1,pcm.length),32000);ab.copyToChannel(pcm,0);d={buffer:ab,loopAt:loopAt/32000};b.decoded.set(key,d);}
  return d;
 }
 function start(serial,p,late=0){
  const c=audio(),d=buffer(p);if(!d)return;const source=c.createBufferSource(),left=c.createGain(),right=c.createGain(),merge=c.createChannelMerger(2);
  source.buffer=d.buffer;source.playbackRate.value=p.ratio;if(p.loop){source.loop=true;source.loopStart=d.loopAt;source.loopEnd=d.buffer.duration;}
  source.connect(left);source.connect(right);left.connect(merge,0,0);right.connect(merge,0,1);merge.connect(master);
  const voice={serial,frame,signature:p.currentAddr+':'+p.endAddr,source,left,right};apply(voice,p);
  source.onended=()=>{if(voices.get(serial)===voice)voices.delete(serial);try{merge.disconnect();}catch{}};
  source.start(0,late>0&&!p.loop?Math.min(late,d.buffer.duration):0);voices.set(serial,voice);stats.starts++;
 }
 function apply(voice,p){const t=ctx.currentTime;voice.left.gain.setTargetAtTime(p.volume*p.left,t,.004);voice.right.gain.setTargetAtTime(p.volume*p.right,t,.004);voice.source.playbackRate.setTargetAtTime(p.ratio,t,.004);}
 function stop(serial){const v=voices.get(serial);if(!v)return;voices.delete(serial);const t=ctx.currentTime;v.left.gain.setTargetAtTime(0,t,.005);v.right.gain.setTargetAtTime(0,t,.005);try{v.source.stop(t+.03);}catch{}stats.stops++;}
 const sfx={
  event(e){if(globalThis.__sfxIgnoreEvents)return;try{
   // A later transfer to the same audio RAM replaces earlier contents.
   if(e.kind===5){if(aramLog.length<64)aramLog.push([installed[e.file]?.url,e.dest.toString(16),e.size]);for(let i=aram.length-1;i>=0;i--)if(aram[i].dest<e.dest+e.size&&e.dest<aram[i].dest+aram[i].size)aram.splice(i,1);aram.push({file:e.file,src:e.src,dest:e.dest,size:e.size});bank(e.file);return;}
   if(muted)return;
   const p=read(e.pb),existing=voices.get(e.serial);
   if(e.kind===1){
    if(replaying){replaySeen.add(e.serial);if(existing&&existing.signature===p.currentAddr+':'+p.endAddr)return;if(existing)stop(e.serial);
     const age=(live-frame)/60;if(age>8/60){stats.skippedStale++;return;}stats.lateStarts++;start(e.serial,p,age);return;}
    if(existing)stop(e.serial);start(e.serial,p);
   }else if(e.kind===2){if(existing){if(replaying)existing.pending=p;else apply(existing,p);stats.updates++;}}
   else if(e.kind===3||e.kind===4)stop(e.serial);
  }catch(error){stats.errors++;stats.lastError=String(error);}},
  // Called by the rollback product for every simulated frame. Replayed frames
  // re-emit deterministic voice serials; unmatched earlier sounds are stopped.
  beginFrame(f,replay=false){
   if(replay&&!replaying){replaying=true;replaySeen=new Set();replayFrom=f;}
   else if(!replay&&replaying){replaying=false;for(const [serial,v] of voices){if(v.frame!==null&&v.frame>=replayFrom&&!replaySeen.has(serial)){stop(serial);stats.mispredictedStops++;}else if(v.pending){apply(v,v.pending);v.pending=null;}}replaySeen=null;}
   frame=f;if(!replay)live=f;
  },
  // Warmup frames are simulated and rewound; they must not be heard.
  mute(value){muted=!!value;if(muted)for(const serial of [...voices.keys()])stop(serial);},
  setVolume(value){volume=value;if(master)master.gain.value=value;},
  snapshot:()=>({enabled:module._portAudioEnabled()===1,files:installed.length,aramMappings:aram.length,aramLog:aramLog.slice(),banksLoaded:[...banks.values()].filter(b=>b.bytes).length,activeVoices:voices.size,contextState:ctx?.state??null,...stats}),
  // Enable after the caller has installed this mixer as the event receiver,
  // so the boot-time bank transfers are recorded.
  enable(){if(!module._portAudioEnable())throw Error('Native audio device unavailable');},
  dispose(){for(const serial of [...voices.keys()])stop(serial);},
 };
 return sfx;
}
