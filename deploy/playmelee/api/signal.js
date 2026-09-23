import {getCache} from '@vercel/functions';
import {signal} from './_signal-core.js';

const cache=getCache({namespace:'melee-signal'});
export default {
 async fetch(request){
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'};
  if(request.method!=='POST')return new Response(JSON.stringify({error:'POST required'}),{status:405,headers});
  const origin=request.headers.get('origin');
  if(origin&&new URL(origin).host!==new URL(request.url).host)return new Response(JSON.stringify({error:'Same-origin request required'}),{status:403,headers});
  let body;try{const text=await request.text();if(text.length>20000)throw Error();body=JSON.parse(text);}catch{return new Response(JSON.stringify({error:'Invalid JSON'}),{status:400,headers});}
  const result=await signal(cache,body);
  return new Response(JSON.stringify(result.body),{status:result.status,headers});
 },
};
