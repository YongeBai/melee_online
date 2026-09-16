// Fixed simulation cadence. Retain backlog under load; pause explicitly when
// hidden. Old rAF timestamps must not move the wall-clock origin backwards.
export function createNativeFrameClock(start,rate=60) {
  const duration=1000/rate;let previous=start,debt=0,maxDebt=0;
  return {
    take(now,limit=4){
      if(!Number.isFinite(now)||!Number.isInteger(limit)||limit<0)throw Error('Native frame clock input');
      if(previous===null){previous=now;return 0;}
      if(now<previous)return 0;
      debt+=now-previous;previous=now;maxDebt=Math.max(maxDebt,debt);
      const count=Math.min(limit,Math.floor((debt+1e-6)/duration));debt=Math.max(0,debt-count*duration);return count;
    },
    reset(){previous=null;debt=0;},
    get debtMs(){return debt;},get maxDebtMs(){return maxDebt;},
  };
}

// Interactive development fixture, not complete competitive match startup.
// Input samples enter the existing normalized HSD boundary; no game-state
// positions, action states, damage or velocities are assigned here.
export function startNativeLive(module,preview,objects,{frameLimit=0,onProgress=()=>{},onComplete=()=>{},onError=()=>{}}={}) {
  const stateChanges=[],inputChanges=[],keys=new Set(),clock=createNativeFrameClock(performance.now()),stepTimes=[],drawTimes=[],intervals=[];
  let raf=0,stopped=false,frames=0,draws=0,started=performance.now(),lastDraw=null;
  const initial=objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  const buttons=new Map([['KeyZ',0x100],['KeyS',0x200],['KeyX',0x400],['KeyC',0x120],['ShiftLeft',0x20],['ShiftRight',0x40]]);
  const handled=new Set([...buttons.keys(),'ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
  let movement=false,jump=false,attack=false,final=null;
  function input(event){if(!handled.has(event.code))return;event.preventDefault();event.type==='keydown'?keys.add(event.code):keys.delete(event.code);if(inputChanges.length<256)inputChanges.push({frame:frames,type:event.type,code:event.code});}
  function reset(){keys.clear();clock.reset();lastDraw=null;}
  const cursors=new Map();
  function sample(values,value){const index=cursors.get(values)??0;if(values.length<3600)values.push(value);else values[index%3600]=value;cursors.set(values,index+1);}
  function distribution(values){const v=[...values].sort((a,b)=>a-b);return {samples:v.length,meanMs:v.reduce((a,b)=>a+b,0)/(v.length||1),p50Ms:v[Math.floor((v.length-1)*.5)]??0,p95Ms:v[Math.floor((v.length-1)*.95)]??0,maxMs:v.at(-1)??0};}
  function snapshot(){return {frames,draws,elapsedMs:performance.now()-started,initial,final,stateChanges,inputChanges,movement,jump,attack,maxDebtMs:clock.maxDebtMs,stepCpu:distribution(stepTimes),drawSubmissionCpu:distribution(drawTimes),rafDrawIntervals:distribution(intervals),resolution:[960,720],gpuReadbacks:false,playable:false,performanceCertified:false,presentationFpsMeasured:false,inputToPhotonMeasured:false};}
  function stop(){if(stopped)return;stopped=true;cancelAnimationFrame(raf);removeEventListener('keydown',input);removeEventListener('keyup',input);removeEventListener('blur',reset);document.removeEventListener('visibilitychange',reset);keys.clear();for(let i=0;i<objects.length;i++)module._portStageProbePad(i,0,0,0);}
  function frame(now){
    if(stopped)return;
    try {
      if(document.hidden){reset();raf=requestAnimationFrame(frame);return;}
      const steps=clock.take(now,frameLimit?Math.min(4,frameLimit-frames):4);
      // Bound work per callback while retaining debt: never skip simulation
      // frames to inflate the rendered frame rate. Hidden tabs pause explicitly.
      for(let step=0;step<steps;step++) {
        let held=0;for(const [code,button] of buttons)if(keys.has(code))held|=button;
        module._portStageProbePad(0,held,Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')));
        for(let i=1;i<objects.length;i++)module._portStageProbePad(i,0,0,0);
        const before=performance.now();module._portRuntimeStep();sample(stepTimes,performance.now()-before);frames++;
        final=objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
        if(!final.flat().every(Number.isFinite))throw Error('Nonfinite interactive fighter state');
        if(stateChanges.length<256&&stateChanges.at(-1)?.state!==final[0][0])stateChanges.push({frame:frames,state:final[0][0],x:final[0][4],y:final[0][5],buttons:held});
        movement ||= Math.abs(final[0][4]-initial[0][4])>.1;
        jump ||= final[0][3]===1&&final[0][5]>initial[0][5]+1;
        attack ||= final[0][0]>=44&&final[0][0]<=69;
      }
      if(steps){const before=performance.now();preview.draw();sample(drawTimes,performance.now()-before);draws++;if(lastDraw!==null)sample(intervals,now-lastDraw);lastDraw=now;if(draws%30===0)onProgress(snapshot());}
      if(frameLimit&&frames>=frameLimit){stop();onComplete(snapshot());return;}
      raf=requestAnimationFrame(frame);
    }catch(error){stop();onError(error,snapshot());}
  }
  for(let i=0;i<objects.length;i++)module._Player_80031848(i);
  addEventListener('keydown',input);addEventListener('keyup',input);addEventListener('blur',reset);document.addEventListener('visibilitychange',reset);
  raf=requestAnimationFrame(frame);
  return {snapshot,stop(){stop();onComplete(snapshot());}};
}
