// Controller-driven original Samus move integration, not retail trace parity.
export function verifySamusMoves(module,object,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Samus moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===13,'wrong fighter kind');
  report.completed=false;report.frames=0;report.phases=[];let phase;
  const buffer=module._malloc(1024*8);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,peakLinks:0,trace:[],initial:read()};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);
    const items=[];for(const item of Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,count))){
      const state=Array.from({length:8},(_,i)=>module._portItemRead(item,i));require(state.every(Number.isFinite)&&[93,94,95,96].includes(state[0]),'item state/kind');
      if(!phase.itemKinds.includes(state[0]))phase.itemKinds.push(state[0]);items.push(state);
    }
    const links=module._portItemLinksList(buffer,1024);require(links<=1024,'link capacity');phase.peakLinks=Math.max(phase.peakLinks,links);
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),damage:s[13],items,links});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected grounded Wait in '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0&&module._portItemLinksList(buffer,1024)===0,'items/links must retire after '+phase.name);
  try{
    begin('partial Charge Shot');grounded();tick(0x200);neutral(65);tick(0x200);neutral(200);
    require(phase.states.includes(343)&&phase.states.includes(344)&&phase.states.includes(346)&&phase.itemKinds.includes(94),'charge and fire');grounded();retired();
    begin('homing Missile');for(let i=0;i<10;i++)tick(0,.7,0);tick(0x200,.7,0);neutral(240);
    require(phase.states.includes(349)&&phase.itemKinds.includes(95),'homing Missile');grounded();retired();
    begin('Super Missile');tick(0x200,1,0);neutral(240);
    require(phase.states.includes(350)&&phase.itemKinds.includes(95),'Super Missile');grounded();retired();
    begin('Bomb');tick(0x200,0,-1);neutral(220);
    require(phase.states.some(s=>s===341||s===355)&&phase.itemKinds.includes(93),'Bomb');grounded();retired();
    begin('Screw Attack');tick(0x200,0,1);neutral(260);
    require(phase.states.includes(353),'Screw Attack');grounded();retired();
    begin('ground grapple');tick(0x10);neutral(220);
    require(phase.states.includes(212)&&phase.itemKinds.includes(96)&&phase.peakLinks>0,'ground grapple chain');grounded();retired();
    begin('air grapple');for(let i=0;i<4;i++)tick(0x400);neutral(8);tick(0x10);neutral(240);
    require(phase.states.includes(357)&&phase.itemKinds.includes(96)&&phase.peakLinks>0,'air grapple chain');grounded();retired();
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}

export function verifySamusContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Samus contact: '+message);};
  require(objects.length===2&&['throw','missile','charge','control'].includes(mode),'invalid probe');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.trace=[];report.attackerStates=[];report.defenderStates=[];report.peakDamage=0;report.peakHitlag=0;report.peakKnockback=0;report.accessoryFrames=0;
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;
    const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');onStep();return s;
  }
  module._Player_80031848(1);
  for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
  require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle');
  const dir=Math.sign(read()[1][4]-read()[0][4])||1;
  // Walk apart then face each other, ensuring projectile spawn is in front.
  for(let i=0;i<25;i++)tick([0,-dir*.5,0],[0,dir*.5,0]);
  for(let i=0;i<8;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);
  for(let i=0;i<20;i++)tick();
  if(mode==='throw'){
    for(let i=0;i<90;i++){
      const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(dx)<22)break;
      tick([0,Math.sign(dx)*.5,0]);
    }
    for(let i=0;i<15;i++)tick();
  }
  report.before=read();require(report.before.every(s=>s[13]===0),'zero starting damage');
  for(let i=0;i<330;i++){
    let pad=[0,0,0];
    if(mode==='throw')pad=i===0?[0x10,0,0]:read()[0][0]===216?[0,dir,0]:pad;
    if(mode==='missile'&&i===0)pad=[0x200,dir,0];
    if(mode==='charge'&&(i===0||i===70))pad=[0x200,0,0];
    const s=tick(pad);report.trace.push(s);
    if(!report.attackerStates.includes(s[0][0]))report.attackerStates.push(s[0][0]);
    if(!report.defenderStates.includes(s[1][0]))report.defenderStates.push(s[1][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);
    if(module._portFighterAccessory(objects[0],1)===3)report.accessoryFrames++;
  }
  report.after=read();
  if(mode==='control')require(report.after.every(s=>s[13]===0)&&!report.peakHitlag&&!report.peakKnockback,'no-input control must not hit');
  else require(report.peakDamage>0&&report.peakKnockback>0,'damage and knockback required');
  if(mode==='throw')require(report.attackerStates.includes(219)&&report.accessoryFrames>0,'original forward throw and accessory');
  report.completed=true;report.retailParityVerified=false;
}
