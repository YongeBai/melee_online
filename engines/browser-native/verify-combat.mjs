// Integration probe over original Fighter callbacks. Inputs are normalized HSD
// samples; no fighter positions, damage, motion states or physics are assigned.
export async function verifyCombat(module,objects,report,{control=false,progress=()=>{}}={}) {
  const state=o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i));
  const snapshot=()=>objects.map(state),trace=[];
  const require=(ok,message)=>{if(!ok)throw Error('Combat: '+message);};
  function tick(a=[0,0,0],b=[0,0,0]) {
    module._portStageProbePad(0,...a);module._portStageProbePad(1,...b);module._portRuntimeStep();report.frames++;
    const current=snapshot();
    for(let i=0;i<2;i++)require(current[i].every(Number.isFinite)&&current[i][9]===15&&current[i][10]===1&&current[i][12]===i&&current[i][18]===4,'finite state, independent ownership and retained stocks');
    // Exclude pointer addresses; retain every observed gameplay field per step.
    trace.push(current.map(s=>[...s.slice(0,7),...s.slice(9)]));
    return current;
  }
  report.control=control;report.frames=0;report.settled=snapshot();
  require(report.settled.every(s=>s[0]===14&&s[3]===0&&s[13]===0),'both fighters settled at zero damage');
  module._Player_80031848(0);module._Player_80031848(1);progress();
  for(let frame=0;frame<90;frame++)tick(undefined,[0,0,frame<5?-1:0]);
  report.afterDrop=snapshot();
  require(report.afterDrop.every(s=>s[0]===14&&s[3]===0)&&Math.abs(report.afterDrop[0][5]-report.afterDrop[1][5])<0.001,'platform drop reaches the same floor');
  report.peakHitlag=[0,0];report.peakKnockback=[0,0];report.motionStates=[[],[]];report.states=[];
  for(let frame=0;frame<300;frame++) {
    const [a,b]=snapshot(),dx=b[4]-a[4],moving=Math.abs(dx)>10;
    const current=tick([moving||control?0:(frame%30===0?0x100:0),moving?Math.sign(dx)*0.5:0,0]);
    for(let i=0;i<2;i++) {
      report.peakHitlag[i]=Math.max(report.peakHitlag[i],current[i][14]);
      report.peakKnockback[i]=Math.max(report.peakKnockback[i],current[i][15]);
      if(!report.motionStates[i].includes(current[i][0]))report.motionStates[i].push(current[i][0]);
    }
    if(frame%10===0)report.states.push({frame,fighters:current});
  }
  report.afterAttacks=snapshot();
  if(control)require(report.afterAttacks.every(s=>s[13]===0)&&report.peakHitlag.every(x=>x===0)&&report.peakKnockback.every(x=>x===0),'no-button control has no damage, hitlag or knockback');
  else {
    require(report.afterAttacks[0][13]===0&&report.afterAttacks[1][13]>0,'only the attacked fighter takes damage');
    require(report.peakHitlag.every(x=>x>0)&&report.peakKnockback[1]>0,'attack and defender hitlag, and defender knockback');
    require(report.motionStates[1].some(s=>s>=75&&s<=91)&&report.afterAttacks[1][4]>report.afterDrop[1][4],'damage reaction and displacement');
  }
  progress();
  const shield=report.shield={before:snapshot()[1],frames:0,states:[],peakHitlag:0};
  for(let frame=0;frame<90;frame++) {
    const defender=tick([!control&&frame>=15&&frame%30===15?0x100:0,0,0],[0x20,0,0])[1];shield.frames++;
    shield.peakHitlag=Math.max(shield.peakHitlag,defender[14]);
    if(!shield.states.includes(defender[0]))shield.states.push(defender[0]);
  }
  shield.after=snapshot()[1];
  require(shield.after[13]===shield.before[13]&&shield.after[17]<shield.before[17]&&shield.states.includes(179),'shield protects damage and consumes health');
  require(control?!shield.states.includes(181)&&shield.peakHitlag===0:shield.states.includes(181)&&shield.peakHitlag>0,'shield stun agrees with attack/control input');
  progress();
  if(!control) {
    const grab=report.grab={frames:0,approachFrames:0,states:[[],[]]};
    for(let frame=0;frame<60;frame++)tick();
    for(let frame=0;frame<120;frame++) {
      const [a,b]=snapshot(),dx=b[4]-a[4];if(Math.abs(dx)<8)break;
      tick([0,Math.sign(dx)*0.5,0]);grab.approachFrames++;
    }
    for(let frame=0;frame<12;frame++)tick();grab.before=snapshot();
    for(let frame=0;frame<120;frame++) {
      const current=tick([frame<2?0x120:0,frame>=25&&frame<30?1:0,0]);grab.frames++;
      for(let i=0;i<2;i++)if(!grab.states[i].includes(current[i][0]))grab.states[i].push(current[i][0]);
    }
    grab.after=snapshot();
    require(grab.states[0].includes(216)&&grab.states[0].includes(219)&&grab.states[1].includes(239)&&grab.after[1][13]>grab.before[1][13],'grab wait, forward throw, thrown reaction and added damage');
  }
  report.traceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(trace)))),b=>b.toString(16).padStart(2,'0')).join('');
  report.completed=true;
  report.limitation='Two Falcons, one stage, default rules and scripted normalized inputs. No full match lifecycle, complete stage callbacks, general effects, audio playback, browser device sampling, gameplay rendering or measured FPS/latency.';
  return report;
}
