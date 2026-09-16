// Exercise original Purin states using controller samples only. This is a move
// integration probe; opponent contact and retail per-frame parity are separate.
export function verifyPurinMoves(module,object,report,{step,onStep=()=>{}}) {
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  const require=(ok,message)=>{if(!ok)throw Error('Purin moves: '+message);};
  require(read()[11]===15,'wrong fighter kind');
  report.completed=false;report.frames=0;report.phases=[];
  let phase;
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter state');
    if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    phase.peakParticles=Math.max(phase.peakParticles,module._portEffectsRead(9,11));
    phase.peakModels=Math.max(phase.peakModels,module._portEffectsRead(5,0));
    phase.frames++;onStep(phase.name,s);phase.final=s;return s;
  }
  function begin(name){phase={name,frames:0,states:[],peakParticles:0,peakModels:0};report.phases.push(phase);}
  function neutral(frames){for(let i=0;i<frames;i++)tick();}
  function grounded(){require(read()[0]===14&&read()[3]===0,'expected grounded Wait before '+phase.name);}
  begin('five aerial jumps');grounded();
  for(let i=0;i<4;i++)tick(0x400);neutral(8);
  for(let jump=0;jump<5;jump++){tick(0x400);neutral(40);}
  require([341,342,343,344,345].every(id=>phase.states.includes(id)),'all five original aerial jump states');
  neutral(300);grounded();
  begin('Rest');grounded();tick(0x200,0,-1);neutral(300);
  require(phase.states.some(s=>s===369||s===371),'grounded Rest state');grounded();
  begin('Sing');grounded();tick(0x200,0,1);neutral(300);
  require(phase.states.some(s=>s===365||s===367),'grounded Sing state');grounded();
  begin('Pound');grounded();tick(0x200,1,0);neutral(100);
  require(phase.states.includes(363),'grounded Pound state');grounded();
  begin('air Pound');for(let i=0;i<4;i++)tick(0x400);neutral(8);tick(0x200,1,0);neutral(200);
  require(phase.states.includes(364),'air Pound state');grounded();
  begin('Rollout');grounded();
  // Face toward stage center through an ordinary turn before charging.
  const direction=read()[4]>0?-.5:.5;tick(0,direction,0);neutral(20);
  for(let i=0;i<60;i++)tick(0x200);neutral(200);
  require(phase.states.some(s=>s===346||s===347)&&phase.states.includes(348)&&phase.states.includes(350),'Rollout startup, charge and release states');
  require(report.phases.find(p=>p.name==='Sing').peakModels>0,'original Sing effect model exercised');
  report.completed=true;report.contactParityVerified=false;
}

export function verifyPurinContact(module,objects,report,{step,mode,onStep=()=>{}}) {
  const require=(ok,message)=>{if(!ok)throw Error('Purin contact: '+message);};
  require(objects.length===2&&['rest','sing','control'].includes(mode),'invalid probe');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.attackerStates=[];report.defenderStates=[];report.peakHitlag=0;report.peakKnockback=0;report.peakDamage=0;
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;
    const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter state');
    onStep();return s;
  }
  module._Player_80031848(1);
  for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
  require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle on the floor');
  for(let i=0;i<90;i++){
    const s=read(),dx=s[1][4]-s[0][4];
    tick([0,Math.abs(dx)>1?Math.sign(dx)*.5:0,0]);
  }
  report.before=read();
  require(report.before.every(s=>s[13]===0),'contact starts at zero damage');
  for(let i=0;i<330;i++){
    const s=tick([i<2&&mode!=='control'?0x200:0,0,i<2?(mode==='sing'?1:-1):0]);
    if(!report.attackerStates.includes(s[0][0]))report.attackerStates.push(s[0][0]);
    if(!report.defenderStates.includes(s[1][0]))report.defenderStates.push(s[1][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);if(!report.firstHit&&s[1][13]>0)report.firstHit={frame:i+1,fighters:s};
    report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);
  }
  report.after=read();
  if(mode==='control')require(report.after.every(s=>s[13]===0)&&!report.peakHitlag&&!report.peakKnockback,'no-button control must not hit');
  if(mode==='rest')require(report.attackerStates.some(s=>s===369||s===371)&&report.peakDamage>0&&report.peakHitlag>0&&report.peakKnockback>0,'Rest must hit with damage, hitlag and knockback');
  if(mode==='sing')require(report.attackerStates.some(s=>s===365||s===367)&&report.defenderStates.includes(297)&&report.after.every(s=>s[13]===0),'Sing must enter sleep without damage');
  report.completed=true;report.retailParityVerified=false;
}
