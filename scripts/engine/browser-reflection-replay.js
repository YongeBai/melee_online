import {benchmarkPad} from './browser-benchmark-input.js';
// This compares gameplay observables, RNG and platform/camera state. Graphics
// state intentionally differs; do not label this full-machine equivalence.
export async function verifyFountainReflectionState(host,{frames=600,feature="reflection",onProgress=()=>{}}={}){
 if(!Number.isInteger(frames)||frames<120||frames>3600)throw Error('Expected 120–3600 replay frames');
 const staticBackground=feature==='staticbackground',stageBackground=feature==='stagebackground',yoshiWaves=feature==='yoshioffscreen',yoshi=feature==='yoshianimation'||stageBackground||yoshiWaves,stadium=feature==='stadiumscreen'||feature==='stadiumdecoration',stageName=staticBackground?'Battlefield':yoshi?'Yoshi':stadium?'Stadium':'Fountain';
 const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
 const inspect=()=>host.adapter.request('meleeControl',{action:staticBackground?'tournamentGameplayState':yoshi?'yoshiGameplayState':stadium?'stadiumGameplayState':'fountainReflectionState'});
 if(!['staticbackground','stagebackground','yoshioffscreen','reflection','scenery','modeldetail','animation','decorations','particles','stadiumscreen','stadiumdecoration','yoshianimation'].includes(feature))throw Error('Unknown cosmetic feature');
 const reflection=enabled=>host.adapter.request('meleeControl',{action:staticBackground?'staticBackgroundAnimation':stageBackground?'stageBackground':yoshiWaves?'yoshiOffscreenDecor':yoshi?'yoshiBackgroundAnimation':feature==='stadiumdecoration'?'stadiumDecoration':stadium?'stadiumScreen':feature==='particles'?'fountainParticles':feature==='decorations'?'fountainDecorations':feature==='animation'?'fountainAnimation':feature==='modeldetail'?'modelDetail':feature==='scenery'?'fountainScenery':'fountainReflection',enabled});
 const neutral=benchmarkPad(null),reference=[],inputs=[];let captured=false;
 const itemKinds=new Set();let randallMoved=false,initialRandall;
 try{
  await command('pause');await command('step');const start=await inspect();if(start.match?.stage!==(staticBackground?31:yoshi?8:stadium?3:2)||(!staticBackground&&(yoshi?start.platforms.length!==3:stadium?!start.platforms.some(p=>p.mapId===2):start.platforms.length!==2)))throw Error(stageName+' platform fixture not ready');
  if(!Array.isArray(start.fighters)||start.fighters.length!==2)throw Error('Two player slots are required');
  const expectedActors=start.fighters.reduce((n,f)=>n+(f.character===14?2:1),0);
  if(!Array.isArray(start.allActors)||start.allActors.length!==expectedActors)throw Error('All fighter/partner actors must be present at the checkpoint');
  if(yoshi){
   if(!Array.isArray(start.items)||![0,2,3].every(id=>start.platforms.some(p=>p.mapId===id)))throw Error('Yoshi stage and item probes are incomplete');
   initialRandall=JSON.stringify(start.platforms.find(p=>p.mapId===2));
  }
  const visible=await reflection(true);
  if(stageBackground){
   if(visible.objects?.length!==2||JSON.stringify(visible.objects.map(object=>object.mapId))!==JSON.stringify([1,2])||
      visible.objects.find(object=>object.mapId===2)?.preservedGameplay!=='Randall'||
      visible.writes?.length||visible.codeWrites?.length)
    throw Error('Yoshi stage background must preserve Randall and use only the decorative draw callback');
  }else if(yoshiWaves){
   if(visible.objects?.length!==1||visible.objects[0].mapId!==3||
      visible.objects[0].groups!==7||visible.objects[0].draws?.length!==14||visible.writes?.length)
    throw Error('Yoshi wave replay must retain the checked Shy Guy stage object');
  }else if(visible.objects.length!==1)throw Error('Cosmetic object was not identified');
  await command('capture',{slot:5});captured=true;
  for(const enabled of[true,false]){
   await command('restore',{slot:5});await reflection(enabled);let previous=await inspect();
   for(let frame=0;frame<frames;frame++){
    if(frame%30===0)onProgress(stageName+' '+feature+' '+(enabled?'reference':'disabled')+' replay '+frame+'/'+frames+'…');
    const pads=enabled?[benchmarkPad(previous),neutral]:inputs[frame];if(enabled)inputs.push(pads);
    await command('pads',{pads,frame:previous.sceneFrame});await command('step');const state=await inspect();
    if(yoshi&&enabled){for(const item of state.items)itemKinds.add(item.kind);randallMoved ||= JSON.stringify(state.platforms.find(p=>p.mapId===2))!==initialRandall;}
    const observed={sceneFrame:state.sceneFrame,randomSeed:state.randomSeed,match:state.match,fighters:state.fighters,allActors:state.allActors,camera:state.camera,platforms:state.platforms,...(yoshi?{items:state.items}:{})};
    if(enabled)reference.push(observed);else if(JSON.stringify(reference[frame])!==JSON.stringify(observed))return {passed:false,kind:stageName.toLowerCase()+'-gameplay-observable-comparison',feature,fullMachineEquivalence:false,framesCompared:frame,mismatch:{frame,reference:reference[frame],disabled:observed}};
    previous=state;
   }
  }
  if(yoshi&&!randallMoved)throw Error("Randall did not move during the replay");
  return {...(yoshi?{randallMoved,observedItemKinds:[...itemKinds]}:{}),passed:true,kind:stageName.toLowerCase()+'-gameplay-observable-comparison',feature,fullMachineEquivalence:false,framesCompared:frames,initialActorCount:expectedActors,checked:['all fighter actors including partners: action, facing, damage and motion state','player slots: positions, actions, stocks, damage','match settings and timers','RNG seed',yoshi?'Randall and main-stage/Shy Guy transforms, timers, item actors and projectiles':stadium?'stage transformation state and stage joint transforms':'moving platform state and positions','native camera transform and settings']};
 }finally{
  await command('pause');try{if(captured){await command('restore',{slot:5});await reflection(true);}await command('clear');}finally{await host.adapter.request('start',{});}
 }
}
