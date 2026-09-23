// Input-only room relay. Game simulation and rendering remain in each browser.
// The room authority itself lives in room-core.mjs so the same rules can run
// inside the owner's browser for peer-to-peer rooms.
import {WebSocketServer} from '../../web/node_modules/ws/wrapper.mjs';
import {createRoomCore} from '../../engines/browser-native/room-core.mjs';
import {memoryStore,signal} from '../../deploy/playmelee/api/_signal-core.js';
function sameOrigin(req){if(!req.headers.origin)return true;try{const origin=new URL(req.headers.origin);return ['http:','https:'].includes(origin.protocol)&&origin.host===req.headers.host;}catch{return false;}}
export function createNativeRoomRelay(server,{maxRooms=64,expiryMs=30000,deliveryDelayMs=null,receiveDelayMs=null,authorize=()=>true,origins=null,allowDiagnosticCpu=true}={}){
 const core=createRoomCore({maxRooms,expiryMs,deliveryDelayMs,receiveDelayMs,allowDiagnosticCpu}),wss=new WebSocketServer({noServer:true,maxPayload:8192}),signals=memoryStore();
 function websocket(ws){const peer=core.attach(ws);ws.on('message',raw=>peer.message(raw.toString()));ws.on('close',()=>peer.close());}
 const originAllowed=req=>origins?origins.includes(req.headers.origin):sameOrigin(req);
 server.on('upgrade',(req,socket,head)=>{if(new URL(req.url,'http://localhost').pathname!=='/native-room'){socket.destroy();return;}if(!authorize(req)||!originAllowed(req)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,websocket);});
 let stopped=false;function stop(){if(stopped)return;stopped=true;core.close();for(const client of wss.clients)client.terminate();wss.close();}
 server.on('close',stop);
 const routes={'/native-rooms':'create','/native-rooms/join':'join','/native-rooms/resume':'resume'};
 return {close:stop,core,deliverySnapshot:core.deliverySnapshot,receiveSnapshot:core.receiveSnapshot,testDisconnectSeat:core.testDisconnectSeat,async handle(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/ice'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({iceServers:[],turn:false}));return true;}
  if(!routes[pathname]&&pathname!=='/api/signal')return false;
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(!authorize(req)){reply(401,{error:'Authentication required'});return true;}
  if(req.method!=='POST'||!originAllowed(req)){reply(403,{error:'Same-origin POST required'});return true;}
  let m;try{let body='';for await(const data of req){body+=data;if(body.length>(routes[pathname]?4096:20000))throw Error('Request too large');}m=JSON.parse(body||'{}');}catch(e){reply(400,{error:e.message});return true;}
  // Local equivalent of the hosted peer-signaling function.
  const result=routes[pathname]?core.request(routes[pathname],m):await signal(signals,m);
  reply(result.status,result.body);return true;
 }};
}
