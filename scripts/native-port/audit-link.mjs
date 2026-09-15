// Probe live dependencies at actual initialization entry points. Never emit a
// runnable module with unresolved imports or pretend that a link proves parity.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const upstream=path.join(root,'engines/melee-decomp'),out=path.join(root,'dist/native-port/audit');
const bin=path.join(root,'.browser-tools/emsdk/upstream/emscripten');
const source=JSON.parse(fs.readFileSync(new URL('./source.json',import.meta.url)));
if(execFileSync('git',['rev-parse','HEAD'],{cwd:upstream,encoding:'utf8'}).trim()!==source.commit)
  throw Error('Expected pinned upstream');
const audit=JSON.parse(fs.readFileSync(path.join(out,'report.json')));
if(audit.sourceCommit!==source.commit)throw Error('Compile audit is stale');
if(!audit.overrides)throw Error('Re-run the compile audit to record platform overrides');
for(const {file,sha256} of audit.overrides)if(createHash('sha256').update(fs.readFileSync(path.join(root,'dist/native-port/include',file))).digest('hex')!==sha256)
  throw Error('Re-run the compile audit after platform override changes');
const failed=new Set(audit.failures.map(x=>x.file));
const files=execFileSync('rg',['--files','src/melee','src/sysdolphin','-g','*.c'],{cwd:upstream,encoding:'utf8'})
  .trim().split('\n').filter(file=>!failed.has(file)).sort();
const objects=files.map(file=>path.join(out,file.replaceAll('/','_')+'.o'));
const library=path.join(out,'game-hsd.a');
fs.rmSync(library,{force:true});
execFileSync(path.join(bin,'emar'),['rcs',library,...objects]);
const native=path.join(root,'dist/native-port'),compiler=process.env.EMCC||path.join(bin,'emcc');
const flags=['-O2','-fno-fast-math','-ffp-contract=off','-fno-strict-aliasing',
  '-fno-builtin-sinf','-fno-builtin-cosf','-fno-builtin-tanf',
  '-I'+path.join(native,'include'),'-Isrc','-Ilibs/dolphin/include'];
const platformObjects=[path.join(native,'float-utils.o'),path.join(native,'estimates.o')];
const portableFiles=['src/MSL/trigf.c','src/MSL/math_data.c','src/MSL/float.c',
  'libs/dolphin/src/dolphin/os/OSAlloc.c','libs/dolphin/src/dolphin/mtx/mtx44.c',
  path.join(native,'sdk-camera.c'),...['platform.c','math.c','matrix-special.c'].map(f=>path.join(root,'engines/browser-native',f))];
for(let i=0;i<portableFiles.length;i++) {
  const object=path.join(out,'platform-'+i+'.o');
  const result=spawnSync(compiler,[...flags,'-c',portableFiles[i],'-o',object],{cwd:upstream,encoding:'utf8'});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(result.stderr);
  platformObjects.push(object);
}
const results=[];
for(const entry of ['HSD_JObjLoadJoint','Fighter_Create']) {
  const target=path.join(out,entry+'.wasm');fs.rmSync(target,{force:true});
  const result=spawnSync(compiler,[...platformObjects,library,
    '--no-entry','-sEXPORTED_FUNCTIONS=_'+entry,'-Wl,--error-limit=0','-o',target],
    {cwd:upstream,encoding:'utf8',maxBuffer:16*1024**2});
  if(result.error)throw result.error;
  const diagnostics=result.stdout+result.stderr;
  fs.writeFileSync(path.join(out,entry+'-link.log'),diagnostics);
  const missing=[...new Set([...diagnostics.matchAll(/undefined symbol: (\S+)/g)].map(x=>x[1]))].sort();
  results.push({entry,linked:result.status===0,missingCount:missing.length,missing,
    otherErrors:diagnostics.split('\n').filter(line=>line.includes('error:')&&!line.includes('undefined symbol:')&&!line.startsWith('emcc: error:')).slice(0,20)});
  // Diagnostic target only: never serve or promote this audit artifact.
  fs.rmSync(target,{force:true});
}
const report={source,scope:'Reachable game/HSD objects with implemented native arithmetic, SDK projection, heap and panic boundaries',
  overrides:audit.overrides,
  compileFailuresExcluded:failed.size,linkedObjects:objects.length,results,gameplayParity:false};
fs.writeFileSync(path.join(out,'link-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results.map(({entry,linked,missingCount,otherErrors})=>({entry,linked,missingCount,otherErrors})),null,2));
