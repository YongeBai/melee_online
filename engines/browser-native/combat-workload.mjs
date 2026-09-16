// Deterministic normalized controller workload for the partial two-Falcon
// fixture, revision 2 (turn toward the opponent before attacking).
// This drives original gameplay; it never writes fighter state.
export function combatWorkload(frame,states) {
  if(states.length!==2)throw Error('Combat workload requires two fighters');
  if(frame<90)return [[0,0,0],[0,0,frame<5?-1:0]];
  return states.map((s,i)=>{
    const dx=states[1-i][4]-s[4],near=Math.abs(dx)<12;
    // Stay near the other fighter, including after a native respawn. Inputs
    // are sampled per simulation frame, independently of presentation cadence.
    const turn=near&&dx*s[16]<0;
    const x=near&&!turn?0:Math.sign(dx)*.5;
    // Re-arm the downward stick flick after landing on a platform. Holding
    // down forever can leave the fighter crouching there without dropping.
    if(s[5]>states[1-i][5]+10)return [0,x,frame%20<5?-1:0];
    // Wind, crossover and respawns can leave nearby fighters facing away.
    // Issue an ordinary turn input and wait for the original state change.
    if(turn)return [0,x,0];
    const cycle=(frame-90+i*15)%180;
    const buttons=i===1&&cycle>=120&&cycle<150?0x20:near&&cycle%30===0?0x100:0;
    return [buttons,x,0];
  });
}

// Run the identical controller sequence without rAF to find correctness faults
// before spending a real-time performance run. This is not an FPS benchmark.
export function verifyCombatWorkload(module,objects,report,frames) {
  const snapshot=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  let states=snapshot();report.completed=false;report.frames=0;report.windows=[];report.stockChanges=[];report.states=[[],[]];
  for(let i=0;i<2;i++)module._Player_80031848(i);
  for(let frame=0;frame<frames;frame++) {
    const pads=combatWorkload(frame,states),before=states;
    pads.forEach((p,i)=>module._portStageProbePad(i,...p));module._portTournamentStep();report.frames++;
    states=snapshot();if(!states.flat().every(Number.isFinite))throw Error('Nonfinite combat workload state');
    const w=Math.floor(frame/600);if(!report.windows[w])report.windows[w]={frames:0,hitlag:0};
    if(frame%600===599)report.windows[w].fighters=states;
    report.windows[w].frames++;if(states.some(s=>s[14]>0))report.windows[w].hitlag++;
    states.forEach((s,i)=>{if(!report.states[i].includes(s[0]))report.states[i].push(s[0]);if(s[18]!==before[i][18])report.stockChanges.push({frame:frame+1,slot:i,stocks:s[18]});});
  }
  report.final=states;
  if(report.windows.some(w=>w.hitlag===0))throw Error('Combat workload lost contact for a full measurement window');
  report.completed=true;
}
