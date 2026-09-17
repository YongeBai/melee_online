/* Original stage-select lifecycle. The browser owns nonblocking scheduling;
 * original menu callbacks own animation, cursor hit tests and selection. */
#include <melee/mn/mnstagesel.h>
#include <melee/mn/types.h>
#include <melee/gm/gm_unsplit.h>
#include <melee/gm/gmvsmelee.h>
#include <melee/gm/gm_1601.h>
#include <melee/gm/types.h>
#include <melee/pl/player.h>
#include <melee/lb/lblanguage.h>
#include <sysdolphin/baselib/controller.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjproc.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/lobj.h>
#include <sysdolphin/baselib/pobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/cobj.h>
#include <stdlib.h>
#include <string.h>
extern int portSceneInitialize(void);
extern void portInitializeVsRouting(void);
extern void portRuntimeSetSceneDestructors(GObjFunc);
extern unsigned portRuntimeStep(void);
extern unsigned portSceneExitStatus(unsigned);
extern double portStageMenuNativeRead(unsigned,unsigned);
static SSSData selection;
static int initialized,character_initialized;
static VsModeData selected_vs;
/* 0: standalone; 1: CSS confirmed; 2: SSS active; 3: SSS canceled;
 * 4: match ready; 5: setup consumed by the match. */
static unsigned menu_transition;
static HSD_GObj* cursor;
static HSD_GObj *camera,*lights,*fog;
static void destroy_lights(HSD_Obj* obj){HSD_LObjRemoveAll((HSD_LObj*)obj);}
static unsigned stage_menu_initialize(unsigned controller,int from_character)
{
    if(initialized||character_initialized||controller>=4||portSceneInitialize()<0)abort();
    portRuntimeSetSceneDestructors(destroy_lights);
    portInitializeVsRouting();portSceneExitStatus(1);lbLang_SetSavedLanguage(1);gm_8016468C();
    memset(&selection,0,sizeof(selection));
    if(from_character){GameModeState state={0};state.info.enter_data=&selection;gmVsMelee_EnterSss(&state,&selected_vs);}
    selection.unk_stage=controller+1;
    selection.force_stage_id=-1;
    mnStageSel_Scene_OnEnter(&selection);
    for(HSD_GObj* g=HSD_GObjPLinkHead[3];g;g=g->next)if(g->obj_kind==HSD_GObj_CameraKind){if(camera)abort();camera=g;}
    for(HSD_GObj* g=HSD_GObjGXLinkHead[0];g;g=g->next_gx){
        if(g->obj_kind==HSD_GObj_LightKind){if(lights)abort();lights=g;}
        else if(g->obj_kind==HSD_GObj_FogKind){if(fog)abort();fog=g;}
        else abort();
    }
    for(HSD_GObj* g=HSD_GObjPLinkHead[5];g;g=g->next)
        for(HSD_GObjProc* p=g->proc;p;p=p->child)
            if(p->on_invoke==fn_8025A310){if(cursor)abort();cursor=g;}
    if(!cursor||!cursor->hsd_obj||!camera||!lights||!fog)abort();initialized=1;return (unsigned)cursor;
}
unsigned portStageMenuInitialize(unsigned controller){menu_transition=0;return stage_menu_initialize(controller,0);}
unsigned portStageMenuFromCharacters(unsigned controller)
{
    if(menu_transition!=1)abort();unsigned result=stage_menu_initialize(controller,1);menu_transition=2;return result;
}
unsigned portStageMenuObjects(unsigned* output,unsigned capacity)
{
    if(!initialized||!output)abort();unsigned count=0;
    for(HSD_GObj* g=HSD_GObjGXLinkHead[4];g;g=g->next_gx){
        if(g->obj_kind!=HSD_GObj_JObjKind||!g->hsd_obj||count>=capacity)abort();
        HSD_JObj* j=g->hsd_obj;
        output[count*3]=(unsigned)g;output[count*3+1]=(unsigned)j;output[count*3+2]=j->id;count++;
    }
    return count;
}
void portStageMenuRenderBegin(void)
{
    extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
    if(!initialized)abort();portRenderContextBegin(camera->hsd_obj,lights->hsd_obj);
    fog->render_cb(fog,0);
}
void portStageMenuCameraSnapshot(float* output)
{
    if(!initialized||!output)abort();HSD_CObj* c=camera->hsd_obj;
    if(HSD_CObjGetProjectionType(c)!=PROJ_PERSPECTIVE)abort();
    HSD_CObjGetViewingMtx(c,(float(*)[4])output);
    MTXPerspective((float(*)[4])(output+12),HSD_CObjGetFov(c),HSD_CObjGetAspect(c),HSD_CObjGetNear(c),HSD_CObjGetFar(c));
    HSD_CObjGetEyePosition(c,(Vec3*)(output+28));HSD_CObjGetInterest(c,(Vec3*)(output+31));
    output[34]=HSD_CObjGetFov(c);output[35]=HSD_CObjGetAspect(c);output[36]=HSD_CObjGetNear(c);output[37]=HSD_CObjGetFar(c);
}
unsigned portStageMenuStep(void)
{
    if(!initialized||portSceneExitStatus(0))abort();
    for(unsigned i=0;i<4;i++)HSD_PadCopyStatus[i]=HSD_PadGameStatus[i];
    mnStageSel_Scene_OnFrame();return portRuntimeStep();
}
double portStageMenuRead(unsigned field)
{
    if(!initialized)abort();HSD_JObj* j=cursor->hsd_obj;
    switch(field){
    case 0:return j->translate.x;case 1:return j->translate.y;
    case 2:return selection.vs.start.rules.stkind;
    case 3:return selection.start_game;
    case 4:return j->id;
    case 5:return portSceneExitStatus(0);
    case 6:return portStageMenuNativeRead(0,0);
    case 7:return portStageMenuNativeRead(1,0);
    default:abort();
    }
}
unsigned portStageMenuFinish(void)
{
    if(!initialized||!portSceneExitStatus(0))abort();
    /* Model callbacks are gone before releasing their archive backing store. */
    for(unsigned link=0;link<64;link++)while(HSD_GObjPLinkHead[link])HSD_GObjFree(HSD_GObjPLinkHead[link]);
    mnStageSel_Scene_OnExit(NULL);initialized=0;cursor=camera=lights=fog=NULL;
    if(menu_transition==2){
        if(selection.start_game){
            GameModeState state={0};state.info.exit_data=&selection;
            gmVsMelee_ExitSss(&state,&selected_vs,0);gm_80167BC8(&selected_vs);menu_transition=4;
        }else menu_transition=3;
    }
    return selection.start_game?selection.vs.start.rules.stkind:0;
}
double portShapeBlend(HSD_PObj* polygon,unsigned index)
{
    if(!polygon||pobj_type(polygon)!=POBJ_SHAPEANIM)abort();
    HSD_ShapeSet* s=polygon->u.shape_set;
    if(s->flags&SHAPESET_ADDITIVE){if(index>=s->nb_shape)abort();return s->blend.bp[index];}
    if(index)abort();return s->blend.bl;
}

