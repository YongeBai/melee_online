import {verifyIllusionAttachments} from './verify-articles.mjs';
import {readNativeResults} from './native-results.mjs';
import {convertPeachCommonItems} from './common-item-assets.mjs';
import {verifyPeachMoves,verifyPeachPulls,verifyPeachContact} from './verify-peach.mjs';
import {verifyKirbyMoves,verifyKirbyCopy} from './verify-kirby.mjs';
import {verifyClimberMoves} from './verify-climbers.mjs';
import create from './melee-fighter-init.mjs';
import {shaderIdentityFiles,validateShaderCatalog} from './shader-catalog.mjs';
import {archiveRootView,inspectArchive} from './archive.mjs';
import {initializeStageArchive} from './stage-archive.mjs';
import {verifyNativeProjection} from './native-camera.mjs';
import {combatWorkload,verifyCombatWorkload} from './combat-workload.mjs';
import {convertPauseModels} from './pause-assets.mjs';
import {verifyNativePause} from './verify-pause.mjs';
import {verifyControllerInput} from './verify-controller.mjs';
import {startNativeLive} from './native-live.mjs';
import {observeCanvasFrames} from './frame-evidence.mjs';
import {createNativeProductRollback} from './native-product-rollback.mjs';
import {createPresentationCache} from './presentation-cache.mjs';
import {createNativeMatchPreview} from './native-match-preview.mjs';
import {verifyMatch,verifyTimeout} from './verify-match.mjs';
import {verifyIntro} from './verify-intro.mjs';
import {verifySeakZeldaMoves,verifySeakZeldaContact} from './verify-seak-zelda.mjs';
import {verifyTransform} from './verify-transform.mjs';
import {verifyAbsorption} from './verify-absorption.mjs';
import {verifyMarioFamilyMoves} from './verify-mario-family.mjs';
import {verifyNessMoves,verifyNessContact} from './verify-ness.mjs';
import {verifyGamewatchMoves,verifyGamewatchContact} from './verify-gamewatch.mjs';
import {verifyMewtwoMoves,verifyMewtwoContact} from './verify-mewtwo.mjs';
import {verifyYoshiMoves,verifyYoshiContact} from './verify-yoshi.mjs';
import {verifyLinkMoves,verifyLinkContact} from './verify-link.mjs';
import {verifyKoopaMoves,verifyKoopaContact} from './verify-koopa.mjs';
import {verifySamusMoves,verifySamusContact} from './verify-samus.mjs';
import {verifyPikachuMoves} from './verify-pikachu.mjs';
import {verifyPurinMoves,verifyPurinContact} from './verify-purin.mjs';
import {verifyCombat} from './verify-combat.mjs';
import {convertPlayerParameters} from './player-parameters.mjs';
import {convertStatusModels,verifyHudIconSelector} from './status-assets.mjs';
import {verifyResidentEffectBank} from './verify-effects.mjs';
import {verifyStartup} from './verify-startup.mjs';
import {convertStoryItem} from './stage-item-assets.mjs';
import {convertItemRuntime} from './item-runtime-assets.mjs';
import {verifyColors} from './verify-colors.mjs';
import {convertFighterArticles,fighterArticleProfiles} from './article-assets.mjs';
import {convertKirbyCopy} from './kirby-copy-assets.mjs';
import {convertCostume,nativeKirbyCostumeSpec} from './costume-assets.mjs';
import {convertKirbyCopyEffects} from './effect-assets.mjs';
import {loadFighterPackage} from './fighter-package.mjs';
import {fighterArchives} from './fighter-assets.mjs';
import {motionSpec} from './motion-spec.mjs';
import {attributeSpec} from './attribute-spec.mjs';
import {convertCommonEffects,convertStageParticles} from './effect-assets.mjs';
import {convertStageMap,nativeStages} from './stage-map-assets.mjs';
import {convertStageCollision} from './stage-collision.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
import {convertSharedParameters} from './shared-assets.mjs';
import {sharedSpec} from './shared-spec.mjs';

