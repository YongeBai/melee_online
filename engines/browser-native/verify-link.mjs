// Controller-driven original Link/Young Link integration, not retail trace parity.
export function verifyLinkMoves(module,object,code,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Link moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(['Lk','Cl'].includes(code)&&read()[11]===(code==='Lk'?6:20),'fighter kind');
  const shift=code==='Cl'?1:0,kinds={bomb:58+shift,boomerang:60+shift,hookshot:62+shift,arrow:64+shift,bow:76+shift};
  if(code==='Cl')kinds.milk=123;
  report.completed=false;report.frames=0;report.phases=[];report.kinds=kinds;let phase;
  const buffer=module._malloc(1024*12);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,peakLinks:0,peakAttachments:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);
    const items=[];for(const item of Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,count))){
      const row=Array.from({length:9},(_,i)=>module._portItemRead(item,i));require(row.every(Number.isFinite)&&Object.values(kinds).includes(row[0]),'unexpected/nonfinite item');
      if(!phase.itemKinds.includes(row[0]))phase.itemKinds.push(row[0]);items.push(row);
    }
    const links=module._portItemLinksList(buffer,1024),attachments=module._portItemAttachmentsList(buffer,1024);require(links<=1024&&attachments<=1024,'attachment capacity');
    phase.peakLinks=Math.max(phase.peakLinks,links);phase.peakAttachments=Math.max(phase.peakAttachments,attachments);
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),damage:s[13],items,links,attachments});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected grounded Wait after '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0&&module._portItemLinksList(buffer,1024)===0&&module._portItemAttachmentsList(buffer,1024)===0,'items must retire after '+phase.name);
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  try{
    begin('charged arrow');grounded();for(let i=0;i<90;i++)tick(0x200);neutral(220);
    require([344,345,346].every(s=>phase.states.includes(s))&&[kinds.arrow,kinds.bow].every(k=>phase.itemKinds.includes(k))&&phase.peakAttachments>0,'charge, fire and arrow attachment');grounded();retired();
    begin('air arrow');jump();for(let i=0;i<6;i++)tick(0x200);neutral(450);
    require(phase.states.includes(347)&&phase.states.includes(349)&&phase.itemKinds.includes(kinds.arrow),'air bow and fire');grounded();retired();
    begin('boomerang');tick(0x200,1,0);neutral(340);
    require(phase.states.includes(350)&&phase.itemKinds.includes(kinds.boomerang)&&phase.peakAttachments>0,'boomerang and trail models');grounded();retired();
    begin('ground hookshot');tick(0x10);neutral(210);
    require(phase.states.includes(212)&&phase.itemKinds.includes(kinds.hookshot)&&phase.peakLinks>0,'ground hookshot links');grounded();retired();
    begin('air hookshot');jump();tick(0x10);neutral(230);
    require(phase.states.includes(360)&&phase.itemKinds.includes(kinds.hookshot)&&phase.peakLinks>0,'air hookshot links');grounded();retired();
    begin('ground Spin Attack');tick(0x200,0,1);neutral(180);require(phase.states.includes(356),'ground spin');grounded();
    begin('air Spin Attack');jump();tick(0x200,0,1);neutral(240);require(phase.states.includes(357),'air spin');grounded();
    begin('bomb pull and throw');tick(0x200,0,-1);neutral(40);tick(0x100,1,0);neutral(400);
    require(phase.states.includes(358)&&phase.itemKinds.includes(kinds.bomb),'bomb pull');grounded();retired();
    if(code==='Cl'){begin('milk taunt');tick(8);neutral(300);require(phase.states.some(s=>s===342||s===343)&&phase.itemKinds.includes(kinds.milk),'Young Link milk taunt');grounded();retired();}
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}

export function verifyLinkContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Link contact: '+message);};
  require(objects.length===2&&['arrow','arrow-shield','boomerang','bomb','hookshot','control'].includes(mode),'invalid mode/fighters');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.trace=[];report.attackerStates=[];report.defenderStates=[];report.peakDamage=0;report.peakHitlag=0;report.peakKnockback=0;
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;
    const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');onStep();return s;
  }
  module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
  require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle');
  const dir=Math.sign(read()[1][4]-read()[0][4])||1;
  for(let i=0;i<22;i++)tick([0,-dir*.5,0],[0,dir*.5,0]);
  // Face the idle defender away: Link's held shield otherwise blocks arrows
  // without a shield button, which is a separate native interaction.
  for(let i=0;i<8;i++)tick([0,dir*.5,0],[0,(mode==='arrow-shield'?-dir:dir)*.5,0]);
  for(let i=0;i<20;i++)tick();
  if(mode==='hookshot'){
    for(let i=0;i<60;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(dx)<22)break;tick([0,Math.sign(dx)*.5,0]);}
    for(let i=0;i<15;i++)tick();
  }
  report.before=read();require(report.before.every(s=>s[13]===0),'zero initial damage');
  for(let i=0;i<450;i++){
    let pad=[0,0,0];
    if((mode==='arrow'||mode==='arrow-shield')&&i<60)pad=[0x200,0,0];
    if(mode==='boomerang'&&i===0)pad=[0x200,dir,0];
    if(mode==='bomb')pad=i===0?[0x200,0,-1]:i===50?[0x100,dir,0]:pad;
    if(mode==='hookshot')pad=i===0?[0x10,0,0]:read()[0][0]===216?[0,dir,0]:pad;
    const s=tick(pad);report.trace.push(s);
    if(!report.attackerStates.includes(s[0][0]))report.attackerStates.push(s[0][0]);if(!report.defenderStates.includes(s[1][0]))report.defenderStates.push(s[1][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);
  }
  report.after=read();
  if(mode==='control')require(report.after.every(s=>s[13]===0)&&!report.peakHitlag&&!report.peakKnockback,'no-input control must not hit');
  else if(mode==='arrow-shield')require(!report.peakDamage&&report.peakHitlag>0&&!report.peakKnockback,'idle physical shield must block the arrow');
  else require(report.peakDamage>0&&report.peakKnockback>0,'damage and knockback required');
  if(mode==='hookshot')require([212,213,216,219].every(s=>report.attackerStates.includes(s)),'hookshot capture and forward throw');
  report.completed=true;report.retailParityVerified=false;
}
