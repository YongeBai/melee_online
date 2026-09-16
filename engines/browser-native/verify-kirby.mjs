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
