// Selectable netcode. Without `?netcode=` the product uses defaultNetcode, the
// variant chosen by the netcode lab (docs/NETCODE-LAB.md). An explicit value
// starts from the earlier shipped behaviour (legacyNetcode) and applies its
// tokens, so one build can compare variants under identical conditions:
//   room|direct  room: inputs only through the owner's reliable, ordered room
//                channel. direct: additionally send every unacknowledged input
//                in each packet over an unordered channel without retransmission
//                (Slippi/GGPO style), so one lost packet never blocks later ones.
//   d<N>         local input delay in frames (0-6).
//   w<N>         rollback prediction window in frames (4-15).
//   s            time sync: estimate frame advantage over the peer from received
//                inputs and half the round trip; the leading peer drops a frame
//                and the trailing peer adds one (at most one per 20 frames).
//   ma|mp<N>|mpa Character/stage select lockstep. ma: wait for the owner's
//                confirmed frames (a guest waits a full round trip) with a
//                3-frame buffer. mp<N>: build each frame from both players'
//                inputs as they arrive (one-way wait) with an N-frame buffer
//                (3-12). mpa: as mp, buffer sized from measured latency.
export const legacyNetcode=Object.freeze({name:'room,d0,w7',transport:'room',delay:0,window:7,sync:false,menu:'authority',menuBuffer:3});
export const defaultNetcode=Object.freeze({name:'direct,d2,w10,s,mpa',transport:'direct',delay:2,window:10,sync:true,menu:'peer',menuBuffer:'auto'});

export function parseNetcode(text){
 if(text===null||text===undefined||text==='')return {...defaultNetcode};
 const config={...legacyNetcode};
 for(const token of String(text).split(',').map(t=>t.trim()).filter(Boolean)){
  let m;
  if(token==='room'||token==='direct')config.transport=token;
  else if((m=/^d([0-9])$/.exec(token))&&Number(m[1])<=6)config.delay=Number(m[1]);
  else if((m=/^w([0-9]{1,2})$/.exec(token))&&Number(m[1])>=4&&Number(m[1])<=15)config.window=Number(m[1]);
  else if(token==='s')config.sync=true;
  else if(token==='ma'){config.menu='authority';config.menuBuffer=3;}
  else if(token==='mpa'){config.menu='peer';config.menuBuffer='auto';}
  else if((m=/^mp([0-9]{1,2})$/.exec(token))&&Number(m[1])>=3&&Number(m[1])<=12){config.menu='peer';config.menuBuffer=Number(m[1]);}
  else throw Error('Unknown netcode option '+token);
 }
 config.name=`${config.transport},d${config.delay},w${config.window}`+(config.sync?',s':'')+(config.menu==='peer'?`,mp${config.menuBuffer==='auto'?'a':config.menuBuffer}`:'');
 return config;
}

// Lockstep buffer that covers one-way delay: half the p95 round trip plus a
// frame of margin, never below the original three frames.
export function menuBufferFor(rttP95Ms){return Number.isFinite(rttP95Ms)?Math.max(3,Math.min(12,Math.ceil((rttP95Ms/2+8)/(1000/60))+1)):3;}

// The game reads analog values as float32. Rounding them when the input is
// made changes nothing in the simulation and lets every delivery path carry
// the identical immutable value in four bytes.
export const canonicalPad=pad=>[pad[0],...pad.slice(1,7).map(Math.fround)];

// Binary input packet: header, then every local input the peer has not yet
// acknowledged (tap, buttons, six float32 analog values). 32 frames keep a
// packet within one SCTP chunk (~0.9 KB), so a lost datagram never takes a
// fragmented message with it.
const MAGIC=0x4d,VERSION=2,HEADER=40,FRAME_BYTES=27,MAX_FRAMES=32;
export function encodeInputPacket({epoch,sequence,seat,ack,first,frames,sentAt,echoSentAt,echoHoldMs,advantage=0}){
 const count=Math.min(frames.length,MAX_FRAMES),buffer=new ArrayBuffer(HEADER+count*FRAME_BYTES),v=new DataView(buffer);
 v.setUint8(0,MAGIC);v.setUint8(1,VERSION);v.setUint16(2,epoch&0xffff);v.setUint16(4,sequence&0xffff);v.setUint8(6,seat);v.setUint8(7,count);
 v.setInt32(8,ack);v.setInt32(12,first);v.setFloat64(16,sentAt);v.setFloat64(24,echoSentAt);v.setFloat32(32,echoHoldMs);v.setFloat32(36,advantage);
 for(let i=0;i<count;i++){const at=HEADER+i*FRAME_BYTES,{pad,tap}=frames[i];v.setUint8(at,tap);v.setUint16(at+1,pad[0]);for(let k=1;k<7;k++)v.setFloat32(at+3+(k-1)*4,pad[k]);}
 return buffer;
}
export function decodeInputPacket(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<HEADER)return null;
 const v=new DataView(buffer);if(v.getUint8(0)!==MAGIC||v.getUint8(1)!==VERSION)return null;
 const count=v.getUint8(7);if(buffer.byteLength!==HEADER+count*FRAME_BYTES)return null;
 const frames=[];for(let i=0;i<count;i++){const at=HEADER+i*FRAME_BYTES;frames.push({tap:v.getUint8(at),pad:[v.getUint16(at+1),...Array.from({length:6},(_,k)=>v.getFloat32(at+3+k*4))]});}
 return {epoch:v.getUint16(2),sequence:v.getUint16(4),seat:v.getUint8(6),ack:v.getInt32(8),first:v.getInt32(12),sentAt:v.getFloat64(16),echoSentAt:v.getFloat64(24),echoHoldMs:v.getFloat32(32),advantage:v.getFloat32(36),frames};
}

