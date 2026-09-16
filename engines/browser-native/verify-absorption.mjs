// Mixed-fighter interaction checks. Only normal controller samples change play.
// These checks do not establish retail parity or input-to-photon latency.
export function verifyAbsorption(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Absorption: '+message);};
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  const kind=read()[0][11],bucket=kind===24,control=mode==='control';
  require(objects.length===2&&[8,24].includes(kind)&&read()[1][11]===0,'requires Ness/Game & Watch versus Mario');
  require(['absorb','control'].includes(mode),'unknown mode');
  Object.assign(report,{completed:false,mode,frames:0,phases:[],retailParityVerified:false});
  const buffer=module._malloc(512);let phase;
  function begin(name){phase={name,initial:read(),frames:0,states:[[],[]],itemKinds:[],trace:[]};report.phases.push(phase);}
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;phase.frames++;
    const s=read();require(s.flat().every(Number.isFinite),'nonfinite fighter');
    for(let slot=0;slot<2;slot++)if(!phase.states[slot].includes(s[slot][0]))phase.states[slot].push(s[slot][0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');
    const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,count),item=>Array.from({length:9},(_,i)=>module._portItemRead(item,i)));
    for(const item of items){require(item.every(Number.isFinite),'nonfinite item');require(item[0]===48&&item[5]===objects[1]||item[0]===121&&item[5]===objects[0],'projectile owner/kind');if(!phase.itemKinds.includes(item[0]))phase.itemKinds.push(item[0]);}
    phase.trace.push({state:s,items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  function align(distance){
    for(let i=0;i<180;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(Math.abs(dx)-distance)<2)break;tick([0,Math.sign(dx)*.5*(Math.abs(dx)>distance?1:-1),0]);}
    const dir=Math.sign(read()[1][4]-read()[0][4])||1;
    for(let i=0;i<5;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);neutral(20);
    require(read().every(s=>s[0]===14&&s[3]===0),'grounded neutral alignment');
  }
  try{
    begin('controller setup');module._Player_80031848(1);
    for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);align(45);
    require(read().every(s=>s[13]===0),'zero starting damage');
    if(!bucket){
      begin('unblocked fireball');tick(undefined,[0x200,0,0]);neutral(140);
      require(phase.final[0][13]>0&&phase.states[0].some(s=>s>=75&&s<=91),'fireball must damage Ness before healing');
      begin('realign after hit');align(45);
    }
    begin(control?'unblocked control':'absorb fireballs');
    for(let i=0;i<(bucket?360:180);i++)tick(control?undefined:[0x200,0,-1],i>=20&&i<300&&(i-20)%110===0?[0x200,0,0]:undefined);
    require(phase.itemKinds.includes(48),'Mario fireballs must spawn');
    if(control){require(phase.final[0][13]>phase.initial[0][13],'control projectile must damage defender');}
    else if(bucket){
      report.catches=phase.trace.filter((s,i)=>s.state[0][0]===376&&(i===0||phase.trace[i-1].state[0][0]!==376)).length;
      require(report.catches===3&&phase.final[0][13]===0,'bucket must absorb three fireballs without damage');
      begin('approach with charged bucket');neutral(90);align(18);
      require(read()[0][13]===0,'filled bucket approach must remain undamaged');
      begin('release Oil Panic');tick([0x200,0,-1]);neutral(200);
      require(phase.states[0].includes(377)&&phase.itemKinds.includes(121)&&phase.final[1][13]>0,'charged Oil Panic must spawn and damage Mario');
      begin('empty bucket after release');for(let i=0;i<45;i++)tick([0x200,0,-1]);neutral(120);
      require(phase.states[0].includes(375)&&!phase.states[0].includes(377),'released bucket must be empty');
    }else{
      report.healed=phase.initial[0][13]-phase.final[0][13];
      require(phase.states[0].includes(369)&&report.healed>0,'PSI Magnet must enter absorption state and heal actual damage');
    }
    begin('retire items');neutral(180);
    require(module._portItemsList(buffer,128)===0,'projectiles/items must retire');
    report.completed=true;
  }finally{module._free(buffer);}
}
