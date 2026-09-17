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
  const copyKind=read()[1][11],profile={18:{item:null,sword:true,ground:492,air:496,attackStates:[494,495,498,499],attackFrame:0,dynamicNodes:[2,2,2]},26:{item:null,sword:true,ground:530,air:534,attackStates:[532,533,536,537],attackFrame:0,dynamicNodes:[2,2,2,2]},3:{item:null,bodyCopy:true,punchCharge:true,ground:455,air:460,attackStates:[458,459,463,464],attackFrame:0},22:{item:137,blaster:139,bodyCopy:true,ground:520,air:523,contactDistance:40},13:{item:151,charge:true,ground:407,air:411,contactDistance:40},6:{item:140,bow:142,dynamicNodes:[3],ground:401,air:404,contactDistance:40},20:{item:141,bow:143,dynamicNodes:[3],ground:514,air:517,contactDistance:40},12:{item:147,child:148,dynamicNodes:[3,3,4],ground:429,air:430,contactDistance:40},23:{item:149,child:150,dynamicNodes:[3,3,2],recoil:1,ground:526,air:527,contactDistance:40},1:{item:136,blaster:138,ground:423,air:426,contactDistance:40},8:{item:145,explosion:146,ground:435,air:439,hold:110},9:{item:134,counter:135,ground:449,air:451,distance:18},2:{item:null,ground:433,air:434},25:{item:null,ground:528,air:529},0:{item:130,ground:399,air:400},17:{item:132,ground:431,air:432},21:{item:131,ground:512,air:513}}[copyKind];
  require(read()[0][11]===4&&profile,'Kirby versus a supported copy');require(['swallow','acquire','spit','contact'].includes(mode),'mode');
  Object.assign(report,{completed:false,copyKind,projectileKind:profile.item,secondaryItemKind:profile.explosion??profile.counter??profile.child??profile.bow??null,attackStates:profile.attackStates??[profile.ground,profile.air],attackFrame:profile.attackFrame,frames:0,states:[[],[]],trace:[],itemKinds:[],retailParityVerified:false});
  const buffer=module._malloc(128*12),stocks=read().map(s=>s[18]);let phase='approach';
  function tick(a=[0,0,0],b=[0,0,0]){
    [a,b].forEach((p,i)=>module._portStageProbePad(i,...p));step();report.frames++;
    const s=read();require(s.flat().every(Number.isFinite)&&s.every((v,i)=>v[18]===stocks[i]),'finite fighters and unchanged stocks');
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');
    const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite)&&(!(item[0]===profile.item)||item[5]===objects[0]),'finite items and Kirby projectile ownership');if(!report.itemKinds.includes(item[0]))report.itemKinds.push(item[0]);}
    s.forEach((v,i)=>{if(!report.states[i].includes(v[0]))report.states[i].push(v[0]);});
    const attachments=profile.bow?module._portItemAttachmentsList(buffer,128):0;require(attachments<=128,'attachment capacity');report.peakAttachments=Math.max(report.peakAttachments??0,attachments);
    const hat=Array.from({length:7},(_,i)=>module._portKirbyRead(objects[0],i));
    if(profile.dynamicNodes?.length>3)hat.push(module._portKirbyRead(objects[0],15));
    if(report.contactBefore&&!report.contactImpact&&s[1][13]>report.contactBefore[1][13])report.contactImpact=s.map(v=>v.slice());
    const charge=profile.charge?Array.from({length:3},(_,i)=>module._portKirbyRead(objects[0],7+i)):profile.punchCharge?[module._portKirbyRead(objects[0],13),module._portKirbyRead(objects[0],14)]:profile.sword?[module._portKirbyRead(objects[0],16),module._portKirbyRead(objects[0],17)]:null;
    const sword=profile.sword?[module._portFighterAccessory(objects[0],0),module._portFighterAccessory(objects[0],1)]:null;
    const body=profile.bodyCopy?Array.from({length:3},(_,i)=>module._portKirbyRead(objects[0],10+i)):null;report.body=body;
    report.trace.push({phase,state:s,hat,items,attachments,charge,body,sword});report.final=s;report.hat=hat;onStep(report);return s;
  }
  const hasModel=()=>profile.bodyCopy?report.body?.[0]&&report.body[1]>0&&report.body[2]>0:report.hat[1]&&report.hat[2];
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  let attackDamage=0;const checkRecoil=()=>require(read()[0][13]===attackDamage+(profile.recoil??0),'original copied attack recoil');
  function attack(air=false){attackDamage=read()[0][13];tick([0x200,0,0]);if(profile.sword){for(let i=0;i<(air?8:60);i++)tick([0x200,0,0]);}else if(profile.punchCharge){for(let i=0;i<120&&read()[0][0]!==profile.ground+1&&read()[0][0]!==profile.air+1;i++)tick();require(read()[0][0]===(air?profile.air:profile.ground)+1,'Giant Punch charge loop');if(!air)neutral(15);tick([0x200,0,0]);}else if(profile.charge&&!air){neutral(65);tick([0x200,0,0]);}else if(profile.bow&&!air){for(let i=1;i<180&&read()[0][0]!==profile.ground+1;i++)tick([0x200,0,0]);require(read()[0][0]===profile.ground+1,'fully charged bow loop');}else if(profile.hold&&!air)for(let i=1;i<profile.hold;i++)tick([0x200,0,0]);}
  function retireBow(){
    if(!profile.bow)return;let frames=0;
    for(;frames<600&&module._portItemsList(buffer,128);frames++)tick();
    require(!module._portItemsList(buffer,128)&&!module._portItemAttachmentsList(buffer,128),'bow, arrow and attachments retire within bounded recovery');
    (report.arrowRetirementWaits??=[]).push({phase,frames});
  }
  function approach(separation=profile.distance??20){
    for(let i=0;i<120;i++)tick([0,0,i<5&&read()[0][5]>1?-1:0],[0,0,i<5&&read()[1][5]>1?-1:0]);
    for(let i=0;i<180;i++){const s=read(),dx=s[1][4]-s[0][4];if(Math.abs(Math.abs(dx)-separation)<1)break;tick([0,Math.sign(dx)*.5*(Math.abs(dx)>separation?1:-1),0]);}
    const dir=Math.sign(read()[1][4]-read()[0][4])||1;for(let i=0;i<4;i++)tick([0,dir*.5,0],[0,-dir*.5,0]);neutral(20);
  }
  try{
    module._Player_80031848(1);approach();
    report.before=read();require(report.before.every(s=>s[0]===14&&s[3]===0&&s[13]===0),'grounded approach');require(module._portKirbyRead(objects[0],0)===4,'start without copy');
    if(profile.dynamicNodes)report.dynamicPoolBefore=module._portDynamicsPoolFree();
    phase='inhale';for(let i=0;i<150&&read()[0][0]!==359;i++)tick([0x200,0,0]);
    require(read()[0][0]===359,'captured fighter in EatWait');neutral(2);
    if(mode==='spit'){phase='spit';tick([0x100,0,0]);neutral(300);require(report.states[0].includes(369)&&report.hat[0]===4&&!report.hat[1],'original spit without gaining copy');require(read().every(s=>s[0]===14),'both fighters recover after spit');report.completed=true;return;}
    phase='swallow';tick([0,0,-1]);neutral(140);
    require(report.hat[0]===copyKind&&hasModel(),'original copy hat acquired');require(read().every(s=>s[0]===14),'both fighters recover');
    report.firstHat=report.hat.slice();if(profile.bodyCopy)report.firstBody=report.body.slice();if(profile.dynamicNodes){require(report.hat[3]===profile.dynamicNodes.length&&JSON.stringify(report.hat.slice(4))===JSON.stringify([...profile.dynamicNodes,...Array(Math.max(0,3-profile.dynamicNodes.length)).fill(0)]),'original dynamic hat chains');report.dynamicPoolWithHat=module._portDynamicsPoolFree();require(report.dynamicPoolBefore-report.dynamicPoolWithHat===profile.dynamicNodes.reduce((a,b)=>a+b,0),'exact hat dynamics pool consumption');}
    if(mode==='contact'){phase='copied attack contact approach';approach(profile.contactDistance??profile.distance??20);
      if(copyKind===8){for(let i=0;i<120&&Math.abs(read()[1][4])>1;i++)tick([0,0,0],[0,-Math.sign(read()[1][4])*.5,0]);approach();}
      // An idle Link's physical shield blocks projectiles from the front.
      // Turn the target using normal input to test arrow damage separately.
      if(profile.bow){const dir=Math.sign(read()[1][4]-read()[0][4]);for(let i=0;i<8;i++)tick([0,0,0],[0,dir*.5,0]);neutral(20);}
      report.contactBefore=read();require(report.contactBefore.every(s=>s[0]===14&&s[3]===0),'grounded contact approach');}
    if(mode==='contact'&&copyKind===8){
      phase='steered copied PK Flash';tick([0x200,0,0]);let previousX=null;
      for(let i=0;i<240&&read()[1][13]===report.contactBefore[1][13];i++){
        const ball=report.trace.at(-1).items.find(item=>item[0]===145);let x=0;
        if(ball){const vx=previousX===null?0:ball[2]-previousX;previousX=ball[2];x=Math.max(-1,Math.min(1,(read()[1][4]-ball[2])*.08-vx*3));}
        // The charged Flash remains above the floor; jump the opponent into
        // its original blast height without assigning either object position.
        tick([i<110?0x200:0,x,0],[i>=120&&i<130?0x400:0,0,0]);
      }
      report.contactAfter=read();require(report.states[0].includes(435)&&report.itemKinds.includes(145)&&report.itemKinds.includes(146),'native steered Flash and explosion');require(report.contactAfter[1][13]>report.contactBefore[1][13]&&report.contactAfter[1][14]>0,'copied Flash contact and hitlag');require(report.contactAfter[0][13]===report.contactBefore[0][13],'attacker damage unchanged');report.completed=true;return;
    }
    phase='copied neutral special';attack();
    if(mode==='contact'&&profile.counter){neutral(10);tick([0,0,0],[0x100,0,0]);}
    if(mode==='contact'&&profile.item===null){
      // Strong punches can KO an idle opponent before the ordinary recovery
      // window ends. Observe original collision/hitlag at first damage instead.
      for(let i=0;i<180&&read()[1][13]===report.contactBefore[1][13];i++)tick();
      report.contactAfter=read();require(report.states[0].includes(profile.ground)&&report.hat[0]===copyKind,'copied punch state and retained hat');
      require(report.contactAfter[1][13]>report.contactBefore[1][13]&&report.contactAfter[1][14]>0,'copied punch damage and native hitlag');require(report.contactAfter[0][13]===report.contactBefore[0][13],'attacker damage unchanged');report.completed=true;return;
    }
    neutral(240);retireBow();checkRecoil();
    require(report.states[0].includes(profile.ground)&&(profile.item===null||report.itemKinds.includes(profile.item)),'original copied attack state and any required item');
    if(profile.punchCharge)require(report.states[0].includes(458)&&module._portKirbyRead(objects[0],13)===0,'partial ground punch and consumed charge');
    if(profile.child)require(report.itemKinds.includes(profile.child),'original Thunder Jolt visible child');
    if(profile.blaster)require(report.itemKinds.includes(profile.blaster),'original copied Blaster item');
    if(profile.bow)require(report.itemKinds.includes(profile.bow)&&report.states[0].includes(profile.ground+1)&&report.states[0].includes(profile.ground+2)&&report.peakAttachments===2&&!module._portItemAttachmentsList(buffer,128),'original copied bow, charge, release and attachment retirement');
    if(profile.explosion)require(report.itemKinds.includes(profile.explosion),'charged copied PK Flash explodes');
    if(mode==='contact'&&profile.counter)require(report.states[0].includes(450)&&report.itemKinds.includes(profile.counter),'native Toad counter and spores');
    require(read()[0][0]===14&&report.hat[0]===copyKind,'copy retained after attack');require(!module._portItemsList(buffer,128),'projectile retirement');
    if(mode==='contact'){if(copyKind===1)require(report.contactImpact?.[1][14]===0,'Fox laser does not cause hitlag');if(copyKind===22)require(report.contactImpact?.[1][14]>0,'Falco laser causes hitlag');report.contactAfter=read();require(report.contactAfter[1][13]>report.contactBefore[1][13],'copied attack damages opponent');require(report.contactAfter[0][13]===report.contactBefore[0][13]+(profile.recoil??0),'attacker damage follows original copy recoil');report.completed=true;return;}
    if(mode==='acquire'){report.completed=true;return;}
    phase='air copied neutral special';for(let i=0;i<10;i++)tick([0x400,0,0]);neutral(8);attack(true);neutral(300);retireBow();checkRecoil();require(report.states[0].includes(profile.air)&&read()[0][0]===14,'air copy and recovery');
    if(profile.punchCharge)require(report.trace.some(t=>t.phase===phase&&t.state[0][0]===463&&t.state[0][3]===1)&&module._portKirbyRead(objects[0],13)===0,'partial airborne punch and consumed charge');
    if(profile.bow)require(report.trace.some(t=>t.phase===phase&&t.state[0][0]===profile.air+2&&t.items.some(i=>i[0]===profile.item)),'original airborne arrow release');
    if(profile.sword){
      require(report.trace.some(t=>t.phase==='copied neutral special'&&t.state[0][0]===profile.ground+2)&&report.trace.some(t=>t.phase===phase&&t.state[0][0]===profile.air+2&&t.state[0][3]===1),'partial ground and airborne sword release');
      require(!module._portFighterAccessory(objects[0],0),'sword removed after recovery');
      phase='fully charged copied sword';const max=module._portKirbyRead(objects[0],17);require(max>0&&max<1000,'bounded original sword charge time');
      tick([0x200,0,0]);for(let i=0;i<max+180&&read()[0][0]!==profile.ground+3;i++)tick([0x200,0,0]);
      require(read()[0][0]===profile.ground+3&&module._portKirbyRead(objects[0],16)>max,'original full charge auto-release');
      report.swordCharge={max,full:module._portKirbyRead(objects[0],16)};neutral(300);require(read()[0][0]===14&&!module._portFighterAccessory(objects[0],0),'full sword recovery and accessory removal');
    }
    if(copyKind===22){
      phase='repeat copied laser';for(let i=0;i<150;i++)tick([i%4===0?0x200:0,0,0]);neutral(240);
      const sequence=report.trace.filter(t=>t.phase===phase),loops=sequence.filter((t,i)=>t.state[0][0]===521&&(i===0||sequence[i-1].state[0][0]!==521||t.state[0][2]<sequence[i-1].state[0][2])).length;
      require(loops>=3&&sequence.some(t=>t.items.some(i=>i[0]===137))&&read()[0][0]===14&&!module._portItemsList(buffer,128),'repeated Falco shots and original recovery');report.repeatedLaserLoops=loops;
    }
    if(profile.punchCharge){
      const stored=()=>module._portKirbyRead(objects[0],13),max=module._portKirbyRead(objects[0],14);
      phase='store partial Giant Punch';tick([0x200,0,0]);for(let i=0;i<600&&stored()<3;i++)tick();
      const partial=stored();require(partial>0&&partial<max&&read()[0][0]===456,'partial Giant Punch charge');tick([0x40,0,0]);neutral(120);
      require(report.trace.some(t=>t.phase===phase&&t.state[0][0]===457)&&read()[0][0]===14&&stored()>=partial&&stored()<max,'shield cancellation stores Giant Punch charge');report.punchCharge={partial,stored:stored(),max};
      phase='resume full Giant Punch';tick([0x200,0,0]);for(let i=0;i<1200&&!(read()[0][0]===14&&stored()===max);i++)tick();require(read()[0][0]===14&&stored()===max,'full Giant Punch automatically stored');
      phase='full ground Giant Punch';tick([0x200,0,0]);neutral(240);require(report.trace.some(t=>t.phase===phase&&t.state[0][0]===459)&&read()[0][0]===14&&stored()===0,'full ground punch consumes charge');
      phase='charge for full air Giant Punch';tick([0x200,0,0]);for(let i=0;i<1200&&!(read()[0][0]===14&&stored()===max);i++)tick();require(stored()===max&&read()[0][0]===14,'full charge for aerial punch');
      phase='full air Giant Punch';for(let i=0;i<10;i++)tick([0x400,0,0]);neutral(8);tick([0x200,0,0]);neutral(300);require(report.trace.some(t=>t.phase===phase&&t.state[0][0]===464&&t.state[0][3]===1)&&read()[0][0]===14&&stored()===0,'full air punch consumes charge and recovers');
      phase='store charge before copy loss';tick([0x200,0,0]);for(let i=0;i<600&&stored()<3;i++)tick();tick([0x40,0,0]);neutral(120);require(stored()>0&&read()[0][0]===14,'Giant Punch charged before copy loss');
    }
    if(profile.charge){
      phase='cancel and store Charge Shot';tick([0x200,0,0]);neutral(65);
      const partial=module._portKirbyRead(objects[0],7),max=module._portKirbyRead(objects[0],8);
      require(partial>0&&partial<max&&read()[0][0]===408,'partial charge in hold');
      tick([0x40,0,0]);neutral(60);
      const stored=module._portKirbyRead(objects[0],7);
      require(stored>=partial&&stored<max&&read()[0][0]===14&&!module._portKirbyRead(objects[0],9)&&!module._portItemsList(buffer,128),'shield cancellation stores charge and retires charging item');
      report.charge={partial,stored,max};
      phase='resume to full charge';tick([0x200,0,0]);
      for(let i=0;i<600&&!(read()[0][0]===14&&module._portKirbyRead(objects[0],7)===max);i++)tick();
      require(read()[0][0]===14&&module._portKirbyRead(objects[0],7)===max&&!module._portItemsList(buffer,128),'full charge automatically stores');
      phase='full charge ground fire';tick([0x200,0,0]);neutral(240);
      require(read()[0][0]===14&&module._portKirbyRead(objects[0],7)===0&&!module._portItemsList(buffer,128),'stored full shot fires grounded and resets');
      require(report.trace.some(t=>t.phase===phase&&t.items.some(i=>i[0]===151&&i[1]===8)),'full-power ground projectile state');
      phase='charge for air fire';tick([0x200,0,0]);
      for(let i=0;i<600&&!(read()[0][0]===14&&module._portKirbyRead(objects[0],7)===max);i++)tick();
      require(module._portKirbyRead(objects[0],7)===max&&read()[0][0]===14,'full charge stored for aerial fire');
      phase='full charge air fire';for(let i=0;i<10;i++)tick([0x400,0,0]);neutral(8);attack(true);neutral(300);
      require(read()[0][0]===14&&module._portKirbyRead(objects[0],7)===0&&!module._portItemsList(buffer,128),'stored full shot fires airborne and resets');
      require(report.trace.some(t=>t.phase===phase&&t.items.some(i=>i[0]===151&&i[1]===8)&&t.state[0][3]===1),'full-power airborne projectile state');
      phase='store charge before copy loss';tick([0x200,0,0]);neutral(65);tick([0x40,0,0]);neutral(60);
      require(module._portKirbyRead(objects[0],7)>0&&read()[0][0]===14,'charged before copy loss');
    }
    phase='taunt copy loss';tick([8,0,0]);neutral(300);require(report.hat[0]===4&&!report.hat[1]&&report.itemKinds.includes(52),'original copy loss and star');if(profile.dynamicNodes){report.dynamicPoolAfterLoss=module._portDynamicsPoolFree();require(report.hat[3]===0&&report.dynamicPoolAfterLoss===report.dynamicPoolBefore,'dynamic hat chains unloaded and pool restored');}require(read()[0][0]===14&&!module._portItemsList(buffer,128),'taunt and star retirement');
    if(profile.bodyCopy)require(!report.body[0],'copy body parts removed on loss');
    phase='reacquire approach';approach();phase='reacquire inhale';for(let i=0;i<150&&read()[0][0]!==359;i++)tick([0x200,0,0]);require(read()[0][0]===359,'second capture');neutral(2);
    phase='reacquire swallow';tick([0,0,-1]);neutral(140);require(report.hat[0]===copyKind&&hasModel(),'hat recreated');report.secondHat=report.hat.slice();if(profile.bodyCopy){report.secondBody=report.body.slice();require(JSON.stringify(report.secondBody.slice(1))===JSON.stringify(report.firstBody.slice(1)),'copy body parts reacquired');}
    if(profile.dynamicNodes){report.dynamicPoolAfterReacquire=module._portDynamicsPoolFree();require(JSON.stringify(report.secondHat.slice(3))===JSON.stringify(report.firstHat.slice(3))&&report.dynamicPoolAfterReacquire===report.dynamicPoolWithHat,'reacquired dynamic hat chains and pool consumption');}
    if(profile.punchCharge){report.punchCharge.afterReacquire=module._portKirbyRead(objects[0],13);require(report.punchCharge.afterReacquire===0,'reacquired Giant Punch charge reset');}
    if(profile.charge){report.charge.afterReacquire=module._portKirbyRead(objects[0],7);require(report.charge.afterReacquire===0,'reacquired copy starts with zero charge');}
    phase='reacquired neutral special';attack();neutral(240);retireBow();checkRecoil();require(report.trace.some(t=>t.phase===phase&&(profile.item===null?t.state[0][0]===profile.ground:t.items.some(i=>i[0]===profile.item))),'reacquired attack');require(read()[0][0]===14&&report.hat[0]===copyKind&&!module._portItemsList(buffer,128),'reacquired copy retained and item retired');
    report.completed=true;
  }finally{module._free(buffer);}
}
