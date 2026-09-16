// Physical controller sequences through original Game & Watch callbacks.
// These are integration checks, not retail parity proof.
export function verifyGamewatchMoves(module,object,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Game & Watch moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===24,'wrong fighter');report.completed=false;report.frames=0;report.phases=[];let phase;
  const buffer=module._malloc(512);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);
    const items=[];for(const item of Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,count))){
      const row=Array.from({length:9},(_,i)=>module._portItemRead(item,i));require(row.every(Number.isFinite)&&(row[0]>=114&&row[0]<=122||row[0]===124),'item kind/state');
      if(!phase.itemKinds.includes(row[0]))phase.itemKinds.push(row[0]);items.push(row);
    }
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected Wait after '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0,'items must retire after '+phase.name);
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  const checked=(state,kind)=>{require(phase.states.includes(state)&&phase.itemKinds.includes(kind),'state/item '+phase.name);grounded();retired();};
  try{
    begin('jab');grounded();tick(0x100);neutral(100);checked(341,114);
    begin('down tilt');tick(0,0,-.5);tick(0x100,0,-.5);neutral(120);checked(345,115);
    begin('forward smash');tick(0x100,1);neutral(150);checked(346,116);
    begin('neutral air');jump();tick(0x100);neutral(220);checked(347,117);
    begin('back air');jump();tick(0x100,-read()[16]);neutral(220);checked(348,118);
    begin('up air');jump();tick(0x100,0,1);neutral(220);checked(349,119);
    begin('ground Chef');tick(0x200);neutral(220);checked(353,122);
    begin('air Chef');jump();tick(0x200);neutral(240);checked(354,122);
    begin('ground Judge');tick(0x200,1);neutral(180);require(phase.states.some(s=>s>=355&&s<=363)&&phase.itemKinds.includes(120),'ground Judge');grounded();retired();
    begin('air Judge');jump();tick(0x200,1);neutral(240);require(phase.states.some(s=>s>=364&&s<=372)&&phase.itemKinds.includes(120),'air Judge');grounded();retired();
    begin('ground Oil Panic');for(let i=0;i<45;i++)tick(0x200,0,-1);neutral(180);require(phase.states.includes(375)&&phase.peakItems===0,'empty ground bucket');grounded();retired();
    begin('air Oil Panic');jump();for(let i=0;i<30;i++)tick(0x200,0,-1);neutral(240);require(phase.states.includes(378)&&phase.peakItems===0,'empty air bucket');grounded();retired();
    begin('ground Fire Rescue');tick(0x200,0,1);neutral(300);checked(373,124);
    begin('air Fire Rescue');jump();tick(0x200,0,1);neutral(300);checked(374,124);
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}

export function verifyGamewatchContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Game & Watch contact: '+message);};
  require(objects.length===2&&['chef','judge','grab','shield','control'].includes(mode),'mode/fighters');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.trace=[];report.attackerStates=[];report.defenderStates=[];report.peakDamage=0;report.peakHitlag=0;report.peakKnockback=0;report.blockedFrames=0;
  function tick(a=[0,0,0],b=[0,0,0]){[a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');onStep();return s;}
  module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
  require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle');
  const separation=mode==='chef'?35:18;
  for(let i=0;i<150;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(dx)<separation)break;tick([0,Math.sign(dx)*.5,0]);}
  const dir=Math.sign(read()[1][4]-read()[0][4])||1;
  for(let i=0;i<5;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);for(let i=0;i<15;i++)tick();
  report.before=read();require(report.before.every(s=>s[13]===0),'zero initial damage');
  for(let i=0;i<600;i++){
    let a=[0,0,0],b=[0,0,0];
    if(mode==='chef'&&i<100)a=[i%2?0:0x200,0,0];
    if(mode==='judge'&&i===0)a=[0x200,dir,0];
    if(mode==='grab')a=i===0?[0x10,0,0]:read()[0][0]===216?[0,dir,0]:a;
    if(mode==='shield'&&i<100){b=[0x20,0,0];if(i>=15&&i%30===15)a=[0x100,0,0];}
    const s=tick(a,b);report.trace.push(s);for(const [slot,key]of [[0,'attackerStates'],[1,'defenderStates']])if(!report[key].includes(s[slot][0]))report[key].push(s[slot][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);
    if(s[1][0]===181&&s[1][14]>0&&s[1][13]===0)report.blockedFrames++;
  }
  report.after=read();
  if(mode==='control')require(!report.peakDamage&&!report.peakHitlag&&!report.peakKnockback,'control must not hit');
  if(mode==='shield')require(!report.peakDamage&&report.blockedFrames>0,'shield must block jab');
  if(mode==='chef')require(report.attackerStates.includes(353)&&report.peakDamage>0&&report.peakKnockback>0,'Chef must hit');
  if(mode==='judge')require(report.attackerStates.some(s=>s>=355&&s<=363)&&report.peakDamage>0&&report.peakHitlag>0,'Judge must hit');
  if(mode==='grab')require(report.attackerStates.includes(219)&&report.peakDamage>0&&report.peakKnockback>0,'forward throw must damage');
  report.completed=true;report.retailParityVerified=false;
}
