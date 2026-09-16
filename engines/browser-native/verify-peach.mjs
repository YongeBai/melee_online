// Drive original Peach callbacks with controller samples, never patched moves.
export function verifyPeachMoves(module,object,report,{step,onStep=()=>{},only=null}){
  const require=(ok,message)=>{if(!ok)throw Error('Peach moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===9,'wrong fighter');Object.assign(report,{completed:false,frames:0,phases:[],retailParityVerified:false});let phase;
  const buffer=module._malloc(512);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite),'fighter state');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');
    const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite),'item state');if(!phase.itemKinds.includes(item[0]))phase.itemKinds.push(item[0]);}
    phase.trace.push({state:s.slice(0,7),items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  const checked=state=>{require(phase.states.includes(state),'state '+state+' in '+phase.name);require(read()[0]===14&&read()[3]===0,'grounded Wait after '+phase.name);require(!module._portItemsList(buffer,128),'retirement after '+phase.name);};
  try{
    if(!only){
      begin('float release');for(let i=0;i<10;i++)tick(0x400,0,-1);for(let i=0;i<60;i++)tick(0x400);neutral(200);checked(341);
      const floats=phase.trace.filter(t=>t.state[0]===341);require(floats.length>=50&&Math.max(...floats.map(t=>t.state[5]))-Math.min(...floats.map(t=>t.state[5]))<.01,'stable original float height');
      begin('float neutral aerial cancel');for(let i=0;i<10;i++)tick(0x400,0,-1);tick(0x500);for(let i=0;i<5;i++)tick(0x400);neutral(200);checked(344);
      for(const [name,x,y,state]of [['forward',1,0,345],['back',-1,0,346],['up',0,1,347],['down',0,-1,348]]){
        begin('float '+name+' aerial');for(let i=0;i<10;i++)tick(0x400,0,-1);tick(0x500,x*read()[16],y);for(let i=0;i<35;i++)tick(0x400);neutral(160);checked(state);
      }
      begin('float expiry');for(let i=0;i<240;i++)tick(0x400,0,i<10?-1:0);neutral(160);checked(341);require(phase.trace.filter(t=>t.state[0]===341).length>=140&&phase.states.includes(342),'float consumes original duration');
      const smashes=new Set();
      for(let i=0;i<12&&smashes.size<3;i++){begin('forward smash '+i);tick(0x100,read()[16]);neutral(120);for(const state of phase.states)if(state>=349&&state<=351)smashes.add(state);require(read()[0]===14,'smash recovery');}
      require(smashes.size===3,'club pan racket through original RNG');
      begin('ground Toad');tick(0x200);neutral(220);checked(365);require(phase.itemKinds.length>0,'Toad item');
      begin('air Toad');jump();tick(0x200);neutral(300);checked(367);
      begin('ground parasol');tick(0x200,0,1);neutral(450);checked(361);require(phase.states.includes(369)||phase.states.includes(370),'parasol fall');
      begin('air parasol');jump();tick(0x200,0,1);neutral(450);checked(363);
    }
    begin('turnip pull and throw');tick(0x200,0,-1);neutral(80);require(phase.states.includes(352)&&phase.itemKinds.length===1,'pull original item');tick(0x100,0,1);neutral(400);checked(352);
    report.completed=true;
  }finally{module._free(buffer);}
}

export function verifyPeachPulls(module,object,report,{step,onStep=()=>{},limit=1600}){
  const require=(ok,message)=>{if(!ok)throw Error('Peach pulls: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===9,'wrong fighter');Object.assign(report,{completed:false,frames:0,pulls:[],rareKinds:[],retailParityVerified:false,selection:'original unmodified RNG and weighted item table'});
  const buffer=module._malloc(512),initialStocks=read()[18];let items=[],phase;
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();report.frames++;
    const s=read();require(s.every(Number.isFinite)&&s[18]===initialStocks,'finite state and original stock count');
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');
    items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>({object:o,values:Array.from({length:9},(_,i)=>module._portItemRead(o,i))}));
    for(const {values:v} of items)require(v.every(Number.isFinite)&&[6,7,12,99].includes(v[0]),'item kind/state');
    if(phase){phase.states.add(s[0]);if(phase.kind!==99)phase.trace.push({state:s,items});onStep(phase);}
    return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  try{
    for(let pull=0;pull<limit&&!report.completed;pull++){
      require(read()[0]===14&&read()[3]===0,'grounded ready for pull '+pull);
      tick(0x200,0,-1);neutral(80);
      const held=items.filter(i=>i.values[5]===object);require(held.length===1,'one pulled item');
      const item=held[0],kind=item.values[0];phase={pull,kind,states:new Set(),trace:[],initial:read()};
      // Beam Sword is swung before a shield+A throw, through the normal item inputs.
      if(kind===12){tick(0x100);neutral(100);}
      tick(0x120,1);neutral(60);for(let i=0;i<1000&&(items.some(i=>i.object===item.object)||read()[0]!==14);i++)tick();
      require(!items.some(i=>i.object===item.object),'pulled item must retire');
      phase.final=read();phase.states=[...phase.states];report.pulls.push(phase);
      if(kind!==99&&!report.rareKinds.includes(kind))report.rareKinds.push(kind);
      phase=null;report.completed=[6,7,12].every(k=>report.rareKinds.includes(k));
    }
    require(report.completed,'rare outcomes not yet all observed');
  }finally{module._free(buffer);}
}

export function verifyPeachContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Peach contact: '+message);};
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  require(read()[0][11]===9&&read()[1][11]===0,'Peach versus Mario');
  require(['turnip','shield','bomber','toad','control'].includes(mode),'mode');
  Object.assign(report,{completed:false,mode,frames:0,states:[[],[]],trace:[],itemKinds:[],blockedFrames:0,peakDamage:0,retailParityVerified:false});
  const buffer=module._malloc(512);
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;const s=read();require(s.flat().every(Number.isFinite),'finite fighters');
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite),'finite items');if(!report.itemKinds.includes(item[0]))report.itemKinds.push(item[0]);}
    for(let i=0;i<2;i++)if(!report.states[i].includes(s[i][0]))report.states[i].push(s[i][0]);
    report.peakDamage=Math.max(report.peakDamage,s[1][13]);if(s[1][0]===181&&s[1][14]>0&&s[1][13]===0)report.blockedFrames++;
    report.trace.push({state:s,items});onStep();return s;
  }
  try{
    module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
    const distance=mode==='toad'?32:45;
    for(let i=0;i<180;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(Math.abs(dx)-distance)<2)break;tick([0,Math.sign(dx)*.5*(Math.abs(dx)>distance?1:-1),0]);}
    const dir=Math.sign(read()[1][4]-read()[0][4])||1;for(let i=0;i<5;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);for(let i=0;i<20;i++)tick();
    report.before=read();require(report.before.every(s=>s[0]===14&&s[3]===0&&s[13]===0),'grounded initial fighters');
    for(let i=0;i<600;i++){
      let a=[0,0,0],b=[0,0,0];
      if(['turnip','shield'].includes(mode)){if(i===0)a=[0x200,0,-1];if(i===90)a=[0x100,dir,0];if(mode==='shield'&&i>=80&&i<160)b=[0x20,0,0];}
      if(mode==='bomber'&&i===0)a=[0x200,dir,0];
      if(mode==='toad'){if(i===0)b=[0x200,0,0];if(i===10)a=[0x200,0,0];}
      tick(a,b);
    }
    report.after=read();
    if(mode==='control')require(!report.peakDamage&&report.itemKinds.length===0,'idle control');
    else if(mode==='shield')require(!report.peakDamage&&report.blockedFrames>0,'shield blocks turnip');
    else if(mode==='toad')require(report.states[0].includes(366)&&report.itemKinds.includes(111)&&report.peakDamage>0&&report.after[0][13]===0,'Toad counter protects Peach and damages Mario');
    else require(report.peakDamage>0&&report.itemKinds.includes(mode==='bomber'?98:99),'move damages opponent');
    require(!module._portItemsList(buffer,128),'items retire');report.completed=true;
  }finally{module._free(buffer);}
}
