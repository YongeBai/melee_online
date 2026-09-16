// Scene-loader bring-up only. HSD class vtables retain drawing methods even
// when loading objects. Unimplemented GX calls abort by name; none are no-ops.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export function sceneLinkInputs(root,upstream,output,additionalFiles=[]) {
  const auditDir=path.join(output,'audit'),report=JSON.parse(fs.readFileSync(path.join(auditDir,'link-report.json')));
  const recipe=createHash('sha256').update(fs.readFileSync(new URL('./portable-source.mjs',import.meta.url))).digest('hex');
  if(report.portableSource?.recipeSha256!==recipe)throw Error('Re-run native compile/link audits before scene bring-up');
  const memoryLightFunctions=new Set(['GXInitLightAttn','GXInitLightAttnA','GXGetLightAttnA','GXInitLightAttnK','GXGetLightAttnK',
    'GXInitLightSpot','GXInitLightDistAttn','GXInitLightPos','GXGetLightPos','GXInitLightDir','GXGetLightDir',
    'GXInitSpecularDir','GXInitSpecularDirHA','GXInitLightColor','GXGetLightColor']);
  const materialDrawing=['GXSetNumIndStages','GXSetIndTexOrder','GXSetIndTexCoordScale','GXSetIndTexMtx','GXSetTevIndirect'];
  const tevSource=path.join(root,'engines/browser-native/tev-state.c'),textureSource=path.join(root,'engines/browser-native/texture-state.c'),pixelSource=path.join(root,'engines/browser-native/pixel-state.c'),modelSource=path.join(root,'engines/browser-native/model-state.c');
  const tevFunctions=new Set([...(fs.readFileSync(tevSource,'utf8')+fs.readFileSync(textureSource,'utf8')+fs.readFileSync(pixelSource,'utf8')+fs.readFileSync(modelSource,'utf8')).matchAll(/\bvoid (GX\w+)\(/g)].map(m=>m[1]));
  const missing=[...new Set([...report.results.find(x=>x.entry==='HSD_JObjLoadJoint').missing,...materialDrawing])].filter(name=>!memoryLightFunctions.has(name)&&!tevFunctions.has(name));
  if(missing.some(name=>!name.startsWith('GX')))throw Error('Scene loader has unresolved non-GX dependencies');
  const headers=execFileSync('rg',['--files','libs/dolphin/include/dolphin/gx','-g','*.h'],{cwd:upstream,encoding:'utf8'})
    .trim().split('\n').map(file=>fs.readFileSync(path.join(upstream,file),'utf8')).join('\n');
  const definitions=missing.map(name=>{
    const declarations=[...new Set([...headers.matchAll(new RegExp('\\bvoid\\s+'+name+'\\s*\\([^;{}]*\\)\\s*;','g'))]
      .map(m=>m[0].replace(/\s+/g,' ').trim()))];
    if(declarations.length!==1)throw Error('GX prototype is ambiguous or absent: '+name);
    return declarations[0].slice(0,-1)+` { fprintf(stderr,"Scene loader attempted unimplemented GX: ${name}\\n"); abort(); }`;
  });
  const guards=path.join(output,'scene-gx-guards.c');
  fs.writeFileSync(guards,'#include <dolphin/gx.h>\n#include <stdio.h>\n#include <stdlib.h>\n'+definitions.join('\n')+'\n');
  const failed=new Set(JSON.parse(fs.readFileSync(path.join(auditDir,'report.json'))).failures.map(f=>f.file));
  const objects=execFileSync('rg',['--files','src/sysdolphin','-g','*.c'],{cwd:upstream,encoding:'utf8'}).trim().split('\n')
    .filter(file=>!failed.has(file)).map(file=>path.join(auditDir,file.replaceAll('/','_')+'.o'));
  const library=path.join(auditDir,'scene-hsd.a');fs.rmSync(library,{force:true});
  execFileSync(path.join(root,'.browser-tools/emsdk/upstream/emscripten/emar'),['rcs',library,...objects]);
  // The animation loader needs character filenames; callers can additionally
  // retain original per-character initialization routines. Explicit objects
  // allow dead-code elimination without recursively extracting
  // unrelated game/platform implementations from the full audit library.
  const characterFiles=execFileSync('rg',['-l','char.*Init_AnimDatFilename.*=','src/melee/ft','-g','*.c'],{cwd:upstream,encoding:'utf8'}).trim().split('\n').sort();
  if(characterFiles.length!==33||characterFiles.some(file=>failed.has(file)))throw Error('Character animation filename source set changed');
  if(additionalFiles.some(file=>failed.has(file)))throw Error('Required character loader failed the compile audit');
  const characterObjects=[...new Set([...characterFiles,...additionalFiles])].map(file=>path.join(auditDir,file.replaceAll('/','_')+'.o'));
  return {files:[path.join(root,'engines/browser-native/scene.c'),tevSource,textureSource,pixelSource,modelSource,guards,library,...characterObjects],
    unavailableGX:missing,auditOptimization:'-O0',renderingReady:false};
}
