import {readAttributeSpec,attributeProbeSource} from './attribute-spec.mjs';
import {readSharedSpec,sharedProbeSource} from './shared-spec.mjs';
import {readMotionSpec} from './motion-spec.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {preparePortableSource} from './portable-source.mjs';
import {commandProbeSource} from './command-probes.mjs';
import {sceneLinkInputs} from './scene-link.mjs';
import {gameLinkInputs} from './game-link.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const source = JSON.parse(fs.readFileSync(new URL('./source.json', import.meta.url)));
const upstream = path.join(root, 'engines/melee-decomp');
const output = path.join(root, 'dist/native-port');
const fighterInit=process.argv.includes('--fighter-init');
const startup=fighterInit||process.argv.includes('--startup');
if(['--scene','--startup','--fighter-init'].filter(flag=>process.argv.includes(flag)).length>1)throw Error('Choose one native integration target');
const scene=startup||process.argv.includes('--scene'),moduleName=fighterInit?'melee-fighter-init':startup?'melee-startup':scene?'melee-scene':'melee-native';
const compiler = process.env.EMCC || path.join(root, '.browser-tools/emsdk/upstream/emscripten/emcc');
const git = args => execFileSync('git', args, {cwd:upstream, encoding:'utf8'}).trim();
if (git(['rev-parse', 'HEAD']) !== source.commit || git(['status', '--porcelain', '--untracked-files=no']))
  throw Error('Native port requires the clean pinned upstream checkout.');
fs.mkdirSync(path.join(output, 'include/Runtime'), {recursive:true});
// Override one platform typedef without changing the upstream checkout.
const original = fs.readFileSync(path.join(upstream, 'src/Runtime/platform.h'), 'utf8');
const needle = 'typedef signed int ssize_t;';
if (original.split(needle).length !== 2) throw Error('Platform typedef patch no longer matches.');
fs.writeFileSync(path.join(output, 'include/Runtime/platform.h'), original.replace(needle,
  '#if !defined(__EMSCRIPTEN__)\n' + needle + '\n#endif'));
const placeholder=fs.readFileSync(path.join(upstream,'src/placeholder.h'),'utf8');
const estimatePlaceholder='#define __frsqrte(x) sqrt(x)';
if(placeholder.split(estimatePlaceholder).length!==2)throw Error('Reciprocal-square-root override no longer matches');
fs.writeFileSync(path.join(output,'include/placeholder.h'),placeholder.replace(estimatePlaceholder,
  'double portFrsqrte(double);\n#define __frsqrte(x) portFrsqrte(x)'));
const vendor=path.join(root,'engines/browser-native/vendor/dolphin');
const provenance=JSON.parse(fs.readFileSync(path.join(vendor,'source.json')));
for(const {file,sha256} of provenance.files)if(createHash('sha256').update(fs.readFileSync(path.join(vendor,file))).digest('hex')!==sha256)
  throw Error('Arithmetic reference source hash mismatch: '+file);
const estimateObjects=[];
for(const [name,file] of [['float-utils',path.join(vendor,'Common/FloatUtils.cpp')],
  ['estimates',path.join(root,'engines/browser-native/estimates.cpp')]]) {
  const object=path.join(output,name+'.o');estimateObjects.push(object);
  execFileSync(compiler,['-std=c++20','-O2','-fno-fast-math','-ffp-contract=off','-fno-exceptions',
    '-I'+vendor,'-c',file,'-o',object],{stdio:'inherit'});
}
// This SDK file mixes portable C with inline PPC assembly. Select complete
// unchanged C definitions from the pinned source rather than compile asm stubs.
const sdkMatrix=fs.readFileSync(path.join(upstream,'libs/dolphin/src/dolphin/mtx/mtx.c'),'utf8');
const selectedSdkFunctions=['MTXRotRad','C_MTXLookAt',...(fighterInit?['MTXLightFrustum','MTXLightPerspective','MTXLightOrtho']:[])];
const selectedText=[['void MTXRotRad(', '\nvoid PSMTXRotTrig('],
  ['void C_MTXLookAt(', '\nvoid MTXLightFrustum('],...(fighterInit?[['void MTXLightFrustum(', null]]:[])].map(([start,end])=>{
    if(sdkMatrix.split(start).length!==2||(end!==null&&sdkMatrix.split(end).length!==2))throw Error('SDK function selection changed');
    const from=sdkMatrix.indexOf(start),to=end===null?sdkMatrix.length:sdkMatrix.indexOf(end,from);
    if(to<from)throw Error('Invalid SDK selection');return sdkMatrix.slice(from,to);
  });
