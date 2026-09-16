// Keep the pinned checkout pristine. Typed adapters reconcile known decomp
// declarations with C's callback ABI without pointer casts or warning suppression.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const digest=text=>createHash('sha256').update(text).digest('hex');
export function adaptMotionStateWord(text) {
  const record=/struct MotionState \{([\s\S]*?)\n\};/.exec(text);
  if(!record||!record[1].includes('u8 move_id : 8;')||!record[1].includes('u8 x9_b7 : 1;'))throw Error('Motion state word layout changed');
  const start=record[0].indexOf('        struct {'),end=record[0].indexOf('        };',start);
  // The first closing anonymous struct ends the inner flag byte; the second
  // ends its numeric-word view. All table initializers remain unchanged.
  const finish=record[0].indexOf('        };',end+10);
  if(start<0||finish<0||!record[0].slice(start,finish).includes('u8 xB;'))throw Error('Motion state word shape changed');
  const fields=[{field:'xB',width:8,shift:0},{field:'xA',width:8,shift:8},...Array.from({length:8},(_,i)=>({field:'x9_b'+(7-i),width:1,shift:16+i})),{field:'move_id',width:8,shift:24}];
  const view='        struct {\n'+fields.map(f=>'            u32 '+f.field+' : '+f.width+';').join('\n')+'\n        };';
  const converted=record[0].slice(0,start)+view+record[0].slice(finish+10);
  return {text:text.replace(record[0],converted),fields:fields.map(f=>({...f,signed:false,view:'motionState',member:null,path:f.field,word:2}))};
}
export function adaptPartnerStickConversion(text) {
  const marker=/static inline u8 inlineM0\(float x\)\n\{([\s\S]*?)\n\}/.exec(text);
  if(!marker||!marker[1].includes('return 127.0F * x;')||!marker[1].includes('return 128.0F * x;'))throw Error('Partner stick conversion changed');
  // Retail converts to a signed word, then stores its low byte. A negative
  // float-to-u8 conversion has no defined C result and saturates on WASM.
  return text.replace(marker[0],marker[0].replace('return 127.0F * x;','return (u8) (s32) (127.0F * x);').replace('return 128.0F * x;','return (u8) (s32) (128.0F * x);'));
}
export function adaptYoshiAttributes(text) {
  // Both retail views describe the same buffer. The loader's view calls the
  // Egg Throw fields padding, but SpecialHi reads them as floats through the
  // second view. Expose those fields to the typed endian importer as well.
  const padding='    u8 pad_xEC[0x114 - 0xEC];';
  const fields=['xEC','xF0','xF4','specialhi_base_angle','xFC','x100','x104','x108','x10C','x110'];
  if(text.split(padding).length!==2||fields.some(name=>!text.includes('float '+name+';')))throw Error('Yoshi attribute overlay changed');
  return text.replace(padding,fields.map(name=>'    float '+name+';').join('\n'));
}
export function adaptLinkArrowTable(text) {
  // USA 1.02 places it_803F6A84 exactly 23 float words after it_803F6A28.
  // WASM does not preserve adjacency between unrelated C global objects.
  const from='temp_r3 = (f32*) &it_803F6A28 + ip->xDD4_itemVar.linkarrow.x9C;',
    expression='(temp_r3[31] * rand) + temp_r3[23]';
  if(text.split(from).length!==3||text.split(expression).length!==3)throw Error('Link arrow table layout patch changed');
  return text.replaceAll(from,'temp_r3 = &it_803F6A84[ip->xDD4_itemVar.linkarrow.x9C];').replaceAll(expression,'(temp_r3[8] * rand) + temp_r3[0]');
}
export function adaptStageCallbacks(text,externalBooleanCallbacks=new Set()) {
  const adapters=[];
  text=text.replace(/\b((?:struct\s+)?StageData\s+\w+\s*=\s*\{)([\s\S]*?)(\};)/g,(whole,start,body,end)=>{
    // These pinned descriptors contain flat fields. Preserve all other bytes.
    const fields=body.split(',');if(fields.length<10)throw Error('Stage descriptor shape changed');
    const name=fields[4].trim();if(!/^\w+$/.test(name))throw Error('Stage callback expression changed');
    if(!externalBooleanCallbacks.has(name)&&!new RegExp('\\bvoid\\s+'+name+'\\s*\\(\\s*bool\\s+\\w+\\s*\\)\\s*\\{').test(text))return whole;
    const wrapper='port_demo_'+name;
    adapters.push({function:name,adapter:wrapper,from:'void(bool)',to:'void(int)',conversion:'identity (retail int bool)'});
    fields[4]=fields[4].replace(name,wrapper);
    return `static void ${wrapper}(int value) { ${name}(value); }\n\n`+start+fields.join(',')+end;
  });
  return {text,adapters};
}
export function preparePortableSource(source,output) {
  const destination=path.join(output,'portable');
  const files=execFileSync('rg',['--files','src','libs/dolphin/include','libs/dolphin/src','-g','*.c','-g','*.h'],
    {cwd:source,encoding:'utf8'}).trim().split('\n').sort();
  const patches=[],extraCommandFields=[];let commandLayout;
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
    if(file==='src/melee/ft/kinds/ftCommon/ftCo_0A01.c')text=adaptPartnerStickConversion(text);
    if(file==='src/melee/it/kinds/itlinkarrow.c')text=adaptLinkArrowTable(text);
    if(file==='src/melee/ft/kinds/ftYoshi/types.h')text=adaptYoshiAttributes(text);
    if(file==='libs/dolphin/include/dolphin/gx/GXVert.h') {
      const declarations=['u8','s8','u16','s16','u32','s32','u64','s64','f32','f64'].map(t=>'void portGXWrite_'+t+'('+t+' value);').join('\n');
      replace('#define GXFIFO_ADDR 0xCC008000',declarations+'\n#define GXFIFO_ADDR 0xCC008000');
      text=text.replace(/GXWGFifo\.T = (\w+);/g,'portGXWrite_##T($1);').replace(/GXWGFifo\.(u8|u16) = (\w+);/g,'portGXWrite_$1($2);');
    }
    if(file==='libs/dolphin/include/dolphin/gx/GXGeometry.h') {
      replace('    GXSetArray((attr), (data), (stride))','    portGXSetArraySized((attr), (data), (size), (stride))');
      replace('void GXSetArray(GXAttr attr, const void* base_ptr, u8 stride);','void GXSetArray(GXAttr attr, const void* base_ptr, u8 stride);\nvoid portGXSetArraySized(GXAttr, const void*, unsigned, u8);');
    }
    if(file==='src/sysdolphin/baselib/psdisp.c') {
      text=text.replace(/GXWGFifo\.(\w+)\s*=\s*([^;]+);/g,'portGXWrite_$1($2);');
      if(text.includes('GXWGFifo.'))throw Error('Unconverted particle FIFO access');
      // Render-only bank exclusion. The caller validates the stage; allocation,
      // lifetime, RNG, sorting and all simulation callbacks stay original.
      replace('typedef struct {\n    HSD_Particle* head;',
        'static unsigned portHiddenParticleBank = 32;\nvoid portParticleHideBank(unsigned bank) { HSD_ASSERT(0, bank <= 32); portHiddenParticleBank = bank; }\nstatic int portParticleHidden(HSD_Particle* p) { return portHiddenParticleBank < 32 && p->bank == portHiddenParticleBank; }\n\ntypedef struct {\n    HSD_Particle* head;');
      replace('                if (!(pp->size < FLT_EPSILON)) {',
        '                if (portParticleHidden(pp)) { pp = pp->next; continue; }\n                if (!(pp->size < FLT_EPSILON)) {');
      // Point batches must not consume an excluded particle before the outer
      // walker can skip it. Do not unlink or alter any particle state.
      if(text.split('    while (q != NULL) {').length!==3)throw Error('Particle point batch shape changed');
      text=text.replaceAll('    while (q != NULL) {','    while (q != NULL) {\n        if (portParticleHidden(q)) break;');
    }
    if(file==='src/sysdolphin/baselib/objalloc.c') {
      // WASM's address-zero page is mapped. An omitted pool initializer must
      // fail before a zero-size allocation can silently corrupt that page.
      const marker='void* HSD_ObjAlloc(HSD_ObjAllocData* data)\n{';
      replace(marker,marker+'\n    HSD_ASSERTREPORT(0, data && data->size >= sizeof(void*), "Native object pool was not initialized\\n");');
    }
    if(file==='src/melee/lb/lbvector.c') {
      // MTXPerspective/MTXOrtho write 16 floats. Retail stack padding cannot
      // make a 12-float C object safe on the WASM stack.
      replace('    Mtx projMtx;','    Mtx44 projMtx;');
    }
    if(file==='src/melee/ft/ft_0899.c') {
      // Retail stack-layout workaround for the rounded leg-slope length.
      // Indexing before sp1C overwrites an unrelated local on WASM, including
      // the Fighter pointer when crouching. Use the declared volatile scratch
      // scalar, retaining the original explicit f32 rounding/store/load.
      replace('((volatile f32*) &sp1C)[-1] = (f32) ((f64) line_len * guess);','line_len_sqrt = (f32) ((f64) line_len * guess);');
      replace('line_len = ((volatile f32*) &sp1C)[-1];','line_len = line_len_sqrt;');
    }
    if(file==='src/melee/gm/gm_1A3F.c') {
      // Browser scene bring-up owns the top-level nonblocking bootstrap. Set
      // the original routing context before running original VS callbacks;
      // zero-initialized globals otherwise report GM_TITLE during the match.
      // This does not replace mode loading, menus, or the results scene.
      const marker='/* 479D30 */ static struct stateMachine state_machine;';
      replace(marker,marker+'\nvoid portInitializeVsRouting(void) { state_machine = (struct stateMachine){0}; state_machine.routing.curr_mode = GM_VS; }\n');
    }
    if(file==='src/melee/gr/stage.c') {
      // Resident typed assets replace disc IO during browser bring-up. Keep the
      // original selection state used by the subsequent on-load/on-start calls.
      const selection='    selected_stage.stkind = stkind;\n    selected_stage.entry = &stage_id_map[stkind];';
      replace(selection,'    portStageSelectResident(stkind);');
      const marker='void Stage_802251E8(StKind stkind, s32* _)';
      replace(marker,'void portStageSelectResident(StKind stkind)\n{\n'+selection+'\n}\n\n'+marker);
    }
    if(file==='src/melee/cm/camera.c') {
      // Expose the unchanged gameplay pass sequence for the browser framebuffer
      // backend. The original camera callback uses this same sequence.
      const marker='static void fn_800301D0(HSD_GObj* gobj, int arg1)\n{';
      const start=text.indexOf(marker),a=text.indexOf('        Camera_800310A0(2);',start),b=text.indexOf('        if (Camera_80030AC4() != 0)',a);
      if(start<0||a<0||b<0)throw Error('Gameplay camera pass sequence changed');
      const body=text.slice(a,b);
      replace(body,'        portCameraDrawPasses(gobj);\n\n');
      replace(marker,'void portCameraDrawPasses(HSD_GObj* gobj)\n{\n    s64 prio8_a, prio1_a;\n'+body+'}\n\n'+marker);
    }
    if(file==='src/sysdolphin/baselib/gobj.c') {
      const marker='static inline void render_gobj(HSD_GObj* cur, int i)\n{';
      replace(marker,'static int (*portGXObserver)(HSD_GObj*, int);\nvoid portSetGXObserver(int (*observer)(HSD_GObj*, int)) { portGXObserver=observer; }\n\n'+marker+'\n    if (portGXObserver && portGXObserver(cur, i)) return;');
    }
    if(file==='src/melee/gm/gmvs.c') {
      // Status animation completion supplies an int argument. PPC tolerates
      // passing it to a void(void) function; WASM call_indirect requires a
      // matching signature. Adapt only that ABI boundary, retaining the body.
      const marker='void fn_8016B784(void)';
      replace(marker,'static void portReadyGoComplete(int status) { fn_8016B784(); }\nstatic void portReadyComplete(int status) { fn_8016B7F8(); }\n\n'+marker);
      text=text.replaceAll(', fn_8016B784);',', (Event) portReadyGoComplete);')
        .replaceAll(', fn_8016B7F8);',', (Event) portReadyComplete);');
    }
    if(file==='src/melee/if/ifall.c') {
      // Expose the unchanged layout/camera/light prefix for incremental HUD
      // bring-up. Full original initialization still invokes the same prefix.
      const start=text.indexOf('void ifAll_802F390C(void)'),split=text.indexOf('    ifStatus_802F7134();',start);
      if(start<0||split<0)throw Error('HUD initialization prefix changed');
      const prefix=text.slice(start,split),bodyStart=prefix.indexOf('    ifAll_802F370C(sp14);');
      if(bodyStart<0)throw Error('HUD layout initialization changed');
      const wrapper='void portHudInitializeBase(SceneDesc* sp14)\n{\n    HSD_LightDesc* lightdesc;\n    ifAll_ShowHUD();\n'+prefix.slice(bodyStart)+'}\nHSD_LObj* portHudLights(void) { return ifAll_804A0FD8.gobj_2->hsd_obj; }\n\n';
      replace(prefix,wrapper+prefix.slice(0,bodyStart)+'    portHudInitializeBase(sp14);\n\n');
    }
    if(file==='src/melee/gm/gm_1601.c') {
      // USA 1.02 0x80168B34..0x80168BF4 keeps ckind in r3 on the ordinary
      // branch, then adds costume * 30. The decomp's uninitialized local is
      // not that behavior and can select a blank stock-icon texture on WASM.
      replace('f32 gm_80168B34(CharacterKind ckind, int arg1, int arg2)\n{\n    int base;',
              'f32 gm_80168B34(CharacterKind ckind, int arg1, int arg2)\n{\n    int base = ckind;');
    }
    if(file==='src/sysdolphin/baselib/cobj.c') {
      // Browser framebuffer rendering uses the original offscreen branch.
      // Keep its native projection/viewport and current-camera ownership;
      // console VI and interlaced half-frame branches are not browser targets.
      text+='\nbool portCObjSetCurrentOffscreen(HSD_CObj* cobj) { if(!cobj)return false; _HSD_ZListClear(); current=cobj; if(!setupOffscreenCamera(cobj))return false; HSD_CObjSetupViewingMtx(cobj); return true; }\n';
    }
    if(file==='src/melee/gr/types.h') {
      replace('    u8 flag : 1;','    u8 : 7; u8 flag : 1;'); // GroundShadowEntry archive MSB.
      const fields=Array.from({length:8},(_,i)=>`            /* +10:${i} */ u8 flags_b${i} : 1;`).join('\n');
      replace(fields,'            u32 : 24;\n'+Array.from({length:8},(_,i)=>`            u32 flags_b${7-i} : 1;`).join('\n'));
    }
    if(file==='src/sysdolphin/baselib/aobj.c') {
      // Reuse HSD's original typed dispatcher at the stage-animation boundary.
      text+='\nvoid portAObjDispatch(HSD_AObj* a, void* o, HSD_Type t, void* f, AObj_Arg_Type k, callbackArg* p) { callbackForeachFunc(a,o,t,f,k,p); }\n';
    }
    if(file==='src/melee/gr/granime.c') {
      // The matching PPC decomp dispatch passes unused register arguments for
      // several callback forms. WASM requires the actual signature; HSD's own
      // dispatcher implements the same AOBJ_ARG enum with exact prototypes.
      const start=text.indexOf('\nvoid grAnime_801C6F50('),end=text.indexOf('\nvoid grAnime_801C706C(',start);
      if(start<0||end<=start)throw Error('Stage animation dispatch boundary changed');
      text=text.slice(0,start)+`\nextern void portAObjDispatch(HSD_AObj*,void*,HSD_Type,void*,AObj_Arg_Type,callbackArg*);
void grAnime_801C6F50(HSD_AObj* aobj,void* obj,u32 flags,void* func,u32 type,void* param)
{ portAObjDispatch(aobj,obj,flags,func,type,param); }
unsigned portStageAnimationProbe(float rate,unsigned flags)
{
    HSD_AObj a={0};callbackArg p;p.f=rate;
    grAnime_801C6F50(&a,NULL,0,HSD_AObjSetRate,AOBJ_ARG_AF,&p);
    if(a.framerate!=rate)return 0;
    p.d=flags;grAnime_801C6F50(&a,NULL,0,HSD_AObjSetFlags,AOBJ_ARG_AU,&p);
    if(a.flags!=(flags&(AOBJ_LOOP|AOBJ_NO_UPDATE)))return 0;
    grAnime_801C6F50(&a,NULL,0,HSD_AObjClearFlags,AOBJ_ARG_AU,&p);
    if(a.flags)return 0;
    grAnime_801C6F50(&a,NULL,0,fn_801C6F2C,AOBJ_ARG_A,NULL);
    return (a.flags&AOBJ_LOOP)!=0;
}
`+text.slice(end);
    }
    if(file==='src/sysdolphin/baselib/texp.c') {
      // The original compiler initializes only referenced constant channels.
      // Define the other channels rather than reading uninitialized C bytes.
      replace('    GXColor reg[8];','    GXColor reg[8] = { 0 };');
    }
    if(file==='src/melee/gm/types.h') {
      // This union is also read/written through its byte member. PPC b7 is
      // bit zero; retain that meaning on the little-endian WASM compiler.
      const fields=Array.from({length:8},(_,i)=>`        u8 b${i} : 1;`).join('\n');
      replace(fields,fields.split('\n').reverse().join('\n'));
    }
    if(file==='src/melee/cm/camera.c') {
      // Retail placed these separate symbols consecutively. C/WASM does not
      // promise that layout: use the actual original camera descriptor.
      replace('    struct CameraStaticData {\n        CameraModeCallbacks callbacks;\n        HSD_WObjDesc interest;\n        HSD_WObjDesc eyepos;\n        HSD_CameraDescPerspective desc;\n    }* data = (struct CameraStaticData*) &cm_803BCB18;','    HSD_CameraDescPerspective* desc = &cm_803BCB64;');
      text=text.replaceAll('data->desc.','desc->');
    }
    if(file==='src/melee/ef/eflib.c') {
      // The retail executable placed ParamTable immediately after AnimQueue.
      // These out-of-array writes otherwise corrupt unrelated WASM globals.
      for(const [from,to,count] of [
        ['efLib_AnimQueue + 0x10','efLib_ParamTable',2],
        ['efLib_AnimQueue[idx + 0x10]','efLib_ParamTable[idx]',4],
      ]) {
        if(text.split(from).length!==count+1)throw Error('Effect parameter table references changed');
        text=text.replaceAll(from,to);
      }
      replace('    desc = &((EF_EffectDesc*) efAsync_DatEntries[gfx_id / 1000]',
        '    HSD_ASSERTREPORT(0, gfx_id >= 0 && gfx_id / 1000 < 51 && efAsync_DatEntries[gfx_id / 1000].data != NULL, "Native effect bank not initialized: gfx=%d\\n", gfx_id);\n'+
        '    desc = &((EF_EffectDesc*) efAsync_DatEntries[gfx_id / 1000]');
    }
    if(file==='src/melee/gr/ground.c') {
      replace('    /* 0x4 */ u8 a : 1;\n    /* 0x4 */ u8 b : 1;\n    /* 0x4 */ u8 c : 1;\n    /* 0x4 */ u8 _ : 5;',
        '    /* Original archive byte: a=0x80, b=0x40, c=0x20. */\n    u8 _ : 5; u8 c : 1; u8 b : 1; u8 a : 1;');
      text+='\nunsigned portStageLightOverrideBits(unsigned bits) { LightOverrideEntry v={0}; ((u8*)&v)[4]=bits; return (v.a<<2)|(v.b<<1)|v.c; }\n';
      text+='LightList** portStageSelectLights(UnkArchiveStruct* archive, LightList** list) { return Ground_801C20E0(archive,list); }\n';
      text+='void portStageCreateGlobalLights(void) { Ground_801C466C(); }\n';
      text+='unsigned portStageCallbackBits(unsigned bits) { StageCallbacks v={0}; v.flags=bits; return (v.flags_b0<<7)|(v.flags_b1<<6)|(v.flags_b2<<5)|(v.flags_b3<<4)|(v.flags_b4<<3)|(v.flags_b5<<2)|(v.flags_b6<<1)|v.flags_b7; }\n';
      text+='unsigned portStageShadowBits(unsigned bits) { struct GroundShadowEntry v={0}; ((u8*)&v)[4]=bits; return v.flag; }\n';
    }
    if(file==='src/sysdolphin/baselib/particle.c') {
      // Particle teardown likewise aliases several independent retail globals
      // through a fabricated aggregate. Preserve the real list and pool owners.
      replace('    typedef struct {\n        HSD_JObj* jobj[8];\n        HSD_Particle* particle[146];\n        u8 pad[0x410];\n        HSD_ObjAllocData alloc_data;\n    } ParticleData;\n    ParticleData* data = (ParticleData*) hsd_804D08E8;','');
      replace('head = &data->particle[gen->linkNo];','head = &hsd_804D0908[gen->linkNo];');
      for(const [from,to,count] of [['data->jobj[jidx]','hsd_804D08E8[jidx]',3],['&data->alloc_data','&hsd_804D0F60.alloc_data',1]]) {
        if(text.split(from).length!==count+1)throw Error('Particle teardown references changed');
        text=text.replaceAll(from,to);
      }
      replace('    ((ParticleFloatBytes*) &hsd_804D78D0)->bytes[0] = *p++;\n'+
        '    ((ParticleFloatBytes*) &hsd_804D78D0)->bytes[1] = *p++;\n'+
        '    ((ParticleFloatBytes*) &hsd_804D78D0)->bytes[2] = *p++;\n'+
        '    ((ParticleFloatBytes*) &hsd_804D78D0)->bytes[3] = *p++;',
        '    hsd_804D78D0 = ((u32)p[0]<<24)|((u32)p[1]<<16)|((u32)p[2]<<8)|p[3];\n    p += 4;');
      text += '\nu32 portParticleOperandBits(u8* stream) { psReadFloat(&stream); return hsd_804D78D0; }\n';
    }
    if(file==='src/melee/it/types.h') {
      const start=text.indexOf('struct ItemAttr {'),end=text.indexOf('    u8 x3;',start);
      if(start<0||end<start||!text.slice(start,end).includes('x1_67_cam_kind'))throw Error('Item attribute flag layout changed');
      text=text.slice(0,start)+'struct ItemAttr {\n'+
        '    u8 x0_hold_kind : 3; u8 x0_78 : 4; u8 x0_is_heavy : 1;\n'+
        '    u8 x1_8 : 1; u8 x1_67_cam_kind : 2; u8 x1_5 : 1; u8 x1_4 : 1; u8 x1_3 : 1; u8 x1_1 : 2;\n'+text.slice(end);
    }
    if(file==='src/melee/it/itmaterial.h')replace('typedef void (*it_MObjSetupFunc)(HSD_MObj* mobj, u32 rendermode, u32 unused);',
      'typedef void (*it_MObjSetupFunc)(HSD_MObj* mobj, u32 rendermode);');
    if(file==='src/melee/it/itmaterial.c') {
      replace('void it_80277D08(void)\n{','static void port_item_material_setup(HSD_MObj* mobj,u32 mode) { fn_80277D8C(mobj,mode,0); }\n\nvoid it_80277D08(void)\n{');
      replace('it_mobj.setup = (it_MObjSetupFunc) fn_80277D8C;','it_mobj.setup = port_item_material_setup;');
      adapters.push({function:'fn_80277D8C',adapter:'port_item_material_setup',from:'void(HSD_MObj*,u32,u32)',to:'void(HSD_MObj*,u32)',conversion:'unused third parameter = 0'});
    }
    if(file==='src/melee/it/item.c') {
      text += '\nint portOriginalItemModelSetup(HSD_GObj* object) {\n'+
        '  if(!item_dynamic_bones_alloc_data.size)HSD_ObjAllocInit(&item_dynamic_bones_alloc_data,sizeof(DynamicBoneTable),4);\n'+
        '  Item_802680CC(object);if(!Item_802682F0(object))return 0;Item_8026814C(object);Item_8026849C(object);it_8027163C(object);return 1;\n}\n'+
        'void portOriginalItemModelRelease(Item* item) { if(item->xBBC_dynamicBoneTable)HSD_ObjFree(&item_dynamic_bones_alloc_data,item->xBBC_dynamicBoneTable); }\n'+
        'unsigned portOriginalItemModelLive(void) { return item_dynamic_bones_alloc_data.used+HSD_CLASS_INFO(&it_mobj)->head.nb_exist; }\n';
    }
    if(file==='src/melee/ft/ftmaterial.c') {
      // Retail .data has ftMObj, the TEV template and the constant template in
      // sequence. C does not guarantee that placement (or retain unused data).
      // Refer to the original template objects explicitly instead of indexing
      // beyond the smaller HSD_MObjInfo object through a fabricated aggregate.
      for(const [from,to,count] of [
        ['    struct ft_MObjInfo* info = (struct ft_MObjInfo*) &ftMObj;\n','',2],
        ['info->texp_tmpl','ftMaterial_803C6A44',3],
        ['info->tevdesc_tmpl','ftMaterial_803C69D0',2],
      ]) {
        if(text.split(from).length!==count+1)throw Error('Fighter material template references changed');
        text=text.replaceAll(from,to);
      }
      replace('void ftMaterial_800BF260(void)\n{',
        'static void port_material_setup(HSD_MObj* mobj,u32 mode)\n{ ftMaterial_800BF2B8(mobj,mode,0); }\n\nvoid ftMaterial_800BF260(void)\n{');
      replace('ftMObj.setup = (HSD_MObjSetupFunc) (Event) ftMaterial_800BF2B8;',
        'ftMObj.setup = port_material_setup;');
      adapters.push({function:'ftMaterial_800BF2B8',adapter:'port_material_setup',from:'void(HSD_MObj*,u32,u32)',to:'void(HSD_MObj*,u32)',conversion:'unused third parameter = 0'});
    }
    if(file==='src/melee/ft/kinds/ftCommon/ftCo_Guard.c') {
      const from='fp->ft_data->x20->x0[2]';
      if(text.split(from).length!==4)throw Error('Shield pose consumers changed');
      text=text.replaceAll(from,'fp->ft_data->x20->x0->child');
    }
    if(file==='src/melee/ft/types.h') {
      const stateWord=adaptMotionStateWord(text);text=stateWord.text;extraCommandFields.push(...stateWord.fields);
      // x20 points directly to HSD_Joint. The old pointer-array indexing at
      // element two accessed its child at +8; retain that access explicitly.
      replace('typedef struct ftData_x20 {\n    /* +0 */ HSD_Joint** x0;',
        'typedef struct ftData_x20 {\n    /* +0 */ HSD_Joint* x0;');
      // The original loops allow eleven dynamics colliders (0x1670..0x1828).
      // Replace the decomp's one-entry placeholder plus padding with that real
      // array so native C indexing stays within its declared object.
      replace('    /* fp+1670 */ Fighter_x1670_t x1670[1]; ///< @todo figure out proper size\n    /* fp+1674 */ u8 filler_x1674[0x1828 - 0x1670 - 0x28];',
        '    /* fp+1670 */ Fighter_x1670_t x1670[11];');
      // The animation flag word is loaded numerically from motion rows. All
      // overlays must retain PPC bit numbers on the little-endian WASM ABI.
      const animationStart='    /*  fp+594 */ union {';
      const animationEnd='    /*  fp+598 */ FigaTree* x598;';
      const from=text.indexOf(animationStart),to=text.indexOf(animationEnd,from);
      if(from<0||to<from||!text.slice(from,to).includes('u32 x594_bits : 13;'))throw Error('Fighter animation flag declaration changed');
      const names=['x594_b0','x594_b1_loop','x594_b2','x594_b3','x594_b4','x594_b5','x594_b6','x594_b7'];
      const replacement='    /*  fp+594 */ union {\n        struct { u32 : 24; '+names.slice().reverse().map(n=>'u32 '+n+' : 1;').join(' ')+' };\n'+
        '        struct { u32 : 6; u32 x7 : 3; u32 x0 : 7; u32 : 16; } x596_bits;\n'+
        '        struct { u32 x597_bits : 6; u32 x594_pad2 : 3; u32 x594_bits : 13; u32 x594_pad : 10; };\n'+
        '        s32 x594_s32;\n    };\n';
      text=text.slice(0,from)+replacement+text.slice(to);
      extraCommandFields.push(...names.map((name,i)=>({field:name,width:1,signed:false,shift:31-i,view:'fighterAnim',member:null,path:name,word:0})),
        ...[['x596_bits.x7',3,6],['x596_bits.x0',7,9],['x594_bits',13,9],['x597_bits',6,0]].map(([name,width,shift])=>({field:name,width,signed:false,shift,view:'fighterAnim',member:null,path:name,word:0})));
      const match=/struct gmScriptEventDefault \{([^{}]*)\};/.exec(text);
      if(!match)throw Error('Missing fighter command dispatch view');
      const converted=reverseCommandBits(match[1]);
      text=text.replace(match[0],'struct gmScriptEventDefault {'+converted.text+'};');
      extraCommandFields.push(...converted.fields.map(f=>({...f,view:'dispatch',member:null,path:f.field,word:0})));
      const motion=/struct ftData_80085FD4_ret \{([\s\S]*?)\n\};/.exec(text);
      if(!motion)throw Error('Missing motion row flag view');
      const flags='    /* +10:0 */ u8 x10_b0 : 1;\n    /* +10:1 */ u8 x10_b1 : 1;';
      if(!motion[1].includes(flags))throw Error('Motion flags changed');
      text=text.replace(motion[0],motion[0].replace(flags,'    u32 : 30;\n    u32 x10_b1 : 1;\n    u32 x10_b0 : 1;')+
        '\n_Static_assert(sizeof(struct ftData_80085FD4_ret)==24,"Motion row ABI");');
      extraCommandFields.push(...[0,1].map(i=>({field:'x10_b'+i,width:1,signed:false,shift:31-i,view:'motion',member:null,path:'x10_b'+i,word:4})));
    }
    if(file==='src/melee/ft/ftaction.c'||file==='src/melee/it/itanimlist.c') {
      let count=0;
      text=text.replace(/\(\((u8|u16|s16)\*\) cmd->u\)\[([01-3])\]/g,(_,type,index)=>{
        count++;return 'portCommand'+type.toUpperCase()+'(cmd->u,'+index+')';
      });
      if(count!==(file.includes('ftaction')?1:18))throw Error('Command raw access count changed: '+file+' '+count);
      if(file==='src/melee/it/itanimlist.c')replace('s32 opcode = ptr->opcode;','s32 opcode = portCommandItemSoundOpcode(cmd->u);');
      text='#include <port-command-word.h>\n'+text;
    }
    if(file==='src/melee/gr/grmaterial.c') {
      replace('*(u16*) cmd->ptr[0]','portCommandU16(cmd->ptr[0],0)');
      text='#include <port-command-word.h>\n'+text;
    }
    if(file==='src/melee/ft/kinds/ftCommon/ftCo_ItemThrow.c') {
      replace('((ftCo_ItemThrowCmd*) fp->cmd_vars)->angle','portCommandSigned12(fp->cmd_vars)');
      text='#include <port-command-word.h>\n'+text;
    }
    if(file==='src/melee/lb/lbcommand.c') {
      replace('    u32* ptr = (u32*) info;\n    ptr[info->loop_count + 3] -= 1;',
        '    info->event_return[info->loop_count - 1] = (CmdUnion*)\n        ((uintptr_t) info->event_return[info->loop_count - 1] - 1);');
      replace('info->ptr[0] = &info->ptr[info->loop_count][0];','info->u = info->event_return[info->loop_count - 2];');
    }
    if(file==='src/melee/lb/lb_00F9.c') {
      // Serialized dynamics parameters are a variable-length array of 60-byte
      // records, not the runtime union's two-entry placeholder view.
      replace('data0 = &arg0->data->desc.lb_unk1.array[0];',
        'data0 = (struct lb_00F9_UnkDesc1Inner*) arg0->data;');
      text += '\nunsigned portDynamicsPoolFree(void) {\n'+
        '  if(!lb_804D63A0)return 0; unsigned seen[320]={0},count=0;\n'+
        '  for(struct DynamicsData* p=cur_data;p;p=p->next) {\n'+
        '    uintptr_t delta=(uintptr_t)p-(uintptr_t)&lb_804D63A0->entries[0];\n'+
        '    if(delta%sizeof(*p)||delta/sizeof(*p)>=320||seen[delta/sizeof(*p)]++)HSD_Panic(__FILE__,0,"Corrupt dynamics free list");\n'+
        '    count++;\n  } return count;\n}\n';
      text='#include <stdint.h>\n'+text;
    }
    if(file==='src/melee/ft/kinds/ftKirby/ftkirby.c') {
      // This reset covers the first 33 words of the 34-word original aggregate.
      // Keep the exact extent, including the untouched final hat entry, but
      // avoid indexing a scalar pointer member as a fabricated s32 array.
      replace('    s32* number_list = (s32*) &ft_80459B88.x0;',
        '    unsigned char* number_list = (unsigned char*) &ft_80459B88;');
      replace('        number_list[i] = 0;',
        '        memset(number_list + i * sizeof(s32), 0, sizeof(s32));');
      text='#include <string.h>\n'+text;
    }
    if(file==='src/melee/ft/ftdata.c') {
      // Retail's adjacent .data/.bss layout is not a C array contract.
      // Symbols 803C0EC0 + 0x108 / + 5940 identify these exact original arrays.
      replace('(ftData_UnkCountStruct*) &CostumeListsForeachCharacter[Ft_Kind_Max]', 'ftData_Table_Unk0');
      replace('(ftData_UnkCountStruct*) ((u8*) CostumeListsForeachCharacter + 5940)', 'ftData_UnkIntPairs');
      const stateAlias='((ft_8045993C_t*) &list[Ft_Kind_Max])[i]';
      if(text.split(stateAlias).length!==4)throw Error('Fighter startup state reset changed');
      text=text.replaceAll(stateAlias,'ft_8045993C[i]');
      // GameCube distinguishes ARAM from RAM by the address high bit. WASM
      // instead validates a range in the immutable, prefetched native bundle.
      let copies=0;
      text=text.replace(/if \(temp_r4_2 < 0x80000000\) \{\s*lbArq_80014BD0\(temp_r4_2, (fp->x59C|arg0->x5A0),\s*OSRoundUp32B\(temp_r3->x8\), 0, 0\);\s*\} else \{\s*memcpy\(\1, \(void\*\) temp_r4_2, temp_r3->x8\);\s*\}/g,
        (_,buffer)=>{copies++;return 'portResidentCopy('+buffer+', temp_r4_2, temp_r3->x8);';});
      if(copies!==2)throw Error('Animation address dispatch changed');
      text='#include <stddef.h>\n#include <stdint.h>\nextern void portResidentCopy(void*, uintptr_t, size_t);\n'+text;
    }
    if(file==='src/melee/lb/types.h') {
      commandLayout=adaptCommandLayouts(text);text=commandLayout.text;
    }
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
        'static bool port_route_fn_801FA4CC(int value) { return fn_801FA4CC(value); }');
      replace('gm_801674C4(14, 2, 2, 0, fn_801FA4CC);','gm_801674C4(14, 2, 2, 0, port_route_fn_801FA4CC);');
      adapters.push({function:'fn_801FA4CC',adapter:'port_route_fn_801FA4CC',from:'int(int)',to:'bool(int)',conversion:'identity (retail int bool)'});
    }
    if(file==='src/melee/it/kinds/itmewtwodisable.c') {
      replace('ItemStateTable it_803F7750[1] =',
        'static bool port_disable_collision(Item_GObj* object) { return itMewtwodisable_UnkMotion0_Coll(object); }\n\nItemStateTable it_803F7750[1] =');
      replace('itMewtwodisable_UnkMotion0_Coll };','port_disable_collision };');
      adapters.push({function:'itMewtwodisable_UnkMotion0_Coll',adapter:'port_disable_collision',from:'int(Item_GObj*)',to:'bool(Item_GObj*)',conversion:'identity (retail int bool)'});
    }
    const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
    if(text!==original)patches.push({file,originalSha256:digest(original),portableSha256:digest(text),adapters});
  }
  // Melee's MSL bool is a signed int, not C99 _Bool. It appears in serialized
  // layouts and is also used as a counter (e.g. Bowser's minimum breath timer).
  // Select only this pinned header; never put all MSL headers ahead of libc.
  fs.writeFileSync(path.join(output,'include/stdbool.h'),'#include <MSL/stdbool.h>\n');
  // Expose this one MSL declaration without putting all MSL headers ahead of
  // the host standard library (which would select incompatible FILE layouts).
  fs.writeFileSync(path.join(output,'include/printf.h'),'#include <MSL/printf.h>\n');
  commandLayout.fields.push(...extraCommandFields);
  fs.writeFileSync(path.join(output,'include/port-command-word.h'),`#ifndef PORT_COMMAND_WORD_H
#define PORT_COMMAND_WORD_H
#include <Runtime/platform.h>
static inline u8 portCommandU8(const void* words,unsigned index) {
    return ((const u32*)words)[index/4] >> (24-8*(index%4));
}
static inline u16 portCommandU16(const void* words,unsigned index) {
    return ((const u32*)words)[index/2] >> (16-16*(index%2));
}
static inline unsigned portCommandItemSoundOpcode(const void* words) {
    return (portCommandU16(words,0)>>2)&255;
}
static inline s16 portCommandS16(const void* words,unsigned index) {
    unsigned value=portCommandU16(words,index);return value<32768?(int)value:(int)value-65536;
}
static inline int portCommandSigned12(const void* words) {
    unsigned value=*(const u32*)words&4095;return value<2048?(int)value:(int)value-4096;
}
#endif
`);
  const manifest={recipeSha256:digest(fs.readFileSync(new URL(import.meta.url))),files:files.length,patches,
    callbackDiagnosticSuppressed:false,functionPointerCasts:false,
    commandLayouts:{records:commandLayout.records.length+2,fields:commandLayout.fields.length,
      sha256:digest(JSON.stringify(commandLayout.fields)),representation:'native numeric u32 with original MSB field positions'}};
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {directory:destination,manifest,commandFields:commandLayout.fields};
}

