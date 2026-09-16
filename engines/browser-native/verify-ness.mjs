// Native Ness move integration driven by physical controller samples.
export function verifyNessMoves(module,object,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Ness moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===8,'wrong fighter');report.completed=false;report.frames=0;report.phases=[];let phase;
  const buffer=module._malloc(8192);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,peakLinks:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);
    const items=[];for(const item of Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,count))){
      const row=Array.from({length:9},(_,i)=>module._portItemRead(item,i));require(row.every(Number.isFinite)&&[66,67,68,69,70,71,72,73,78,101,102].includes(row[0]),'item kind/state');
      if(!phase.itemKinds.includes(row[0]))phase.itemKinds.push(row[0]);items.push(row);
    }
    const links=module._portItemLinksList(buffer,1024);require(links<=1024,'link capacity');phase.peakLinks=Math.max(phase.peakLinks,links);
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),items,links});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected Wait after '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0&&module._portItemLinksList(buffer,1024)===0,'items/links must retire after '+phase.name);
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  const checked=(state,kind)=>{require(phase.states.includes(state)&&phase.itemKinds.includes(kind),'state/item '+phase.name);grounded();retired();};
  try{
    begin('bat');grounded();tick(0x100,1);neutral(180);checked(341,101);
    begin('charged up smash yo-yo');tick(0x100,0,1);for(let i=0;i<45;i++)tick(0x100);neutral(240);checked(342,102);require(phase.states.includes(343)&&phase.states.includes(344)&&phase.peakLinks===20,'up yo-yo charge/release and string');
    begin('charged down smash yo-yo');tick(0x100,0,-1);for(let i=0;i<45;i++)tick(0x100);neutral(240);checked(345,102);require(phase.states.includes(346)&&phase.states.includes(347)&&phase.peakLinks===20,'down yo-yo charge/release and string');
    begin('ground PK Fire');tick(0x200,1);neutral(240);checked(356,66);
    begin('air PK Fire');jump();tick(0x200,1);neutral(240);checked(357,66);
    begin('charged PK Flash');for(let i=0;i<110;i++)tick(0x200);neutral(300);checked(348,68);require(phase.itemKinds.includes(78),'Flash explosion');
    begin('air PK Flash');jump();tick(0x200);neutral(300);checked(352,68);
    begin('ground PK Thunder');tick(0x200,0,1);neutral(360);checked(358,69);require([70,71,72,73].every(k=>phase.itemKinds.includes(k)),'Thunder trail types');
    begin('air PK Thunder');jump();tick(0x200,0,1);neutral(360);checked(362,69);
    begin('ground PSI Magnet');for(let i=0;i<60;i++)tick(0x200,0,-1);neutral(160);require([367,368,370].every(s=>phase.states.includes(s)),'ground Magnet start/hold/end');grounded();retired();
    begin('air PSI Magnet');jump();for(let i=0;i<35;i++)tick(0x200,0,-1);neutral(240);require(phase.states.includes(372)&&phase.states.includes(373),'air Magnet start/hold');grounded();retired();
    begin('steered PK Thunder self-hit');for(let i=0;i<120&&read()[4]<35;i++)tick(0,.5);neutral(20);jump();tick(0x200,0,1);
    for(let i=0;i<180&&!phase.states.includes(365);i++){
      const ball=phase.trace.at(-1).items.find(item=>item[0]===69),self=read();
      if(ball){const dx=self[4]+1-ball[2],dy=self[5]+5-ball[3],n=Math.hypot(dx,dy)||1;tick(0,dx/n,dy/n);}else tick();
    }
    require(phase.states.includes(365),'steered projectile must launch aerial PK Thunder 2');
    const launch=read();neutral(15);require(Math.hypot(read()[4]-launch[4],read()[5]-launch[5])>30,'Thunder 2 travel');retired();
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}

export function verifyNessContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Ness contact: '+message);};
  require(objects.length===2&&['fire','fire-shield','bat','yoyo','grab','control'].includes(mode),'mode/fighters');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.trace=[];report.attackerStates=[];report.defenderStates=[];report.itemKinds=[];report.peakDamage=0;report.peakHitlag=0;report.peakKnockback=0;report.blockedFrames=0;report.peakLinks=0;
  const buffer=module._malloc(8192);
  function tick(a=[0,0,0],b=[0,0,0]){[a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');onStep();return s;}
  try{
    module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
    require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle');
    const ranged=mode.startsWith('fire');
    for(let i=0;i<150;i++){const s=read(),dx=s[1][4]-s[0][4];if(ranged?Math.abs(dx)>40:Math.abs(dx)<18)break;tick([0,Math.sign(dx)*.5*(ranged?-1:1),0]);}
    const dir=Math.sign(read()[1][4]-read()[0][4])||1;
    for(let i=0;i<5;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);for(let i=0;i<15;i++)tick();
    report.before=read();require(report.before.every(s=>s[13]===0),'zero initial damage');
    for(let i=0;i<600;i++){
      let a=[0,0,0],b=[0,0,0];
      if(mode.startsWith('fire')&&i===0)a=[0x200,dir,0];
      if(mode==='fire-shield'&&i<100)b=[0x20,0,0];
      if(mode==='bat'&&i===0)a=[0x100,dir,0];
      if(mode==='yoyo'&&i<45)a=i===0?[0x100,0,-1]:[0x100,0,0];
      if(mode==='grab')a=i===0?[0x10,0,0]:read()[0][0]===216?[0,dir,0]:a;
      const s=tick(a,b);report.trace.push(s);for(const [slot,key]of [[0,'attackerStates'],[1,'defenderStates']])if(!report[key].includes(s[slot][0]))report[key].push(s[slot][0]);
      report.peakDamage=Math.max(report.peakDamage,s[1][13]);report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);
      if(s[1][0]===181&&s[1][14]>0&&s[1][13]===0)report.blockedFrames++;
      const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');for(const item of Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n))){const kind=module._portItemRead(item,0);if(!report.itemKinds.includes(kind))report.itemKinds.push(kind);}
      const links=module._portItemLinksList(buffer,1024);require(links<=1024,'link capacity');report.peakLinks=Math.max(report.peakLinks,links);
    }
    report.after=read();
    if(mode==='control')require(!report.peakDamage&&!report.peakHitlag&&!report.peakKnockback,'control must not hit');
    if(mode==='fire-shield')require(!report.peakDamage&&report.blockedFrames>0,'shield must block PK Fire');
    if(mode==='fire')require(report.itemKinds.includes(66)&&report.itemKinds.includes(67)&&report.peakDamage>0&&report.peakHitlag>0,'PK Fire and pillar must hit');
    if(mode==='bat')require(report.attackerStates.includes(341)&&report.itemKinds.includes(101)&&report.peakDamage>0&&report.peakKnockback>0,'bat must hit');
    if(mode==='yoyo')require(report.attackerStates.includes(345)&&report.peakLinks===20&&report.peakDamage>0&&report.peakKnockback>0,'yo-yo must hit with native string');
    if(mode==='grab')require(report.attackerStates.includes(219)&&report.peakDamage>0&&report.peakKnockback>0,'forward throw must damage');
    require(module._portItemsList(buffer,128)===0&&module._portItemLinksList(buffer,1024)===0,'items and links must retire');
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}
