// One player drives Popo. Nana receives the original partner input/AI pipeline.
export function verifyClimberMoves(module,object,report,{step,onStep=()=>{},only=null}){
  const require=(ok,message)=>{if(!ok)throw Error('Climbers moves: '+message);};
  const partner=module._Player_GetEntityAtIndex(0,1),objects=[object,partner];
  const read=()=>objects.map(o=>Array.from({length:35},(_,i)=>module._portFighterConstructRead(o,i)));
  require(partner&&partner!==object&&read()[0][11]===10&&read()[1][11]===11,'native Popo/Nana ownership');
  require(only===null||only==='belay','move selection');
  Object.assign(report,{completed:false,frames:0,phases:[],objects,retailParityVerified:false});let phase;
  const buffer=module._malloc(8192);
  function begin(name){phase={name,frames:0,states:[[],[]],itemKinds:[],itemOwners:[],peakLinks:0,initial:read(),trace:[]};report.phases.push(phase);}
  function tick(buttons=0,x=0,y=0){
    module._portStageProbePad(0,buttons,x,y);step();phase.frames++;report.frames++;
    const s=read();for(const v of s)require(v[33]===(v[34]>>>24)&&v[30]===((v[34]>>>23)&1),'live motion word move ID and partner-copy flag');require(s.flat().every(Number.isFinite),'finite partner states');
    for(let i=0;i<2;i++){require(s[i][11]===10+i&&s[i][12]===0,'partner kind/player');if(!phase.states[i].includes(s[i][0]))phase.states[i].push(s[i][0]);}
    const n=module._portItemsList(buffer,128);require(n<=128,'item capacity');
    const items=Array.from(new Uint32Array(module.HEAPU8.buffer,buffer,n),o=>Array.from({length:9},(_,i)=>module._portItemRead(o,i)));
    for(const item of items){require(item.every(Number.isFinite)&&[106,107,113].includes(item[0]),'item kind/state');if(!phase.itemKinds.includes(item[0]))phase.itemKinds.push(item[0]);if(!phase.itemOwners.includes(item[5]))phase.itemOwners.push(item[5]);}
    const links=module._portItemLinksList(buffer,1024);require(links<=1024,'link capacity');phase.peakLinks=Math.max(phase.peakLinks,links);
    phase.trace.push({state:s,items,links});phase.final=s;onStep(phase);return s;
  }
  const neutral=n=>{for(let i=0;i<n;i++)tick();};
  const center=()=>{if(read()[0][5]>1){for(let i=0;i<4;i++)tick(0,0,-1);neutral(80);}for(let i=0;i<240&&Math.abs(read()[0][4])>5;i++)tick(0,-Math.sign(read()[0][4])*.5);neutral(120);require(Math.abs(read()[0][4])<8&&read()[0][0]===14,'walk back toward center');};
  const jump=()=>{for(let i=0;i<10;i++)tick(0x400);neutral(8);};
  const checked=(state,item)=>{require(phase.states[0].includes(state),'Popo state '+state+' in '+phase.name);if(item!==undefined)require(phase.itemKinds.includes(item),'move item '+phase.name);require(read()[0][0]===14&&read()[0][3]===0,'Popo Wait after '+phase.name);require(!module._portItemsList(buffer,128)&&!module._portItemLinksList(buffer,1024),'items retire after '+phase.name);};
  try{
    if(!only){
      begin('partner walk and jump');neutral(90);const start=read();for(let i=0;i<20;i++)tick(0,-.5);neutral(40);jump();neutral(220);
      require(read().every((s,i)=>s[4]<start[i][4]-2),'both walk from one controller');require(phase.trace.some(t=>t.state[1][31]===-64)&&phase.trace.some(t=>t.state[1][32]===-64),'signed left-stick sample retained in new and delayed queues');require(phase.trace.some(t=>t.state[1][23]===1),'Nana input-copy mode');require(phase.states.every(s=>s.includes(25)||s.includes(26)),'both jump');
      begin('ground Ice Shot');tick(0x200);neutral(240);checked(341,106);require(objects.every(o=>phase.itemOwners.includes(o)),'independent Popo and Nana projectiles');
      begin('air Ice Shot');jump();tick(0x200);neutral(280);checked(342,106);
      begin('ground Blizzard');for(let i=0;i<80;i++)tick(0x200,0,-1);neutral(240);checked(357,107);require(objects.every(o=>phase.itemOwners.includes(o)),'both Blizzard owners');
      begin('air Blizzard');jump();for(let i=0;i<40;i++)tick(0x200,0,-1);neutral(300);checked(358,107);
      begin('ground Squall Hammer');tick(0x200,-1);for(let i=0;i<40;i++)tick(i%4===0?0x200:0,.2);neutral(300);checked(344);require(phase.states[1].includes(359),'Nana linked ground Squall');
      begin('air Squall Hammer');jump();tick(0x200,1);for(let i=0;i<180;i++){const x=read()[0][4];tick(i<30&&i%4===0?0x200:0,Math.abs(x)>8?-Math.sign(x):0);}neutral(200);checked(346);require(phase.states[1].includes(360),'Nana linked air Squall');
    }
    begin('ground Belay');center();neutral(60);tick(0x200,0,1);neutral(600);checked(347,113);require(phase.peakLinks===40,'forty native rope links');
    if(!only){begin('air Belay');center();jump();tick(0x200,0,1);neutral(600);checked(352,113);require(phase.peakLinks===40,'air rope links');}
    report.completed=true;
  }finally{module._free(buffer);}
}
