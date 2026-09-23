// ICE servers for peer connections. STUN alone connects most home networks;
// symmetric NATs need TURN. When Cloudflare Realtime TURN credentials are
// configured (TURN_KEY_ID, TURN_KEY_API_TOKEN), mint short-lived ones.
const stun=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
export default {
 async fetch(request){
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Cross-Origin-Resource-Policy':'same-origin'};
  const origin=request.headers.get('origin');
  if(origin&&new URL(origin).host!==new URL(request.url).host)return new Response(JSON.stringify({error:'Same-origin request required'}),{status:403,headers});
  const {TURN_KEY_ID:id,TURN_KEY_API_TOKEN:token}=process.env;
  if(!id||!token)return new Response(JSON.stringify({iceServers:stun,turn:false}),{headers});
  try{
   const response=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({ttl:14400}),signal:AbortSignal.timeout(4000)});
   if(!response.ok)throw Error('TURN credentials unavailable: '+response.status);
   const {iceServers}=await response.json();
   return new Response(JSON.stringify({iceServers:[...stun,...[iceServers].flat()],turn:true}),{headers});
  }catch(e){return new Response(JSON.stringify({iceServers:stun,turn:false,error:e.message}),{headers});}
 },
};