const selectedSdk=path.join(output,'sdk-camera.c');
fs.writeFileSync(selectedSdk,'#include <dolphin.h>\n#include <math.h>\n'+selectedText.join('\n'));
// Light-object constructors/getters only write CPU-side data. Compile the
// original complete prefix; hardware register submission starts after it.
const sdkLightText=fs.readFileSync(path.join(upstream,'libs/dolphin/src/dolphin/gx/GXLight.c'),'utf8');
const lightBoundary='#if DEBUG\n#define WRITE_SOME_LIGHT_REG1';
if(sdkLightText.split(lightBoundary).length!==2)throw Error('SDK light object boundary changed');
const sdkLight=path.join(output,'sdk-light.c');
let lightSource=sdkLightText.slice(0,sdkLightText.indexOf(lightBoundary));
const colorShift='obj->Color = (color.r << 24)';
if(lightSource.split(colorShift).length!==2)throw Error('SDK light color packing changed');
// Preserve packed high-bit colors without signed left-shift overflow in C.
lightSource=lightSource.replace(colorShift,'obj->Color = ((u32) color.r << 24)');
fs.writeFileSync(sdkLight,lightSource.replace('"__gx.h"',JSON.stringify(path.join(upstream,'libs/dolphin/src/dolphin/gx/__gx.h'))));
const projectText=fs.readFileSync(path.join(upstream,'libs/dolphin/src/dolphin/gx/GXTransform.c'),'utf8');
const projectStart='void GXProject(',projectEnd='\nvoid GXSetProjection(';
if(projectText.split(projectStart).length!==2||projectText.split(projectEnd).length!==2)throw Error('SDK projection selection changed');
const sdkProject=path.join(output,'sdk-project.c');
fs.writeFileSync(sdkProject,'#include <dolphin.h>\n#include <dolphin/os.h>\n'+projectText.slice(projectText.indexOf(projectStart),projectText.indexOf(projectEnd)));
selectedSdkFunctions.push('GXProject');
// Texture storage sizing is pure CPU code, including the SDK's tiled-format
// and mip-chain rules. Shadow construction needs it before any GPU capture.
const sdkTextureText=fs.readFileSync(path.join(upstream,'libs/dolphin/src/dolphin/gx/GXTexture.c'),'utf8');
const sizeStart='static void __GXGetTexTileShift(',sizeEnd='\nvoid __GetImageTileCount(';
if(sdkTextureText.split(sizeStart).length!==2||sdkTextureText.split(sizeEnd).length!==2)throw Error('SDK texture size selection changed');
const sdkTextureSize=path.join(output,'sdk-texture-size.c');
fs.writeFileSync(sdkTextureSize,'#include <dolphin.h>\n#include <dolphin/os.h>\n#define __cntlzw(x) ((x)?__builtin_clz((unsigned)(x)):32)\n'+sdkTextureText.slice(sdkTextureText.indexOf(sizeStart),sdkTextureText.indexOf(sizeEnd)));
selectedSdkFunctions.push('GXGetTexBufferSize');
// This obsolete SDK entry is intentionally empty in the retail (non-DEBUG)
// SDK. Compile its original definition instead of an unsupported-call guard.
const sdkTevText=fs.readFileSync(path.join(upstream,'libs/dolphin/src/dolphin/gx/GXTev.c'),'utf8');
const clampStart='void GXSetTevClampMode(',clampEnd='\nvoid GXSetAlphaCompare(';
if(sdkTevText.split(clampStart).length!==2||sdkTevText.split(clampEnd).length!==2)throw Error('SDK clamp selection changed');
const sdkTevClamp=path.join(output,'sdk-tev-clamp.c');
fs.writeFileSync(sdkTevClamp,'#include <dolphin.h>\n#include <macros.h>\n'+sdkTevText.slice(sdkTevText.indexOf(clampStart),sdkTevText.indexOf(clampEnd)));
selectedSdkFunctions.push('GXSetTevClampMode');
const tobj=fs.readFileSync(path.join(upstream,'src/sysdolphin/baselib/tobj.c'),'utf8');
const textureStart='static void MakeTextureMtx(HSD_TObj* tobj)\n{',textureEnd='\nstatic void TObjSetupMtx(';
if(tobj.split(textureStart).length!==2||tobj.split(textureEnd).length!==2)throw Error('Texture matrix selection changed');
const textureSource=path.join(output,'texture-matrix.c');
fs.writeFileSync(textureSource,
  '#include <sysdolphin/baselib/tobj.h>\n#include <sysdolphin/baselib/mtx.h>\n#include <sysdolphin/baselib/debug.h>\n#include <math.h>\n'+
  '#include <placeholder.h>\n#define FLT_EPSILON 1.00000001335e-10F\n'+
  tobj.slice(tobj.indexOf(textureStart),tobj.indexOf(textureEnd,tobj.indexOf(textureStart)))+'\n'+
  fs.readFileSync(path.join(root,'engines/browser-native/texture-matrix.c'),'utf8'));
