import {readSharedSpec,sharedProbeSource} from './shared-spec.mjs';
import {readMotionSpec} from './motion-spec.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {preparePortableSource} from './portable-source.mjs';
import {commandProbeSource} from './command-probes.mjs';
import {sceneLinkInputs} from './scene-link.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const source = JSON.parse(fs.readFileSync(new URL('./source.json', import.meta.url)));
const upstream = path.join(root, 'engines/melee-decomp');
const output = path.join(root, 'dist/native-port');
const scene=process.argv.includes('--scene'),moduleName=scene?'melee-scene':'melee-native';
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
// This SDK file mixes portable C with inline PPC assembly. Select two complete
// unchanged C definitions from the pinned source rather than compile asm stubs.
const sdkMatrix=fs.readFileSync(path.join(upstream,'libs/dolphin/src/dolphin/mtx/mtx.c'),'utf8');
const selectedSdkFunctions=['MTXRotRad','C_MTXLookAt'];
const selectedText=[['void MTXRotRad(', '\nvoid PSMTXRotTrig('],
  ['void C_MTXLookAt(', '\nvoid MTXLightFrustum(']].map(([start,end])=>{
    if(sdkMatrix.split(start).length!==2||sdkMatrix.split(end).length!==2)throw Error('SDK function selection changed');
    const from=sdkMatrix.indexOf(start),to=sdkMatrix.indexOf(end,from);
    if(to<from)throw Error('Invalid SDK selection');return sdkMatrix.slice(from,to);
  });
const selectedSdk=path.join(output,'sdk-camera.c');
fs.writeFileSync(selectedSdk,'#include <dolphin.h>\n#include <math.h>\n'+selectedText.join('\n'));
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
  'portArchiveClose', 'portRuntimeInit', 'portRuntimeStep', 'portRuntimeProbeCreate',
  'portRuntimeProbePause', 'portRuntimeProbeRead', 'portRuntimeProbeReset',
  'portRuntimeProbeClear', 'portRuntimeHeapFree', 'portRuntimeObjectsUsed', 'portRuntimeProcsUsed',
  'portFighterAttribute', 'portFighterPhysicsProbe', 'portAnimationCreate', 'portAnimationRun', 'portAnimationDestroy',
  'portAnimationTimeline', 'PSMTXIdentity','PSMTXCopy','PSMTXScale','PSMTXTranspose','PSMTXConcat',
  'PSMTXMultVec','PSMTXMultVecSR','PSVECAdd','PSVECSubtract','PSVECScale','PSVECDotProduct',
  'PSVECSquareMag','PSVECCrossProduct','HSD_MtxSRT','HSD_MkRotationMtx','sinf','cosf',
  'portPoseCreate','portPoseNode','portPoseTrack','portPoseRewind','portPoseStep','portPoseDestroy',
  'portFrsqrte','portFres','portRound25','portEstimateBits','PSVECNormalize','PSVECMag','PSMTXTrans',
  'MTXFrustum','MTXPerspective','MTXOrtho','MTXRotRad','C_MTXLookAt','PSMTXQuat','PSMTXInverse','PSMTXRotAxisRad',
  'portSkinMatrices','portSkinVertices','portTextureMatrix','portPoseFlags',
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
const sceneInputs=scene?sceneLinkInputs(root,upstream,output):null;
if(scene) {
  exports=exports.filter(name=>!['portInterpolate','portSeed','portRandom','portStagePrune','portStageMetric','portArchiveOpen','portArchiveSymbol','portArchiveClose','portFighterAttribute','portFighterPhysicsProbe'].includes(name));
  exports.push('portCollisionAttach','portCollisionReset','portCollisionWorld','portCollisionRead','portSharedInitialize','portSharedGlobal','portSceneJointAnimation','portCpuScript','portCpuChoose','portColorCreate','portColorDestroy','portColorSelect','portColorStep','portColorRead','portSharedField','portSharedPart','portSharedLanding','portMotionCreate','portMotionDestroy','portMotionLoad','portMotionEntry','portMotionLive','portMotionBuffers','portFilePins',
    'portSceneObjectDeleteNextStep','portSceneObjectCreate','portSceneObjectRoot','portSceneObjectFree','portSceneLoad','portSceneDestroy','portSceneCollect','portSceneMatrices','portSceneMetric','portSceneLiveJoints',
    'portFileInstall','portFileCount','portFileBytes','portFileReads','portFileAllocations','portFileClear','portFileArchive','portFileArchiveClose','portFileArchivePair',
    'portSceneAnimation','portSceneRequest','portSceneAnimate','portSceneFlags','portSceneLiveObjects');
}
const selectedUnits=scene?units.filter(file=>!file.startsWith('src/melee/')):units;
selectedUnits.push('src/melee/lb/lbcommand.c');
if(scene)selectedUnits.push('src/melee/ft/ftcoll.c','src/melee/lb/lbcollision.c','src/melee/lb/lb_00B0.c','src/melee/lb/lbanim.c','src/melee/lb/lbarchive.c','src/melee/lb/lb_013B.c','src/melee/lb/lb_0219.c','src/melee/ft/ftaction.c','src/melee/ft/ftcmdscript.c','src/melee/ft/ftcpuattack.c','src/melee/ft/ftdata.c','src/melee/ft/ftparts.c','src/melee/ft/ftcommon.c','src/melee/ft/fighter.c','src/melee/pl/player.c');
execFileSync(compiler, [...flags, ...selectedUnits.map(file=>path.join(portable.directory,file)), selectedSdk,textureSource,...estimateObjects,
  path.join(root, 'engines/browser-native/errors.c'),commandProbe,path.join(root,'engines/browser-native/commands.c'),
  ...(scene?[]:[path.join(root, 'engines/browser-native/platform.c'),path.join(root, 'engines/browser-native/fighter.c')]),
  path.join(root, 'engines/browser-native/runtime.c'),
  path.join(root, 'engines/browser-native/animation.c'),
  path.join(root, 'engines/browser-native/math.c'),
  path.join(root, 'engines/browser-native/matrix-special.c'),
  path.join(root, 'engines/browser-native/pose.c'),
  path.join(root, 'engines/browser-native/skin.c'),
  ...(sceneInputs?[path.join(root,'engines/browser-native/character-collision.c'),sharedProbe,path.join(root,'engines/browser-native/cpu.c'),path.join(root,'engines/browser-native/colors.c'),path.join(root,'engines/browser-native/shared.c'),path.join(root,'engines/browser-native/motions.c'),path.join(root,'engines/browser-native/resident-files.c'),...sceneInputs.files]:[]),
  '-sEXPORTED_FUNCTIONS=' + exports.map(x => '_' + x).join(','),
  '-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32', '-sMODULARIZE=1',
  '-sEXPORT_NAME=createMeleeNative', '-sENVIRONMENT=web,node', '-sALLOW_MEMORY_GROWTH=1',
  '-sASSERTIONS=1', '-o', path.join(output, moduleName+'.mjs')], {cwd:upstream, stdio:'inherit'});
