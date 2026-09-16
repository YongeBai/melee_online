// Exercise the original callbacks using controller samples, without forced states.
export function verifyKirbyMoves(module,object,report,{step,onStep=()=>{},only=null}){
  const require=(ok,message)=>{if(!ok)throw Error('Kirby moves: '+message);};
  const read=()=>Array.from({length:35},(_,i)=>module._portFighterConstructRead(object,i));
  require(read()[11]===4,'wrong fighter');require(only===null||only==='cutter','move selection');Object.assign(report,{completed:false,frames:0,phases:[],retailParityVerified:false});let phase;
  const buffer=module._malloc(512),stocks=read()[18];
  function begin(name){phase={name,frames:0,states:[],itemKinds:[],initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();require(s.every(Number.isFinite)&&s[18]===stocks,'finite fighter and unchanged stock count');require(s[33]===(s[34]>>>24),'native motion word');
    if(!phase.states.includes(s[0]))phase.states.push(s[0]);
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');
    const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite),'finite item');if(!phase.itemKinds.includes(item[0]))phase.itemKinds.push(item[0]);}
    phase.trace.push({state:s.slice(0,7),items});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  const checked=(state,item)=>{require(phase.states.includes(state),'state '+state+' in '+phase.name);if(item!==undefined)require(phase.itemKinds.includes(item),'item '+item+' in '+phase.name);require(read()[0]===14&&read()[3]===0,'grounded Wait after '+phase.name);require(!module._portItemsList(buffer,128),'item retirement '+phase.name);};
  try{
    if(!only){
    begin('reach top platform');jump();for(let j=0;j<3;j++){tick(0x400);neutral(18);}neutral(300);require(read()[5]>50&&read()[0]===14,'native top platform landing');
    begin('five aerial jumps');jump();for(let i=0;i<180;i++)tick(0x400);neutral(350);for(let s=341;s<=345;s++)require(phase.states.includes(s),'aerial jump '+s);checked(345);
    begin('ground inhale release');for(let i=0;i<70;i++)tick(0x200);neutral(160);checked(353);require(phase.states.includes(354)&&phase.states.includes(355),'inhale loop and release');
    begin('air inhale release');jump();for(let i=0;i<35;i++)tick(0x200);neutral(220);checked(371);
    begin('ground hammer');tick(0x200,read()[16]);neutral(240);checked(383,51);
    begin('air hammer');jump();tick(0x200,read()[16]);neutral(300);checked(384);
    }
    begin('ground final cutter');tick(0x200,0,1);neutral(400);checked(385,50);
    begin('air final cutter');jump();tick(0x200,0,1);neutral(400);checked(389,50);
    if(!only){
    begin('ground stone release');tick(0x200,0,-1);neutral(90);tick(0x200);neutral(180);checked(393);require(phase.states.includes(394)&&phase.states.includes(395),'stone hold and release');
    begin('air stone release');jump();tick(0x200,0,-1);neutral(90);tick(0x200);neutral(220);checked(396);require(phase.states.includes(397),'air stone');
    }
    report.completed=true;
  }finally{module._free(buffer);}
}

