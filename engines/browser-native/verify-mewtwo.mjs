// Controller-driven native Mewtwo checks; retail parity is a separate gate.
export function verifyMewtwoMoves(module,object,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Mewtwo moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===16,'wrong fighter');report.completed=false;report.frames=0;report.phases=[];let phase;
  const buffer=module._malloc(512);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);
    const items=[];for(const item of Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,count))){
      const row=Array.from({length:9},(_,i)=>module._portItemRead(item,i));require(row.every(Number.isFinite)&&[110,112].includes(row[0]),'item kind/state');
      if(!phase.itemKinds.includes(row[0]))phase.itemKinds.push(row[0]);items.push(row);
    }
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected Wait after '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0,'items must retire after '+phase.name);
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  try{
    begin('Shadow Ball charge cancel');grounded();tick(0x200);neutral(60);tick(0x20);neutral(90);
    require(phase.states.includes(342)&&phase.states.includes(344)&&phase.itemKinds.includes(112),'charge and cancel');grounded();retired();
    begin('full Shadow Ball');tick(0x200);for(let i=0;i<500&&read()[0]!==343;i++)tick();require(read()[0]===343,'full charge');tick(0x200);neutral(240);
    require(phase.states.includes(345)&&phase.itemKinds.includes(112),'release full charge');grounded();retired();
    begin('air Shadow Ball');jump();tick(0x200);neutral(20);tick(0x200);neutral(300);
    require(phase.states.includes(346)&&phase.states.includes(350)&&phase.itemKinds.includes(112),'air charge/release');grounded();retired();
    begin('ground Disable');tick(0x200,0,-1);neutral(160);require(phase.states.includes(359)&&phase.itemKinds.includes(110),'ground Disable');grounded();retired();
    begin('air Disable');jump();tick(0x200,0,-1);neutral(240);require(phase.states.includes(360)&&phase.itemKinds.includes(110),'air Disable');grounded();retired();
    begin('ground Confusion miss');tick(0x200,read()[4]>0?-1:1);neutral(120);require(phase.states.includes(351),'ground Confusion');grounded();
    begin('air Confusion miss');jump();tick(0x200,read()[4]>0?-1:1);neutral(240);require(phase.states.includes(352),'air Confusion');grounded();
    begin('ground Teleport');tick(0x200,0,1);for(let i=0;i<20;i++)tick(0,0,1);neutral(300);
    require(phase.states.includes(353)&&phase.states.some(s=>[354,357].includes(s)),'ground Teleport travel');grounded();
    begin('air Teleport');jump();tick(0x200,0,1);for(let i=0;i<20;i++)tick(0,0,1);neutral(300);
    require(phase.states.includes(356)&&phase.states.includes(357)&&phase.states.includes(358),'air Teleport phases');grounded();retired();
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}

export function verifyMewtwoContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Mewtwo contact: '+message);};
  require(objects.length===2&&['shadowball','shadowball-shield','shadowball-shield-break','disable','confusion','grab','control'].includes(mode),'mode/fighters');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.trace=[];report.attackerStates=[];report.defenderStates=[];report.peakDamage=0;report.peakHitlag=0;report.peakKnockback=0;report.blockedFrames=0;report.released=false;
  function tick(a=[0,0,0],b=[0,0,0]){[a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');onStep();return s;}
  module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
  require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle');
  const projectile=mode.startsWith('shadowball');
  let dir=Math.sign(read()[1][4]-read()[0][4])||1;
  for(let i=0;i<150;i++){const s=read(),dx=s[1][4]-s[0][4];if(projectile?Math.abs(dx)>50:Math.abs(dx)<18)break;tick([0,Math.sign(dx)*.5*(projectile?-1:1),0]);}
  dir=Math.sign(read()[1][4]-read()[0][4])||1;
  for(let i=0;i<5;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);for(let i=0;i<15;i++)tick();
  report.before=read();require(report.before.every(s=>s[13]===0),'zero initial damage');
  for(let i=0;i<600;i++){
    let a=[0,0,0],b=[0,0,0];
    if(projectile){if(i===0)a=[0x200,0,0];else if(!report.released&&read()[0][0]===343){a=[0x200,0,0];report.released=true;}if(mode==='shadowball-shield-break'||mode==='shadowball-shield'&&report.released&&!report.peakHitlag)b=[0x20,0,0];}
    if(mode==='disable'&&i===0)a=[0x200,0,-1];
    if(mode==='confusion'&&i===0)a=[0x200,dir,0];
    if(mode==='grab')a=i===0?[0x10,0,0]:read()[0][0]===216?[0,dir,0]:a;
    const s=tick(a,b);report.trace.push(s);for(const [slot,key]of [[0,'attackerStates'],[1,'defenderStates']])if(!report[key].includes(s[slot][0]))report[key].push(s[slot][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);
    if(s[1][0]===181&&s[1][14]>0&&s[1][13]===0)report.blockedFrames++;
  }
  report.after=read();
  if(mode==='control')require(!report.peakDamage&&!report.peakHitlag&&!report.peakKnockback,'control must not hit');
  if(mode==='shadowball')require(report.released&&report.peakDamage>0&&report.peakKnockback>0,'released Shadow Ball must hit');
  if(mode==='shadowball-shield')require(report.released&&report.blockedFrames>0,'shield must block released Shadow Ball');
  if(mode==='shadowball-shield-break')require(report.released&&!report.peakDamage&&report.defenderStates.includes(205)&&report.defenderStates.includes(211),'depleted shield must break and stun without body damage');
  if(mode==='disable')require(report.attackerStates.includes(359)&&report.peakHitlag>0&&report.defenderStates.includes(300)&&report.after[1][0]===14,'Disable must enter DamageBind and recover');
  if(mode==='confusion')require(report.attackerStates.includes(351)&&report.defenderStates.includes(303)&&report.peakDamage>0,'Confusion must enter ThrownMewtwo and damage');
  if(mode==='grab')require(report.attackerStates.includes(219)&&report.peakDamage>0&&report.peakKnockback>0,'forward throw must damage');
  report.completed=true;report.retailParityVerified=false;
}
