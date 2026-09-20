// Injected only by the Node/CDP probe; never loaded by the product.
export function installRoomTiming({gpuCheckEveryFrame=false,measureInput=false,recordInputs=false,inputTape=null}={}){
 const product=globalThis.nativeProductRollback;
 if(!product)throw Error('Timing requires a live rollback product');
 const series={reconcile:[],advance:[],draw:[],gpuCheck:[],frameIntervals:[]},inputs=[];
 let lastDraw=null,pending=null,accepted=null,stalledAdvances=0;
 const localX=()=>characterModule._portFighterConstructRead(characterModule._Player_GetEntity(product.driver.seat),4);
 const localStickX=()=>characterModule._portFighterConstructRead(characterModule._Player_GetEntity(product.driver.seat),21);
 const sent=new Map(),recorded=new Map(),sendInput=nativeRoom.sendInput;
 if(measureInput||recordInputs)nativeRoom.sendInput=function(frame,pad){const at=performance.now(),result=sendInput.call(this,frame,pad);if(result){if(measureInput&&!sent.has(frame))sent.set(frame,{pad:[...pad],at});if(recordInputs&&!recorded.has(frame))recorded.set(frame,[...pad]);}return result;};
 const push=(name,value)=>{if(series[name].length<7200)series[name].push(value);};
 for(const [owner,key] of [[product.driver,'reconcile'],[product.driver,'advance'],[product.preview,'draw']]){
  const original=owner[key];owner[key]=function(...args){
   if(key==='advance'&&inputTape&&args[0]>=3){const pad=inputTape[args[0]];if(!pad)throw Error('Missing recorded input at '+args[0]);args[1]=args[1].map((p,seat)=>seat===product.driver.seat?pad:p);}
   const start=performance.now(),result=original.apply(this,args);if(key==='draw'&&gpuCheckEveryFrame&&gl.getError()!==gl.NO_ERROR)throw Error('Diagnostic GPU failure');const end=performance.now();push(key,end-start);
   if(key==='advance'&&!result)stalledAdvances++;
   if(key==='advance'&&result){const transmitted=sent.get(args[0]);sent.delete(args[0]);if(pending&&transmitted&&transmitted.at>=pending.at){const pad=transmitted.pad;if((pending.code==='KeyD'&&pad[1]>0)||(pending.code==='KeyA'&&pad[1]<0)){accepted={...pending,frame:args[0],sampleMs:transmitted.at-pending.at,advanceEndMs:end-pending.at};pending=null;}}}
   if(key==='draw'){if(lastDraw!==null)push('frameIntervals',end-lastDraw);lastDraw=end;if(accepted){inputs.push({...accepted,submitMs:end-accepted.at});accepted=null;}const latest=inputs.at(-1);if(latest){const direction=latest.code==='KeyD'?1:-1;if(latest.nativeInputSubmitMs===undefined&&localStickX()*direction>.5)latest.nativeInputSubmitMs=end-latest.at;if(latest.movementSubmitMs===undefined&&(localX()-latest.x)*direction>.01)latest.movementSubmitMs=end-latest.at;}}
   return result;
  };
 }
 const gl=document.querySelector('#native-preview').getContext('webgl2'),getError=gl.getError.bind(gl);
 gl.getError=()=>{const start=performance.now(),result=getError();push('gpuCheck',performance.now()-start);return result;};
 if(measureInput)addEventListener('keydown',e=>{if(!e.repeat&&['KeyA','KeyD'].includes(e.code))pending={code:e.code,x:localX(),at:performance.now(),eventDispatchMs:Math.max(0,performance.now()-e.timeStamp)};});
 const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return {samples:n,meanMs:values.reduce((a,b)=>a+b,0)/(n||1),p50Ms:sorted[Math.floor((n-1)*.5)]??0,p95Ms:sorted[Math.floor((n-1)*.95)]??0,p99Ms:sorted[Math.floor((n-1)*.99)]??0,maxMs:sorted.at(-1)??0,over16_67:values.filter(x=>x>1000/60).length,over25:values.filter(x=>x>25).length,over33_34:values.filter(x=>x>1000/30).length};};
 globalThis.roomInputTape=frames=>Array.from({length:frames},(_,frame)=>{if(frame<3)return [0,0,0,0,0,0,0];const pad=recorded.get(frame);if(!pad)throw Error('Input recording missed frame '+frame);return pad;});
 globalThis.roomTimingReport=()=>({gpuCheckEveryFrame,stalledAdvances,costs:Object.fromEntries(Object.entries(series).map(([key,values])=>[key,stats(values)])),input:{samples:inputs.length,eventToSample:stats(inputs.map(x=>x.sampleMs)),eventToDrawSubmission:stats(inputs.map(x=>x.submitMs)),eventToNativeInputSubmission:stats(inputs.filter(x=>x.nativeInputSubmitMs!==undefined).map(x=>x.nativeInputSubmitMs)),eventToMovementSubmission:stats(inputs.filter(x=>x.movementSubmitMs!==undefined).map(x=>x.movementSubmitMs)),events:inputs},scope:'Browser key event handler to accepted local simulation input and CPU draw submission. Native-input metric additionally requires fighter input.lstick[0].x to reflect the requested direction; movement metric requires native X displacement. Excludes physical device, GPU completion, compositor and scanout. Not input-to-photon.'});
}
