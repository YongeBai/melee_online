/* Bring-up of original stage model ownership; full Stage startup is separate. */
#include <melee/gr/ground.h>
#include <melee/gr/grdatfiles.h>
#include <melee/gr/granime.h>
#include <melee/gr/grbattle.h>
#include <melee/gr/types.h>
#include <melee/sc/types.h>
#include <melee/mp/mplib.h>
#include <melee/mp/mpcoll.h>
#include <melee/pl/player.h>
#include <melee/cm/camera.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/lobj.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/controller.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
_Static_assert(sizeof(UnkStageDat)==48&&sizeof(struct UnkStageDat_x8_t)==52,"Stage map ABI");
_Static_assert(sizeof(GroundParam)==220&&sizeof(StageParam)==100,"Stage parameter ABI");
extern int portSceneInitialize(void);
extern void portRuntimeSetSceneDestructors(GObjFunc);
extern LightList** portStageSelectLights(UnkArchiveStruct*,LightList**);
extern void portStageCreateGlobalLights(void);
extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
static HSD_GObj* owners[7];
static HSD_GObj* render_lights;
static int installed;
static int collision_installed;
static int callbacks_initialized;
extern void portStageSelectResident(StKind);
static void destroy_lights(HSD_Obj* object){HSD_LObjRemoveAll((HSD_LObj*)object);}
void portStageRenderInitialize(void)
{
    if(!installed||render_lights)abort();
    /* Original Ground creates a priority-zero light object at the end of that
     * priority group. Keep its real animation process and stage selection. */
    HSD_GObj* previous=NULL;
    for(HSD_GObj* p=HSD_GObjPLinkHead[3];p&&p->p_priority==0;p=p->next)previous=p;
    portStageCreateGlobalLights();
    render_lights=previous?previous->next:HSD_GObjPLinkHead[3];
    if(!render_lights||render_lights->classifier!=0xD||render_lights->p_priority||!render_lights->hsd_obj)abort();
}
void portStageRenderBegin(void)
{
    HSD_GObj* camera=Camera_80030A50();
    if(!render_lights||!camera||!camera->hsd_obj)abort();
    portRenderContextBegin(camera->hsd_obj,render_lights->hsd_obj);
}
void portStageMapInstall(HSD_Archive* archive,UnkStageDat* data,GroundParam* param)
{
    if(installed||!archive||!data||!param||data->unkC!=7||portSceneInitialize()<0)abort();
    portRuntimeSetSceneDestructors(destroy_lights);
    Ground_801BFFB0();
    UnkArchiveStruct* entry=grDatFiles_GetArchive();entry->unk0=archive;entry->unk4=data;entry->unk8=0;
    stage_info.grkind=Gr_Kind_Battle;stage_info.param=param;installed=1;
}
HSD_GObj* portStageMapCreate(unsigned index)
{
    if(!installed||callbacks_initialized||index>=7||owners[index])abort();
    owners[index]=Ground_GetStageGObj(index);
    if(!owners[index])abort();
    if(collision_installed)Ground_InitMapColl(owners[index]->hsd_obj,index);
    grAnime_801C8138(owners[index],index,0);
    return owners[index];
}
void portBattlefieldCallbacksInitialize(void* parameters)
{
    if(!installed||!collision_installed||callbacks_initialized||!parameters)abort();
    for(unsigned i=0;i<7;i++)if(owners[i])abort();
    portStageSelectResident(St_Kind_Battle);
    stage_info.yakumono_param=parameters;
    stage_info.on_touch_line=grNBa_StageData.on_touch_line;
    stage_info.on_check_shadow_render=grNBa_StageData.on_check_shadow_render;
    grNBa_StageData.on_init();
    for(unsigned i=0;i<7;i++)owners[i]=Ground_GetMapGObj(i);
    if(!owners[0]||!owners[1]||!owners[3]||!owners[6])abort();
    callbacks_initialized=1;
}
unsigned portBattlefieldObject(unsigned index)
{
    if(!callbacks_initialized||index>=7)abort();
    return (unsigned)Ground_GetMapGObj(index);
}
void portStageMapBounds(void){if(!owners[0])abort();Ground_801C39C0();Ground_801C3BB4();}
/* Camera-related calls from Ground_801C0800 and fn_8016E730. Full Stage startup
 * still owns other dependencies that this bring-up target has not integrated. */
void portStageCameraStart(void)
{
    if(!installed||!collision_installed||!owners[0]||!Camera_80030A50())abort();
    GroundParam* p=stage_info.param;
    Ground_801C38D0(p->x8,p->x14,p->x1C,p->x18);
    Ground_801C38EC(p->x10,p->xC);
    Ground_801C3970(p->x28);
    Ground_801C3900(p->x2E,p->x30,p->x34,p->x38,p->x3C,p->x40,p->x44,p->x48);
    Ground_801C392C(p->x50,p->x54,p->x58,p->x5C,p->x60,p->x64);
    Ground_801C3960(p->x20);Ground_801C3950(p->x24);
    Camera_80030730(Ground_801C20D0());
    Ground_EnableMatchCamera();Camera_8002F3AC();
}
/* Exact native view/projection inputs, before GPU clip-space conversion.
 * Layout: view[12], projection[16], eye[3], interest[3], fov/aspect/near/far.
 * The original camera aspect is preserved; output framing remains 4:3. */
