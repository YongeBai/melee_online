// Room-code rendezvous for WebRTC. It stores only short-lived session
// descriptions; inputs never pass through this service.
const CODE=/^[A-HJ-NP-Z2-9]{6}$/,ID=/^[A-Za-z0-9_-]{8,64}$/,KEY=/^[A-Za-z0-9_-]{16,64}$/;
const fail=(status,error)=>({status,body:{error}});
function check(m,fields){
 if(!CODE.test(m.code??''))throw fail(400,'Invalid room code');
 if(fields.includes('hostKey')&&!KEY.test(m.hostKey??''))throw fail(400,'Invalid host key');
 if(fields.includes('id')&&!ID.test(m.id??''))throw fail(400,'Invalid peer id');
 if(fields.includes('sdp')&&(typeof m.sdp!=='string'||m.sdp.length>16384))throw fail(400,'Invalid session description');
}
export function memoryStore(){
 const values=new Map();
 return {async get(k){const v=values.get(k);if(!v)return undefined;if(v.until<Date.now()){values.delete(k);return undefined;}return v.value;},
  async set(k,value,{ttl}){values.set(k,{value,until:Date.now()+ttl*1000});},async delete(k){values.delete(k);}};
}
export async function signal(store,m){
 try{
  if(!m||typeof m!=='object')throw fail(400,'Invalid request');
  const owner=async()=>{const host=await store.get('host:'+m.code);if(!host)throw fail(404,'Room not found');if(m.hostKey!==undefined&&host.hostKey!==m.hostKey)throw fail(403,'Room belongs to another host');return host;};
  if(m.op==='host'){check(m,['hostKey']);const host=await store.get('host:'+m.code);if(host&&host.hostKey!==m.hostKey)throw fail(409,'Room code in use');await store.set('host:'+m.code,{hostKey:m.hostKey},{ttl:7200});return {status:200,body:{ok:true}};}
  if(m.op==='offer'){check(m,['id','sdp']);await owner();await store.set('offer:'+m.code,{id:m.id,sdp:m.sdp,at:Date.now()},{ttl:30});return {status:200,body:{ok:true}};}
  if(m.op==='poll-offer'){check(m,['hostKey']);await owner();const offer=await store.get('offer:'+m.code);if(offer)await store.delete('offer:'+m.code);return {status:200,body:{offer:offer??null}};}
  if(m.op==='answer'){check(m,['hostKey','id','sdp']);await owner();await store.set('answer:'+m.code+':'+m.id,{sdp:m.sdp},{ttl:30});return {status:200,body:{ok:true}};}
  if(m.op==='poll-answer'){check(m,['id']);const answer=await store.get('answer:'+m.code+':'+m.id);if(answer)await store.delete('answer:'+m.code+':'+m.id);return {status:200,body:{answer:answer??null}};}
  if(m.op==='close'){check(m,['hostKey']);await owner();await store.delete('host:'+m.code);return {status:200,body:{ok:true}};}
  throw fail(400,'Unsupported signaling operation');
 }catch(e){if(e?.status)return e;throw e;}
}
