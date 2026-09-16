// Exercise stock loss through controller input and the original VS controller.
// No writes to position, velocity, damage, stocks, timer or outcome.
export function verifyMatch(module,objects,report,{onStep=()=>{},progress=()=>{}}={}) {
  const read=(field,slot=0)=>module._portTournamentRead(field,slot);
  const state=object=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(object,i));
  const require=(ok,message)=>{if(!ok)throw Error('Match: '+message);};
  report.frames=0;report.stockChanges=[];report.states=[];report.completed=false;
  report.crouch={frames:0,states:[]};
  for(let i=0;i<100;i++){
    module._portStageProbePad(0,0,0,i<80?-1:0);module._portStageProbePad(1,0,0,0);
    module._portTournamentStep();report.crouch.frames++;
    const s=state(objects[0]);require(s.every(Number.isFinite),'finite crouch/slope state');
    if(!report.crouch.states.includes(s[0]))report.crouch.states.push(s[0]);onStep();
  }
  require(report.crouch.states.includes(40)&&state(objects[0])[0]===14,'held crouch reaches SquatWait and releases to Wait');
  report.before={rules:Array.from({length:12},(_,i)=>read(i)),clock:[read(12),read(13),read(14)],stocks:[read(10),read(10,1)]};
  require(JSON.stringify(report.before.rules)===JSON.stringify([1,1,480,1,0,-1,1,1,1,0,4,0]),'four stocks, eight minutes, no items, normal speed/damage');
  require(read(22)===2,'VS game mode routing');
  for(let i=0;i<2;i++)module._Player_80031848(i);
  let previous=4,lastState=-1;
  for(let frame=0;frame<3600;frame++) {
    module._portStageProbePad(0,0,1,0);module._portStageProbePad(1,0,0,0);
    module._portTournamentStep();report.frames++;
    const a=state(objects[0]),stocks=read(10),outcome=read(15);
    require(a.every(Number.isFinite),'finite fighter state');
    require(read(10,1)===4,'inactive opponent retains four stocks');
    if(a[0]!==lastState){lastState=a[0];report.states.push({frame:report.frames,state:a[0],stocks,x:a[4],y:a[5]});}
    if(stocks!==previous){require(stocks===previous-1,'one stock per KO');report.stockChanges.push({frame:report.frames,stocks,falls:read(18),outcome});previous=stocks;progress();}
    onStep();
    if(outcome){report.outcome=outcome;break;}
  }
  report.after={clock:[read(12),read(13),read(14)],stocks:[read(10),read(10,1)],outcome:read(15),phase:read(20)};
  require(report.stockChanges.length===4&&report.after.stocks[0]===0,'four input-driven KOs with native respawns');
  require(report.after.outcome===2,'original elimination outcome');
  require(report.after.clock[0]-report.before.clock[0]===report.frames,'match clock advances once per step');
  module._portTournamentStep();onStep();
  report.transition={phase:read(20),outcome:read(16),clock:read(12)};
  require(report.transition.phase===1&&report.transition.outcome===2,'original match-end transition');
  const stopped=state(objects[1]);
  report.endFrames=0;
  for(let i=0;i<600&&read(20)!==3;i++){
    module._portTournamentStep();report.endFrames++;
    require(JSON.stringify(state(objects[1]))===JSON.stringify(stopped),'winner simulation freezes during match end');
    onStep();
  }
  require(read(20)===3,'original post-match scene exit phase');
  report.completed=true;
}

export function verifyTimeout(module,report,{progress=()=>{},onStep=()=>{}}={}) {
  const read=field=>module._portTournamentRead(field,0);
  report.completed=false;report.before=read(12);report.frames=0;
  while(!read(15)&&report.frames<28801){
    module._portStageProbePad(0,0,0,0);module._portStageProbePad(1,0,0,0);
    module._portTournamentStep();report.frames++;
    if(read(12)>=28440)onStep();
    if(report.frames%6000===0)progress();
  }
  report.after={frame:read(12),seconds:read(13),fraction:read(14),outcome:read(15)};
  if(report.after.frame!==28800||report.after.outcome!==1||report.after.seconds!==0||report.after.fraction!==59)throw Error('Original eight-minute timeout boundary');
  module._portTournamentStep();onStep();report.transition={phase:read(20),outcome:read(16)};
  if(report.transition.phase!==1||report.transition.outcome!==1)throw Error('Original timeout match-end transition');
  report.endFrames=0;
  while(read(20)!==3&&report.endFrames<600){module._portTournamentStep();report.endFrames++;onStep();}
  if(read(20)!==3||read(12)!==28800)throw Error('Original timeout exit and frozen clock');
  report.completed=true;
}
