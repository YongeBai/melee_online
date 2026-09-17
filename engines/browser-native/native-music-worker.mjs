import {decodeHps} from './hps-audio.mjs';
onmessage=async({data:{url}})=>{try{const response=await fetch(url);if(!response.ok)throw Error('Hosted music unavailable: '+response.status);const audio=decodeHps(await response.arrayBuffer());postMessage({audio},audio.pcm.map(c=>c.buffer));}catch(error){postMessage({error:String(error.message??error)});}};
