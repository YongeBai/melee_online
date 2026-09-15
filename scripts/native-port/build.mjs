import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const source = JSON.parse(fs.readFileSync(new URL('./source.json', import.meta.url)));
const upstream = path.join(root, 'engines/melee-decomp');
const output = path.join(root, 'dist/native-port');
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
const units = ['src/melee/mp/mpcoll.c', 'src/melee/mp/mplib.c', 'src/melee/gr/ground.c', 'src/melee/ft/ftcommon.c',
  'src/MSL/trigf.c', 'src/MSL/math_data.c', 'src/sysdolphin/baselib/mtx.c',
  'src/sysdolphin/baselib/random.c', 'src/sysdolphin/baselib/archive.c',
  'src/sysdolphin/baselib/memory.c', 'src/sysdolphin/baselib/initialize.c',
  'src/sysdolphin/baselib/objalloc.c', 'libs/dolphin/src/dolphin/os/OSAlloc.c',
  'src/sysdolphin/baselib/fobj.c', 'src/sysdolphin/baselib/spline.c', 'src/sysdolphin/baselib/aobj.c',
  ...['gobj','gobjproc','gobjplink','gobjgxlink','gobjobject','gobjuserdata'].map(n=>'src/sysdolphin/baselib/'+n+'.c')];
const exports = ['malloc', 'free', 'portInterpolate', 'portSeed', 'portRandom',
  'portStagePrune', 'portStageMetric', 'portArchiveOpen', 'portArchiveSymbol',
  'portArchiveClose', 'portRuntimeInit', 'portRuntimeStep', 'portRuntimeProbeCreate',
  'portRuntimeProbePause', 'portRuntimeProbeRead', 'portRuntimeProbeReset',
  'portRuntimeProbeClear', 'portRuntimeHeapFree', 'portRuntimeObjectsUsed', 'portRuntimeProcsUsed',
  'portFighterAttribute', 'portFighterPhysicsProbe', 'portAnimationCreate', 'portAnimationRun', 'portAnimationDestroy',
  'portAnimationTimeline', 'PSMTXIdentity','PSMTXCopy','PSMTXScale','PSMTXTranspose','PSMTXConcat',
  'PSMTXMultVec','PSMTXMultVecSR','PSVECAdd','PSVECSubtract','PSVECScale','PSVECDotProduct',
  'PSVECSquareMag','PSVECCrossProduct','HSD_MtxSRT','HSD_MkRotationMtx','sinf','cosf',
  'portPoseCreate','portPoseNode','portPoseTrack','portPoseRewind','portPoseStep','portPoseDestroy'];
const flags = ['-O2', '-fno-fast-math', '-ffp-contract=off', '-fno-strict-aliasing',
  '-fno-builtin-sinf', '-fno-builtin-cosf', '-fno-builtin-tanf',
  '-ffunction-sections', '-fdata-sections', '-I' + path.join(output, 'include'),
  '-Isrc', '-Ilibs/dolphin/include'];
execFileSync(compiler, [...flags, ...units, path.join(root, 'engines/browser-native/platform.c'),
  path.join(root, 'engines/browser-native/runtime.c'),
  path.join(root, 'engines/browser-native/fighter.c'),
  path.join(root, 'engines/browser-native/animation.c'),
  path.join(root, 'engines/browser-native/math.c'),
  path.join(root, 'engines/browser-native/pose.c'),
  '-sEXPORTED_FUNCTIONS=' + exports.map(x => '_' + x).join(','),
  '-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32', '-sMODULARIZE=1',
  '-sEXPORT_NAME=createMeleeNative', '-sENVIRONMENT=web,node', '-sALLOW_MEMORY_GROWTH=1',
  '-sASSERTIONS=1', '-o', path.join(output, 'melee-native.mjs')], {cwd:upstream, stdio:'inherit'});
for (const name of ['archive.mjs', 'stage-collision.mjs', 'fighter-assets.mjs', 'verify-fighters.mjs',
  'animation-assets.mjs', 'verify-animations.mjs','math-reference.mjs','verify-math.mjs',
  'joint-assets.mjs','verify-poses.mjs','verify.mjs', 'verify-runtime.mjs', 'index.html'])
  fs.copyFileSync(path.join(root, 'engines/browser-native', name), path.join(output, name));
const wasm = fs.readFileSync(path.join(output, 'melee-native.wasm'));
const module = new WebAssembly.Module(wasm);
const report = {source, compiler:execFileSync(compiler, ['--version'], {encoding:'utf8'}).split('\n')[0],
  units, flags:flags.filter(x=>!x.startsWith('-I')), wasmBytes:wasm.length,
  wasmSha256:createHash('sha256').update(wasm).digest('hex'), imports:WebAssembly.Module.imports(module),
  playable:false, gameplayParity:false, performanceCertified:false};
fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
