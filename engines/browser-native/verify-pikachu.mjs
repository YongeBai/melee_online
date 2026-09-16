// Original Pikachu/Pichu special moves driven by ordinary controller samples.
// Asset/runtime integration checks do not substitute for retail trace parity.
export function verifyPikachuMoves(module,object,code,kinds,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Pikachu moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(({Pk:12,Pc:23})[code]===read()[11]&&kinds.length===3,'invalid fighter/item kinds');
  report.completed=false;report.frames=0;report.phases=[];report.kinds=kinds;let phase;
  const buffer=module._malloc(512);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,itemFrames:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,128);require(count<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);if(count)phase.itemFrames++;
    const items=[];for(const item of new Uint32Array(module.HEAPU8.buffer,buffer,count)){
      const state=Array.from({length:8},(_,i)=>module._portItemRead(item,i));require(state.every(Number.isFinite)&&kinds.includes(state[0]),'invalid item state/kind');
      if(!phase.itemKinds.includes(state[0]))phase.itemKinds.push(state[0]);items.push(state);
    }
    phase.trace.push({frame:phase.frames,state:s.slice(0,7),damage:s[13],items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected grounded Wait in '+phase.name);
  const retired=()=>require(module._portItemsList(buffer,128)===0,'items must retire after '+phase.name);
  try{
    begin('ground Thunder Jolt');grounded();tick(0x200);neutral(250);
    require(phase.states.includes(341)&&phase.itemKinds.includes(kinds[1])&&phase.itemKinds.includes(kinds[2]),'ground Jolt controller and visible child');grounded();retired();
    require(code==='Pc'?phase.final[13]>phase.initial[13]:phase.final[13]===phase.initial[13],'original neutral-special self-damage');
    begin('air Thunder Jolt');for(let i=0;i<4;i++)tick(0x400);neutral(8);tick(0x200);neutral(300);
    require(phase.states.includes(342)&&phase.itemKinds.includes(kinds[2]),'air Jolt');grounded();retired();
    begin('Thunder');grounded();
    // Battlefield's platforms intercept Thunder. Walk out from underneath
    // them before checking the separate bolt-to-owner contact state.
    for(let i=0;read()[4]<56&&i<180;i++)tick(0,.5,0);neutral(20);grounded();
    tick(0x200,0,-1);neutral(300);
    require(phase.states.includes(359)&&phase.states.includes(361)&&phase.itemKinds.includes(kinds[0])&&phase.peakItems>1,'Thunder start, self-contact and linked bolts');grounded();retired();
    require(code==='Pc'?phase.final[13]>phase.initial[13]:phase.final[13]===phase.initial[13],'original Thunder self-damage');
    begin('up special');grounded();tick(0x200,0,1);for(let i=0;i<18;i++)tick(0,0,1);for(let i=0;i<18;i++)tick(0,read()[4]>0?-1:1,0);neutral(260);
    phase.dashStarts=phase.trace.filter((t,i,a)=>[354,357].includes(t.state[0])&&(!i||a[i-1].state[0]!==t.state[0])).map(t=>({frame:t.frame,state:t.state[0],position:t.state.slice(4,6)}));
    require(phase.states.includes(353)&&phase.dashStarts.length===2,'Quick Attack/Agility startup and two directed dashes');grounded();
    begin('Skull Bash');grounded();const direction=read()[4]>0?-1:1;
    for(let i=0;i<30;i++)tick(0x200,direction,0);neutral(320);
    require(phase.states.includes(343)&&phase.states.includes(344)&&phase.states.some(s=>s===345||s===347||s===350||s===352),'Skull Bash startup, charge and release');
    report.completed=true;report.retailParityVerified=false;
  }finally{module._free(buffer);}
}