// Direct peer input exchange for one match. Delivery is idempotent: callers get
// each remote frame once and contiguous acknowledgements of local frames.
export function createDirectInputLink({channel,seat,onInput,onAck,firstFrame=3,resendMs=20,maxBuffered=2048,now=()=>performance.now(),setInterval:every=globalThis.setInterval,clearInterval:cancel=globalThis.clearInterval}){
 let tag=null,advantage=0,peerAdvantage=null,local=new Map(),peerAck=firstFrame-1,remoteContiguous=firstFrame-1,seen=new Set(),lastSend=-Infinity,owesAck=false,echo=null,timer=0;
 const stats={packetsSent:0,packetsReceived:0,stalePackets:0,framesReceived:0,duplicateFrames:0,resends:0,skippedBacklog:0,rtt:[]};
 function flush(){
  if(!tag||!channel.open)return;
  const frames=[];for(let f=peerAck+1;local.has(f)&&frames.length<MAX_FRAMES;f++)frames.push(local.get(f));
  if(!frames.length&&!owesAck)return;
  // SCTP queues even unreliable messages behind its congestion window. Never
  // add to a backlog: the next packet repeats every unacknowledged frame.
  if((channel.bufferedAmount??0)>maxBuffered){stats.skippedBacklog++;return;}
  const t=now();
  try{channel.send(encodeInputPacket({...tag,seat,ack:remoteContiguous,first:peerAck+1,frames,sentAt:t,echoSentAt:echo?.sentAt??0,echoHoldMs:echo?t-echo.receivedAt:0,advantage}));}catch{return;}
  lastSend=t;owesAck=false;stats.packetsSent++;
 }
 function receive(buffer){
  const p=decodeInputPacket(buffer);if(!p||!tag)return;
  if(p.epoch!==(tag.epoch&0xffff)||p.sequence!==(tag.sequence&0xffff)||p.seat!==1-seat){stats.stalePackets++;return;}
  const t=now();stats.packetsReceived++;
  if(p.echoSentAt>0&&stats.rtt.length<4096)stats.rtt.push(t-p.echoSentAt-p.echoHoldMs);
  echo={sentAt:p.sentAt,receivedAt:t};peerAdvantage=p.advantage;
  // Cumulative acknowledgement of our inputs, delivered one frame at a time.
  if(p.ack>peerAck){for(let f=peerAck+1;f<=p.ack;f++){if(!local.has(f))break;onAck(f);local.delete(f);peerAck=f;}}
  p.frames.forEach((value,i)=>{const f=p.first+i;if(f<=remoteContiguous||seen.has(f)){stats.duplicateFrames++;return;}seen.add(f);stats.framesReceived++;onInput(f,value);});
  while(seen.has(remoteContiguous+1)){seen.delete(remoteContiguous+1);remoteContiguous++;owesAck=true;}
 }
 channel.onmessage=receive;
 // Keep resending while inputs are unacknowledged (including when this peer is
 // stalled and producing no new frames), and acknowledge received input.
 timer=every(()=>{if(now()-lastSend>=resendMs&&(local.size||owesAck)){if(local.size)stats.resends++;flush();}},Math.max(4,resendMs>>1));
 return {
  begin(epoch,sequence){tag={epoch,sequence};advantage=0;peerAdvantage=null;local.clear();peerAck=firstFrame-1;remoteContiguous=firstFrame-1;seen.clear();owesAck=false;echo=null;},
  end(){tag=null;local.clear();seen.clear();},
  send(frame,value){if(!tag||frame<=peerAck||local.has(frame))return;local.set(frame,{pad:[...value.pad],tap:value.tap});flush();},
  // Our frame-advantage estimate, reported to the peer; and the peer's latest.
  setAdvantage(value){advantage=Number.isFinite(value)?value:0;},get peerAdvantage(){return peerAdvantage;},
  get active(){return !!tag;},
  snapshot(){const r=[...stats.rtt].sort((a,b)=>a-b),q=x=>r.length?r[Math.min(r.length-1,Math.floor(x*r.length))]:null;return {packetsSent:stats.packetsSent,packetsReceived:stats.packetsReceived,stalePackets:stats.stalePackets,framesReceived:stats.framesReceived,duplicateFrames:stats.duplicateFrames,resends:stats.resends,skippedBacklog:stats.skippedBacklog,unacknowledged:local.size,peerAck,remoteContiguous,rttP50Ms:q(.5),rttP95Ms:q(.95)};},
  dispose(){cancel(timer);tag=null;channel.onmessage=null;},
 };
}
