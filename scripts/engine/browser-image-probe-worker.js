import {AsyncCanvasImageProbe} from './browser-async-image-probe.js';
let probe,timer=null,failed=false;
function fail(error) {
  failed=true;if(timer!==null)clearTimeout(timer);timer=null;
  postMessage({error:error.message});probe?.dispose();
}
function harvest() {
  timer=null;if(failed)return;
  try{
    for(const result of probe.poll())postMessage(result);
    if(probe.pending.length)timer=setTimeout(harvest,4);
  }catch(error){fail(error);}
}
self.onmessage=event=>{
  const message=event.data;
  if(failed){message?.bitmap?.close();return;}
  try{
    if(message.type==='init'){
      if(probe)throw Error('Image verifier initialized twice');
      probe=new AsyncCanvasImageProbe(message);postMessage({ready:true});return;
    }
    if(message.type!=='capture'||!probe)throw Error('Unexpected image verifier message');
    try{probe.capture(message.bitmap,{id:message.id});}finally{message.bitmap.close();}
    if(timer===null)timer=setTimeout(harvest,0);
  }catch(error){fail(error);}
};
