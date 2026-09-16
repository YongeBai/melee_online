/* Native VS controller bring-up. Rules/player defaults and match decisions use
 * original game code; browser device/presentation scheduling is separate. */
#include <melee/gm/gm_1601.h>
#include <melee/gm/gm_1B03.h>
#include <melee/gm/gmvs.h>
#include <melee/gm/gmscene.h>
#include <melee/gm/gm_1A36.h>
#include <melee/gm/gm_1A3F.h>
#include <melee/gm/types.h>
#include <melee/mn/types.h>
#include <melee/gr/forward.h>
#include <melee/pl/player.h>
#include <melee/if/ifall.h>
#include <melee/if/if_2F6E.h>
#include <melee/if/iftime.h>
#include <melee/sc/types.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/controller.h>
#include <stdlib.h>
static int initialized,started;
static int hud_initialized;
extern unsigned portRuntimeStep(void);
extern void portInitializeVsRouting(void);
extern void portHudInitializeBase(SceneDesc*);
extern HSD_LObj* portHudLights(void);
extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
void portTournamentHudInitialize(SceneDesc* scene)
{
    if(!initialized||started||hud_initialized||!scene)abort();
    portHudInitializeBase(scene);ifTime_Reset();ifTime_CreateTimers();hud_initialized=1;
}
void portHudRenderBegin(void)
{
    if(!hud_initialized)abort();
    portRenderContextBegin(ifAll_GetHUDGObj()->hsd_obj,portHudLights());
}
unsigned portHudObjects(unsigned* output,unsigned capacity)
{
    if(!hud_initialized||!output)abort();unsigned count=0;
    for(HSD_GObj* object=HSD_GObjGXLinkHead[11];object;object=object->next_gx){
        if(object->obj_kind!=HSD_GObj_JObjKind||!object->hsd_obj||count>=capacity)abort();
        HSD_JObj* joint=object->hsd_obj;
        output[count*3]=(unsigned)object;output[count*3+1]=(unsigned)joint;output[count*3+2]=joint->id;count++;
    }
    return count;
}
void portHudCameraSnapshot(float* output)
{
    if(!hud_initialized||!output)abort();HSD_CObj* c=ifAll_GetHUDGObj()->hsd_obj;
    if(HSD_CObjGetProjectionType(c)!=PROJ_PERSPECTIVE)abort();
    HSD_CObjGetViewingMtx(c,(float(*)[4])output);
    MTXPerspective((float(*)[4])(output+12),HSD_CObjGetFov(c),HSD_CObjGetAspect(c),HSD_CObjGetNear(c),HSD_CObjGetFar(c));
    HSD_CObjGetEyePosition(c,(Vec3*)(output+28));HSD_CObjGetInterest(c,(Vec3*)(output+31));
    output[34]=HSD_CObjGetFov(c);output[35]=HSD_CObjGetAspect(c);output[36]=HSD_CObjGetNear(c);output[37]=HSD_CObjGetFar(c);
}
void portTournamentStatusInstall(HSD_Archive* archive)
{
    if(!archive||started||*ifAll_GetArchive())abort();
    *ifAll_GetArchive()=archive;ifStatus_802F7134();
}
void portTournamentInitialize(void)
{
    if(initialized)abort();StartMeleeData data={0};
    portInitializeVsRouting();Player_80036DD8();gm_801A3E88();
    gm_SetupRulesDefaults(&data.rules);
    data.rules.match_kind=MatchKind_Stock;data.rules.is_stock=true;data.rules.is_vs=true;
    data.rules.timer_enabled=true;data.rules.timer_counts_up=false;data.rules.time_limit=8*60;
    data.rules.item_freq=-1;data.rules.x20=0;data.rules.is_teams=false;data.rules.stkind=St_Kind_Battle;
    for(unsigned i=0;i<GM_MAX_PLAYERS;i++){
        gm_SetupPlayerDefaults(&data.players[i]);
        if(i<2){data.players[i].slot_type=Gm_PKind_Human;data.players[i].ckind=CKind_Captain;data.players[i].stocks=4;data.players[i].team=i;}
    }
    gm_SetupSubColors(&data);fn_8016DCC0(&data);initialized=1;
}
void portTournamentBegin(void)
{
    if(!initialized||started||!Player_GetEntity(0)||!Player_GetEntity(1))abort();
    /* The current fixture enters after its settle interval. This is the real
     * ready/go completion callback; intro graphics and full startup are pending. */
    fn_8016B784();started=1;
}
unsigned portTournamentStep(void)
{
    if(!started)abort();
    /* gmscene.c invokes the scene frame callback before HSD object processes. */
    for(unsigned i=0;i<PAD_MAX_CONTROLLERS;i++)HSD_PadCopyStatus[i]=HSD_PadGameStatus[i];
    gm_EvaluateAllControllerInputs();gm_Scene_Vs_OnFrame();
    /* Same scene pause-bit to process-link mapping as gmscene.c. Browser
     * stepping supplies a complete input sample, without VI queue starvation. */
    *HSD_GObjLibInitData.unk_2=gm_801A48A4(gm_801A4624());
    return portRuntimeStep();
}
double portTournamentRead(unsigned field,unsigned slot)
{
    if(!initialized||slot>=GM_MAX_PLAYERS)abort();
    StartMeleeRules* r=gm_GetStartMeleeRules();VsSceneState* s=gmVs_GetSceneState();
    switch(field){
    case 0:return r->match_kind;case 1:return r->is_stock;case 2:return r->time_limit;
    case 3:return r->timer_enabled;case 4:return r->timer_counts_up;case 5:return r->item_freq;
    case 6:return r->x20==0;case 7:return r->x30;case 8:return r->game_speed;
    case 9:return r->is_teams;case 10:return Player_GetStocks(slot);case 11:return Player_GetPlayerSlotType(slot);
    case 12:return s->frame_count;case 13:return s->timer_seconds;case 14:return s->unk_2C;
    case 15:return gm_GetMatchOutcome();case 16:return s->match_result;case 17:return s->hud_enabled;
    case 18:return Player_GetFallsByIndex(slot,0);case 19:return (unsigned)Player_GetEntity(slot);
    case 20:return s->unk_0;case 21:return Player_GetControllerIndex(slot);
    case 22:return gm_GetCurrentGameMode();
    default:abort();
    }
}
