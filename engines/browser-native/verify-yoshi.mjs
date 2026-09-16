// Original controller-driven Yoshi integration; retail parity is a separate gate.
export function verifyYoshiMoves(module,object,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Yoshi moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===14,'wrong fighter');report.completed=false;report.frames=0;report.phases=[];let phase;
  const buffer=module._malloc(512);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);
    const items=[];for(const item of Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,count))){
      const row=Array.from({length:9},(_,i)=>module._portItemRead(item,i));require(row.every(Number.isFinite)&&[86,87,88].includes(row[0]),'item kind/state');
      if(!phase.itemKinds.includes(row[0]))phase.itemKinds.push(row[0]);items.push(row);
    }
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),shield:s[17],items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected Wait after '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0,'items must retire after '+phase.name);
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  try{
    begin('egg shield');grounded();for(let i=0;i<45;i++)tick(0x20);neutral(60);
    require(phase.states.includes(342)&&phase.states.includes(343)&&phase.trace.some(s=>s.shield<phase.initial[17]),'native shield hold, release and health');grounded();
    begin('ground Egg Throw');tick(0x200,0,1);neutral(180);require(phase.states.includes(364)&&phase.itemKinds.includes(86),'ground egg');grounded();retired();
    begin('charged aimed Egg Throw');tick(0x200,0,1);for(let i=0;i<13;i++)tick(0x200,read()[16],0);neutral(180);
    const flight=phase.trace.flatMap(s=>s.items.filter(item=>item[0]===86&&item[1]===1));
    require(flight.length>5&&Math.abs(flight.at(-1)[2]-flight[0][2])>5,'charged egg must travel through its native flight state');grounded();retired();
    begin('air Egg Throw');jump();tick(0x200,0,1);neutral(240);require(phase.states.includes(365)&&phase.itemKinds.includes(86),'air egg');grounded();retired();
    begin('ground Egg Lay miss');tick(0x200);neutral(150);require(phase.states.includes(346),'ground tongue');grounded();retired();
    begin('air Egg Lay miss');jump();tick(0x200);neutral(220);require(phase.states.includes(351),'air tongue');grounded();retired();
    begin('ground Yoshi Bomb');tick(0x200,0,-1);neutral(220);require(phase.states.includes(366)&&phase.states.includes(367)&&phase.itemKinds.includes(88),'ground bomb and stars');grounded();retired();
    begin('air Yoshi Bomb');jump();tick(0x200,0,-1);neutral(220);require(phase.states.includes(368)&&phase.states.includes(367)&&phase.itemKinds.includes(88),'air bomb and stars');grounded();retired();
    begin('Egg Roll');tick(0x200,read()[4]>0?-1:1,0);for(let i=0;i<100;i++){const s=tick(i>=55&&i%2?0x200:0);if([359,363].includes(s[0]))break;}neutral(220);
    require(phase.states.includes(360)&&phase.states.includes(361)&&phase.states.some(s=>[359,363].includes(s)),'roll start, loop and exit');grounded();retired();
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}

export function verifyYoshiContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Yoshi contact: '+message);};
  require(objects.length===2&&['egg-lay','egg-throw','grab','shield','control'].includes(mode),'mode/fighters');
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  report.completed=false;report.mode=mode;report.frames=0;report.trace=[];report.attackerStates=[];report.defenderStates=[];report.peakDamage=0;report.peakHitlag=0;report.peakKnockback=0;report.eggAccessoryFrames=0;report.blockedFrames=0;
  function tick(a=[0,0,0],b=[0,0,0]){[a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');onStep();return s;}
  module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
  require(read().every(s=>s[0]===14&&s[3]===0),'fighters must settle');
  let dir=Math.sign(read()[1][4]-read()[0][4])||1;
  for(let i=0;i<90;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(dx)<18)break;tick([0,Math.sign(dx)*.5,0]);}
  dir=Math.sign(read()[1][4]-read()[0][4])||1;
  for(let i=0;i<5;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);for(let i=0;i<15;i++)tick();
  report.before=read();require(report.before.every(s=>s[13]===0),'zero initial damage');
  for(let i=0;i<600;i++){
    let a=[0,0,0],b=[0,0,0];
    if(mode==='egg-lay'&&i===0)a=[0x200,0,0];
    if(mode==='egg-throw'&&i<30)a=i===0?[0x200,0,1]:[0,dir,0];
    if(mode==='grab')a=i===0?[0x10,0,0]:read()[0][0]===216?[0,dir,0]:a;
    if(mode==='shield'&&i<100){b=[0x20,0,0];if(i>=15&&i%30===15)a=[0x100,0,0];}
    const s=tick(a,b);report.trace.push(s);for(const [slot,key]of [[0,'attackerStates'],[1,'defenderStates']])if(!report[key].includes(s[slot][0]))report[key].push(s[slot][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);report.peakHitlag=Math.max(report.peakHitlag,s[1][14]);report.peakKnockback=Math.max(report.peakKnockback,s[1][15]);
    if(module._portFighterAccessory(objects[1],1)===4)report.eggAccessoryFrames++;
    if(s[1][0]===344&&s[1][14]>0&&s[1][13]===0)report.blockedFrames++;
  }
  report.after=read();
  if(mode==='control')require(!report.peakDamage&&!report.peakHitlag&&!report.peakKnockback,'control must not hit');
  if(mode==='shield')require(!report.peakDamage&&report.blockedFrames>0&&report.trace.some(s=>s[1][17]<report.before[1][17]),'egg shield must block attacks and consume health');
  if(mode==='egg-lay')require(report.peakDamage>0&&report.defenderStates.includes(276)&&report.defenderStates.includes(277)&&report.eggAccessoryFrames>0&&module._portFighterAccessory(objects[1],1)!==4&&report.after[1][0]===14,'capture, egg shell, damage and escape');
  if(mode==='egg-throw')require(report.peakDamage>0&&report.peakKnockback>0&&report.attackerStates.includes(364),'thrown egg damage and knockback');
  if(mode==='grab')require(report.peakDamage>0&&report.peakKnockback>0&&report.attackerStates.includes(219),'tongue grab and forward throw');
  report.completed=true;report.retailParityVerified=false;
}