/* Browser entry into original character select. The scene still owns every
 * hand/roster callback and selection transition; platform calls stay guarded. */
#include <melee/mn/mncharsel.h>
#include <melee/gm/gmmain_lib.h>
#include <melee/gm/gm_1601.h>
#include <melee/gm/types.h>
#include <sysdolphin/baselib/sislib.h>
extern GameRules gmMainLib_DefaultGameRules;
extern struct GamePrefs gmMainLib_DefaultGamePrefs;
static CSSData character_selection;
static u8 character_ko_counts[GM_MAX_PLAYERS];
static unsigned character_menu_initialize(int resume)
{
    if(initialized||character_initialized||portSceneInitialize()<0)abort();
    portRuntimeSetSceneDestructors(destroy_lights);portInitializeVsRouting();portSceneExitStatus(1);
    *gmMainLib_GetGameRules()=gmMainLib_DefaultGameRules;
    *gmMainLib_GetGamePrefs()=gmMainLib_DefaultGamePrefs;
    gmMainLib_GetGamePrefs()->item_freq=255;gmMainLib_GetGamePrefs()->item_mask=0;
    GameRules* rules=gmMainLib_GetGameRules();rules->mode=1;rules->stock_count=4;rules->stock_time_limit=8;
    lbLang_SetSavedLanguage(1);gm_8016468C();gm_80164F18();
    if(resume)character_selection.vs=selected_vs;else gm_InitVsMode(&character_selection.vs);
    menu_transition=0;character_selection.match_type=VS_MELEE;
    character_selection.unk_0x0=1;character_selection.ko_counts=character_ko_counts;
    for(unsigned i=0;i<2;i++)character_selection.vs.start.players[i].slot_type=Gm_PKind_Human;
    HSD_SisLib_803A6048(0x10000);
    mnCharSel_Scene_OnEnter(&character_selection);character_initialized=1;return 1;
}

unsigned portCharacterMenuInitialize(void){return character_menu_initialize(0);}
unsigned portCharacterMenuResume(void){if(menu_transition!=3)abort();return character_menu_initialize(1);}