void portStageCameraSnapshot(float* output)
{
    HSD_GObj* object=Camera_80030A50();
    if(!output||!object||!object->hsd_obj)abort();
    HSD_CObj* c=object->hsd_obj;
    Camera_8002A4AC(object);
    if(HSD_CObjGetProjectionType(c)!=PROJ_PERSPECTIVE){fprintf(stderr,"Unexpected native projection %d\n",HSD_CObjGetProjectionType(c));abort();}
    HSD_CObjGetViewingMtx(c,(float(*)[4])output);
    MTXPerspective((float(*)[4])(output+12),HSD_CObjGetFov(c),HSD_CObjGetAspect(c),HSD_CObjGetNear(c),HSD_CObjGetFar(c));
    HSD_CObjGetEyePosition(c,(Vec3*)(output+28));HSD_CObjGetInterest(c,(Vec3*)(output+31));
    output[34]=HSD_CObjGetFov(c);output[35]=HSD_CObjGetAspect(c);output[36]=HSD_CObjGetNear(c);output[37]=HSD_CObjGetFar(c);
    for(unsigned i=0;i<38;i++)if(!isfinite(output[i])){fprintf(stderr,"Nonfinite native camera field %u\n",i);abort();}
}
/* The original collision arrays are arena-lived. This bring-up runtime pins
 * both archives until the whole WASM instance is destroyed. */
void portStageMapCollisionLoad(MapCollData* data)
{
    if(!installed||collision_installed||!data||data->vert_count>2048||data->line_count>1536||data->joint_count<=0||data->joint_count>256)abort();
    mpColl_80041C78();stage_info.coll_data=data;mpLibLoad(data);mpLib_80058820();collision_installed=1;
}
void portStageMapSpawn(unsigned slot)
{
    Vec3 position;
    if(!collision_installed||slot>=4||!Ground_801C2D24(slot,&position))abort();
    Player_80032768(slot,&position);Player_SetFacingDirection(slot,position.x>0?-1.0f:1.0f);
}
double portStageMapCollisionRead(unsigned field,unsigned index)
{
    if(!collision_installed)abort();MapCollData* data=stage_info.coll_data;
    if(field==0)return data->vert_count;
    if(field==3)return data->line_count;
    if(index>=(unsigned)data->vert_count)abort();
    if(field==1)return mpGetGroundCollVtx()[index].pos.x;
    if(field==2)return mpGetGroundCollVtx()[index].pos.y;
    abort();
}
/* Scripted normalized controller samples at the same boundary gameplay reads.
 * Raw device calibration/clamping and browser input scheduling remain separate. */
void portStageProbePad(unsigned slot,unsigned buttons,float x,float y)
{
    if(slot>=4||(buttons&~0x1f7f)||!isfinite(x)||!isfinite(y)||fabsf(x)>1||fabsf(y)>1)abort();
    HSD_PadStatus* p=&HSD_PadGameStatus[slot];unsigned previous=p->button;
    memset(p,0,sizeof(*p));p->button=buttons;p->last_button=previous;
    p->trigger=buttons&~previous;p->release=previous&~buttons;p->nml_stickX=x;p->nml_stickY=y;
}
double portStageMapRead(unsigned field,unsigned index)
{
    if(!installed)abort();
    if(field==0){if(index>=8)abort();return index<4?((float*)&stage_info.cam_info.cam_bounds)[index]:((float*)&stage_info.blast_zone)[index-4];}
    if(field==1){if(index>=261)abort();return (uintptr_t)stage_info.x280[index];}
    if(field==2){if(index>=7)abort();HSD_GObj* g=callbacks_initialized?Ground_GetMapGObj(index):owners[index];if(!g)abort();return (uintptr_t)((Ground*)g->user_data)->x18;}
    if(field==3){if(index>=261||!stage_info.x280[index])abort();Vec3 position;Ground_801C2D24(index,&position);return position.x;}
    if(field==4){if(index>=261||!stage_info.x280[index])abort();Vec3 position;Ground_801C2D24(index,&position);return position.y;}
    abort();
}
unsigned portStageMapLights(unsigned index)
{
    UnkArchiveStruct* entry=grDatFiles_GetArchive();
    if(!installed||index>=7)abort();LightList** lights=entry->unk4->unk8[index].x18;
    lights=portStageSelectLights(entry,lights);unsigned n=0;while(lights[n]){if(++n>32)abort();}return n;
}
void portStageMapClear(void)
{
    if(!installed||collision_installed)abort();
    if(render_lights){HSD_LObj_803668EC(NULL);HSD_GObjFree(render_lights);render_lights=NULL;}
    for(unsigned i=0;i<7;i++)if(owners[i]){Ground* ground=owners[i]->user_data;if(ground->x18)HSD_GObjFree(ground->x18);HSD_GObjFree(owners[i]);owners[i]=NULL;}
    Ground_801BFFB0();stage_info.param=NULL;installed=0;
}
