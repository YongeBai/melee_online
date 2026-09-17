/* Native VS controller bring-up. Rules/player defaults and match decisions use
 * original game code; browser device/presentation scheduling is separate. */
#include <melee/gm/gm_1601.h>
#include <melee/gm/gm_1B03.h>
#include <melee/gm/gmvs.h>
#include <melee/gm/gmpause.h>
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
#include <melee/if/ifstatus.h>
#include <melee/if/ifstock.h>
#include <melee/if/types.h>
#include <melee/sc/types.h>
#include <melee/ft/types.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/controller.h>
#include <stdlib.h>
static int initialized,started;
static int hud_initialized;
static int damage_initialized;
static HSD_GObj* pause_object;
unsigned portTournamentPauseInitialize(void)
{
    if(!hud_initialized||started||pause_object)abort();
    HSD_GObj* existing[64];unsigned count=0;
    for(HSD_GObj* g=HSD_GObjGXLinkHead[11];g;g=g->next_gx){if(count==64)abort();existing[count++]=g;}
    fn_801A1134();
    for(HSD_GObj* g=HSD_GObjGXLinkHead[11];g;g=g->next_gx){
        unsigned i=0;while(i<count&&existing[i]!=g)i++;
        if(i<count)continue;
        if(pause_object||g->classifier!=14||g->obj_kind!=HSD_GObj_JObjKind)abort();pause_object=g;
    }
    if(!pause_object||!pause_object->hsd_obj)abort();
    return ((HSD_JObj*)pause_object->hsd_obj)->id;
}
double portTournamentPauseRead(unsigned field)
{
    if(!pause_object)abort();VsSceneState* s=gmVs_GetSceneState();
    switch(field){
    case 0:return gm_GetDbPauseFlag(1)!=0;
    case 1:return s->pauser;
    case 2:return s->pause_timer;
    case 3:return s->unpause_timer;
    case 4:return (((HSD_JObj*)pause_object->hsd_obj)->flags&JOBJ_HIDDEN)!=0;
    default:abort();
    }
}
extern unsigned portRuntimeStep(void);
extern void portInitializeVsRouting(void);
extern void portStageSelectResident(StKind);
extern void portHudInitializeBase(SceneDesc*);
extern HSD_LObj* portHudLights(void);
extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
void portTournamentHudInitialize(SceneDesc* scene)
{
    if(!initialized||started||hud_initialized||!scene)abort();
    portHudInitializeBase(scene);ifTime_Reset();ifTime_CreateTimers();hud_initialized=1;
}
void portTournamentDamageInitialize(void)
{
    if(!hud_initialized||started||damage_initialized||!Player_GetEntity(0)||!Player_GetEntity(1))abort();
    ifStatus_802F66A4();ifStock_802FAEC4();ifStatus_802F665C(2);damage_initialized=1;
}
int portHudPlayerRead(unsigned slot,unsigned field)
{
    if(!damage_initialized||slot>=2)abort();IfDamageState* s=&ifStatus_GetHUDInfo()->players[slot];
    switch(field){case 0:return s->damage_percent;case 1:return s->old_damage;case 2:return s->HUD_parent_entity!=NULL;case 3:return s->next!=NULL;default:abort();}
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
void portTournamentInitializeStage(unsigned left,unsigned right,unsigned stage)
{
    extern int portFighterCharacterKind(unsigned);
    int characters[2]={portFighterCharacterKind(left),portFighterCharacterKind(right)};
    if(initialized||characters[0]<0||characters[1]<0||(stage!=St_Kind_Battle&&stage!=St_Kind_Last&&stage!=St_Kind_OldPupupu&&stage!=St_Kind_Izumi&&stage!=St_Kind_Story&&stage!=St_Kind_PStadium))abort();StartMeleeData data={0};
    portInitializeVsRouting();Player_80036DD8();gm_801A3E88();
    gm_SetupRulesDefaults(&data.rules);
    data.rules.match_kind=MatchKind_Stock;data.rules.is_stock=true;data.rules.is_vs=true;
    data.rules.timer_enabled=true;data.rules.timer_counts_up=false;data.rules.time_limit=8*60;
    data.rules.item_freq=-1;data.rules.x20=0;data.rules.is_teams=false;data.rules.stkind=stage;
    for(unsigned i=0;i<GM_MAX_PLAYERS;i++){
        gm_SetupPlayerDefaults(&data.players[i]);
        if(i<2){data.players[i].slot_type=Gm_PKind_Human;data.players[i].ckind=characters[i];data.players[i].stocks=4;data.players[i].team=i;}
    }
    gm_SetupSubColors(&data);fn_8016DCC0(&data);initialized=1;
}
void portTournamentInitializeKinds(unsigned left,unsigned right){portTournamentInitializeStage(left,right,St_Kind_Battle);}
void portTournamentInitialize(void){portTournamentInitializeKinds(Ft_Kind_Captain,Ft_Kind_Captain);}
void portTournamentBegin(void)
{
    if(!initialized||started||!Player_GetEntity(0)||!Player_GetEntity(1))abort();
    /* The current fixture enters after its settle interval. This is the real
     * ready/go completion callback; intro graphics and full startup are pending. */
    fn_8016B784();started=1;
}
static void ready_complete(int status) { fn_8016B7F8(); }
void portTournamentIntroBegin(void)
{
    if(!initialized||started||!hud_initialized||!Player_GetEntity(0)||!Player_GetEntity(1))abort();
    portStageSelectResident(gm_GetStartMeleeRules()->stkind);
    ifStatus_802F6EA4(3,-1,-1,0,(Event)fn_8016B7B4,(Event)ready_complete);
    started=1;
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
    case 23:{unsigned mask=0;for(unsigned i=0;i<8;i++)if(ifStatus_803F9628[i].x0)mask|=1u<<i;return mask;}
    case 24:{HSD_GObj* g=Player_GetEntity(slot);if(!g)abort();return ((Fighter*)g->user_data)->x221D_b4;}
    default:abort();
    }
}
