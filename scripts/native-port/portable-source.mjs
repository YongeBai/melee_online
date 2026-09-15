// Keep the pinned checkout pristine. Typed adapters reconcile known decomp
// declarations with C's callback ABI without pointer casts or warning suppression.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const digest=text=>createHash('sha256').update(text).digest('hex');
export function adaptStageCallbacks(text,externalBooleanCallbacks=new Set()) {
  const adapters=[];
  text=text.replace(/\b((?:struct\s+)?StageData\s+\w+\s*=\s*\{)([\s\S]*?)(\};)/g,(whole,start,body,end)=>{
    // These pinned descriptors contain flat fields. Preserve all other bytes.
    const fields=body.split(',');if(fields.length<10)throw Error('Stage descriptor shape changed');
    const name=fields[4].trim();if(!/^\w+$/.test(name))throw Error('Stage callback expression changed');
    if(!externalBooleanCallbacks.has(name)&&!new RegExp('\\bvoid\\s+'+name+'\\s*\\(\\s*bool\\s+\\w+\\s*\\)\\s*\\{').test(text))return whole;
    const wrapper='port_demo_'+name;
    adapters.push({function:name,adapter:wrapper,from:'void(bool)',to:'void(int)',conversion:'argument != 0'});
    fields[4]=fields[4].replace(name,wrapper);
    return `static void ${wrapper}(int value) { ${name}(value != 0); }\n\n`+start+fields.join(',')+end;
  });
  return {text,adapters};
}
export function preparePortableSource(source,output) {
  const destination=path.join(output,'portable');
  const files=execFileSync('rg',['--files','src','libs/dolphin/include','libs/dolphin/src','-g','*.c','-g','*.h'],
    {cwd:source,encoding:'utf8'}).trim().split('\n').sort();
  const patches=[];
  const booleanCallbacks=new Set();
  for(const file of files.filter(f=>f.startsWith('src/melee/gr/')&&f.endsWith('.c')))
    for(const match of fs.readFileSync(path.join(source,file),'utf8').matchAll(/\bvoid\s+(\w+)\s*\(\s*bool\s+\w+\s*\)\s*\{/g))booleanCallbacks.add(match[1]);
  const exact=(text,from,to,file)=>{
    if(text.split(from).length!==2)throw Error('Portable declaration patch changed: '+file+' '+from);
    return text.replace(from,to);
  };
  for(const file of files) {
    const original=fs.readFileSync(path.join(source,file),'utf8');let text=original,adapters=[];
    const replace=(from,to)=>{text=exact(text,from,to,file);};
    // Match the implemented function signatures, retaining their original bodies.
    if(file==='src/melee/gr/grkraid.h')replace('void grKraid_OnDemoInit(bool);','void grKraid_OnDemoInit(int);');
    if(file==='src/melee/gr/grtzelda.c')replace('void grTZelda_OnDemoInit(bool);','void grTZelda_OnDemoInit(int);');
    if(file==='src/melee/gr/grkinokoroute.h')replace('bool grKinokoRoute_80208480(bool);','bool grKinokoRoute_80208480(int);');
    if(file==='src/melee/gr/grshrineroute.c')replace('bool hide);','int hide);');
    if(file==='src/melee/lb/lbcardnew.h') {
      replace('bool lb_8001B8C8(int chan);','int lb_8001B8C8(int chan);');
      replace('bool lb_8001BA44(int chan,','int lb_8001BA44(int chan,');
    }
    // Retail PPC keeps these values in r3 across calls. C needs the return and
    // argument flow spelled out; the apparent void signatures are not portable.
    if(file==='src/melee/ft/ftlib.h')replace('void ftLib_800876B4(HSD_GObj*);','bool ftLib_800876B4(HSD_GObj*);');
    if(file==='src/melee/ft/ftlib.c')replace('void ftLib_800876B4(HSD_GObj* gobj)\n{\n    ftAnim_IsFramesRemaining(gobj);\n}',
      'bool ftLib_800876B4(HSD_GObj* gobj)\n{\n    return ftAnim_IsFramesRemaining(gobj);\n}');
    if(file==='src/melee/gm/gm_1798.c')replace('extern s32 ftLib_800876B4(HSD_GObj*);','extern bool ftLib_800876B4(HSD_GObj*);');
    if(file==='src/melee/mn/mnmainrule.c')replace('void mnCharSel_802640A0(void);','s32 mnCharSel_802640A0(void);');
    if(file==='src/melee/mn/mnhyaku.c') {
      replace('void gm_801677E8(void);','void gm_801677E8(s8);');
      replace('mn_802295AC();\n        gm_801677E8();','gm_801677E8(mn_802295AC());');
    }
    if(file.startsWith('src/melee/gr/')&&file.endsWith('.c')) {
      const result=adaptStageCallbacks(text,booleanCallbacks);text=result.text;adapters.push(...result.adapters);
    }
    if(file==='src/melee/gr/gricemt.c') {
      replace('static int fn_801FA4CC(int num);','static int fn_801FA4CC(int num);\n'+
        'static bool port_route_fn_801FA4CC(int value) { return fn_801FA4CC(value) != 0; }');
      replace('gm_801674C4(14, 2, 2, 0, fn_801FA4CC);','gm_801674C4(14, 2, 2, 0, port_route_fn_801FA4CC);');
      adapters.push({function:'fn_801FA4CC',adapter:'port_route_fn_801FA4CC',from:'int(int)',to:'bool(int)',conversion:'result != 0'});
    }
    if(file==='src/melee/it/kinds/itmewtwodisable.c') {
      replace('ItemStateTable it_803F7750[1] =',
        'static bool port_disable_collision(Item_GObj* object) { return itMewtwodisable_UnkMotion0_Coll(object) != 0; }\n\nItemStateTable it_803F7750[1] =');
      replace('itMewtwodisable_UnkMotion0_Coll };','port_disable_collision };');
      adapters.push({function:'itMewtwodisable_UnkMotion0_Coll',adapter:'port_disable_collision',from:'int(Item_GObj*)',to:'bool(Item_GObj*)',conversion:'result != 0'});
    }
    const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
    if(text!==original)patches.push({file,originalSha256:digest(original),portableSha256:digest(text),adapters});
  }
  // Expose this one MSL declaration without putting all MSL headers ahead of
  // the host standard library (which would select incompatible FILE layouts).
  fs.writeFileSync(path.join(output,'include/printf.h'),'#include <MSL/printf.h>\n');
  const manifest={recipeSha256:digest(fs.readFileSync(new URL(import.meta.url))),files:files.length,patches,
    callbackDiagnosticSuppressed:false,functionPointerCasts:false};
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {directory:destination,manifest};
}