const units = ['src/melee/mp/mpcoll.c', 'src/melee/mp/mplib.c', 'src/melee/gr/ground.c', 'src/melee/ft/ftcommon.c',
  'libs/dolphin/src/dolphin/mtx/mtx44.c',
  'src/MSL/trigf.c', 'src/MSL/math_data.c', 'src/MSL/float.c', 'src/sysdolphin/baselib/mtx.c',
  'src/sysdolphin/baselib/random.c', 'src/sysdolphin/baselib/archive.c',
  'src/sysdolphin/baselib/memory.c', 'src/sysdolphin/baselib/initialize.c',
  'src/sysdolphin/baselib/objalloc.c', 'libs/dolphin/src/dolphin/os/OSAlloc.c',
  'src/sysdolphin/baselib/fobj.c', 'src/sysdolphin/baselib/spline.c', 'src/sysdolphin/baselib/aobj.c',
  ...['gobj','gobjproc','gobjplink','gobjgxlink','gobjobject','gobjuserdata'].map(n=>'src/sysdolphin/baselib/'+n+'.c')];
let exports = ['malloc', 'free', 'portInterpolate', 'portSeed', 'portRandom',
  'portStagePrune', 'portStageMetric', 'portArchiveOpen', 'portArchiveSymbol',
  'portArchiveClose', 'portRuntimeInit', 'OSDisableInterrupts', 'OSRestoreInterrupts', 'portRuntimeStep', 'portRuntimeProbeCreate',
  'portRuntimeProbePause', 'portRuntimeProbeRead', 'portRuntimeProbeReset',
  'portRuntimeProbeClear', 'portRuntimeHeapFree', 'portRuntimeObjectsUsed', 'portRuntimeProcsUsed',
  'portFighterAttribute', 'portFighterPhysicsProbe', 'portAnimationCreate', 'portAnimationRun', 'portAnimationDestroy',
  'portAnimationTimeline', 'PSMTXIdentity','PSMTXCopy','PSMTXScale','PSMTXTranspose','PSMTXConcat',
  'PSMTXMultVec','PSMTXMultVecSR','PSVECAdd','PSVECSubtract','PSVECScale','PSVECDotProduct',
  'PSVECSquareMag','PSVECCrossProduct','HSD_MtxSRT','HSD_MkRotationMtx','sinf','cosf',
  'portPoseCreate','portPoseNode','portPoseTrack','portPoseRewind','portPoseStep','portPoseDestroy',
  'portFrsqrte','portFres','portRound25','portEstimateBits','PSVECNormalize','PSVECMag','PSMTXTrans',
  'MTXFrustum','MTXPerspective','MTXOrtho','MTXRotRad','C_MTXLookAt','PSMTXQuat','PSMTXInverse','PSMTXRotAxisRad',
  'portSkinMatrices','portSkinViewMatrices','portSkinVertices','portTextureMatrix','portPoseFlags',
  'portCommandReadUnit','portCommandFieldRead','portCommandFieldWrite','portCommandFieldCount','portCommandControlCreate','portCommandControlDestroy',
  'portCommandControlFrame','portCommandControlStep','portCommandControlRead'];