export function verifyKirbyCopy(module,objects,report,{step,onStep=()=>{},mode='swallow'}){
  const require=(ok,message)=>{if(!ok)throw Error('Kirby copy: '+message);};
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  const copyKind=read()[1][11],profile={0:{item:130,ground:399,air:400},17:{item:132,ground:431,air:432},21:{item:131,ground:512,air:513}}[copyKind];
  require(read()[0][11]===4&&profile,'Kirby versus a supported projectile copy');require(['swallow','acquire','spit','contact'].includes(mode),'mode');
  Object.assign(report,{completed:false,copyKind,projectileKind:profile.item,frames:0,states:[[],[]],trace:[],itemKinds:[],retailParityVerified:false});
  const buffer=module._malloc(512),stocks=read().map(s=>s[18]);let phase='approach';
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;
    const s=read();require(s.flat().every(Number.isFinite)&&s.every((v,i)=>v[18]===stocks[i]),'finite fighters and unchanged stocks');
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');
    const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite)&&(!(item[0]===profile.item)||item[5]===objects[0]),'finite items and Kirby projectile ownership');if(!report.itemKinds.includes(item[0]))report.itemKinds.push(item[0]);}
    s.forEach((v,i)=>{if(!report.states[i].includes(v[0]))report.states[i].push(v[0]);});
    const hat=Array.from({length:3},(_,i)=>module._portKirbyRead(objects[0],i));
    report.trace.push({phase,state:s,hat,items});report.final=s;report.hat=hat;onStep(report);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  function approach(){
    for(let i=0;i<120;i++)tick([0,0,i<5&&read()[0][5]>1?-1:0],[0,0,i<5&&read()[1][5]>1?-1:0]);
    for(let i=0;i<180;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(Math.abs(dx)-20)<1)break;tick([0,Math.sign(dx)*.5*(Math.abs(dx)>20?1:-1),0]);}
    const dir=Math.sign(read()[1][4]-read()[0][4])||1;for(let i=0;i<4;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);neutral(20);
  }
  try{
    module._Player_80031848(1);approach();
    report.before=read();require(report.before.every(s=>s[0]===14&&s[3]===0&&s[13]===0),'grounded approach');require(module._portKirbyRead(objects[0],0)===4,'start without copy');
    phase='inhale';for(let i=0;i<150&&read()[0][0]!==359;i++)tick([0x200,0,0]);
    require(read()[0][0]===359,'captured fighter in EatWait');neutral(2);
    if(mode==='spit'){phase='spit';tick([0x100,0,0]);neutral(300);require(report.states[0].includes(369)&&report.hat[0]===4&&!report.hat[1],'original spit without gaining copy');require(read().every(s=>s[0]===14),'both fighters recover after spit');report.completed=true;return;}
    phase='swallow';tick([0,0,-1]);neutral(140);
    require(report.hat[0]===copyKind&&report.hat[1]&&report.hat[2],'original copy hat acquired');require(read().every(s=>s[0]===14),'both fighters recover');
    report.firstHat=report.hat.slice();
    if(mode==='contact'){phase='projectile contact approach';approach();report.contactBefore=read();require(report.contactBefore.every(s=>s[0]===14&&s[3]===0),'grounded contact approach');}
    phase='copied fireball';tick([0x200,0,0]);neutral(240);
    require(report.states[0].includes(profile.ground)&&report.itemKinds.includes(profile.item),'original copied fireball state and item');
    require(read()[0][0]===14&&report.hat[0]===copyKind,'copy retained after attack');require(!module._portItemsList(buffer,128),'fireball retirement');
    if(mode==='contact'){report.contactAfter=read();require(report.contactAfter[1][13]>report.contactBefore[1][13],'copied projectile damages opponent');require(report.contactAfter[0][13]===report.contactBefore[0][13],'attacker damage unchanged');report.completed=true;return;}
    if(mode==='acquire'){report.completed=true;return;}
    phase='air copied fireball';for(let i=0;i<10;i++)tick([0x400,0,0]);neutral(8);tick([0x200,0,0]);neutral(300);require(report.states[0].includes(profile.air)&&read()[0][0]===14,'air copy and recovery');
    phase='taunt copy loss';tick([8,0,0]);neutral(300);require(report.hat[0]===4&&!report.hat[1]&&report.itemKinds.includes(52),'original copy loss and star');require(read()[0][0]===14&&!module._portItemsList(buffer,128),'taunt and star retirement');
    phase='reacquire approach';approach();phase='reacquire inhale';for(let i=0;i<150&&read()[0][0]!==359;i++)tick([0x200,0,0]);require(read()[0][0]===359,'second capture');neutral(2);
    phase='reacquire swallow';tick([0,0,-1]);neutral(140);require(report.hat[0]===copyKind&&report.hat[1],'hat recreated');report.secondHat=report.hat.slice();
    phase='reacquired fireball';tick([0x200,0,0]);neutral(240);require(report.trace.some(t=>t.phase===phase&&t.items.some(i=>i[0]===profile.item)),'reacquired projectile');require(read()[0][0]===14&&report.hat[0]===copyKind&&!module._portItemsList(buffer,128),'reacquired copy retained and item retired');
    report.completed=true;
  }finally{module._free(buffer);}
}
