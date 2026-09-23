// Peer-to-peer room transport. The room owner's page runs the input-only room
// authority (room-core.mjs); the guest reaches it over an RTCDataChannel.
// A tiny signaling endpoint exchanges session descriptions by room code.
// Neither game state nor inputs pass through a server.
import {createRoomCore} from './room-core.mjs';

const storageKey='native-melee-p2p-v1';
const defaultIce=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
const randomId=(n=18)=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function createPeerTransport({storage=globalThis.sessionStorage,signalUrl='/api/signal',iceServers=defaultIce,onEvent=()=>{}}={}){
 let saved=null;try{saved=JSON.parse(storage.getItem(storageKey));}catch{}
 let role=saved?.role??null,code=saved?.code??null,hostKey=saved?.hostKey??null,core=null,listening=false,disposed=false,guestLink=null;
 const hostLinks=new Set(),rtt=[],events=[],timeline={sent:[],received:[]};
 // Wall-clock stamps of match inputs leaving this page and peer inputs
 // arriving, so a harness on one machine can compute one-way transit.
 const stamp=(list,text)=>{if(list.length>=20000)return;const key=/"key":"(match:[0-9]+)"/.exec(text);if(!key)return;const frame=/"frame":([0-9]+)/.exec(text);if(frame)list.push([key[1],Number(frame[1]),performance.timeOrigin+performance.now()]);};
 const outgoing=text=>{if(text.startsWith('{"type":"input"'))stamp(timeline.sent,text);},incoming=text=>{if(text.startsWith('{"type":"peer-input"'))stamp(timeline.received,text);};
 const log=(event,detail={})=>{const e={t:Math.round(performance.now()),event,...detail};events.push(e);if(events.length>200)events.shift();if(globalThis.__meleeP2PDebug)console.warn('[p2p]',JSON.stringify(e));onEvent(e);};
 const persist=()=>{try{if(!role){storage.removeItem(storageKey);return;}storage.setItem(storageKey,JSON.stringify({role,code,hostKey,core:role==='host'&&core?core.serialize():null}));}catch{}};
 addEventListener('pagehide',persist);
 async function signal(body){const response=await fetch(signalUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(6000),cache:'no-store'}),result=await response.json().catch(()=>({}));if(!response.ok){const e=Error(result.error??'Signaling unavailable');e.status=response.status;throw e;}return result;}
 function gathered(pc,ms=2500){return new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();const done=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);resolve();}};const t=setTimeout(resolve,ms);pc.addEventListener('icegatheringstatechange',done);});}
 // One RTCDataChannel carries RPC (room create/join/resume), relay messages
 // and RTT probes. Relay messages keep their original JSON form.
 function link(pc,channel,side){
  const rpc=new Map();let nextRpc=0,ping=null;
  // A reloading peer can close the channel while delayed work is still queued.
  const post=value=>{if(channel.readyState==='open')channel.send(JSON.stringify(value));};
  const l={pc,channel,side,socket:null,peer:null,get open(){return channel.readyState==='open';},
   call(route,body){return new Promise((resolve,reject)=>{const id=++nextRpc;rpc.set(id,{resolve,reject});channel.send(JSON.stringify({rpc:id,route,body}));setTimeout(()=>{if(rpc.delete(id))reject(Error('Room host did not respond'));},10000);});},
   close(){clearInterval(ping);try{channel.close();}catch{}try{pc.close();}catch{}}};
  const startPing=()=>{clearInterval(ping);ping=setInterval(()=>{if(channel.readyState==='open')channel.send(JSON.stringify({ping:performance.now()}));},500);};if(channel.readyState==='open')startPing();else channel.addEventListener('open',startPing,{once:true});
  // Measurement harnesses may emulate WAN delay by setting globalThis.__meleeP2PDelay
  // to {baseMs,jitterMs}; delivery stays ordered, like the data channel itself.
  let due=0,seq=0,timer=0;const queue=[];
  const drain=()=>{timer=0;const now=performance.now();while(queue.length&&queue[0].at<=now+.5){try{queue.shift().run();}catch(e){log('delivery-error',{message:e.message});}}if(queue.length)timer=setTimeout(drain,queue[0].at-now);};
  const deliver=run=>{const d=globalThis.__meleeP2PDelay;if(!d&&!queue.length)return run();const now=performance.now(),jitter=d?.jitterMs?((seq++*7919)%1000)/1000*d.jitterMs:0;due=Math.max(due,now+(d?.baseMs??0)+jitter);queue.push({at:due,run});if(!timer)timer=setTimeout(drain,due-now);};
  const handle=({data})=>deliver(()=>receive(data));
  const receive=data=>{
   let m;try{m=JSON.parse(data);}catch{return;}
   if(m.ping!==undefined){post({pong:m.ping});return;}
   if(m.pong!==undefined){rtt.push(performance.now()-m.pong);if(rtt.length>240)rtt.shift();return;}
   if(m.rpcReply!==undefined){log('rpc-reply',{status:m.status});const p=rpc.get(m.rpcReply);if(p){rpc.delete(m.rpcReply);if(m.status===200)p.resolve(m.body);else p.reject(Error(m.body?.error??'Room request failed'));}return;}
   if(m.rpc!==undefined&&side==='host'){const result=core.request(m.route,m.body??{});log('rpc',{route:m.route,status:result.status});persist();post({rpcReply:m.rpc,status:result.status,body:result.body});return;}
   if(side==='host'){if(!l.peer){l.peer=core.attach(l.hostPeer);}l.peer.message(data);return;}
   incoming(data);l.socket?.onmessage?.({data});
  };channel.addEventListener('message',handle);
  channel.addEventListener('close',()=>deliver(closed));
  const closed=()=>{clearInterval(ping);for(const p of rpc.values())p.reject(Error('Room connection closed'));rpc.clear();if(side==='host'){hostLinks.delete(l);l.peer?.close();log('guest-disconnected');}else{if(guestLink===l)guestLink=null;l.socket?.closeFromLink();log('host-disconnected');}};
  // The core's view of a guest peer.
  l.hostPeer={rollback:false,get readyState(){return channel.readyState==='open'?1:3;},send:text=>{if(channel.readyState==='open')channel.send(text);},close:()=>l.close(),terminate:()=>l.close()};
  return l;
 }
 async function listen(){
  if(listening)return;listening=true;
  while(!disposed&&role==='host'){
   try{const {offer}=await signal({op:'poll-offer',code,hostKey});if(offer)await answer(offer);}
   catch(e){log('signal-error',{message:e.message});if(e.status===404||e.status===403){try{await signal({op:'host',code,hostKey});}catch{}}}
   await sleep(hostLinks.size?1000:350);
  }
  listening=false;
 }
 async function answer(offer){
  const pc=new RTCPeerConnection({iceServers});
  const ready=new Promise(resolve=>pc.addEventListener('datachannel',({channel})=>resolve(channel),{once:true}));
  await pc.setRemoteDescription({type:'offer',sdp:offer.sdp});await pc.setLocalDescription(await pc.createAnswer());await gathered(pc);
  await signal({op:'answer',code,hostKey,id:offer.id,sdp:pc.localDescription.sdp});log('answered',{id:offer.id});
  ready.then(channel=>{const l=link(pc,channel,'host');hostLinks.add(l);const opened=()=>log('guest-connected',{id:offer.id});if(channel.readyState==='open')opened();else channel.addEventListener('open',opened,{once:true});});
  setTimeout(()=>{if(pc.connectionState!=='connected'&&![...hostLinks].some(l=>l.pc===pc))pc.close();},20000);
 }
 async function becomeHost(saveCore=null){
  role='host';core=createRoomCore({maxRooms:4,allowDiagnosticCpu:true});if(saveCore)core.restore(saveCore);core.onChange(persist);
 }
 async function claim(){for(;;){try{await signal({op:'host',code,hostKey});return;}catch(e){if(e.status!==409)throw e;throw e;}}}
 async function connectHost(targetCode,attempts=12){
  for(let attempt=0;attempt<attempts&&!disposed;attempt++){
   const pc=new RTCPeerConnection({iceServers}),channel=pc.createDataChannel('melee',{ordered:true}),id=randomId();
   try{
    await pc.setLocalDescription(await pc.createOffer());await gathered(pc);
    await signal({op:'offer',code:targetCode,id,sdp:pc.localDescription.sdp});log('offered',{attempt});
    let reply=null;for(const until=performance.now()+6000;!reply&&performance.now()<until;){await sleep(120);reply=(await signal({op:'poll-answer',code:targetCode,id})).answer;}
    if(!reply)throw Error('Room host did not answer');
    await pc.setRemoteDescription({type:'answer',sdp:reply.sdp});
    await new Promise((resolve,reject)=>{if(channel.readyState==='open')return resolve();const t=setTimeout(()=>reject(Error('Peer connection timed out')),10000);channel.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});channel.addEventListener('close',()=>{clearTimeout(t);reject(Error('Peer connection closed'));},{once:true});});
    const l=link(pc,channel,'guest');log('host-connected',{attempt,candidate:await selectedPair(pc)});return l;
   }catch(e){pc.close();log('connect-failed',{attempt,message:e.message});if(e.status===404&&attempt>=3)throw Error('Room not found');await sleep(Math.min(1500,250*(attempt+1)));}
  }
  throw Error('Could not reach the room host');
 }
 async function selectedPair(pc){try{const stats=await pc.getStats();let pair;stats.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)pair=stats.get(s.selectedCandidatePairId);});if(!pair)stats.forEach(s=>{if(s.type==='candidate-pair'&&s.nominated&&s.state==='succeeded')pair=s;});if(!pair)return null;const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);return {local:local?.candidateType,remote:remote?.candidateType,protocol:local?.protocol,rttMs:pair.currentRoundTripTime!=null?pair.currentRoundTripTime*1000:null};}catch{return null;}}
 async function guestLinkFor(targetCode){if(guestLink?.open)return guestLink;guestLink=await connectHost(targetCode);return guestLink;}
 function loopback(){
  // In-page socket between the owner's client and its own room authority.
  let peer;const client={readyState:0,onopen:null,onmessage:null,onclose:null,onerror:null,
   send(text){if(client.readyState!==1)throw Error('Room connection unavailable');outgoing(text);queueMicrotask(()=>peer.message(text));},
   close(){if(client.readyState===3)return;client.readyState=3;server.readyState=3;queueMicrotask(()=>{peer.close();client.onclose?.({});});}};
  const server={rollback:false,readyState:1,send(text){if(server.readyState===1){incoming(text);queueMicrotask(()=>{if(client.readyState===1)client.onmessage?.({data:text});});}},close(){client.close();},terminate(){client.close();}};
  peer=core.attach(server);queueMicrotask(()=>{client.readyState=1;client.onopen?.({});});return client;
 }
 function remoteSocket(){
  const socket={readyState:0,onopen:null,onmessage:null,onclose:null,onerror:null,link:null,
   send(text){if(socket.readyState!==1||!socket.link?.open)throw Error('Room connection unavailable');outgoing(text);socket.link.channel.send(text);},
   close(){if(socket.readyState===3)return;socket.readyState=3;if(socket.link)socket.link.socket=null;queueMicrotask(()=>socket.onclose?.({}));},
   closeFromLink(){if(socket.readyState===3)return;socket.readyState=3;socket.onclose?.({});}};
  guestLinkFor(code).then(l=>{if(socket.readyState===3)return;socket.link=l;l.socket=socket;socket.readyState=1;socket.onopen?.({});}).catch(e=>{log('socket-failed',{message:e.message});if(socket.readyState===3)return;socket.readyState=3;socket.onerror?.({});socket.onclose?.({});});
  return socket;
 }
 const transport={
  kind:'webrtc-p2p',
  get role(){return role;},get code(){return code;},
  async post(path,body={}){
   if(path==='/native-rooms'){
    if(role==='host'&&core){core.close();try{await signal({op:'close',code,hostKey});}catch{}}
    for(let attempt=0;;attempt++){await becomeHost();hostKey=randomId();const result=core.request('create',body);if(result.status!==200)throw Error(result.body.error);code=result.body.code;try{await claim();persist();listen();log('hosting',{code});return result.body;}catch(e){core.close();if(e.status!==409||attempt>4)throw e;}}
   }
   if(path==='/native-rooms/resume'){
    if(role==='host'){await becomeHost(saved?.core??[]);await claim();const result=core.request('resume',body);if(result.status!==200)throw Error(result.body.error);persist();listen();return result.body;}
    if(role==='guest'&&code){const l=await guestLinkFor(code);return l.call('resume',body);}
    throw Error('Room session expired');
   }
   if(path==='/native-rooms/join'){
    const target=String(body.code??'').toUpperCase();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(target))throw Error('Invalid room code');
    log('join',{code:target});guestLink?.close();guestLink=null;const l=await connectHost(target,6);guestLink=l;const result=await l.call('join',{code:target});
    // Release this page's own room only after the join is confirmed.
    if(role==='host'&&code!==target){const oldCode=code,oldKey=hostKey;void signal({op:'close',code:oldCode,hostKey:oldKey}).catch(()=>{});}
    role='guest';code=target;hostKey=null;persist();return result;
   }
   throw Error('Unsupported room request');
  },
  socket(){return role==='host'?loopback():remoteSocket();},
  stats(){const sorted=[...rtt].sort((a,b)=>a-b),q=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))]:null;return {kind:'webrtc-p2p',role,code,links:role==='host'?hostLinks.size:guestLink?.open?1:0,rttSamples:rtt.length,rttMeanMs:rtt.length?rtt.reduce((a,b)=>a+b,0)/rtt.length:null,rttP50Ms:q(.5),rttP95Ms:q(.95),rttMaxMs:sorted.at(-1)??null,events:events.slice(-20)};},
  timeline(){return {sent:timeline.sent.slice(),received:timeline.received.slice()};},
  async pair(){const l=role==='host'?[...hostLinks][0]:guestLink;return l?selectedPair(l.pc):null;},
  forget(){if(role==='host'&&code)void signal({op:'close',code,hostKey}).catch(()=>{});role=null;code=null;hostKey=null;core?.close();core=null;try{storage.removeItem(storageKey);}catch{}},
  dispose(){disposed=true;removeEventListener('pagehide',persist);persist();for(const l of hostLinks)l.close();guestLink?.close();},
 };
 return transport;
}
