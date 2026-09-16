// Original special states reached only through controller input. This checks
// native integration, not equivalence to a retail per-frame reference trace.
export function verifyMarioFamilyMoves(module,object,code,report,{step,onStep=()=>{}}) {
  const require=(ok,message)=>{if(!ok)throw Error('Mario-family moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(({Mr:0,Lg:17,Dr:21})[code]===read()[11],'wrong fighter kind');
  report.completed=false;report.frames=0;report.phases=[];let phase;
  const buffer=module._malloc(128),capeKind=code==='Mr'?83:84;
  function begin(name){phase={name,frames:0,states:[],capeFrames:0,itemStates:[],peakItems:0};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();report.frames++;phase.frames++;
    const s=read();require(s.every(Number.isFinite),'nonfinite fighter state');
    if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const count=module._portItemsList(buffer,32);require(count<=32,'item capacity');phase.peakItems=Math.max(phase.peakItems,count);
    for(const item of new Uint32Array(module.HEAPU8.buffer,buffer,count)){
      if(code!=='Lg'&&module._portItemRead(item,0)===capeKind){
        require(module._portItemRead(item,5)===object,'cape owner');phase.capeFrames++;
        const id=module._portItemRead(item,1);if(!phase.itemStates.includes(id))phase.itemStates.push(id);
      }
    }
    phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const grounded=()=>require(read()[0]===14&&read()[3]===0,'expected grounded Wait before '+phase.name);
  try {
    if(code!=='Lg'){
      begin('cape');grounded();tick(0x200,1,0);neutral(100);
      require(phase.states.includes(345)&&phase.capeFrames>0&&phase.itemStates.includes(0),'ground cape state and attached item');grounded();
      require(module._portItemsList(buffer,32)===0,'cape must retire');
      begin('air cape');for(let i=0;i<4;i++)tick(0x400);neutral(8);tick(0x200,1,0);neutral(220);
      // Retail 802B2730 passes the item GObj to ftLib_800865CC; it does not
      // query the airborne fighter. This fixture selects item state 0 even
      // while the fighter correctly enters SpecialAirS (346).
      require(phase.states.includes(346)&&phase.capeFrames>0&&phase.itemStates.includes(0),'air cape state and attached item');grounded();
      require(module._portItemsList(buffer,32)===0,'air cape must retire');
    }
    begin('cyclone');grounded();tick(0x200,0,-1);neutral(200);
    require(phase.states.includes(code==='Lg'?357:349),'ground cyclone');grounded();
    begin('up special');grounded();tick(0x200,0,1);neutral(240);
    require(phase.states.includes(code==='Lg'?355:347),'ground up special');grounded();
    if(code==='Lg'){
      begin('Green Missile');grounded();tick(0,read()[4]>0?-.5:.5);neutral(20);
      for(let i=0;i<30;i++)tick(0x200,read()[4]>0?-1:1);neutral(300);
      require(phase.states.includes(343)&&phase.states.includes(344)&&phase.states.some(s=>s===347||s===348||s===353||s===354),'Missile start, charge and release');
    }
    report.completed=true;report.retailParityVerified=false;
  } finally {module._free(buffer);}
}
