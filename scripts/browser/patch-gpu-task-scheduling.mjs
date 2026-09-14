import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function patchGpuTaskScheduling(source) {
  const marker='var _emscripten_set_timeout_loop=(cb,msecs,userData)=>{';
  if(source.split(marker).length!==2 || source.includes('meleeGpuTaskChannel'))
    throw Error('Unexpected Emscripten timer-loop glue');
  // A MessageChannel task yields to the browser without nested setTimeout's
  // minimum delay. Only the new zero-interval GPU loop uses this branch.
  const branch=`if(msecs===0&&typeof MessageChannel==='function'){
    const meleeGpuTaskChannel=new MessageChannel();
    const close=()=>{meleeGpuTaskChannel.port1.close();meleeGpuTaskChannel.port2.close();};
    const schedule=()=>{
      const address=typeof Module==='object' ? Module._meleeGpuWaitAddress >>> 0 : 0;
      if(address&&typeof Atomics.waitAsync==='function'){
        const value=Atomics.load(HEAP32,address>>>2);
        if(value<=1){
          const wait=Atomics.waitAsync(HEAP32,address>>>2,value,100);
          if(wait.async){wait.value.then(()=>meleeGpuTaskChannel.port2.postMessage(0));return;}
        }
      }
      meleeGpuTaskChannel.port2.postMessage(0);
    };
    meleeGpuTaskChannel.port1.onmessage=()=>{
      runtimeKeepalivePop();
      callUserCallback(()=>{
        let again=false;
        try{again=!!getWasmTableEntry(cb)(_emscripten_get_now(),userData);}
        finally{if(!again)close();}
        if(again){runtimeKeepalivePush();schedule();}
      });
    };
    runtimeKeepalivePush();schedule();return 0;
  }`;
  return source.replace(marker,marker+branch);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file=process.argv[2];if(!file)throw Error('Usage: node patch-gpu-task-scheduling.mjs CORE.js');
  writeFileSync(file,patchGpuTaskScheduling(readFileSync(file,'utf8')));
}
