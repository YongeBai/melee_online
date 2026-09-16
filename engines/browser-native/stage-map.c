/* Bring-up of original stage model ownership; full Stage startup is separate. */
#include <melee/gr/ground.h>
#include <melee/gr/grdatfiles.h>
#include <melee/gr/granime.h>
#include <melee/gr/types.h>
#include <melee/sc/types.h>
#include <melee/mp/mplib.h>
#include <melee/mp/mpcoll.h>
#include <melee/pl/player.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/lobj.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/controller.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
_Static_assert(sizeof(UnkStageDat)==48&&sizeof(struct UnkStageDat_x8_t)==52,"Stage map ABI");
_Static_assert(sizeof(GroundParam)==220&&sizeof(StageParam)==100,"Stage parameter ABI");
extern int portSceneInitialize(void);
extern void portRuntimeSetSceneDestructors(GObjFunc);
extern LightList** portStageSelectLights(UnkArchiveStruct*,LightList**);
static HSD_GObj* owners[7];
static int installed;
static int collision_installed;
static void destroy_lights(HSD_Obj* object){HSD_LObjRemoveAll((HSD_LObj*)object);}
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
    if(!installed||index>=7||owners[index])abort();
    owners[index]=Ground_GetStageGObj(index);
    if(!owners[index])abort();
    if(collision_installed)Ground_InitMapColl(owners[index]->hsd_obj,index);
    grAnime_801C8138(owners[index],index,0);
    return owners[index];
}
void portStageMapBounds(void){if(!owners[0])abort();Ground_801C39C0();Ground_801C3BB4();}
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
    if(field==2){if(index>=7||!owners[index])abort();return (uintptr_t)((Ground*)owners[index]->user_data)->x18;}
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
    for(unsigned i=0;i<7;i++)if(owners[i]){Ground* ground=owners[i]->user_data;if(ground->x18)HSD_GObjFree(ground->x18);HSD_GObjFree(owners[i]);owners[i]=NULL;}
    Ground_801BFFB0();stage_info.param=NULL;installed=0;
}
