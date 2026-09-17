// Exercise the original player-owned Sheik/Zelda swap through down-B.
export function verifyTransform(module,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Transformation: '+message);};
  const state=()=>{const owner=module._Player_GetEntity(0);return {owner,costume:module._portFighterConstructRead(owner,35),values:Array.from({length:19},(_,i)=>module._portFighterConstructRead(owner,i))};};
  const initial=state();require([7,19].includes(initial.values[11]),'wrong initial fighter');
  Object.assign(report,{completed:false,frames:0,phases:[],retailParityVerified:false});let phase;
  const tick=(buttons=0,x=0,y=0)=>{
    module._portStageProbePad(0,buttons,x,y);step();report.frames++;const s=state();
    require(s.values.every(Number.isFinite),'nonfinite fighter');phase.trace.push(s);phase.final=s;onStep(phase);return s;
  };
  // A Mario opponent supplies actual damage before swapping forms.
  const opponent=module._Player_GetEntity(1);
  if(opponent&&module._portFighterConstructRead(opponent,11)===0){
    phase={name:'real fireball damage',trace:[]};report.phases.push(phase);module._Player_80031848(1);
    for(let i=0;i<120;i++){module._portStageProbePad(1,0,0,i<5?-1:0);tick();}
    for(let i=0;i<180;i++){const dx=module._portFighterConstructRead(opponent,4)-state().values[4];if(Math.abs(Math.abs(dx)-45)<2)break;tick(0,Math.sign(dx)*.5*(Math.abs(dx)>45?1:-1));}
    const dir=Math.sign(module._portFighterConstructRead(opponent,4)-state().values[4])||1;
    for(let i=0;i<5;i++){module._portStageProbePad(1,0,-dir*.5,0);tick(0,dir*.5);}
    module._portStageProbePad(1,0,0,0);for(let i=0;i<20;i++)tick();
    module._portStageProbePad(1,0x200,0,0);tick();module._portStageProbePad(1,0,0,0);for(let i=0;i<160;i++)tick();
    require(state().values[13]>0,'opponent must inflict real damage');report.initialDamage=state().values[13];
  }
  for(let round=0;round<4;round++){
    const air=round>=2;
    phase={name:air?'jump setup':'ground setup',trace:[]};
    if(air){report.phases.push(phase);for(let i=0;i<180&&state().values[4]<62;i++)tick(0,.5);for(let i=0;i<25;i++)tick();for(let i=0;i<10;i++)tick(0x400);for(let i=0;i<8;i++)tick();tick(0x400);for(let i=0;i<4;i++)tick();}
    const before=state(),target=before.values[11]===7?19:7;phase={name:(air?'air':'ground')+' transform to '+target,before,trace:[]};report.phases.push(phase);
    require(air?before.values[3]===1:before.values[0]===14&&before.values[3]===0,'expected initial ground/air state');
    tick(0x200,0,-1);for(let i=0;i<300;i++)tick();
    const after=state();require(after.values[11]===target&&after.owner!==before.owner&&after.values[0]===14,'swap into target and recover');
    require(after.values[13]===before.values[13]&&after.values[18]===before.values[18],'preserve damage and stocks');
    require(after.costume===before.costume&&after.costume===initial.costume,'preserve selected costume across forms');
    if(air)require(phase.trace.find(s=>s.owner!==before.owner)?.values[3]===1,'swap must occur in the air');
    else require(Math.abs(after.values[4]-before.values[4])<.01&&Math.abs(after.values[5]-before.values[5])<.01,'preserve grounded position');
    require(module._Player_GetEntityAtIndex(0,1)===before.owner,'previous fighter becomes inactive form');
  }
  require(state().owner===initial.owner,'round trip must reuse original fighter');report.completed=true;
}