// These asset words are converted to native u32 values before C sees them.
// Keep their PPC (MSB-first) field positions, including partial-byte/halfword
// views. Promoting those views to u32 is intentional: they are CmdUnion views,
// never standalone arrays. Runtime Fighter flag structs are NOT changed here.
export function reverseCommandBits(body) {
  const clean=body.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  const declarations=clean.split(';').map(s=>s.trim()).filter(Boolean);
  const fields=[];let used=0;
  for(const declaration of declarations) {
    const match=/^([us](?:8|16|32))\s+(\w+)\s*:\s*(\d+)$/.exec(declaration);
    if(!match)throw Error('Unexpected command bitfield declaration: '+declaration);
    const width=Number(match[3]);used+=width;
    if(width<1||used>32)throw Error('Command fields exceed one word');
    fields.push({field:match[2],width,signed:match[1][0]==='s',shift:32-used});
  }
  if(!fields.length)throw Error('Empty command bitfield record');
  const lines=fields.toReversed().map(f=>`    ${f.signed?'s32':'u32'} ${f.field} : ${f.width};`);
  if(used<32)lines.unshift(`    u32 : ${32-used};`);
  return {text:'\n'+lines.join('\n')+'\n',fields};
}
export function adaptCommandLayouts(text) {
  const union=/union CmdUnion \{([\s\S]*?)\n\};/.exec(text);
  if(!union)throw Error('Missing command word union');
  const fields=[],records=[];
  for(const [,type,member] of union[1].matchAll(/struct (\w+) (\w+);/g)) {
    const re=new RegExp('struct '+type+' \\{([^{}]*)\\};','g'),matches=[...text.matchAll(re)];
    if(matches.length!==1)throw Error('Ambiguous command word definition: '+type);
    if(!matches[0][1].includes(':'))continue; // Native pointers/raw u32 words.
    const converted=reverseCommandBits(matches[0][1]);records.push(type);
    fields.push(...converted.fields.map(f=>({...f,view:'command',member,path:member+'.'+f.field,word:0})));
    text=text.replace(matches[0][0],'struct '+type+' {'+converted.text+'};');
  }
  const color=/union ColorOverlay_x8_t \{([\s\S]*?)\n\};/.exec(text);
  if(!color)throw Error('Missing color command union');
  let colorBody=color[1],count=0;
  colorBody=colorBody.replace(/struct \{([^{}]*)\} (light_rot1|light_rot2|unk);/g,(_,body,member)=>{
    const converted=reverseCommandBits(body);count++;
    fields.push(...converted.fields.map(f=>({...f,view:'color',member,path:member+'.'+f.field,word:0})));
    return 'struct {'+converted.text+'} '+member+';';
  });
  if(count!==3||colorBody.split('GXColor light_color;').length!==2)throw Error('Color command shape changed');
  colorBody=colorBody.replace('GXColor light_color;','struct { u32 a : 8; u32 b : 8; u32 g : 8; u32 r : 8; } light_color;');
  fields.push(...['r','g','b','a'].map((field,i)=>({field,width:8,signed:false,shift:24-i*8,view:'color',member:'light_color',path:'light_color.'+field,word:0})));
  text=text.replace(color[0],'union ColorOverlay_x8_t {'+colorBody+'\n};');
  const skip=/struct spawn_hitbox_skip \{([^{}]*)\};/.exec(text);
  if(!skip||!skip[1].includes('u8 _0[0xF];')||[...skip[1].matchAll(/u32 xF_b[0-4] : 1;/g)].length!==5)
    throw Error('Hitbox byte-15 overlay shape changed');
  text=text.replace(skip[0],`struct spawn_hitbox_skip {
    u32 _words[3];
    u32 : 3;
    u32 xF_b4 : 1; u32 xF_b3 : 1; u32 xF_b2 : 1; u32 xF_b1 : 1; u32 xF_b0 : 1;
    u32 : 24;
};`);
  fields.push(...Array.from({length:5},(_,i)=>({field:'xF_b'+i,width:1,signed:false,shift:7-i,view:'skip',member:null,path:'xF_b'+i,word:3})));
  const stack='    union CmdUnion*\n        event_return[3]; // 0x10 - Array Size is purely made-up for now\n    u32 loop_count_dup;  // 0x14\n    u32 unk_x18;         // 0x18';
  if(text.split(stack).length!==2)throw Error('Command return stack shape changed');
  text=text.replace(stack,'    CmdUnion* event_return[5]; // Five existing words at offsets 0x10..0x20.');
  const at=text.lastIndexOf('#endif');if(at<0)throw Error('Command header guard missing');
  text=text.slice(0,at)+'_Static_assert(sizeof(CmdUnion)==4,"Native command word ABI");\n'+
    '_Static_assert(sizeof(struct spawn_hitbox_skip)==16,"Native hitbox overlay ABI");\n'+
    '_Static_assert(sizeof(CommandInfo)==0x24,"Native command state ABI");\n'+text.slice(at);
  return {text,fields,records};
}