const flags = ['-O2', '-fno-fast-math', '-ffp-contract=off', '-fno-strict-aliasing',
  '-Wl,--fatal-warnings',
  '-fno-builtin-sinf', '-fno-builtin-cosf', '-fno-builtin-tanf',
  '-ffunction-sections', '-fdata-sections', '-I' + path.join(output, 'include'),
  '-I'+path.join(output,'portable/src'),'-I'+path.join(output,'portable/libs/dolphin/include'),
  '-Isrc', '-Ilibs/dolphin/include'];
const portable=preparePortableSource(upstream,output);
const sharedSpec=readSharedSpec(upstream),sharedProbe=path.join(output,'shared-probe.c');
fs.writeFileSync(sharedProbe,sharedProbeSource(sharedSpec));
fs.writeFileSync(path.join(output,'shared-spec.mjs'),'export const sharedSpec='+JSON.stringify(sharedSpec)+';\n');
const commandProbe=path.join(output,'command-layout-probe.c');
fs.writeFileSync(commandProbe,commandProbeSource(portable.commandFields));
fs.writeFileSync(path.join(output,'command-fields.mjs'),'export const commandFields='+JSON.stringify(portable.commandFields)+';\n');
fs.writeFileSync(path.join(output,'motion-spec.mjs'),'export const motionSpec='+JSON.stringify(readMotionSpec(upstream))+';\n');
const attributeSpec=readAttributeSpec(upstream,output,compiler),attributeProbe=path.join(output,'attribute-probe.c');
fs.writeFileSync(attributeProbe,attributeProbeSource(attributeSpec));
fs.writeFileSync(path.join(output,'attribute-spec.mjs'),'export const attributeSpec='+JSON.stringify(attributeSpec)+';\n');
const sceneInputs=scene?sceneLinkInputs(root,upstream,output,attributeSpec.characters.map(c=>c.file)):null;
if(scene) {
  exports=exports.filter(name=>!['portInterpolate','portSeed','portRandom','portStagePrune','portStageMetric','portArchiveOpen','portArchiveSymbol','portArchiveClose','portFighterAttribute','portFighterPhysicsProbe'].includes(name));
  exports.push('portFighterModelLive','portFighterModelCreate','portCostumeLoad','portCostumeAnimation','portCostumeRelease','portMaterialColorSelect','portMaterialColorRead','portMaterialAttach','portMaterialSelect','portMaterialReset','portMaterialRead','portCostumeCount','portVisibilityAttach','portVisibilitySelect','portVisibilityApply','portVisibilityRead','portCollisionAuxiliary','portCollisionAuxiliaryRead','portLightColor','GXInitLightSpot','GXInitLightDistAttn','GXInitLightPos','GXInitLightDir','GXInitLightColor','GXGetLightColor','portCollisionPartRead','portAttributeField','portAttributeSize','portAttributesLoad','portCollisionAttach','portCollisionReset','portCollisionWorld','portCollisionRead','portSharedInitialize','portSharedGlobal','portSceneJointAnimation','portCpuScript','portCpuChoose','portColorCreate','portColorDestroy','portColorSelect','portColorStep','portColorRead','portSharedField','portSharedPart','portSharedLanding','portMotionCreate','portMotionDestroy','portMotionLoad','portMotionEntry','portMotionLive','portMotionBuffers','portFilePins',
    'portSceneObjectDeleteNextStep','portSceneObjectCreate','portSceneObjectRoot','portSceneObjectFree','portSceneLoad','portSceneDestroy','portSceneCollect','portSceneMatrices','portSceneMetric','portSceneLiveJoints',
    'portFileInstall','portFileCount','portFileBytes','portFileReads','portFileAllocations','portFileClear','portFileArchive','portFileArchiveClose','portFileArchivePair',
    'portSceneAnimation','portSceneRequest','portSceneAnimate','portSceneFlags','portSceneMeshVisibility','portMaterialTev','portMaterialTextureState','portMaterialPixelState','portMaterialDrawState','GXProject','portMaterialPolygon','portNativeDrawObject','portMaterialModelState','portRenderContextState','portSceneLiveObjects','portSceneLiveMetric');
}
if(fighterInit)exports.push('portStadiumFireworksOff','portStadiumRead','portRandallRead','portStoryItemInstall','portStageParticlesInstall','portDreamlandWindRead','portFountainPlatformRead','portFountainReflectionOff','portStageObjects','portStageAnimationProbe','portStageShadowBits','portTournamentInitializeStage','portStageMapInstallKind','portStageCallbacksInitialize','portStageObject','gm_80168B34','portTournamentDamageInitialize','portHudPlayerRead','portTournamentHudInitialize','portHudObjects','portHudRenderBegin','portHudCameraSnapshot','portTournamentStatusInstall','portTournamentInitialize','portTournamentInitializeKinds','portTournamentBegin','portTournamentIntroBegin','portTournamentStep','portTournamentRead','portStageRenderInitialize','portStageRenderBegin','portStageCallbackBits','portStageCameraStart','portStageCameraSnapshot','portProbeRulesInitialize','Player_80031848','portSceneInitialize','portStageMapInstall','portStageMapCollisionRead','portStageProbePad','portStageMapCollisionLoad','portStageMapSpawn','portStageMapCreate','portStageDrawPasses','portBattlefieldCallbacksInitialize','portBattlefieldObject','portStageMapBounds','portStageMapRead','portStageMapLights','portStageMapClear','portStageLightOverrideBits','portMatchCameraInitialize','portParticleOperandBits','portEffectsInitialize','portNativeDrawParticles','portEffectModels','portEffectsLoad','portEffectsBankData','portCommonEffectsLoad','portEffectsRead','portEffectCreate','portEffectBankCreate','portEffectsDestroyOwner','portEffectParentCreate','portEffectLife','portEffectStep','portEffectsParticleStep','portMatchPlayerInitialize','portPackedFlagBits','portFighterPreviewPrepare','portFighterPreviewFinish','portFighterNativeDraw','portFighterRespawnPlatform','portFighterAccessory','portFighterConstruct','portFighterConstructRead','portItemsInitialize','portItemsList','portItemLinksList','portItemAttachmentsList','portItemRead','portItemCommonProbe','portArticleProbeCreate','portArticleProbeStart','portArticleProbeStep','portArticleProbeRead','portItemModelCreate','portItemAttrFlags','portItemModelTransform','portItemModelRead','portOriginalItemModelLive','portFighterMotionRegister','portFighterMotionUnregister','portFighterMotionAttach','portFighterMotionLoad','portFighterMotionRead','portSecondaryAttach','portPartAnimationApply','portPartAnimationStep','portPartAnimationClear','portPartAnimationRead','portShieldPoseApply','portSecondaryJointRead','portGameplayAttach','portGameplayRescale','portGameplayUpdate','portGameplayRead','portFighterAnimationInitialize','portFighterAnimationStart','portFighterAnimationStep','portFighterAnimationRead','portDynamicsInitialize','portDynamicsPoolFree','portDynamicsAttach','portDynamicsRead','portDynamicsStep','portDynamicsSelect','Fighter_Create','portFighterInitModelCreate','portFighterPlayerConfigure','portFighterInitRead');
if(startup)exports.push('portFighterInitialize','portStartupMetric','portStartupResetCheck');
const selectedUnits=scene?units.filter(file=>!file.startsWith('src/melee/')):units;
selectedUnits.push('src/melee/lb/lbcommand.c');
if(scene)selectedUnits.push('src/melee/ft/ft_0C88.c','src/melee/ft/ftmetal.c','src/melee/ft/ftanim.c','src/melee/ft/ftmaterial.c','src/melee/lb/lbrefract.c','src/melee/ft/ftdevice.c','src/melee/ft/kinds/ftCommon/ftCo_09F4.c','src/melee/ft/ft_0C8C.c','src/melee/ft/ftCo_800C7CA0.c','src/melee/ft/ftcoll.c','src/melee/lb/lbcollision.c','src/melee/lb/lb_00B0.c','src/melee/lb/lbanim.c','src/melee/lb/lbarchive.c','src/melee/lb/lb_013B.c','src/melee/lb/lb_0219.c','src/melee/ft/ftaction.c','src/melee/ft/ftcmdscript.c','src/melee/ft/ftcpuattack.c','src/melee/ft/ftdata.c','src/melee/ft/ftparts.c','src/melee/ft/ftcommon.c','src/melee/ft/fighter.c','src/melee/pl/player.c');
if(startup)selectedUnits.push('src/melee/gr/ground.c','src/melee/gr/grdatfiles.c','src/melee/lb/lbspdisplay.c');
const gameInputs=fighterInit?gameLinkInputs(root,upstream,output):null;
execFileSync(compiler, [...flags, ...selectedUnits.map(file=>path.join(portable.directory,file)), selectedSdk,sdkLight,sdkProject,sdkTextureSize,sdkTevClamp,textureSource,...estimateObjects,
  path.join(root, 'engines/browser-native/errors.c'),commandProbe,path.join(root,'engines/browser-native/commands.c'),
  ...(scene?[]:[path.join(root, 'engines/browser-native/platform.c'),path.join(root, 'engines/browser-native/fighter.c')]),
  path.join(root, 'engines/browser-native/runtime.c'),
  path.join(root, 'engines/browser-native/animation.c'),
  path.join(root, 'engines/browser-native/math.c'),
  path.join(root, 'engines/browser-native/matrix-special.c'),
  path.join(root, 'engines/browser-native/pose.c'),
  path.join(root, 'engines/browser-native/skin.c'),
  ...(sceneInputs?[attributeProbe,path.join(root,'engines/browser-native/attributes.c'),path.join(root,'engines/browser-native/character-collision.c'),sharedProbe,path.join(root,'engines/browser-native/cpu.c'),path.join(root,'engines/browser-native/colors.c'),path.join(root,'engines/browser-native/shared.c'),path.join(root,'engines/browser-native/motions.c'),path.join(root,'engines/browser-native/resident-files.c'),...sceneInputs.files]:[]),
  ...(startup?[path.join(root,'engines/browser-native/startup.c')]:[]),
  ...(gameInputs?[path.join(root,'engines/browser-native/match.c'),path.join(root,'engines/browser-native/stage-map.c'),path.join(root,'engines/browser-native/item-model.c'),path.join(root,'engines/browser-native/item-runtime.c'),path.join(root,'engines/browser-native/effects.c'),...gameInputs.files]:[]),
  '--no-entry','--emit-symbol-map','-Wl,--error-limit=0',
  '-sEXPORTED_FUNCTIONS=' + exports.map(x => '_' + x).join(','),
  '-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32', '-sMODULARIZE=1',
  '-sEXPORT_NAME=createMeleeNative', '-sENVIRONMENT=web,node', '-sALLOW_MEMORY_GROWTH=1',
  '-sASSERTIONS=1', '-o', path.join(output, moduleName+'.mjs')], {cwd:upstream, stdio:'inherit'});
