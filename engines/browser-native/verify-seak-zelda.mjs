// Selected original special-move callbacks, driven only by controller inputs.
export function verifySeakZeldaMoves(module,object,report,{step,onStep=()=>{},only=null}){
  const require=(ok,message)=>{if(!ok)throw Error('Sheik/Zelda moves: '+message);};
  const read=()=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  const kind=read()[11];require([7,19].includes(kind),'wrong fighter');
  Object.assign(report,{completed:false,frames:0,phases:[],retailParityVerified:false});let phase;
  require(only===null||kind===7&&only==='chain'||kind===19&&only==='din','move selection');
  const buffer=module._malloc(8192);
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],peakItems:0,peakLinks:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite)&&s[11]===kind,'fighter state');if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');phase.peakItems=Math.max(phase.peakItems,n);
    const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite)&&[79,80,85,97,108,109].includes(item[0]),'item kind/state');if(!phase.itemKinds.includes(item[0]))phase.itemKinds.push(item[0]);}
    const links=module._portItemLinksList(buffer,1024);require(links<=1024,'link capacity');phase.peakLinks=Math.max(phase.peakLinks,links);
    phase.trace.push({state:s.slice(0,7),items,links});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  const checked=(state,item)=>{require(phase.states.includes(state)&&(item===undefined||phase.itemKinds.includes(item)),'state/item '+phase.name);require(read()[0]===14&&read()[3]===0,'grounded Wait after '+phase.name);require(!module._portItemsList(buffer,128)&&!module._portItemLinksList(buffer,1024),'retirement after '+phase.name);};
  try{
    if(kind===7){
      if(!only){begin('charged ground needles');for(let i=0;i<120;i++)tick(0x200);neutral(240);checked(341,79);require(phase.itemKinds.includes(80),'held needle model');}
      if(!only){begin('air needles');jump();for(let i=0;i<25;i++)tick(0x200);neutral(240);checked(345,79);}
      if(!only||only==='chain'){begin('ground chain');tick(0x200,1);for(let i=0;i<60;i++)tick(0x200,Math.sin(i*.2),Math.cos(i*.2));neutral(220);checked(349,97);require(phase.peakLinks===20,'twenty native chain links');}
      if(!only){begin('air chain');jump();tick(0x200,1);for(let i=0;i<25;i++)tick(0x200);neutral(240);checked(352,97);}
      if(!only){begin('ground Vanish');tick(0x200,0,1);neutral(400);checked(355,85);}
      if(!only){begin('air Vanish');jump();tick(0x200,0,1);neutral(400);checked(358,85);}
    }else{
      if(!only){begin('ground Nayru');tick(0x200);neutral(160);checked(341);}
      if(!only){begin('air Nayru');jump();tick(0x200);neutral(220);checked(342);}
      if(!only||only==='din'){begin('guided ground Din Fire');tick(0x200,1);for(let i=0;i<30;i++)tick(0x200,0,i<15?.4:-.4);neutral(240);checked(343,108);require(phase.itemKinds.includes(109),'Din Fire explosion');}
      if(!only){begin('air Din Fire');jump();tick(0x200,1);for(let i=0;i<20;i++)tick(0x200);neutral(300);checked(346,108);}
      if(!only){begin('ground Farore');tick(0x200,0,1);neutral(400);checked(349);}
      if(!only){begin('air Farore');jump();tick(0x200,0,1);neutral(400);checked(352);}
    }
    report.completed=true;
  }finally{module._free(buffer);}
}

export function verifySeakZeldaContact(module,objects,report,{step,mode,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Sheik/Zelda contact: '+message);};
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  const kind=read()[0][11];require([7,19].includes(kind)&&['attack','shield','control','reflect'].includes(mode),'mode/kind');
  require(mode!=='reflect'||kind===19&&read()[1][11]===0,'reflection requires Zelda versus Mario');
  Object.assign(report,{completed:false,mode,frames:0,trace:[],states:[[],[]],itemKinds:[],peakDamage:0,blockedFrames:0,reflectedFrames:0,retailParityVerified:false});
  const buffer=module._malloc(512);let items=[];
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;const s=read();require(s.flat().every(Number.isFinite),'fighter state');
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite),'item state');if(!report.itemKinds.includes(item[0]))report.itemKinds.push(item[0]);if(mode==='reflect'&&item[0]===48&&item[5]===objects[0])report.reflectedFrames++;}
    for(let slot=0;slot<2;slot++)if(!report.states[slot].includes(s[slot][0]))report.states[slot].push(s[slot][0]);
    report.trace.push({state:s,items});report.peakDamage=Math.max(report.peakDamage,s[1][13]);if(s[1][0]===181&&s[1][14]>0&&s[1][13]===0)report.blockedFrames++;
    onStep();return s;
  }
  try{
    module._Player_80031848(1);for(let i=0;i<120;i++)tick(undefined,[0,0,i<5?-1:0]);
    for(let i=0;i<180;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(Math.abs(dx)-45)<2)break;tick([0,Math.sign(dx)*.5*(Math.abs(dx)>45?1:-1),0]);}
    const dir=Math.sign(read()[1][4]-read()[0][4])||1;for(let i=0;i<5;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);for(let i=0;i<20;i++)tick();
    report.before=read();require(report.before.every(s=>s[0]===14&&s[3]===0&&s[13]===0),'neutral initial fighters');let released=false;
    for(let i=0;i<600;i++){
      let a=[0,0,0],b=[0,0,0];
      if(mode==='reflect'){if(i===0)b=[0x200,0,0];if(i===15)a=[0x200,0,0];}
      else if(mode!=='control'){
        if(kind===7&&i<120)a=[0x200,0,0];
        if(kind===19){const fire=items.find(x=>x[0]===108&&x[1]===0);if(fire&&Math.abs(fire[2]-read()[1][4])<3)released=true;if(!released&&i<120)a=[0x200,i===0?dir:0,0];}
        if(mode==='shield'&&i<300)b=[0x20,0,0];
      }
      tick(a,b);
    }
    report.after=read();
    if(mode==='control')require(report.peakDamage===0&&report.itemKinds.length===0,'idle control');
    else if(mode==='shield')require(report.peakDamage===0&&report.blockedFrames>0,'shield must block projectile');
    else if(mode==='reflect')require(report.reflectedFrames>0&&report.peakDamage>0&&report.after[0][13]===0,'Nayru must return fireball to Mario');
    else require(report.peakDamage>0&&report.itemKinds.includes(kind===7?79:109),'projectile/explosion must damage');
    require(!module._portItemsList(buffer,128),'items retire');report.completed=true;
  }finally{module._free(buffer);}
}
