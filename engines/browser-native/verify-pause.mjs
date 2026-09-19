import {createNativeCamera,checkNativeCamera} from './native-camera.mjs';
// Exercise original VS pause routines through controller input. No pause bits,
// player transforms, camera parameters or timer values are assigned by this test.
export function verifyNativePause(module,objects,report,{step,onStep=()=>{},cameraValidation={},readStage=null,platformMotion=false}){
  const require=(ok,message)=>{if(!ok)throw Error('Native pause: '+message);};
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  const pause=()=>Array.from({length:5},(_,i)=>module._portTournamentPauseRead(i));
  const clock=()=>[12,13,14].map(i=>module._portTournamentRead(i,0));
  const camera=createNativeCamera(module);
  const cameraState=()=>{const c=camera.snapshot();checkNativeCamera(c,cameraValidation);return Array.from(c.raw);};
  const neutral=[0,0,0,0,0,0,0],start=[0x1000,0,0,0,0,0,0];let phase='settle';
  Object.assign(report,{completed:false,frames:0,trace:[],cycles:[],retailParityVerified:false});
  objects.forEach((_,i)=>module._Player_80031848(i));
  function tick(samples=[neutral,neutral],snapshot){
    samples.forEach((s,i)=>module._portControllerSample(i,...s));step();report.frames++;
    const row={phase,states:read(),pause:pause(),clock:clock(),exit:module._portTournamentRead(25,0),outcome:module._portTournamentRead(16,0),snapshot,camera:cameraState(),stage:readStage?.()??null};report.trace.push(row);onStep(row);return row;
  }
  try{
  for(let i=0;i<120;i++)tick();
  require(pause()[0]===0&&pause()[4]===1,'initially unpaused with hidden native artwork');
  for(const slot of [0,1]){
    let movingStage=null;
    if(platformMotion){
      phase='wait for moving platform '+slot;let previous=readStage()[slot][0];
      for(let i=0;i<4500;i++){const row=tick(),height=row.stage[slot][0];if(Math.abs(height-previous)>.0001){movingStage={slot,before:previous,height,waitFrames:i+1};break;}previous=height;}
      require(movingStage!==null,'platform must be moving before pause');
    }
    phase='pause P'+(slot+1);const samples=[neutral,neutral];samples[slot]=start;
    const first=tick(samples,'pause'+slot);require(first.pause[0]===1&&first.pause[1]===slot&&first.pause[4]===0,'Start opens original pause for correct owner');
    const frozen={states:first.states,clock:first.clock,stage:first.stage};let frozenFrames=0;
    const assertFrozen=row=>{require(JSON.stringify(row.states)===JSON.stringify(frozen.states),'fighter state frozen');require(JSON.stringify(row.clock)===JSON.stringify(frozen.clock),'match timer frozen');require(row.pause[0]===1,'pause remains active');require(JSON.stringify(row.stage)===JSON.stringify(frozen.stage),'native stage state frozen');frozenFrames++;};
    // Original debounce, held Start, and a different controller cannot resume.
    for(let i=0;i<15;i++)assertFrozen(tick(samples));
    assertFrozen(tick());const other=[neutral,neutral];other[1-slot]=start;assertFrozen(tick(other));assertFrozen(tick());
    phase='paused camera P'+(slot+1);
    const rotate=[neutral,neutral];rotate[slot]=[0,.75,.5,0,0,0,0];for(let i=0;i<30;i++)assertFrozen(tick(rotate,i===29?'pausecamera'+slot:undefined));
    require(cameraState().some((v,i)=>Math.abs(v-first.camera[i])>.1),'native pause camera responds to stick');
    for(let i=0;i<10;i++)assertFrozen(tick());
    phase='resume P'+(slot+1);const resumed=tick(samples);
    require(resumed.pause[0]===0&&resumed.pause[4]===1,'owner Start hides original artwork and resumes');
    for(let i=0;i<20;i++)tick(undefined,i===19?'resume'+slot:undefined);require(clock()[0]>frozen.clock[0],'match clock resumes');
    if(platformMotion)require(Math.abs(readStage()[slot][0]-frozen.stage[slot][0])>.0001,'platform motion resumes');
    report.cycles.push({slot,movingStage,stageAfter:readStage?.()??null,frozenFrames,clockBefore:frozen.clock,clockAfter:clock()});
  }
  phase='LRAS no contest';let samples=[start,neutral];let row=tick(samples,'lras-pause');require(row.pause[0]===1&&row.pause[1]===0,'P1 opens pause before LRAS');
  for(let i=0;i<15;i++)tick(samples);tick();samples=[[0x1160,0,0,0,0,1,1],neutral];row=tick(samples,'lras-exit');
  require(row.exit===1&&row.outcome===7,'native LRAS requests a no-contest scene exit');module._portTournamentFinish();
  report.lras={outcome:module._portTournamentResultRead(0,0),winnerCount:module._portTournamentResultRead(2,0),sceneExit:row.exit,sceneState:module._portTournamentRead(20,0)};
  require(report.lras.outcome===7&&report.lras.winnerCount===2&&report.lras.sceneState===0,'native no-contest standings preserve the LRAS terminal state');
  report.completed=true;
  }finally{camera.dispose();}
}