for (const name of ['character-collision-assets.mjs','verify-character-collision.mjs','verify-common-initialization.mjs','joint-animation-assets.mjs','verify-cpu.mjs','cpu-assets.mjs','color-reference.mjs','verify-colors.mjs','color-assets.mjs','verify-shared.mjs','shared-assets.mjs','verify-motions.mjs','motion-assets.mjs','motion-animations.mjs','verify-commands.mjs','resident-files.mjs','verify-resident-files.mjs','archive.mjs','scene-assets.mjs','verify-scene.mjs','scene.html', 'stage-collision.mjs', 'fighter-assets.mjs', 'verify-fighters.mjs',
  'animation-assets.mjs', 'verify-animations.mjs','math-reference.mjs','verify-math.mjs',
  'joint-assets.mjs','verify-poses.mjs','mesh-assets.mjs','verify-meshes.mjs','skin-assets.mjs','verify-skin.mjs','material-assets.mjs','texture.mjs','texture-matrix.mjs','gpu-mesh.mjs','verify-gpu-conventions.mjs','gpu-preview.mjs','gpu-preview.html','estimate-vectors.mjs','verify.mjs', 'verify-runtime.mjs', 'index.html'])
  fs.copyFileSync(path.join(root, 'engines/browser-native', name), path.join(output, name));
const wasm = fs.readFileSync(path.join(output, moduleName+'.wasm'));
const module = new WebAssembly.Module(wasm);
const report = {source, compiler:execFileSync(compiler, ['--version'], {encoding:'utf8'}).split('\n')[0],
  units:selectedUnits,portableSource:portable.manifest,selectedSdkFunctions,selectedHsdFunctions:['MakeTextureMtx'],arithmeticReference:provenance,flags:flags.filter(x=>!x.startsWith('-I')), wasmBytes:wasm.length,
  wasmSha256:createHash('sha256').update(wasm).digest('hex'), imports:WebAssembly.Module.imports(module),
  ...(scene?{sceneBringup:sceneInputs}:{}),playable:false, gameplayParity:false, performanceCertified:false};
fs.writeFileSync(path.join(output, scene?'scene-build.json':'build.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
