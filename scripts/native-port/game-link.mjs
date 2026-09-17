// Link the wider original game graph while keeping the real browser resident
// file boundary. Original definitions are renamed, not stubbed. File callers
// resolve to resident-files.c; the sword-trail wrapper scopes the GX receiver
// and calls the complete original drawing function.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export function renameBoundaryDefinitions(text,names) {
  for(const name of names) {
    const pattern=new RegExp('(^[^\\n;{}]*\\b)'+name+'(\\s*\\([^;{}]*\\)\\s*\\{)','gm');
    let count=0;text=text.replace(pattern,(_,before,after)=>{count++;return before+'port_unlinked_'+name+after;});
    if(count!==1)throw Error('Expected exactly one original boundary definition: '+name);
  }
  return text;
}
export function gameLinkInputs(root,upstream,output) {
  const replacements={
    'src/melee/lb/lbaudio_ax.c':['lbAudioAx_80027168','lbAudioAx_80027648'],
    'src/sysdolphin/baselib/axdriver.c':['AXDriver_8038E8EC','AXDriverStop','AXDriverPause','AXDriverResume','AXDriver_8038EA18'],
    'src/melee/gr/grpstadium.c':['grStadium_801D4548','grStadium_801D1290','grStadium_801D1390','grStadium_801D2528'],
    'src/melee/it/item.c':['Item_80267978'],
    'src/melee/it/it_26B1.c':['it_8026B3F8'],
    'src/melee/ft/ftafterimage.c':['ftCo_800C2600'],
    'src/melee/lb/lbfile.c':['lbFileGetSize','lbFile_8001668C','lbFile_800168A0'],
    'src/melee/lb/lbheap.c':['lbHeap_80015BD0','lbHeap_80015CA8'],
    'src/melee/lb/lbdvd.c':['lbDvd_8001819C'],
  };
  const audit=path.join(output,'audit'),portable=path.join(output,'portable');
  const report=JSON.parse(fs.readFileSync(path.join(audit,'report.json'))),failed=new Set(report.failures.map(f=>f.file));
  const files=execFileSync('rg',['--files','src/melee','src/sysdolphin','-g','*.c'],{cwd:upstream,encoding:'utf8'}).trim().split('\n').sort();
  const objects=files.filter(f=>!failed.has(f)&&!replacements[f]).map(f=>path.join(audit,f.replaceAll('/','_')+'.o'));
  const library=path.join(audit,'game-runtime.a');fs.rmSync(library,{force:true});
  execFileSync(path.join(root,'.browser-tools/emsdk/upstream/emscripten/emar'),['rcs',library,...objects]);
  const sources=Object.entries(replacements).map(([file,names])=>{
    const result=path.join(output,'runtime-'+path.basename(file));
    const text=fs.readFileSync(path.join(portable,file),'utf8');
    // Preserve local quoted includes after moving the generated source file.
    fs.writeFileSync(result,renameBoundaryDefinitions(text,names).replace(/^#include "([^"]+)"/gm,(_,name)=>'#include '+JSON.stringify(path.join(portable,path.dirname(file),name))));
    return result;
  });
  const names=JSON.parse(fs.readFileSync(new URL('./game-unimplemented.json',import.meta.url))).functions.filter(name=>!['GXSetTevClampMode','GXSetFog','GXSetFogRangeAdj','GXGetTexBufferSize','GXGetProjectionv','GXEnableTexOffsets','GXSetPointSize','GXSetLineWidth'].includes(name));
  const headers=execFileSync('rg',['--files','libs/dolphin/include','-g','*.h'],{cwd:upstream,encoding:'utf8'}).trim().split('\n').sort()
    .map(file=>fs.readFileSync(path.join(upstream,file),'utf8')).join('\n');
  const definitions=names.map(name=>{
    const pattern=new RegExp('(?:^|\\n)(?:extern\\s+)?([A-Za-z_][A-Za-z_0-9\\s*]*?\\b'+name+'\\s*\\([^;{}]*\\)\\s*;)','g');
    const candidates=[...new Set([...headers.matchAll(pattern)].map(m=>m[1].replace(/\s+/g,' ').replace(/\(\s*\)/g,'(void)').trim()))];
    if(candidates.length!==1)throw Error('Ambiguous or missing platform prototype: '+name+' '+JSON.stringify(candidates));
    return candidates[0].slice(0,-1)+' { fprintf(stderr,"Unimplemented native platform call: '+name+'\\n"); abort(); }';
  });
  const guards=path.join(output,'game-platform-guards.c');
  fs.writeFileSync(guards,'#include <dolphin.h>\n#include <dolphin/ax.h>\n#include <dolphin/thp/thp.h>\n#include <stdio.h>\n#include <stdlib.h>\n'+definitions.join('\n')+'\n');
  const menuGuards=path.join(output,'menu-platform-guards.c');
  fs.writeFileSync(menuGuards,'#include <sysdolphin/baselib/hsd_3915.h>\n#include <stdio.h>\n#include <stdlib.h>\n'+
    ['DrawRectangle','hsd_80391A04'].map(name=>{
      const header=fs.readFileSync(path.join(upstream,'src/sysdolphin/baselib/hsd_3915.h'),'utf8');
      const declaration=header.match(new RegExp('void '+name+'\\([^;]+;'))?.[0];if(!declaration)throw Error('Missing menu platform declaration '+name);
      return declaration.slice(0,-1)+' { fprintf(stderr,"Unimplemented native platform call: '+name+'\\n"); abort(); }';
    }).join('\n'));
  const modes=path.join(output,'sdk-video-modes.c'),modeSource=fs.readFileSync(path.join(upstream,'libs/dolphin/src/dolphin/gx/GXFrameBuf.c'),'utf8');
  fs.writeFileSync(modes,'#include <dolphin/gx.h>\n'+['GXNtsc480Int','GXNtsc480IntDf','GXNtsc480Prog'].map(name=>{
    const declaration=modeSource.match(new RegExp('GXRenderModeObj '+name+' = [\\s\\S]*?;'))?.[0];if(!declaration)throw Error('Missing original video mode '+name);return declaration;
  }).join('\n'));
  const font=fs.readFileSync(path.join(output,'fixtures/sis-font.bin'));
  if(font.length!==287*512||font.every(x=>x===0))throw Error('Prepare the original SIS font fixture before linking fighter initialization');
  const fontSource=path.join(output,'sis-font.c');
  fs.writeFileSync(fontSource,'#include <sysdolphin/baselib/sislib_font.h>\nTextGlyphTexture HSD_SisLib_FontAtlas[287] __attribute__((aligned(32))) = {\n'+
    Array.from({length:287},(_,i)=>'{{'+[...font.subarray(i*512,(i+1)*512)].join(',')+'}}').join(',\n')+'\n};\n');
  return {files:[...sources,guards,menuGuards,modes,fontSource,library],unavailablePlatform:names,fontBytes:font.length,fontSha256:createHash('sha256').update(font).digest('hex'),replacedDefinitions:replacements,linkedAuditObjects:objects.length};
}