// Shared construction path for diagnostics and same-runtime native menu startup.
export async function runNativeConstructor(options={}) {
const diagnostics=[],report={constructorAttempted:false,constructorCompleted:false,playable:false,performanceMeasured:false};let rollbackPresentationCache=null;
const params=new URLSearchParams(options.params??location.search),menuHandoff=options.menuHandoff===true;
if(menuHandoff){
  if(!options.module||!options.canvas)throw Error('Native menu handoff requires the existing runtime and canvas');
  const m=options.module,map=Object.entries(nativeStages).find(([,s])=>s.kind===m._portMenuMatchRead(4,0));
  if(!map)throw Error('Selected stage is outside the tournament set');
  for(const name of ['tournament','hud','damagehud','intro','stagecallbacks','live'])params.set(name,'1');
  params.set('map',map[0]);params.set('character',motionSpec.codes[m._portMenuMatchRead(10,0)]);params.set('opponent',motionSpec.codes[m._portMenuMatchRead(10,1)]);
  // Retain the measured Fountain profile: cosmetic stars/scenery and the
  // unfinished reflection capture are omitted; platform simulation is original.
  if(map[0]==='fountain'){params.set('fountaincosmetics','off');params.set('fountainscenery','off');}
  params.set('costume',m._portMenuMatchRead(1,0));params.set('opponentcostume',m._portMenuMatchRead(1,1));
  report.menuHandoff={sameRuntime:true,selectedStage:m._portMenuMatchRead(4,0),characters:[0,1].map(p=>m._portMenuMatchRead(0,p)),costumes:[0,1].map(p=>m._portMenuMatchRead(1,p))};
}
const tournament=params.has('tournament')||params.has('hud')||params.has('damagehud'),live=params.has('live'),renderSteps=params.has('rendersteps'),render=live||params.has('render'),previewActors=[];
const stageKey=params.get('map')??'battlefield',stageSpec=nativeStages[stageKey];
if(!stageSpec)throw Error('Unknown native stage');
const stadiumFireworksOff=params.get('stadiumfireworks')==='off';
if(stadiumFireworksOff&&stageKey!=='stadium')throw Error('Stadium fireworks profile requires Stadium');
if(stadiumFireworksOff)report.stageCosmetics={fireworks:false,originalSimulation:true};
const fountainCosmeticsOff=params.get('fountaincosmetics')==='off',fountainSceneryOff=params.get('fountainscenery')==='off';
if(fountainSceneryOff&&!fountainCosmeticsOff)throw Error('Fountain scenery reduction requires its cosmetic profile');
if(fountainCosmeticsOff&&stageKey!=='fountain')throw Error('Fountain cosmetic profile requires Fountain');
if(fountainCosmeticsOff)report.stageCosmetics={stars:false,scenery:!fountainSceneryOff,reflection:'constant black',originalSimulation:true};
const code=params.get('character')??'Ca',character=fighterArchives[code],kind=motionSpec.codes.indexOf(code);
if(!character||kind<0)throw Error('Unknown fighter component');
const opponentCode=params.get('opponent')??code,opponentCharacter=fighterArchives[opponentCode],opponentKind=motionSpec.codes.indexOf(opponentCode);
if(!opponentCharacter||opponentKind<0)throw Error('Unknown opponent component');
const withStage=tournament||live||params.has('stage'),combat=tournament||live||params.has('combat')||params.has('projectilecombat')||params.has('purincontact')||params.has('samuscontact')||params.has('koopacontact')||params.has('linkcontact')||params.has('yoshicontact')||params.has('mewtwocontact');
if(opponentCode!==code&&!combat)throw Error('Mixed fighters require a two-fighter scene');
report.opponentCharacter={code:opponentCode,name:opponentCharacter,kind:opponentKind};
report.character={code,name:character,kind};
const costumeIndex=Number(params.get('costume')??0),opponentCostumeIndex=Number(params.get('opponentcostume')??0);
if([costumeIndex,opponentCostumeIndex].some(v=>!Number.isInteger(v)||v<0||v>5))throw Error('Invalid selected costume');
if((costumeIndex||opponentCostumeIndex)&&!tournament)throw Error('Selected costumes require tournament setup');
report.selectedCostumes=[costumeIndex,opponentCostumeIndex];
const intro=params.has('intro'),damageHud=params.has('damagehud'),withHud=tournament&&(damageHud||params.has('hud')); let hudPreview=null;
const stageCallbacks=params.has('stagecallbacks'),stageOnly=params.has('stageonly');
const stageFrames=Number(params.get('stageframes')??4500);
if(!Number.isInteger(stageFrames)||stageFrames<4500||stageFrames>27000||stageOnly&&!stageCallbacks)throw Error('Invalid stage callback probe');
const cameraValidation=stageCallbacks&&stageKey==='destination'?{clipPlanes:[1,30000]}:{};let dynamicStage=null,stageItemModels=null;
if(intro&&!withHud)throw Error('Intro requires native HUD');
if(stageCallbacks&&!intro)throw Error('Stage callback integration requires the intro probe');
const capture=line=>{diagnostics.push(String(line));if(diagnostics.length>64)diagnostics.shift();console.log(String(line));};
try {
  async function asset(name){const r=await fetch('./fixtures/'+name);if(!r.ok)throw Error('Hosted asset unavailable: '+name);return new Uint8Array(await r.arrayBuffer());}
  const modelNames=menuHandoff?[]:await (await fetch('./model-fixtures.json')).json();
  const [gameModule,common,models]=await Promise.all([options.module??create({print:capture,printErr:capture}),asset('PlCo.dat'),Promise.all(modelNames.map(async name=>({name,bytes:await asset(name)})))]);
  let module=gameModule;
  if(render)report.projectionChecks=verifyNativeProjection(module);
  if(menuHandoff){installResidentFile(module,'PlCo.dat',convertSharedParameters(common,sharedSpec).image);if(module._portFighterInitialize()!==0)throw Error('Original fighter startup after menus failed');report.menuHandoff.startupPassed=true;}
  else report.startupPassed=verifyStartup(module,common,models).passed;
  for(let byte=0;byte<256;byte++)if(module._portPackedFlagBits(byte)!==byte)throw Error('Packed game flag byte changed');
  report.packedFlagCases=256;
  let peachCommon=null;
  if([code,opponentCode].some(c=>fighterArticleProfiles[c])||stageKey==='story') {
    const data=convertItemRuntime(await asset('ItCo.usd'));installResidentFile(module,'NativeItemRuntime.dat',data.image);
    const items=openResidentArchive(module,'NativeItemRuntime.dat',['native_item_common','native_item_parameters']);
    const colors=openResidentArchive(module,'NativeItemRuntime.dat',['native_item_colors']);
    module._portItemsInitialize(...items.addresses,colors.addresses[0]);report.items={initialized:true,colorCommands:data.scripts.commands.size};
    report.items.colors=verifyColors(module,{archive:data.archive,colors:{tables:[data.colorTable],scripts:data.scripts}},()=>colors.addresses[0]);
  }
  if([code,opponentCode].includes('Pe')){
    const source=convertPeachCommonItems(await asset('ItCo.usd'));installResidentFile(module,'NativePeachCommon.dat',source.image);
    const file=openResidentArchive(module,'NativePeachCommon.dat',['native_common_article_6']),base=file.addresses[0]-source.rows[0].article;
    source.rows.forEach(row=>module._portCommonItemInstall(base+row.article,row.kind));
    peachCommon={source,base};
    report.items.peachCommon=source.rows.map(r=>({kind:r.kind,stateCount:r.stateCount}));
  }
  const view=()=>new DataView(module.HEAPU8.buffer),ptr=at=>view().getUint32(at,true);
  const effectFiles=new Map(),packageOptions={asset,models,motionSpec,attributeSpec,effectFiles};
  const packageCodes=[...new Set([code,opponentCode,...[code,opponentCode].flatMap(c=>c==='Pp'?['Nn']:c==='Nn'?['Pp']:c==='Sk'?['Zd']:c==='Zd'?['Sk']:[])])],packages=[];
  const family=c=>['Sk','Zd'].includes(c)?'Zelda':['Pp','Nn'].includes(c)?'Climbers':c;
  for(const selected of packageCodes){
    const costumeIndices=[[code,costumeIndex],[opponentCode,opponentCostumeIndex]].filter(([c])=>family(c)===family(selected)).map(([,index])=>index);
    packages.push(await loadFighterPackage(module,selected,{...packageOptions,costumeIndices}));
  }
  const kirbyCopies=[];
  if(packageCodes.includes('Kb'))for(const selected of packages.filter(p=>['Mr','Lg','Dr','Ca','Gn','Ns','Pe','Fx','Pk','Pc','Lk','Cl','Ss','Fc','Dk','Ms','Fe','Zd','Sk','Kp','Pp','Mt','Pr','Gw','Ys'].includes(p.code))){
    const copyName='PlKbCp'+selected.code+'.dat',bytes=await asset(copyName),source=convertKirbyCopy(bytes,selected.code);installResidentFile(module,copyName,source.image);
    const effectName='EfKb'+(selected.code==='Pp'?'Ic':selected.code==='Sk'?'Zd':selected.code==='Fc'?'Fx':selected.code==='Dr'?'Mr':selected.code==='Pc'?'Pk':selected.code)+'.dat';
    // These copies use common/original effects without a separate copy file.
    if(!['Ns','Pe','Lk','Cl','Mt','Pr','Gw','Ys'].includes(selected.code)&&!effectFiles.has(effectName)){const effectBytes=await asset(effectName),effectSource=convertKirbyCopyEffects(effectBytes,selected.code);installResidentFile(module,effectName,effectSource.image);effectFiles.set(effectName,{bytes:effectBytes,source:effectSource});}
    const bodyCostumes=new Map(),installedBodies=new Map();
    if(source.bodyCopy)for(const index of packages.find(p=>p.code==='Kb').selectedCostumes.keys()){
      const spec=nativeKirbyCostumeSpec(module,selected.kind,index);let body=installedBodies.get(spec.name);
      if(!body){const bytes=await asset(spec.name),converted=convertCostume(bytes);if(converted.model.tree.name!==spec.joint||(converted.animation?.name??null)!==spec.animation)throw Error('Kirby copy costume symbols differ from original table');installResidentFile(module,spec.name,converted.image);body={name:spec.name,bytes,converted};installedBodies.set(spec.name,body);}
      bodyCostumes.set(index,{...body,index});
    }
    kirbyCopies.push({bodyCostumes,code:selected.code,kind:selected.kind,bytes:source.bytes,source,effects:effectFiles.get(effectName)?.source});
  }
  const primary=packages.find(p=>p.code===code),secondary=packages.find(p=>p.code===opponentCode),baseBytes=primary.baseBytes;
  report.baseArchive=primary.baseArchive;report.opponentBaseArchive=secondary.baseArchive;
  report.residentFighters=packages.map(p=>({code:p.code,kind:p.kind,effectName:p.effectName,costumes:[...p.selectedCostumes.keys()]}));
  module._portMatchCameraInitialize();report.dynamics={initialPool:module._portDynamicsInitialize()};if(report.dynamics.initialPool!==320)throw Error('Original dynamics pool initialization');module._portEffectsInitialize();
  const commonEffectBytes=await asset('EfCoData.dat'),effects=convertCommonEffects(commonEffectBytes);
  installResidentFile(module,'EfCoData.dat',effects.image);
  const effectData=module._portCommonEffectsLoad();
  if(!effectData)throw Error('Original common effect-bank loader failed');
  report.commonEffects=verifyResidentEffectBank(module,effects,effectData);
  if(tournament){
    installResidentFile(module,'PdPm.dat',convertPlayerParameters(await asset('PdPm.dat')).image);
    const hudBytes=await asset('IfAll.usd'),status=convertStatusModels(hudBytes,{hud:withHud,damage:damageHud});
    installResidentFile(module,'NativeStatus.dat',status.image);
    const statusFile=openResidentArchive(module,'NativeStatus.dat',['ScInfCnt_scene_models',...(withHud?['ScInfDmg_scene_data']:[])]);
    module._portTournamentStatusInstall(statusFile.archive);report.statusModels=status.models;
    if(menuHandoff){if(options.browserInput&&!options.network?.active)options.browserInput.samples(2).forEach((sample,p)=>module._portControllerSample(p,...sample));module._portTournamentInitializeMenu();}else module._portTournamentInitializeCostumes(kind,opponentKind,stageSpec.kind,costumeIndex,opponentCostumeIndex);report.rules=Array.from({length:12},(_,i)=>module._portTournamentRead(i,0));
    if(withHud){
      report.iconSelectorChecks=verifyHudIconSelector(module);
      module._portTournamentHudInitialize(statusFile.addresses[1]);
      const archive=inspectArchive(hudBytes),base=statusFile.addresses[1]-archive.publics.get('ScInfDmg_scene_data');
      hudPreview={models:new Map([...status.models,...status.hudModels].map((model,i)=>[base+model.joint,{name:model.kind??'status '+i,bytes:archiveRootView(archive,'hud_Share_joint',model.joint)}]))};
      report.hud={models:status.hudModels,camera:status.camera};
      const pauseBytes=await asset('GmPause.usd'),pause=convertPauseModels(pauseBytes);
      installResidentFile(module,'GmPause.usd',pause.image);
      const pauseDescriptor=module._portTournamentPauseInitialize();
      hudPreview.models.set(pauseDescriptor,{name:'native pause',bytes:archiveRootView(inspectArchive(pauseBytes),'pause_Share_joint',pause.joint)});
      report.pauseAsset={nodes:pause.nodes,meshes:pause.meshes,materialAnimations:pause.materialAnimations};
    }
  }
  else {module._portMatchPlayerInitialize();module._portFighterPlayerConfigure(0,0,0,0,0,1,0);}

  if(combat&&!tournament){if(module._portProbeRulesInitialize()!==1)throw Error('Original default damage ratio');module._portFighterPlayerConfigure(1,1,0,1,1,1,0);}
  if(withStage){
    const rawStageBytes=await asset(stageSpec.file),stageBytes=initializeStageArchive(rawStageBytes,stageKey),map=convertStageMap(stageBytes,{stage:stageKey,callbacks:stageCallbacks});
    for(let byte=0;byte<256;byte++)if(module._portStageShadowBits(byte)!==(byte>>>7))throw Error('Stage shadow MSB layout');
    for(const rate of [0,0.25,1,2])for(const flags of [0,0x20000000,0x40000000,0xffffffff])if(module._portStageAnimationProbe(rate,flags)!==1)throw Error('Stage animation callback ABI');
    installResidentFile(module,'NativeStageMap.dat',map.image);
    const stageFile=openResidentArchive(module,'NativeStageMap.dat',['native_stage_map','native_stage_parameters']);
    module._portStageMapInstallKind(stageFile.archive,...stageFile.addresses,stageSpec.kind);
    const particles=convertStageParticles(stageBytes,stageKey);
    installResidentFile(module,'NativeStageParticles.dat',particles.image);
    const particleFile=openResidentArchive(module,'NativeStageParticles.dat',['native_stage_particles','native_stage_particle_textures']);
    if(module._portStageParticlesInstall(...particleFile.addresses)!==particles.count)throw Error('Original stage particle bank registration');
    report.stageParticles={bank:particles.bank,...verifyResidentEffectBank(module,particles,particleFile.addresses[0])};
    const collision=convertStageCollision(stageBytes);
    installResidentFile(module,'NativeStageCollision.dat',collision.image);
    const collisionFile=openResidentArchive(module,'NativeStageCollision.dat',['coll_data']);
    module._portStageMapCollisionLoad(collisionFile.addresses[0]);
    const cd=new DataView(collision.image.buffer,32),verts=cd.getUint32(0,true),count=cd.getUint32(4,true),scale=view().getFloat32(stageFile.addresses[1],true);
    if(module._portStageMapCollisionRead(0,0)!==count)throw Error('Stage collision vertex count');
    for(let i=0;i<count;i++)for(let axis=0;axis<2;axis++)if(module._portStageMapCollisionRead(1+axis,i)!==Math.fround(cd.getFloat32(verts+i*8+axis*4,true)*scale))throw Error('Stage collision world vertex');
    if(stageKey==='story'){
      const data=convertStoryItem(stageBytes);installResidentFile(module,'NativeStoryItem.dat',data.image);
      const file=openResidentArchive(module,'NativeStoryItem.dat',['native_story_article']),base=file.addresses[0]-data.article;
      const image=new DataView(data.image.buffer),size=image.getUint32(4,true),relocations=new Set(Array.from({length:image.getUint32(8,true)},(_,i)=>image.getUint32(32+size+i*4,true)));let checks=0;
      for(let at=0;at<size;){checks++;if(relocations.has(at)){if(ptr(base+at)!==base+image.getUint32(32+at,true))throw Error('Story item relocation mismatch');at+=4;}else{if(module.HEAPU8[base+at]!==data.image[32+at])throw Error('Story item payload mismatch');at++;}}
      module._portStoryItemInstall(file.addresses[0]);stageItemModels=new Map([[base+data.model.joint,{name:'Shy Guy',bytes:archiveRootView(inspectArchive(data.source),'item_Share_joint',data.model.joint)}]]);
      report.stageItem={passed:true,checks,relocations:relocations.size,kind:data.kind,states:data.stateCount,joints:data.model.boneCount,meshes:data.model.scene.model.meshes.length,initialized:true};
    }
    if(stageCallbacks){const callbacks=openResidentArchive(module,'NativeStageMap.dat',['native_stage_callbacks']);module._portStageCallbacksInitialize(callbacks.addresses[0]);}
    if(stadiumFireworksOff){if(!stageCallbacks)throw Error('Stadium fireworks profile requires callbacks');module._portStadiumFireworksOff();}
    if(fountainCosmeticsOff){if(!stageCallbacks)throw Error('Fountain cosmetic profile requires callbacks');module._portFountainReflectionOff();}
    for(const id of stageSpec.initial) {
      const object=stageCallbacks?module._portStageObject(id):module._portStageMapCreate(id);
      if(render&&!stageCallbacks)previewActors.push({name:stageSpec.name+' group '+id,object,extraRoot:1,bytes:archiveRootView(inspectArchive(stageBytes),'stage_Share_joint',new DataView(map.image.buffer,32).getUint32(map.table+id*52,true))});
    }
    if(stageCallbacks&&render){
      const sources=Array.from({length:stageSpec.count},(_,id)=>archiveRootView(inspectArchive(stageBytes),'stage_Share_joint',new DataView(map.image.buffer,32).getUint32(map.table+id*52,true)));
      for(const extra of map.extraModels)sources.push(archiveRootView(inspectArchive(stageBytes),'stage_Share_joint',extra.root));
      const stageObjects=module._malloc(512*8);if(!stageObjects)throw Error('Stage object list allocation');
      dynamicStage=()=>{
        const count=module._portStageObjects(stageObjects,512),rows=new Uint32Array(module.HEAPU8.buffer,stageObjects,count*2);
        return Array.from({length:count},(_,i)=>{const object=rows[i*2],id=rows[i*2+1];return {name:stageSpec.name+' group '+id,object,extraRoot:1,bytes:sources[id],cosmeticHidden:fountainCosmeticsOff&&(id===stageSpec.count||fountainSceneryOff&&id===1),emptyStageObject:id>=sources.length};});
      };
    }
    if(stageCallbacks&&stageKey==='fountain'){
      const list=module._malloc(512*8);if(!list)throw Error('Stage owner allocation');
      try{const count=module._portStageObjects(list,512),rows=new Uint32Array(module.HEAPU8.buffer,list,count*2);const groups=Array.from({length:count},(_,i)=>rows[i*2+1]);
        if(count!==7||groups.filter(x=>x===4).length!==2||groups.filter(x=>x===5).length!==1)throw Error('Fountain original platform/star ownership');
        report.fountainOwners=groups;
      }finally{module._free(list);}
    }
    module._portStageMapBounds();module._portStageMapSpawn(0);
    if(render)module._portStageRenderInitialize();
    report.stage={name:stageSpec.name,kind:stageSpec.kind,collisionLoaded:true,vertexChecks:count*2,modelGroups:stageSpec.initial,splineCount:map.splineCount,shadowCount:map.shadowCount,shadowFlagCases:256,animationCallbackCases:16,completeStageStartup:false};
    if(stageCallbacks){report.stage.originalCallbacks=stageKey!=='stadium';if(stageKey==='stadium')report.stage.callbackProfile='Original terrain/particles; frozen transformations and static background screen';}
  }
  report.constructorAttempted=true;
  console.log('NATIVE_CONSTRUCTOR_START '+JSON.stringify(report));
  let object=menuHandoff?module._portTournamentConstructSelected(0):module._portFighterConstruct(kind,0);
  if(!object)throw Error('Original constructor returned no fighter');
  report.constructorCompleted=true;report.object=object;
  report.fighterEffects=primary.effect?verifyResidentEffectBank(module,primary.effect.source,module._portEffectsBankData(primary.effect.source.bank)):{commonOnly:true};
  const state=()=>Array.from({length:13},(_,i)=>module._portFighterConstructRead(object,i));
  report.state=state();
  if(!report.state.every(Number.isFinite)||!report.state[7]||!report.state[8]||report.state[9]!==15||report.state[10]!==1||report.state[11]!==(menuHandoff?module._portMenuMatchRead(10,0):kind)||report.state[12]!==0)throw Error('Constructed fighter state/ownership invariant');
  report.fighterShadows=[module._portFighterConstructRead(object,19)];
  if(!report.fighterShadows[0])throw Error('Original fighter shadow allocation failed');
  report.constructorVerified=true;
  let opponent=0;
  const combatState=o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i));
  if(combat){
    module._portStageMapSpawn(1);opponent=menuHandoff?module._portTournamentConstructSelected(1):module._portFighterConstruct(opponentKind,1);
    if(!opponent||opponent===object)throw Error('Second original constructor failed');
    report.fighterShadows.push(module._portFighterConstructRead(opponent,19));
    if(!report.fighterShadows[1]||report.fighterShadows[1]===report.fighterShadows[0])throw Error('Independent fighter shadow ownership');
    const a=combatState(object),b=combatState(opponent);
    if(b[9]!==15||b[10]!==1||b[11]!==(menuHandoff?module._portMenuMatchRead(10,1):opponentKind)||b[12]!==1||(a[8]===b[8])!==(a[11]===b[11])||a[7]===b[7])throw Error('Fighter kind/archive/independent ownership');
    report.opponentEffects=secondary.effect?verifyResidentEffectBank(module,secondary.effect.source,module._portEffectsBankData(secondary.effect.source.bank)):{commonOnly:true};
    report.combat={completed:false,initial:[a,b],frames:0};
  }
  for(const copy of kirbyCopies){for(const index of packages.find(p=>p.code==='Kb').selectedCostumes.keys()){module._ftKb_SpecialN_800EED50(copy.kind,index);const body=copy.bodyCostumes.get(index);if(body){const root=module._portKirbyCostumeRootAt(copy.kind,index);if(!root)throw Error('Missing copy body costume');body.base=root-body.converted.rootOffset;}}copy.root=module._portKirbyCopyRoot(copy.kind);if(!copy.root)throw Error('Original Kirby copy loader failed');copy.base=copy.root-copy.source.root;if(copy.effects)copy.effectChecks=verifyResidentEffectBank(module,copy.effects,module._portEffectsBankData(copy.effects.bank));}
  report.kirbyCopies=kirbyCopies.map(c=>({code:c.code,root:c.root,bodyCopy:c.source.bodyCopy,costumes:[...c.bodyCostumes.values()].map(b=>({index:b.index,name:b.name,nodes:b.converted.model.tree.nodes.length})),hatNodes:c.source.scene?.model.tree.nodes.length??0,hatMeshes:c.source.scene?.model.meshes.length??0,accessoryMeshes:c.source.accessory?.scene.model.meshes.length,dynamicBoneChains:c.source.dynamics.length,articles:c.source.articles.rows.length,effects:c.effectChecks}));
  const fighterOwners=[0,...(combat?[1]:[])].flatMap(slot=>[0,1].flatMap(index=>{const owner=module._Player_GetEntityAtIndex(slot,index);if(!owner)return [];const source=packages.find(p=>p.kind===combatState(owner)[11]);if(!source)throw Error('Missing native fighter form package');const costumeId=module._portFighterConstructRead(owner,35),selected=source.selectedCostumes.get(costumeId);if(!selected)throw Error('Missing constructed costume '+source.code+' '+costumeId);const pkg={...source,costume:selected.costume,modelBytes:selected.bytes};return [{slot,index,owner,pkg}];}));
  report.dynamics.fighters=fighterOwners.map(({owner,pkg})=>{
    const expected=pkg.source.dynamics.rows.slice(0,pkg.source.dynamics.count).map(r=>r.count),count=module._portDynamicsRead(owner,0,0);
    const nodes=Array.from({length:count},(_,i)=>module._portDynamicsRead(owner,i,2));
    if(count!==expected.length||JSON.stringify(nodes)!==JSON.stringify(expected))throw Error('Original live dynamics chain mismatch '+pkg.code+': '+JSON.stringify({expected,nodes}));
    return {code:pkg.code,owner,chains:count,nodes};
  });report.dynamics.freeAfterFighters=module._portDynamicsPoolFree();
  report.fighterForms=fighterOwners.map(({slot,index,owner,pkg})=>({slot,index,owner,code:pkg.code,costume:pkg.costume.index}));
  if(render||params.has('camera')){module._portStageCameraStart();report.cameraStarted=true;}
  if(tournament||live||params.has('step')){
    report.schedulerContext=tournament?'Original VS rules/controller: four stocks, eight minutes, no items, '+character+' versus '+opponentCharacter+' and partial '+stageSpec.name+' startup. Audio, menus and full scene ownership remain incomplete.':combat?stageSpec.name+' geometry/collision, default rules, two player-owned fighters and scripted normalized combat input.':withStage?stageSpec.name+' geometry/collision and source spawn without complete match startup.':'Isolated constructor without a match.';
    report.schedulerSteps=0;console.log('NATIVE_CONSTRUCTOR_START '+JSON.stringify(report));
    for(let i=0;i<(intro?0:120);i++){module._portRuntimeStep();report.schedulerSteps++;}
    report.afterSteps=state();
    if(!report.afterSteps.every(Number.isFinite)||report.afterSteps[9]!==15||report.afterSteps[10]!==1)throw Error('Scheduled fighter state/ownership invariant');
    if(withStage&&!intro&&(report.afterSteps[0]!==14||report.afterSteps[3]!==0))throw Error('Fighter did not land into Wait on '+stageSpec.name);
    if(damageHud){module._portTournamentDamageInitialize();report.hud.damage=true;}
    if(tournament&&!intro){module._portTournamentBegin();module._portTournamentStep();report.match=Array.from({length:23},(_,i)=>module._portTournamentRead(i,0));}
    const step=()=>{tournament?module._portTournamentStep():module._portRuntimeStep();if([code,opponentCode].some(c=>c==='Sk'||c==='Zd')){object=module._Player_GetEntity(0);if(opponent)opponent=module._Player_GetEntity(1);}};
    let preview,canvas,previewFactory;
    const saveShaders=()=>{report.shaderCoverage=preview?.shaderCoverage();if(params.has('recordshaders'))globalThis.nativeShaderSources=preview.shaderSources();};
    function recordHud(drawn){
      if(drawn.materialDraws?.afterimageDraws){
        const stats=report.afterimages??={frames:0,draws:0,vertices:0};stats.frames++;stats.draws+=drawn.materialDraws.afterimageDraws;stats.vertices+=drawn.materialDraws.afterimageVertices;
        if(!report.preview.afterimage){report.preview.afterimage=drawn;const img=document.createElement('img');img.id='native-preview-afterimage';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
      }
      if(drawn.materialDraws?.particleDraws&&!report.preview.particles){
        report.preview.particles=drawn;
        const img=document.createElement('img');img.id='native-preview-particles';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
      }
      if(!drawn.hud)return;
      report.hud.drawnFrames=(report.hud.drawnFrames??0)+1;
      if(damageHud){
        report.hud.stockDrawCounts??=[];
        for(const row of drawn.hud.objects)if(row.name==='Stc_scemdls'&&!report.hud.stockDrawCounts.includes(row.draws))report.hud.stockDrawCounts.push(row.draws);
      }
      if(drawn.hud.objects.some(o=>o.name==='tdsce')){
        report.hud.countdownFrames=(report.hud.countdownFrames??0)+1;
        if(report.hud.countdownFrames===30){const img=document.createElement('img');img.id='native-preview-countdown';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);report.preview.countdown=drawn;}
      }
      if(drawn.hud.objects.some(o=>o.name.startsWith('status ')&&o.draws)){
        report.hud.statusFrames=(report.hud.statusFrames??0)+1;
        if(report.hud.statusFrames===30){const img=document.createElement('img');img.id='native-preview-status';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);report.preview.status=drawn;}
      }
    }
    if(render) {
      const sharedArchive=inspectArchive(common),sharedRoot=sharedArchive.publics.get('ftLoadCommonData');
      const accessoryModels=new Map([[1,sharedArchive.data.getUint32(sharedArchive.data.getUint32(sharedRoot+8*4))],[2,sharedArchive.data.getUint32(sharedRoot+16*4)]].map(([kind,root])=>[kind,archiveRootView(sharedArchive,'accessory_Share_joint',root)]));
      function collectFighterCostume(owner,pkg,target,nodes){
        const {partCount,costume}=pkg;
        // Original OnLoad inserts an extra nonvisual part into Link's skeleton.
        // Bone-array indices therefore differ from costume traversal indices.
        const byDescriptor=new Map();
        for(let part=0;part<partCount;part++){
          const joint=module._portCollisionPartRead(owner,part,0);if(!joint)continue;
          const descriptor=module._portCollisionPartRead(owner,part,11);
          if(byDescriptor.has(descriptor))throw Error('Duplicate fighter part descriptor');byDescriptor.set(descriptor,joint);
        }
        module.__dirtyMark?.(target,nodes.length*4);const pointers=new Uint32Array(module.HEAPU8.buffer,target,nodes.length),base=costume.root-costume.rootOffset;
        for(const [i,node]of nodes.entries()){
          const descriptor=base+node.offset,joint=byDescriptor.get(descriptor);if(!joint)throw Error('Missing fighter costume part '+i);
          pointers[i]=joint;byDescriptor.delete(descriptor);
        }
        if(byDescriptor.size!==1)throw Error('Unexpected Link attachment parts');
      }
      for(const c of kirbyCopies)if(c.source.captureJoint!==null)accessoryModels.set(9,archiveRootView(inspectArchive(c.bytes),'accessory_Share_joint',c.source.captureJoint));
      for(const c of kirbyCopies)if(c.source.accessory)accessoryModels.set(c.kind===10?8:c.kind===18?6:7,archiveRootView(inspectArchive(c.bytes),'accessory_Share_joint',c.source.accessory.joint));
      const copyHats=new Map(kirbyCopies.filter(c=>!c.source.bodyCopy).map(c=>[c.base+c.source.joint,archiveRootView(inspectArchive(c.bytes),'hat_Share_joint',c.source.joint)]));
      for(const {slot:i,owner,pkg} of fighterOwners){
        previewActors.push({name:(pkg.code==='Ca'?'Falcon':pkg.character)+' P'+(i+1),object:owner,active:()=>!['Sk','Zd'].includes(pkg.code)||module._Player_GetEntity(i)===owner,collectNodes:['Lk','Cl'].includes(pkg.code)?(target,nodes)=>collectFighterCostume(owner,pkg,target,nodes):undefined,accessories:pkg.code==='Kb'?[{root:()=>module._portKirbyRead(owner,1),kind:()=>module._portKirbyRead(owner,2),models:copyHats},...kirbyCopies.filter(c=>c.source.bodyCopy).flatMap(c=>[
          {bytes:c.bodyCostumes.get(pkg.costume.index).bytes,base:c.bodyCostumes.get(pkg.costume.index).base,label:'costume'},
          ...(c.source.joint===null?[]:[{bytes:archiveRootView(inspectArchive(c.bytes),'copy_body_Share_joint',c.source.joint),base:c.base,label:'extra'}])
        ].map(part=>({name:'Kirby copy '+c.code+' body '+part.label,bytes:part.bytes,descriptorBase:part.base,root:()=>module._portKirbyRead(owner,0)===c.kind?module._portKirbyRead(owner,10):0,collectNodes:(target,n)=>module._portKirbyBodyNodes(owner,target,n)})))]:[],accessory:{name:'Fighter accessory P'+(i+1),root:()=>module._portFighterAccessory(owner,0),kind:()=>module._portFighterAccessory(owner,1),models:accessoryModels},prepare:()=>module._portFighterPreviewPrepare(owner),finish:()=>module._portFighterPreviewFinish(owner),bytes:pkg.modelBytes});
      }
      canvas=options.canvas??document.createElement('canvas');canvas.width=960;canvas.height=720;canvas.id='native-preview';if(!options.canvas)document.querySelector('#result').before(canvas);
      const effectModels=new Map();
      for(const [bytes,source,data] of [[commonEffectBytes,effects,effectData],...[...effectFiles.values()].map(e=>[e.bytes,e.source,module._portEffectsBankData(e.source.bank)])]){
        if(!data)throw Error('Missing loaded render effect bank');
        const archive=inspectArchive(bytes),base=data-source.root-8;
        for(const [i,e] of source.effects.entries())effectModels.set(base+e.joint,{name:'Effect '+source.bank+':'+i,bytes:archiveRootView(archive,'effect_Share_joint',e.joint)});
      }
      let itemModels=stageItemModels;
      for(const c of kirbyCopies){itemModels??=new Map();const a=inspectArchive(c.bytes);for(const row of [...c.source.articles.rows,...c.source.articles.attachments])if(row.joint!==null)itemModels.set(c.base+row.joint,{name:'Kirby copy '+c.code+' '+(row.label??'item '+row.slot),bytes:archiveRootView(a,'item_Share_joint',row.joint)});}
      if(peachCommon){itemModels??=new Map();const {source,base}=peachCommon,a=inspectArchive(source.source);for(const row of source.rows)if(row.joint!==null)itemModels.set(base+row.joint,{name:'Common item '+row.kind,bytes:archiveRootView(a,'item_Share_joint',row.joint)});}
      for(const pkg of packages)if(fighterArticleProfiles[pkg.code]){
        const {baseBytes,baseName,character,source}=pkg,owner=fighterOwners.find(f=>f.pkg.kind===pkg.kind)?.owner;
        if(!owner)throw Error('Loaded opponent requires two-fighter scene');
        itemModels??=new Map();const articles=convertFighterArticles(baseBytes,baseName),archive=inspectArchive(articles.source),base=combatState(owner)[8]+source.imports.find(i=>i.label==='articles').at;
        for(const row of articles.rows)if(row.joint!==null)itemModels.set(base+row.joint,{name:character+' item '+row.slot,bytes:archiveRootView(archive,'item_Share_joint',row.joint)});
        for(const row of articles.attachments){
          const bytes=archiveRootView(archive,'item_Share_joint',row.joint);
          if(row.label==='throw')accessoryModels.set(3,bytes);
          else if(row.label==='captured egg')accessoryModels.set(4,bytes);
          else if(row.label==='Kirby capture accessory')accessoryModels.set(5,bytes);
          else itemModels.set(base+row.joint,{name:character+' '+row.label,bytes});
        }
      }
      rollbackPresentationCache=params.has('rollback')?createPresentationCache():null;previewFactory=(presentationCache=rollbackPresentationCache??options.presentationCache??null,renderModule=gameModule)=>{
        // Dynamic stage/accessory/Link callbacks above resolve this lexical
        // module. Keep all their calls and direct HEAP writes in the same
        // instance as the renderer. Never retain this scope across an await.
        const scoped=fn=>{const previous=module;module=renderModule;try{const result=fn();if(result?.then)throw Error('Native presentation must be synchronous');return result;}finally{module=previous;}};
        const renderer=scoped(()=>createNativeMatchPreview(renderModule,canvas,previewActors,{presentationCache,cacheModels:params.get('cachemodels')!=='0',traceAttachments:params.has('kirbycopy')||params.has('illusionattachments'),gpuErrorChecks:params.get('gpuerrors')!=='deferred',cameraValidation,items:itemModels,effects:effectModels,stage:dynamicStage,hud:hudPreview,verify:!live&&(!renderSteps||params.has('verifyvertices')),callbacks:params.get('callbacks')!=='0'}));
        return Object.fromEntries(Object.entries(renderer).map(([key,value])=>[key,typeof value==='function'?(...args)=>scoped(()=>value(...args)):value]));
      };preview=previewFactory();
      if(params.has('prewarmshaders')||params.has('rollback')){
        const build=await (await fetch('./fighter-init-build.json')).json();
        const hashes=await Promise.all(shaderIdentityFiles.map(async name=>{const bytes=await (await fetch('./'+name)).arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return [name,Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')];}));
        const identity={wasmSha256:build.wasmSha256,sources:Object.fromEntries(hashes)},catalog=validateShaderCatalog(await (await fetch('./native-shader-catalog.json')).json(),identity);
        const before=[object,opponent].filter(Boolean).map(combatState);
        report.shaderPreparation=preview.prewarm(catalog.programs);
        if(JSON.stringify(before)!==JSON.stringify([object,opponent].filter(Boolean).map(combatState)))throw Error('Shader preparation changed fighter state');
        report.shaderPreparation.fighterStateUnchanged=true;
      }
      report.preview={settled:preview.draw()};
      if(!live){const initial=document.createElement('img');initial.id='native-preview-settled';initial.width=960;initial.height=720;initial.src=canvas.toDataURL();canvas.before(initial);}
    }
    if(intro&&menuHandoff){module._portTournamentIntroBegin();report.intro={paced:true};}
    else if(intro){
      report.intro={};verifyIntro(module,report.intro,{onStep:({frame,mask})=>{
        if(!preview)return;const drawn=preview.draw();report.intro.renderedFrames=(report.intro.renderedFrames??0)+1;
        const name=mask&8?'ready':mask&16?'go':null;
        if(name&&!report.intro[name]&&frame%15===0){
          const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);report.intro[name]=drawn;
        }
      }});report.match=Array.from({length:23},(_,i)=>module._portTournamentRead(i,0));
    }
    if(options.onMatchBoundary){
      if(!tournament||!intro||live||menuHandoff)throw Error('Checkpoint diagnostic requires a settled standalone tournament');
      preview?.dispose();preview=null;
      const boundary={module,step,readPlayers:()=>[0,1].map(p=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(module._Player_GetEntity(p),i))),createPreview:previewFactory};
      await options.onMatchBoundary(boundary);report.checkpointBoundary=true;return report;
    }
    if(stageCallbacks&&!live&&!params.has('input')&&!params.has('workloadsteps')){
      report.stage.transitions=[];report.stage.peakStageParticles=0;let previous='';
      const wind=stageKey==='dreamland'?{directions:[],activeFrames:0,displacementChecks:0,windTransitionFrames:0,maxError:0,strength:module._portDreamlandWindRead(4,0)}:null;
      if(wind)report.stage.wind=wind;
      const platforms=stageKey==='fountain'?Array.from({length:2},(_,i)=>({initial:module._portFountainPlatformRead(0,i),min:Infinity,max:-Infinity,upFrames:0,downFrames:0,phases:[],collisionChecks:0,maxCollisionError:0})):null;
      const stadium=stageKey==='stadium'?{frozen:true,staticBackgroundScreen:true,originalTimer:module._portStadiumRead(2),checks:0,maxCollisionError:0}:null;
      if(stadium)report.stage.stadium=stadium;
      const randall=stageKey==='story'?{hiddenFrames:0,minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,leftFrames:0,rightFrames:0,upFrames:0,downFrames:0,collisionChecks:0,maxCollisionError:0}:null;
      let lastRandall=randall?[module._portRandallRead(0),module._portRandallRead(1)]:null,previousItems=new Set();
      const itemBuffer=randall?module._malloc(128*4):0,shyGuys=randall?{peak:0,spawns:0,retirements:0,minX:Infinity,maxX:-Infinity}:null;
      if(randall){if(!itemBuffer)throw Error('Stage item probe allocation');report.stage.randall=randall;report.stage.shyGuys=shyGuys;}
      const lastHeights=platforms?.map(p=>p.initial);if(platforms)report.stage.platforms=platforms;
      for(let frame=0;frame<stageFrames;frame++){
        // In the Story visual fixture, use a normal down-stick flick to drop
        // both fighters from their starting platforms; native camera follows.
        for(let slot=0;slot<2;slot++){
          const storyView=stageOnly&&randall,position=storyView?combatState([object,opponent][slot])[4]:0;
          const x=storyView&&frame>=60&&frame<240&&Math.abs(position)<54?(slot?0.5:-0.5):0;
          module._portStageProbePad(slot,0,x,storyView&&frame<5?-1:0);
        }
        const beforeWind=wind?[object,opponent].map((o,slot)=>({state:combatState(o),offset:module._portDreamlandWindRead(3,slot)})):null;
        if(wind){const direction=module._portDreamlandWindRead(0,0);if(direction&&!wind.directions.includes(direction))wind.directions.push(direction);if(direction)wind.activeFrames++;}
        step();
        if(wind)for(const [slot,before] of beforeWind.entries()){
          const after=combatState([object,opponent][slot]),afterOffset=module._portDreamlandWindRead(3,slot);
          // Stage callbacks and fighter physics occupy different scheduler
          // priorities. Check steady wind; report boundary/phase transitions.
          if(before.offset!==afterOffset){wind.windTransitionFrames++;continue;}
          if(before.offset&&before.state[0]===14&&before.state[3]===0&&after[0]===14&&after[3]===0){
            if(Math.abs(before.offset)!==wind.strength)throw Error('Original Dream Land wind strength differs from source');
            const error=Math.abs(after[4]-before.state[4]-before.offset);wind.maxError=Math.max(wind.maxError,error);wind.displacementChecks++;
            if(error>.0001)throw Error('Original Dream Land wind displacement mismatch '+JSON.stringify({frame,slot,error,before,after}));
          }
        }
        if(stadium){
          const phase=module._portStadiumRead(0),form=module._portStadiumRead(1),timer=module._portStadiumRead(2),mask=module._portStadiumRead(4),error=module._portStadiumRead(5);
          if(phase!==0||form!==5||timer!==stadium.originalTimer||mask!==0x50||error!==0||module._portStadiumRead(6)!==1)throw Error('Frozen Stadium invariant '+JSON.stringify({frame,phase,form,timer,mask,error}));
          stadium.checks++;stadium.maxCollisionError=Math.max(stadium.maxCollisionError,error);
        }
        if(platforms)for(let i=0;i<2;i++){
          const p=platforms[i],height=module._portFountainPlatformRead(0,i),phase=module._portFountainPlatformRead(1,i),error=module._portFountainPlatformRead(3,i);
          if(!Number.isFinite(height)||height< -1.001||height>35.001||!Number.isFinite(error)||error>.0001)throw Error('Fountain platform/collision invariant '+JSON.stringify({frame,i,height,phase,error}));
          p.min=Math.min(p.min,height);p.max=Math.max(p.max,height);p.upFrames+=height>lastHeights[i]?1:0;p.downFrames+=height<lastHeights[i]?1:0;lastHeights[i]=height;
          if(!p.phases.includes(phase))p.phases.push(phase);p.collisionChecks++;p.maxCollisionError=Math.max(p.maxCollisionError,error);
        }
        if(randall){
          const hidden=module._portRandallRead(3);if(hidden!==module._portRandallRead(4))throw Error('Randall model/collision visibility differs');
          if(hidden){randall.hiddenFrames++;lastRandall=null;}else {
          const x=module._portRandallRead(0),y=module._portRandallRead(1),error=module._portRandallRead(2);
          if(![x,y,error].every(Number.isFinite)||error>.0001)throw Error('Randall collision mismatch '+JSON.stringify({frame,x,y,error}));
          randall.minX=Math.min(randall.minX,x);randall.maxX=Math.max(randall.maxX,x);randall.minY=Math.min(randall.minY,y);randall.maxY=Math.max(randall.maxY,y);
          randall.leftFrames+=lastRandall&&x<lastRandall[0]?1:0;randall.rightFrames+=lastRandall&&x>lastRandall[0]?1:0;randall.upFrames+=lastRandall&&y>lastRandall[1]?1:0;randall.downFrames+=lastRandall&&y<lastRandall[1]?1:0;lastRandall=[x,y];randall.collisionChecks++;randall.maxCollisionError=Math.max(randall.maxCollisionError,error);
          }
          const count=module._portItemsList(itemBuffer,128);if(count>128)throw Error('Story item capacity');const current=new Set(new Uint32Array(module.HEAPU8.buffer,itemBuffer,count));
          shyGuys.peak=Math.max(shyGuys.peak,count);for(const item of current){if(module._portItemRead(item,0)!==210)throw Error('Unexpected Story item');const x=module._portItemRead(item,2);if(!Number.isFinite(x))throw Error('Nonfinite Story item position');shyGuys.minX=Math.min(shyGuys.minX,x);shyGuys.maxX=Math.max(shyGuys.maxX,x);if(!previousItems.has(item))shyGuys.spawns++;}
          for(const item of previousItems)if(!current.has(item))shyGuys.retirements++;previousItems=current;
        }
        if(randall&&preview&&!report.stage.randallVisible&&module._portRandallRead(0)>70&&module._portRandallRead(0)<72&&module._portRandallRead(1)>-21){
          const drawn=preview.draw(),actor=drawn.actors.find(a=>a.name==="Yoshi's Story group 2");
          if(!actor?.draws)throw Error('Randall did not render at the side of the stage');
          report.stage.randallVisible={frame:frame+1,x:module._portRandallRead(0),y:module._portRandallRead(1),actor};
          const img=document.createElement('img');img.id='native-randall';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
        }
        report.stage.peakStageParticles=Math.max(report.stage.peakStageParticles,module._portEffectsRead(9,30));
        const groups=Array.from({length:stageSpec.count},(_,i)=>module._portStageObject(i)?i:-1).filter(i=>i>=0),key=groups.join(',');
        if(key!==previous){report.stage.transitions.push({frame:frame+1,groups});previous=key;}
        if(preview&&(renderSteps||frame%120===0)){
          const drawn=preview.draw();report.stage.renderedFrames=(report.stage.renderedFrames??0)+1;
          if(frame===2676||frame===2876){
            (report.stage.drawTransitions??=[]).push({frame:frame+1,actors:drawn.actors,resources:drawn.resourceStats});
            const img=document.createElement('img');img.id='native-stage-transition-'+frame;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
          }
        }
        if(!stageSpec.mandatory.every(i=>groups.includes(i)))throw Error('Original stage lost mandatory map groups');
        if([0,1].some(slot=>module._portTournamentRead(10,slot)!==4))throw Error('Idle stage callback test lost stocks');
      }
      if(stageKey==='battlefield'&&(report.stage.transitions.length<3||report.stage.transitions.at(-1).groups.length!==4))throw Error('Original Battlefield background did not create and retire a transition');
      if(stageKey==='destination'&&stageFrames>=27000&&(report.stage.transitions.length<5||!report.stage.transitions.some(t=>t.groups.includes(9))||report.stage.transitions.at(-1).groups.join(',')!==stageSpec.initial.join(',')))throw Error('Original Final Destination background did not complete two ownership cycles');
      if(wind&&(!wind.activeFrames||!wind.displacementChecks||(stageFrames>=9000&&wind.directions.length!==2)))throw Error('Dream Land original wind was not exercised');
      if(platforms&&platforms.some(p=>!p.upFrames||!p.downFrames||p.max-p.min<1))throw Error('Both Fountain platforms must move up and down');
      if(randall){module._free(itemBuffer);if(!randall.leftFrames||!randall.rightFrames||!randall.upFrames||!randall.downFrames||randall.maxX-randall.minX<100||!shyGuys.peak||!shyGuys.spawns||!shyGuys.retirements)throw Error('Randall cycle or Shy Guy lifecycle not exercised');}
      if(stadium){stadium.transformCallbacks=module._portStadiumRead(3);if(stadium.transformCallbacks<stageFrames)throw Error('Frozen Stadium scheduler was not exercised');stadium.enabledJointMask=module._portStadiumRead(4);}
      report.stage.callbackFrames=stageFrames;report.stage.callbacksVerified=true;
    }
    if(combat&&!live&&!stageOnly&&!params.has('input')&&!params.has('workloadsteps')&&!params.has('projectilecombat')&&!params.has('purincontact')&&!params.has('samuscontact')&&!params.has('koopacontact'))await verifyCombat(module,[object,opponent],report.combat,{
      step,cameraValidation,control:params.has('control'),camera:report.cameraStarted===true,
      onStep:renderSteps?()=>{recordHud(preview.draw());report.renderedSteps=(report.renderedSteps??0)+1;}:undefined,
      progress:()=>console.log('NATIVE_CONSTRUCTOR_START '+JSON.stringify(report)),
    });
    if(damageHud&&!live&&!stageOnly&&!params.has('workloadsteps')){
      report.hud.afterCombat=[object,opponent].map((object,slot)=>({damage:combatState(object)[13],display:module._portHudPlayerRead(slot,0)}));
      if(report.hud.afterCombat.some(p=>p.display!==Math.min(999,Math.floor(p.damage))))throw Error('HUD damage differs from settled fighter damage');
    }
    if(live){
      if(!options.browserInput){const controls=document.createElement('p');controls.textContent='Native port development fixture — arrows: move; X: jump; Z: attack; S: special; C: grab; Shift: shield. Enter/Escape: Start.';canvas.before(controls);}
      const limit=Number(params.get('liveframes')??0);if(!Number.isInteger(limit)||limit<0||limit>36000)throw Error('Invalid live frame limit');
      let productRollback=null;if(params.has('rollback')){if(!menuHandoff||!options.network?.active)throw Error('Product rollback requires a two-player native room');preview.dispose();preview=null;productRollback=await createNativeProductRollback({source:options.runtime,wasmBytes:options.wasmBytes,dirtyManifest:options.dirtyManifest,audio:options.rollbackAudio,network:options.network,step,createPreview:previewFactory,presentationCache:rollbackPresentationCache});preview=productRollback.preview;report.rollback={enabled:true,presentation:'independent-wasm-replica',productionDefault:true};globalThis.nativeProductRollback=productRollback;}
      const frameObserver=params.has('captureframes')?observeCanvasFrames(canvas):null;
      await frameObserver?.start();
      await new Promise((resolve,reject)=>{
        globalThis.nativeLive=startNativeLive(module,preview,[object,opponent].filter(Boolean),{step,network:options.network,rollback:productRollback?.driver,browserInput:options.browserInput,unlockInput:!menuHandoff,shouldFinish:()=>tournament&&module._portTournamentRead(25,0)!==0,readMatch:withHud?()=>({pause:Array.from({length:5},(_,i)=>module._portTournamentPauseRead(i)),clock:[12,13,14].map(i=>module._portTournamentRead(i,0)),...(menuHandoff?{intro:{mask:module._portTournamentRead(23,0),gate:module._portTournamentRead(17,0),blocked:[0,1].map(p=>module._portTournamentRead(24,p))}}:{})}):null,resolveObjects:()=>[object,opponent].filter(Boolean),frameLimit:limit,inputProvider:params.has('workload')?combatWorkload:null,
          onDraw:()=>frameObserver?.request(),
          onProgress:params.has('liveframes')||params.has('captureframes')?s=>{report.live=s;if(productRollback)report.rollback.metrics=productRollback.snapshot();document.querySelector('#result').textContent=JSON.stringify(s,null,2);}:null,
          onComplete:s=>{void (async()=>{if(frameObserver)s.observation=await frameObserver.stop();report.live=s;if(productRollback)report.rollback.metrics=productRollback.snapshot();resolve();})().catch(reject);},onError:(error,s)=>{report.live=s;document.documentElement.dataset.live='failed';preview.dispose();void frameObserver?.stop();reject(error);}});
        document.documentElement.dataset.live='ready';options.onLive?.(globalThis.nativeLive);
      });
      if(tournament)report.matchFinal=Array.from({length:23},(_,i)=>module._portTournamentRead(i,0));
      if(report.live.completionReason==='match-end'){report.results=readNativeResults(module);Object.defineProperty(report,'nativeResultContext',{value:{packages,costumes:[costumeIndex,opponentCostumeIndex]}});}
      report.finalGpuErrorCheck=preview.validateGpu();saveShaders();preview.dispose();
    }else if(preview){report.preview.final=preview.draw();}
    if(params.has('input')){
      report.input={completed:false,frames:0,states:[],motionWordChecks:0,moveIds:[]};
      module._Player_80031848(0);
      console.log('NATIVE_CONSTRUCTOR_START '+JSON.stringify(report));
      for(const [name,frames,buttons,x,y] of [['walk',12,0,0.5,0],['release',12,0,0,0],['jump',4,0x400,0,0],['air',20,0,0,0],['attack',4,0x100,0,0],['recover',90,0,0,0]]){
        for(let i=0;i<frames;i++){module._portStageProbePad(0,buttons,x,y);step();report.input.frames++;
          const word=module._portFighterConstructRead(object,34)>>>0,moveId=module._portFighterConstructRead(object,33),copyFlag=module._portFighterConstructRead(object,30);
          if(moveId!==(word>>>24)||copyFlag!==((word>>>23)&1))throw Error('Action-state word differs from live move ID/partner flag');
          report.input.motionWordChecks++;if(!report.input.moveIds.includes(moveId))report.input.moveIds.push(moveId);
          if(renderSteps){recordHud(preview.draw());report.renderedSteps=(report.renderedSteps??0)+1;}}
        report.input.states.push({name,state:state()});
        const latest=report.input.states.at(-1).state;
        if(name==='walk'&&(!(latest[4]>report.afterSteps[4])||![15,16,17].includes(latest[0])))throw Error('Scripted walking input did not produce walking movement');
        // Compare to the actual takeoff floor, not the earlier intro spawn platform.
        if(name==='air'&&(latest[3]!==1||latest[5]<=report.input.states.find(s=>s.name==='release').state[5]))throw Error('Scripted jump did not become airborne');
        if(name==='attack'&&!(latest[0]>=65&&latest[0]<=69||code==='Gw'&&latest[0]>=347&&latest[0]<=349))throw Error('Scripted aerial attack did not enter an aerial attack state');
        if(name==='recover'&&(latest[0]!==14||latest[3]!==0))throw Error('Fighter did not recover into grounded Wait');
      }
      report.input.completed=true;
      if(params.has('pauseinput')){report.pauseInput={};verifyNativePause(module,[object,opponent],report.pauseInput,{step,cameraValidation,platformMotion:stageKey==='fountain',readStage:stageKey==='fountain'?()=>[0,1].map(i=>[0,1].map(f=>module._portFountainPlatformRead(f,i))):stageKey==='story'?()=>[0,1,3].map(f=>module._portRandallRead(f)):null,onStep:row=>{if(!preview)return;const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;if(row.snapshot){report.preview[row.snapshot]=drawn;const img=document.createElement('img');img.id='native-preview-'+row.snapshot;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}}});}
      if(params.has('controllerinput')){report.controllerInput={};verifyControllerInput(module,[object,opponent],report.controllerInput,{step,onStep:renderSteps?()=>{recordHud(preview.draw());report.renderedSteps=(report.renderedSteps??0)+1;}:undefined});}
      if(params.has('kirbycopy')){report.kirbyCopy={};verifyKirbyCopy(module,[object,opponent],report.kirbyCopy,{step,mode:params.get('kirbycopy'),donor:params.get('kirbycopydonor')??'primary',onStep:renderSteps?r=>{
        const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
        const arrowAttachmentDraws=drawn.attachmentDraws.filter(a=>/^Kirby copy (Lk|Cl) arrow /.test(a.name)).reduce((sum,a)=>sum+a.draws,0);
        if([6,20].includes(r.copyKind)){r.arrowAttachmentRenderedFrames=(r.arrowAttachmentRenderedFrames??0)+(arrowAttachmentDraws>0?1:0);r.maxArrowAttachmentDraws=Math.max(r.maxArrowAttachmentDraws??0,arrowAttachmentDraws);}
        const last=r.trace.at(-1);if([3,15,16,22,24].includes(r.copyKind)){const draws=drawn.accessoryDraws.filter(d=>d.name?.startsWith('Kirby copy '+({3:'Dk',15:'Pr',16:'Mt',22:'Fc',24:'Gw'}[r.copyKind])+' body'));if(!last.body[0]&&draws.length)throw Error('Copy body GPU resources survived native removal');r.bodyRenderedFrames=(r.bodyRenderedFrames??0)+(draws.some(d=>d.draws)?1:0);r.peakBodyDraws=Math.max(r.peakBodyDraws??0,...draws.map(d=>d.draws));}
        if(r.copyKind===14&&last.egg[1]===9){const draws=drawn.accessoryDraws.filter(d=>d.name==='Fighter accessory P2');r.eggRenderedFrames=(r.eggRenderedFrames??0)+(draws.some(d=>d.draws)?1:0);r.peakEggDraws=Math.max(r.peakEggDraws??0,...draws.map(d=>d.draws));}
        if(r.copyKind===10){const draws=drawn.accessoryDraws.filter(d=>d.name==='Fighter accessory P1');if(!last.hammer[0]&&draws.length)throw Error('Copy hammer GPU resources survived native removal');if(last.hammer[1]===8){r.hammerRenderedFrames=(r.hammerRenderedFrames??0)+(draws.some(d=>d.draws)?1:0);r.peakHammerDraws=Math.max(r.peakHammerDraws??0,...draws.map(d=>d.draws));}}
        if([18,26].includes(r.copyKind)){const draws=drawn.accessoryDraws.filter(d=>d.name==='Fighter accessory P1');if(!last.sword[0]&&draws.length)throw Error('Copy sword GPU resource survived native removal');if([6,7].includes(last.sword[1])){r.swordRenderedFrames=(r.swordRenderedFrames??0)+(draws.some(d=>d.draws)?1:0);r.peakSwordDraws=Math.max(r.peakSwordDraws??0,...draws.map(d=>d.draws));}}
        const name=r.copyKind===14&&last.egg[1]===9?'copyegg':r.copyKind===19&&last.items.some(i=>i[0]===79&&i[5]===object)?'copyreflected':last.items.some(i=>i[0]===r.secondaryItemKind)&&(r.copyKind!==24||!report.preview.copysecondary)&&(![12,23].includes(r.copyKind)||report.preview.copyfire)&&(![6,20].includes(r.copyKind)||!report.preview.copysecondary)?'copysecondary':r.projectileKind===null&&r.attackStates.includes(last.state[0][0])&&(last.state[0][2]>=(r.attackFrame??(r.copyKind===2?55:70))||r.contactBefore&&last.state[1][13]>r.contactBefore[1][13])&&([14,15].includes(r.copyKind)||drawn.effectModels)?'copyattack':last.items.some(i=>i[0]===r.projectileKind&&(r.copyKind!==24||Math.hypot(i[2]-last.state[0][4],i[3]-last.state[0][5])>12)&&(r.copyKind!==10||Math.abs(i[2]-last.state[0][4])>15)&&(r.copyKind!==5||last.state[0][2]>=12)&&(![13,16].includes(r.copyKind)||i[1]>0&&Math.hypot(i[2]-last.state[0][4],i[3]-last.state[0][5])>18)&&(![6,20].includes(r.copyKind)||last.attachments===2&&arrowAttachmentDraws>0)&&(r.copyKind!==8||Math.hypot(i[2]-last.state[0][4],i[3]-last.state[0][5])>15)&&(r.copyKind!==9||last.state[0][2]>=10))?'copyfire':last.items.some(i=>i[0]===52&&Math.hypot(i[2]-last.state[0][4],i[3]-last.state[0][5])>15)?'copystar':(last.hat[1]||last.body?.[0])&&last.state[0][0]===14?'copyhat':last.state[0][0]===359?'captured':null;
        if(name&&!report.preview[name]){report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
      }:undefined});}
      if(params.has('kirbymoves')){report.kirbyMoves={};verifyKirbyMoves(module,object,report.kirbyMoves,{step,only:params.get('kirbymove'),onStep:renderSteps?phase=>{
        const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
        const name=drawn.actors.some(a=>a.name==='Kirby item 1'&&a.draws)?'hammer':drawn.actors.some(a=>a.name==='Kirby item 0'&&a.draws)?'cutter':phase.final[0]===394?'stone':null;
        if(name&&!report.preview[name]){report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
      }:undefined});}
      if(params.has('climbersmoves')){report.climbersMoves={};verifyClimberMoves(module,object,report.climbersMoves,{step,only:params.get('climbersmove'),onStep:renderSteps?phase=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;if(phase.trace.at(-1).links===40&&Math.hypot(phase.final[0][4]-phase.final[1][4],phase.final[0][5]-phase.final[1][5])>20&&!report.preview.belay){report.preview.belay=drawn;const img=document.createElement('img');img.id='native-preview-belay';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}}:undefined});}
      if(params.has('peachcontact')){report.peachContact={};verifyPeachContact(module,[object,opponent],report.peachContact,{step,mode:params.get('peachcontact'),onStep:renderSteps?()=>{recordHud(preview.draw());report.renderedSteps=(report.renderedSteps??0)+1;}:undefined});}
      if(params.has('peachpulls')){report.peachPulls={};verifyPeachPulls(module,object,report.peachPulls,{step,onStep:renderSteps?phase=>{if(phase.kind!==99){
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          const actor=drawn.actors.find(a=>a.name==='Common item '+phase.kind),name='rare'+phase.kind;
          if(actor?.draws&&!report.preview[name]){report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }}:undefined});}
      if(params.has('peachmoves')){report.peachMoves={};verifyPeachMoves(module,object,report.peachMoves,{step,only:params.get('peachmove'),onStep:renderSteps?()=>{recordHud(preview.draw());report.renderedSteps=(report.renderedSteps??0)+1;}:undefined});}
      if(params.has('formcontact')){
        report.formContact={};verifySeakZeldaContact(module,[object,opponent],report.formContact,{step,mode:params.get('formcontact'),onStep:renderSteps?()=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;}:undefined});
      }
      if(params.has('formmoves')){
        report.formMoves={};verifySeakZeldaMoves(module,object,report.formMoves,{step,only:params.get('formmove'),onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          const name=phase.name==='ground chain'&&phase.peakLinks===20&&phase.frames>=55?'chain':phase.name==='guided ground Din Fire'&&phase.itemKinds.includes(109)?'dinfire':null;
          if(name&&!report.preview[name]){report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('transform')){
        report.transform={};verifyTransform(module,report.transform,{step,onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          if(drawn.actors.some(a=>a.active===false&&a.draws))throw Error('Inactive transformation body was drawn');
          report.transform.inactiveBodiesHidden=true;
          const current=module._portFighterConstructRead(module._Player_GetEntity(0),11),name=current===7?'sheik':'zelda';
          if(phase.before&&current!==phase.before.values[11]&&!report.preview[name]&&drawn.actors.some(a=>a.name===(current===7?'Seak':'Zelda')+' P1'&&a.draws)){report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('absorption')){
        report.absorption={};verifyAbsorption(module,[object,opponent],report.absorption,{step,mode:params.get('absorption'),onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          const capture=phase.name==='release Oil Panic'&&drawn.actors.some(a=>a.name.includes(' item ')&&a.draws)?'oilpanic':phase.name==='absorb fireballs'&&[376,369].includes(combatState(object)[0])?'absorption':null;
          if(capture&&!report.preview[capture]){report.preview[capture]=drawn;const img=document.createElement('img');img.id='native-preview-'+capture;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('purincontact')){
        if(code!=='Pr'||!opponent)throw Error('Purin contact requires two Purin fighters');
        report.purinContact={};verifyPurinContact(module,[object,opponent],report.purinContact,{step,mode:params.get('purincontact'),onStep:renderSteps?()=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          if(!report.preview.sing&&report.purinContact.frames>=240&&drawn.actors.some(a=>a.name==='Effect 11:0'&&a.draws)){report.preview.sing=drawn;const img=document.createElement('img');img.id='native-preview-sing';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('purinmoves')){
        if(code!=='Pr'||opponent)throw Error('Purin move probe requires one Purin fighter');
        report.purinMoves={};verifyPurinMoves(module,object,report.purinMoves,{step,onStep:renderSteps?()=>{recordHud(preview.draw());report.renderedSteps=(report.renderedSteps??0)+1;}:undefined});
      }
      if(params.has('linkcontact')){
        if(!['Lk','Cl'].includes(code)||!opponent)throw Error('Link contact requires two fighters');
        report.linkContact={};verifyLinkContact(module,[object,opponent],report.linkContact,{step,mode:params.get('linkcontact'),onStep:renderSteps?()=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          if(!report.preview.linkhit&&combatState(opponent)[13]>0){report.preview.linkhit=drawn;const img=document.createElement('img');img.id='native-preview-linkhit';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('yoshicontact')){
        if(code!=='Ys'||!opponent)throw Error('Yoshi contact requires two fighters');
        report.yoshiContact={};verifyYoshiContact(module,[object,opponent],report.yoshiContact,{step,mode:params.get('yoshicontact'),onStep:renderSteps?()=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          if(!report.preview.capturedegg&&module._portFighterAccessory(opponent,1)===4){report.preview.capturedegg=drawn;const img=document.createElement('img');img.id='native-preview-capturedegg';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('mewtwocontact')){
        if(code!=='Mt'||!opponent)throw Error('Mewtwo contact requires two fighters');
        report.mewtwoContact={};verifyMewtwoContact(module,[object,opponent],report.mewtwoContact,{step,mode:params.get('mewtwocontact'),onStep:renderSteps?()=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
        }:undefined});
      }
      if(params.has('nesscontact')){
        if(code!=='Ns'||!opponent)throw Error('Ness contact requires two fighters');
        report.nessContact={};verifyNessContact(module,[object,opponent],report.nessContact,{step,mode:params.get('nesscontact'),onStep:renderSteps?()=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
        }:undefined});
      }
      if(params.has('nessmoves')){
        if(code!=='Ns')throw Error('Ness move probe fighter');
        report.nessMoves={};verifyNessMoves(module,object,report.nessMoves,{step,onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          for(const [name,active]of [['yoyo',phase.peakLinks===20&&phase.frames===35],['pkflash',phase.trace.at(-1).items.some(i=>i[0]===78)],['pkthunder',phase.trace.at(-1).items.some(i=>i[0]===73)]])if(active&&!report.preview[name]){
            report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
          }
        }:undefined});
      }
      if(params.has('gamewatchcontact')){
        if(code!=='Gw'||!opponent)throw Error('Game & Watch contact requires two fighters');
        report.gamewatchContact={};verifyGamewatchContact(module,[object,opponent],report.gamewatchContact,{step,mode:params.get('gamewatchcontact'),onStep:renderSteps?()=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
        }:undefined});
      }
      if(params.has('gamewatchmoves')){
        if(code!=='Gw')throw Error('Game & Watch move probe fighter');
        report.gamewatchMoves={};verifyGamewatchMoves(module,object,report.gamewatchMoves,{step,onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          for(const [name,kind]of [['gwchef',122],['gwjudge',120],['gwrescue',124],['gwturtle',118]])if(phase.trace.at(-1).items.some(i=>i[0]===kind)&&!report.preview[name]){
            report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
          }
        }:undefined});
      }
      if(params.has('mewtwomoves')){
        if(code!=='Mt')throw Error('Mewtwo move probe fighter');
        report.mewtwoMoves={};verifyMewtwoMoves(module,object,report.mewtwoMoves,{step,onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          for(const [name,active]of [['shadowball',phase.name==='full Shadow Ball'&&phase.frames===60],['disable',phase.name==='ground Disable'&&phase.trace.at(-1).items.some(i=>i[0]===110)],['teleport',phase.name==='ground Teleport'&&phase.states.includes(354)]])if(active&&!report.preview[name]){
            report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
          }
        }:undefined});
      }
      if(params.has('yoshimoves')){
        if(code!=='Ys')throw Error('Yoshi move probe fighter');
        report.yoshiMoves={};verifyYoshiMoves(module,object,report.yoshiMoves,{step,onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          for(const [name,active]of [['eggshield',phase.name==='egg shield'&&phase.frames===30],['eggthrow',phase.name==='ground Egg Throw'&&phase.frames===30],['eggroll',phase.name==='Egg Roll'&&phase.frames===35],['yoshistars',phase.name==='ground Yoshi Bomb'&&phase.trace.at(-1).items.some(i=>i[0]===88)]])if(active&&!report.preview[name]){
            report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
          }
        }:undefined});
      }
      if(params.has('illusionattachments')){
        report.illusionAttachments={};verifyIllusionAttachments(module,object,code,report.illusionAttachments,{step,onStep:()=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;if(drawn.attachmentDraws?.some(d=>d.draws)&&!report.preview.illusion){report.preview.illusion=drawn;const img=document.createElement('img');img.id='native-preview-illusion';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}return drawn;}});
      }
      if(params.has('linkmoves')){
        if(!['Lk','Cl'].includes(code))throw Error('Link move probe fighter');
        report.linkMoves={};verifyLinkMoves(module,object,code,report.linkMoves,{step,onStep:renderSteps?phase=>{
          const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          for(const [name,active]of [['arrow',phase.name==='charged arrow'&&phase.frames>=100&&phase.peakAttachments>0],['hookshot',phase.name==='ground hookshot'&&phase.frames>=30&&phase.peakLinks>0],['boomerang',phase.name==='boomerang'&&phase.frames>=50&&phase.peakAttachments>0]])if(active&&!report.preview[name]){
            report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);
          }
        }:undefined});
      }
      if(params.has('koopamoves')||params.has('koopacontact')){
        if(code!=='Kp'||params.has('koopacontact')&&!opponent||params.has('koopamoves')&&opponent&&!stageCallbacks)throw Error('Koopa probe fighter count');
        const onStep=renderSteps?()=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          if(!report.preview.flame&&(report.koopaMoves?.phases.at(-1)?.frames>=60||report.koopaContact?.frames>=210)&&drawn.materialDraws.particleDraws>0&&module._portEffectsRead(9,12)>0&&[342,345].includes(state()[0])){report.preview.flame=drawn;const img=document.createElement('img');img.id='native-preview-flame';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
          if(!report.preview.claw&&state()[0]===351){report.preview.claw=drawn;const img=document.createElement('img');img.id='native-preview-claw';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined;
        if(params.has('koopamoves')){report.koopaMoves={};verifyKoopaMoves(module,object,report.koopaMoves,{step,onStep});}
        else{report.koopaContact={};verifyKoopaContact(module,[object,opponent],report.koopaContact,{step,onStep,mode:params.get('koopacontact')});}
      }
      if(params.has('samuscontact')){
        if(code!=='Ss'||!opponent)throw Error('Samus contact requires two Samus fighters');
        report.samusContact={};verifySamusContact(module,[object,opponent],report.samusContact,{step,mode:params.get('samuscontact'),onStep:renderSteps?()=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          if(!report.preview.throw&&module._portFighterAccessory(object,1)===3){report.preview.throw=drawn;const img=document.createElement('img');img.id='native-preview-throw';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('samusmoves')){
        if(code!=='Ss'||opponent)throw Error('Samus moves require one Samus fighter');
        report.samusMoves={};verifySamusMoves(module,object,report.samusMoves,{step,onStep:renderSteps?phase=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          for(const [name,label] of [['charge','Samus item 1'],['missile','Samus item 2'],['grapple','Samus grapple 3']])if(!report.preview[name]&&phase.frames>20&&drawn.actors.some(a=>a.name===label&&a.draws)){report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('pikachumoves')){
        if(!['Pk','Pc'].includes(code)||opponent)throw Error('Pikachu moves require one supported fighter');
        const archive=inspectArchive(baseBytes),root=archive.publics.get('ftData'+character),attrs=archive.data.getUint32(root+4),kinds=[0xDC,0x14,0x18].map(o=>archive.data.getUint32(attrs+o));
        report.pikachuMoves={};verifyPikachuMoves(module,object,code,kinds,report.pikachuMoves,{step,onStep:renderSteps?phase=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          for(const [name,slot,minFrame] of [['jolt',2,0],['thunder',0,60]])if(!report.preview[name]&&phase.frames>=minFrame&&(name!=='thunder'||phase.final[0]===361)&&drawn.actors.some(a=>a.name===character+' item '+slot&&a.draws)){report.preview[name]=drawn;const img=document.createElement('img');img.id='native-preview-'+name;img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('mariomoves')){
        if(!['Mr','Lg','Dr'].includes(code)||opponent)throw Error('Mario-family moves require one supported fighter');
        report.marioMoves={};verifyMarioFamilyMoves(module,object,code,report.marioMoves,{step,onStep:renderSteps?phase=>{const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
          if(!report.preview.cape&&phase.capeFrames>=8&&drawn.actors.some(a=>a.name===character+' item '+(code==='Dr'?3:2)&&a.draws)){report.preview.cape=drawn;const img=document.createElement('img');img.id='native-preview-cape';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
        }:undefined});
      }
      if(params.has('projectiles')) {
        if(!['Fx','Fc','Mr','Lg','Dr','Pk','Pc'].includes(code))throw Error('Unsupported projectile input fixture');
        const projectileControl=params.has('projectilecontrol'),projectileShield=params.has('projectileshield'),projectileReflect=params.has('projectilereflect'),capeReflect=projectileReflect&&['Mr','Dr'].includes(code);
        const archive=inspectArchive(baseBytes),root=archive.publics.get('ftData'+character),attrs=archive.data.getUint32(root+4),laserKind=({Mr:48,Dr:49,Lg:105})[code]??archive.data.getUint32(attrs+(['Pk','Pc'].includes(code)?0x14:28));
        if(opponent){
          module._Player_80031848(1);
          for(let frame=0;frame<90;frame++){module._portStageProbePad(0,0,0,0);module._portStageProbePad(1,0,0,frame<5?-1:0);step();}
          if(['Mr','Lg','Dr','Pk','Pc'].includes(code)){
            // Separate the pair using their current ordering. Chasing a target
            // relative to the shooter's position can push both fighters toward
            // the ledge when the defender starts behind the shooter.
            const direction=combatState(opponent)[4]>=state()[4]?1:-1;
            for(let frame=0;frame<25;frame++){module._portStageProbePad(0,0,-direction*.5,0);module._portStageProbePad(1,0,direction*.5,0);step();}
            for(let frame=0;frame<8;frame++){module._portStageProbePad(0,0,direction*.5,0);module._portStageProbePad(1,0,-direction*.5,0);step();}
            module._portStageProbePad(0,0,0,0);module._portStageProbePad(1,0,0,0);
            for(let frame=0;frame<20;frame++)step();
          }else {
          // Place the defender using walking input, never a position/state write.
          for(let frame=0;combatState(opponent)[4]<state()[4]+35&&frame<120;frame++){module._portStageProbePad(1,0,.5,0);step();}
          if(projectileReflect){module._portStageProbePad(1,0,-.5,0);step();}
          }
          for(let frame=0;frame<12;frame++){module._portStageProbePad(1,projectileReflect&&!capeReflect?0x200:projectileShield?0x20:0,0,projectileReflect&&!capeReflect?-1:0);step();}
        }
        const before=opponent?combatState(opponent):null,shooterBefore=combatState(object),buffer=module._malloc(128),traces=new Map(),defenderStates=new Set();let laserFrames=0,peakItems=0,peakHitlag=0,peakKnockback=0,reflectedFrames=0;
        try {
          for(let frame=0;frame<180;frame++) {
            module._portStageProbePad(0,!projectileControl&&frame<2?0x200:0,0,0);
            if(capeReflect)module._portStageProbePad(1,frame>=10&&frame<12?0x200:0,frame>=10&&frame<12?Math.sign(shooterBefore[4]-before[4]):0,0);
            step();
            if(opponent){const s=combatState(opponent);peakHitlag=Math.max(peakHitlag,s[14]);peakKnockback=Math.max(peakKnockback,s[15]);defenderStates.add(s[0]);}
            const count=module._portItemsList(buffer,32);if(count>32)throw Error('Projectile fixture item capacity');peakItems=Math.max(peakItems,count);
            for(const item of new Uint32Array(module.HEAPU8.buffer,buffer,count)) {
              const values=Array.from({length:8},(_,field)=>module._portItemRead(item,field));
              if(!values.every(Number.isFinite))throw Error('Nonfinite live item state');
              if(values[0]===laserKind){laserFrames++;const trace=traces.get(item)??[];trace.push({frame,state:values});traces.set(item,trace);if(projectileReflect&&values[5]===opponent)reflectedFrames++;else if(values[5]!==object)throw Error('Projectile owner mismatch');}
            }
            if(renderSteps){const drawn=preview.draw();recordHud(drawn);report.renderedSteps=(report.renderedSteps??0)+1;
              if(!report.preview.projectile&&drawn.actors.some(a=>a.name===character+' item '+(['Pk','Pc'].includes(code)?2:code==='Dr'?1:0)&&a.draws)){report.preview.projectile=drawn;const img=document.createElement('img');img.id='native-preview-projectile';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);}
            }
          }
          const rows=[...traces.values()];
          const after=opponent?combatState(opponent):null;
          const shooterAfter=combatState(object);
          report.projectiles={completed:false,mode:projectileControl?'control':projectileShield?'shield':projectileReflect?'reflect':'hit',frames:180,laserKind,laserFrames,peakItems,traces:rows,contact:opponent?{before,after,shooterBefore,shooterAfter,reflectedFrames,peakHitlag,peakKnockback,defenderStates:[...defenderStates]}:null};
          if(projectileControl?(laserFrames||peakItems):(!laserFrames||!rows.some(t=>t.length>2&&Math.max(...t.map(s=>s.state[2]))-Math.min(...t.map(s=>s.state[2]))>(opponent?0:10))||module._portItemsList(buffer,32)))throw Error('Projectile spawn/travel/retirement disagrees with input');
          if(opponent){
            const correct=projectileControl?(after[13]===before[13]&&peakHitlag===0&&peakKnockback===0):projectileShield?(after[13]===before[13]&&after[17]<before[17]&&defenderStates.has(181)&&peakHitlag>0):projectileReflect?(after[13]===before[13]&&shooterAfter[13]>shooterBefore[13]&&reflectedFrames>0):(after[13]>before[13]&&(code==='Fx'?peakHitlag===0&&peakKnockback===0:peakHitlag>0&&peakKnockback>0));
            if(!correct)throw Error('Projectile contact disagrees with hit/control/shield input');
          }
          report.projectiles.completed=true;
        } finally {module._free(buffer);}
      }
      if(preview)report.preview.final=preview.draw();
    }
    if(params.has('workloadsteps')){const count=Number(params.get('workloadsteps'));if(!tournament||live||!Number.isInteger(count)||count<180||count>36000)throw Error('Invalid unpaced workload');report.simulationWorkload={};verifyCombatWorkload(module,[object,opponent],report.simulationWorkload,count);}
    else if(tournament&&!live&&params.has('timeout')){report.timeout={};verifyTimeout(module,report.timeout,{onStep:renderSteps?()=>{recordHud(preview.draw());report.timeoutRenderedSteps=(report.timeoutRenderedSteps??0)+1;}:undefined,progress:()=>console.log('NATIVE_CONSTRUCTOR_START '+JSON.stringify(report))});}
    else if(tournament&&!live&&!stageOnly&&!params.has('input')){report.lifecycle={};verifyMatch(module,[object,opponent],report.lifecycle,{onStep:renderSteps?()=>{const drawn=preview.draw();recordHud(drawn);report.lifecycleRenderedSteps=(report.lifecycleRenderedSteps??0)+1;if(drawn.accessories){report.respawnPlatformDrawFrames=(report.respawnPlatformDrawFrames??0)+1;if(report.respawnPlatformDrawFrames===30){const img=document.createElement('img');img.id='native-preview-respawn';img.width=960;img.height=720;img.src=canvas.toDataURL();canvas.before(img);report.preview.respawn=drawn;}}}:undefined,progress:()=>console.log('NATIVE_CONSTRUCTOR_START '+JSON.stringify(report))});}
    if(damageHud)report.hud.finalPlayers=[0,1].map(slot=>Array.from({length:4},(_,field)=>module._portHudPlayerRead(slot,field)));
    if(preview&&!live){report.finalGpuErrorCheck=preview.validateGpu();saveShaders();preview.dispose();}
  }
} catch(error){rollbackPresentationCache?.dispose();report.error=String(error.stack||error);report.diagnostics=diagnostics;}
document.querySelector('#result').textContent=JSON.stringify(report,null,2);
document.documentElement.dataset.result=report.constructorCompleted?'constructed':'blocked';
console.log('NATIVE_CONSTRUCTOR_RESULT '+JSON.stringify(report));
return report;
}
