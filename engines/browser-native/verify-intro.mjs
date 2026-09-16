// Exercise the original Ready -> Go -> live callbacks and their simulation
// gates, including fighter entrance animations. Complete stage on-init remains
// separate integration work.
export function verifyIntro(module,report,{onStep=()=>{}}={}) {
  const read=(field,slot=0)=>module._portTournamentRead(field,slot);
  const require=(ok,message)=>{if(!ok)throw Error('Intro: '+message);};
  report.completed=false;report.frames=0;report.transitions=[];report.fighterStates=[[],[]];report.accessories=[[],[]];
  require(read(12)===0&&read(17)===0,'clock and HUD gate start closed');
  require(read(24)===1&&read(24,1)===1,'fighter input starts gated');
  module._portTournamentIntroBegin();
  let lastMask=-1;
  for(let frame=0;frame<600;frame++){
    const mask=read(23),gate=read(17),blocked=[read(24),read(24,1)];
    for(let slot=0;slot<2;slot++){
      const object=read(19,slot),state=module._portFighterConstructRead(object,0),accessory=module._portFighterAccessory(object,1);
      if(!report.fighterStates[slot].includes(state))report.fighterStates[slot].push(state);
      if(!report.accessories[slot].includes(accessory))report.accessories[slot].push(accessory);
    }
    if(mask!==lastMask){report.transitions.push({frame,mask,gate,blocked,clock:read(12)});lastMask=mask;}
    if(!gate)require(read(12)===0&&read(13)===480,'match clock stays at eight minutes through countdown');
    if(mask&8)require(blocked.every(x=>x===1),'input remains locked through Ready');
    if(mask&16)require(blocked.every(x=>x===0),'Ready completion releases fighter input');
    if(gate){require(mask===0&&blocked.every(x=>x===0),'Go completion opens HUD after removing animation');break;}
    for(let slot=0;slot<2;slot++)module._portStageProbePad(slot,frame<30?0x100:0,frame<30?1:0,0);
    module._portTournamentStep();report.frames++;
    for(let slot=0;slot<2;slot++)require(read(10,slot)===4,'countdown retains four stocks');
    onStep({frame:report.frames,mask:read(23)});
  }
  require(report.transitions.some(t=>t.mask===8)&&report.transitions.some(t=>t.mask===16)&&read(17)===1,'original Ready and Go complete');
  require(read(12)===0,'clock starts on next scene step');
  for(let slot=0;slot<2;slot++){
    require([322,323,324,14].every(s=>report.fighterStates[slot].includes(s)),'original Entry/EntryStart/EntryEnd/Wait states');
    require(report.accessories[slot].includes(2)&&module._portFighterAccessory(read(19,slot),1)===0,'native entrance accessory created and removed');
  }
  module._portTournamentStep();require(read(12)===1,'clock advances exactly once after Go');
  report.completed=true;
}
