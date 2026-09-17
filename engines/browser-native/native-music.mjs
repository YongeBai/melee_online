// Original C chooses the track and transport; this owns only browser playback.
// Decode off the gameplay thread, and never claim autoplay worked while locked.
export async function createNativeMusic(){
 const response=await fetch('./music-fixtures.json');if(!response.ok)throw Error('Hosted music manifest unavailable');const manifest=await response.json();
 let context,gain,analyser,node,worker,buffer,track=null,loopStart=null,offset=0,began=0,paused=false,unlocked=false,disposed=false,generation=0,error=null,status='idle';
 const events=[],listeners=new AbortController();
 function log(event){if(events.length===64)events.shift();events.push({event,track,time:performance.now()});}
 function setup(){if(context)return;context=new AudioContext({latencyHint:'interactive'});gain=context.createGain();analyser=context.createAnalyser();analyser.fftSize=256;gain.connect(analyser);analyser.connect(context.destination);}
 function position(){let p=offset+(node?context.currentTime-began:0);if(buffer&&loopStart!==null&&p>=buffer.duration)p=loopStart+(p-loopStart)%(buffer.duration-loopStart);return p;}
 function halt(){if(!node)return;offset=position();const old=node;node=null;old.onended=null;old.stop();old.disconnect();}
 function play(){if(!buffer||paused||document.hidden||!unlocked||context.state!=='running'||node||disposed)return;node=context.createBufferSource();node.buffer=buffer;node.loop=loopStart!==null;if(node.loop){node.loopStart=loopStart;node.loopEnd=buffer.duration;}node.connect(gain);began=context.currentTime;node.onended=()=>{node?.disconnect();node=null;buffer=null;status='ended';log('ended');};node.start(0,offset);status='playing';log('playing');}
 async function unlock(){if(disposed||unlocked&&context?.state==='running')return;setup();try{await context.resume();unlocked=context.state==='running';if(unlocked)play();}catch(e){error=String(e);}}
 for(const type of ['pointerdown','keydown'])addEventListener(type,unlock,{capture:true,signal:listeners.signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){halt();if(buffer)status='hidden';}else play();},{signal:listeners.signal});
 function stop(){generation++;worker?.terminate();worker=null;halt();buffer=null;track=null;loopStart=null;offset=0;paused=false;status='idle';}
 function request(r){
  if(disposed)return false;
  if(r.action===0){const name=String(r.path??'').replace(/^\/?audio\//,'');if(!Object.hasOwn(manifest,name)||!Number.isFinite(r.volume)||r.volume<0||r.volume>255){error='Unsupported native music request: '+r.path;return false;}
   stop();setup();track=name;gain.gain.value=r.volume/255;error=null;status='loading';log('requested');const ticket=generation;
   worker=new Worker(new URL('./native-music-worker.mjs',import.meta.url),{type:'module'});
   const failed=message=>{if(ticket!==generation)return;error=message;status='failed';worker?.terminate();worker=null;};
   worker.onerror=e=>failed(e.message);worker.onmessage=({data})=>{if(ticket!==generation)return;worker.terminate();worker=null;if(data.error){failed(data.error);return;}try{const a=data.audio;buffer=context.createBuffer(a.pcm.length,a.length,a.rate);a.pcm.forEach((p,i)=>buffer.copyToChannel(p,i));loopStart=a.loopStart===null?null:a.loopStart/a.rate;status=paused?'paused':unlocked?'ready':'locked';log('decoded');play();}catch(e){failed(String(e));}};
   worker.postMessage({url:new URL('./audio/'+name,import.meta.url).href});return true;
  }
  if(r.action===1){stop();return true;}
  if(r.action===2){if(!track)return false;halt();paused=true;status='paused';log('paused');return true;}
  if(r.action===3){if(!track)return false;paused=false;play();return true;}
  if(r.action===4)return !!track&&!['failed','ended'].includes(status);
  return false;
 }
 function snapshot(){let outputPeak=0;if(analyser){const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);for(const x of data)outputPeak=Math.max(outputPeak,Math.abs(x));}return {track,status,error,contextState:context?.state??'absent',offsetSeconds:position(),loopStartSeconds:loopStart,outputPeak,events:[...events],soundEffects:false};}
 return {request,snapshot,dispose(){if(disposed)return;stop();disposed=true;listeners.abort();void context?.close();}};
}