for (const name of ['stage-archive.mjs','stage-item-assets.mjs','shader-catalog.mjs','articles.html','item-runtime-assets.mjs','item-common-assets.mjs','article-assets.mjs','verify-articles.mjs','stage-map-assets.mjs','verify-stage-map.mjs','stage-map.html','effect-assets.mjs','verify-effects.mjs','tev-shader.mjs','tev-reference.mjs','verify-tev.mjs','tev-check.html','native-tev.mjs','native-texture.mjs','native-pixel.mjs','native-model.mjs','native-render-context.mjs','material-shader.mjs','material-gpu.mjs','verify-material-shader.mjs','verify-model-state.mjs','verify-material-state.mjs','native-match-preview.mjs','immediate-geometry.mjs','native-live.mjs','combat-workload.mjs','native-camera.mjs','verify-combat.mjs','verify-match.mjs','verify-intro.mjs','player-parameters.mjs','status-assets.mjs','constructor.html','fighter-base-assets.mjs','verify-purin.mjs','verify-pikachu.mjs','verify-samus.mjs','verify-koopa.mjs','verify-link.mjs','verify-yoshi.mjs','verify-mewtwo.mjs','verify-gamewatch.mjs','verify-mario-family.mjs','purin-extra-assets.mjs','fox-extra-assets.mjs','item-model-assets.mjs','verify-item-models.mjs','secondary-animation-assets.mjs','verify-secondary-animation.mjs','gameplay-assets.mjs','verify-gameplay.mjs','verify-fighter-animation.mjs','dynamics-assets.mjs','verify-dynamics.mjs','fighter-init-assets.mjs','verify-fighter-init.mjs','fighter-init.html','startup.html','verify-startup.mjs','costume-assets.mjs','animation-object-assets.mjs','material-animation-assets.mjs','verify-material-animation.mjs','visibility-assets.mjs','auxiliary-assets.mjs','verify-lights.mjs','attribute-assets.mjs','verify-attributes.mjs','character-collision-assets.mjs','verify-character-collision.mjs','verify-common-initialization.mjs','joint-animation-assets.mjs','verify-cpu.mjs','cpu-assets.mjs','color-reference.mjs','verify-colors.mjs','color-assets.mjs','verify-shared.mjs','shared-assets.mjs','verify-motions.mjs','motion-assets.mjs','motion-animations.mjs','verify-commands.mjs','resident-files.mjs','verify-resident-files.mjs','archive.mjs','scene-assets.mjs','verify-scene.mjs','scene.html', 'stage-collision.mjs', 'fighter-assets.mjs', 'verify-fighters.mjs',
  'animation-assets.mjs', 'verify-animations.mjs','math-reference.mjs','verify-math.mjs',
  'joint-assets.mjs','verify-poses.mjs','mesh-assets.mjs','verify-meshes.mjs','skin-assets.mjs','verify-skin.mjs','material-assets.mjs','texture.mjs','texture-matrix.mjs','gpu-mesh.mjs','verify-gpu-conventions.mjs','gpu-preview.mjs','gpu-preview.html','estimate-vectors.mjs','verify.mjs', 'verify-runtime.mjs', 'index.html'])
  fs.copyFileSync(path.join(root, 'engines/browser-native', name), path.join(output, name));
const wasm = fs.readFileSync(path.join(output, moduleName+'.wasm'));
const module = new WebAssembly.Module(wasm);
const report = {source, compiler:execFileSync(compiler, ['--version'], {encoding:'utf8'}).split('\n')[0],
  units:selectedUnits,portableSource:portable.manifest,selectedSdkFunctions,selectedHsdFunctions:['MakeTextureMtx'],arithmeticReference:provenance,flags:flags.filter(x=>!x.startsWith('-I')), wasmBytes:wasm.length,
  wasmSha256:createHash('sha256').update(wasm).digest('hex'), imports:WebAssembly.Module.imports(module),
  ...(scene?{sceneBringup:sceneInputs}:{}),...(gameInputs?{gameInputs}:{}),...(startup?{startupEntry:'Fighter_FirstInitialize_80067A84',startupLights:'original Ground fallback; tournament stage initialization pending'}:{}),playable:false, gameplayParity:false, performanceCertified:false};
fs.writeFileSync(path.join(output, fighterInit?'fighter-init-build.json':startup?'startup-build.json':scene?'scene-build.json':'build.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