#include <sysdolphin/baselib/fog.h>
extern void HSD_SisLib_803A84BC(HSD_GObj*,int);
static HSD_GObj* character_camera(void)
{
    HSD_GObj* result=NULL;
    for(HSD_GObj* g=HSD_GObjPLinkHead[3];g;g=g->next)if(g->obj_kind==HSD_GObj_CameraKind){if(result)abort();result=g;}
    if(!character_initialized||!result||result->gxlink_prios!=0x1F)abort();return result;
}
unsigned portCharacterMenuObjects(unsigned* out,unsigned capacity)
{
    HSD_GObj* cam=character_camera();unsigned count=0;
    for(unsigned link=1;link<5;link++)if(cam->gxlink_prios&(1ULL<<link))
        for(HSD_GObj* g=HSD_GObjGXLinkHead[link];g;g=g->next_gx){
            if(!g->render_cb)continue;if(count>=capacity)abort();
            unsigned text=g->render_cb==HSD_SisLib_803A84BC;
            HSD_JObj* j=text?NULL:g->hsd_obj;
            if(!text&&(g->obj_kind!=HSD_GObj_JObjKind||!j))abort();
            out[count*4]=(unsigned)g;out[count*4+1]=(unsigned)j;
            out[count*4+2]=j?j->id:0;out[count*4+3]=text;count++;
        }
    return count;
}
void portCharacterMenuRenderBegin(void)
{
    extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
    HSD_LObj* light=NULL;HSD_Fog* f=NULL;
    for(HSD_GObj* g=HSD_GObjGXLinkHead[0];g;g=g->next_gx){
        if(g->obj_kind==HSD_GObj_LightKind){if(light)abort();light=g->hsd_obj;}
        else if(g->obj_kind==HSD_GObj_FogKind){if(f)abort();f=g->hsd_obj;}
        else abort();
    }
    if(!light||!f)abort();portRenderContextBegin(character_camera()->hsd_obj,light);HSD_FogSet(f);
}
void portCharacterMenuCameraSnapshot(float* out)
{
    HSD_CObj* c=character_camera()->hsd_obj;if(!out||HSD_CObjGetProjectionType(c)!=PROJ_PERSPECTIVE)abort();
    HSD_CObjGetViewingMtx(c,(float(*)[4])out);
    MTXPerspective((float(*)[4])(out+12),HSD_CObjGetFov(c),HSD_CObjGetAspect(c),HSD_CObjGetNear(c),HSD_CObjGetFar(c));
    HSD_CObjGetEyePosition(c,(Vec3*)(out+28));HSD_CObjGetInterest(c,(Vec3*)(out+31));
    out[34]=HSD_CObjGetFov(c);out[35]=HSD_CObjGetAspect(c);out[36]=HSD_CObjGetNear(c);out[37]=HSD_CObjGetFar(c);
}
unsigned portCharacterMenuStep(void)
{
    if(!character_initialized||portSceneExitStatus(0))abort();
    for(unsigned i=0;i<4;i++)HSD_PadCopyStatus[i]=HSD_PadGameStatus[i];
    mnCharSel_Scene_OnFrame();return portRuntimeStep();
}
double portCharacterMenuRead(unsigned field,unsigned player)
{
    if(!character_initialized||player>=4)abort();
    switch(field){
    case 0:return portSceneExitStatus(0);
    case 1:return character_selection.vs.start.players[player].ckind;
    case 2:return character_selection.vs.start.players[player].color;
    case 3:return character_selection.vs.start.players[player].slot_type;
    default:abort();
    }
}
unsigned portCharacterMenuFinish(void)
{
    extern double portCharacterMenuNativeRead(unsigned,unsigned);
    if(!character_initialized||!portSceneExitStatus(0))abort();
    unsigned phase=portCharacterMenuNativeRead(0,0);
    /* Confirm/cancel OnExit reads the scene result, not destroyed model data. */
    if(phase!=1&&phase!=2)abort();
    /* Remove text/context owners now; original OnExit frees the SIS arena once. */
    HSD_SisLib_803A5E70();
    for(unsigned link=0;link<64;link++)while(HSD_GObjPLinkHead[link])HSD_GObjFree(HSD_GObjPLinkHead[link]);
    mnCharSel_Scene_OnExit(NULL);character_initialized=0;
    if(phase==1){GameModeState state={0};state.info.exit_data=&character_selection;gmVsMelee_ExitCss(&state,&selected_vs);menu_transition=1;}else menu_transition=0;
    return character_selection.pending_scene_change;
}

/* Read the original scene handoff, without re-encoding C structures in JS. */
double portMenuMatchRead(unsigned field,unsigned player)
{
    if((menu_transition!=4&&menu_transition!=5)||player>=GM_MAX_PLAYERS)abort();
    StartMeleeData* d=&selected_vs.start;
    switch(field){
    case 0:return d->players[player].ckind;case 1:return d->players[player].color;
    case 2:return d->players[player].slot_type;case 3:return d->players[player].stocks;
    case 4:return d->rules.stkind;case 5:return d->rules.time_limit;
    case 6:return d->rules.item_freq;case 7:return d->rules.is_teams;
    case 8:return d->rules.match_kind;case 9:return d->rules.timer_enabled;
    case 10:return Player_800325C8(menu_transition==5?Player_GetPlayerCharacter(player):d->players[player].ckind,0);
    default:abort();
    }
}
StartMeleeData* portMenuTakeMatch(void)
{
    if(menu_transition!=4||initialized||character_initialized)abort();
    menu_transition=5;return &selected_vs.start;
}
