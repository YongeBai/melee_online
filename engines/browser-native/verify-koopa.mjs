// Ordinary controller inputs exercise original Bowser states and item lifetime.
// This is selected integration coverage, not retail trace parity.
export function verifyKoopaMoves(module,object,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Koopa moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===5,'wrong fighter');report.completed=false;report.frames=0;report.phases=[];let phase;
  const buffer=module._malloc(512);
  function begin(name){phase={name,frames:0,states:[],peakItems:0,itemFrames:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);if(count)phase.itemFrames++;
    const items=[];for(const item of new Uint32Array(module.HEAPU8.buffer,buffer,count)){
      const row=Array.from({length:9},(_,i)=>module._portItemRead(item,i));
      require(row.every(Number.isFinite)&&row[0]===100&&row[5]===object&&row[8]===0,'original no-model flame item and owner');items.push(row);
    }
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected grounded Wait in '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0,'flames must retire');
  try{
    begin('ground Flame Breath');grounded();for(let i=0;i<120;i++)tick(0x200,0,i<40?0:i<80?.8:-.8);neutral(100);
    require([341,342,343].every(s=>phase.states.includes(s))&&phase.itemFrames>60&&phase.peakItems>1,'sustained ground Flame Breath and release');grounded();retired();
    begin('air Flame Breath');for(let i=0;i<10;i++)tick(0x400);neutral(2);for(let i=0;i<30;i++)tick(0x200);neutral(170);
    require(phase.states.includes(344)&&phase.states.includes(345)&&phase.peakItems>0,'air Flame Breath');grounded();retired();
    begin('ground Whirling Fortress');tick(0x200,0,1);neutral(160);require(phase.states.includes(359),'ground Whirling Fortress');grounded();
    begin('air Whirling Fortress');for(let i=0;i<10;i++)tick(0x400);neutral(2);tick(0x200,0,1);neutral(210);require(phase.states.includes(360),'air Whirling Fortress');grounded();
    begin('Bowser Bomb');tick(0x200,0,-1);neutral(200);require([361,362,363].every(s=>phase.states.includes(s)),'Bowser Bomb jump, fall and landing');grounded();
    begin('ground Koopa Klaw miss');tick(0x200,1,0);neutral(100);require(phase.states.includes(347),'ground Koopa Klaw');grounded();
    begin('air Koopa Klaw miss');for(let i=0;i<10;i++)tick(0x400);neutral(2);tick(0x200,1,0);neutral(180);require(phase.states.includes(353),'air Koopa Klaw');grounded();retired();
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}

export function verifyKoopaContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Koopa contact: '+message);};
  require(objects.length===2&&['flame','flame-shield','claw','control'].includes(mode),'invalid probe');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.trace=[];report.attackerStates=[];report.defenderStates=[];report.peakDamage=0;report.peakHitlag=0;report.peakKnockback=0;report.minimumShield=60;report.blockedHitFrames=0;report.firstBlockedHitFrame=null;report.firstFighterDamageFrame=null;
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;
    const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');onStep();return s;
  }
  module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
  require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle');
  const dir=Math.sign(read()[1][4]-read()[0][4])||1;
  for(let i=0;i<12;i++)tick([0,-dir*.5,0],[0,dir*.5,0]);
  for(let i=0;i<8;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);
  for(let i=0;i<20;i++)tick();
  if(mode==='flame-shield')for(let i=0;i<5;i++)tick(undefined,[0x20,0,0]);
  report.before=read();require(report.before.every(s=>s[13]===0),'zero initial damage');
  for(let i=0;i<240;i++){
    let pad=[0,0,0];if(mode.startsWith('flame')&&i<60)pad=[0x200,0,0];
    if(mode==='claw')pad=i===0?[0x200,dir,0]:[348,349,350].includes(read()[0][0])?[0,dir,0]:pad;
    const s=tick(pad,mode==='flame-shield'&&i<110?[0x20,0,0]:undefined);report.trace.push(s);
    if(!report.attackerStates.includes(s[0][0]))report.attackerStates.push(s[0][0]);if(!report.defenderStates.includes(s[1][0]))report.defenderStates.push(s[1][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);report.minimumShield=Math.min(report.minimumShield,s[1][17]);
    if(s[1][0]===181&&s[1][14]>0&&s[1][13]===0){report.blockedHitFrames++;report.firstBlockedHitFrame??=i;}
    if(s[1][13]>0)report.firstFighterDamageFrame??=i;
  }
  report.after=read();
  if(mode==='control')require(report.after.every(s=>s[13]===0)&&!report.peakHitlag&&!report.peakKnockback,'no-button control must not hit');
  // Sustained fire can reach exposed hurtboxes after the shield shrinks. Verify
  // the initial blocked hits explicitly, rather than assuming permanent cover.
  else if(mode==='flame-shield')require(report.blockedHitFrames>=6&&report.minimumShield<report.before[1][17]&&(report.firstFighterDamageFrame===null||report.firstFighterDamageFrame>report.firstBlockedHitFrame),'flames must first hit GuardSetOff without fighter damage');
  else require(report.peakDamage>0&&report.peakKnockback>0,'damage and knockback required');
  if(mode==='claw')require(report.attackerStates.includes(348)&&report.attackerStates.includes(351),'Koopa Klaw capture and forward throw');
  report.completed=true;report.retailParityVerified=false;
}
