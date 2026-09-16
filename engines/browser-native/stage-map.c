/* Bring-up of original stage model ownership; full Stage startup is separate. */
#include <melee/gr/ground.h>
#include <melee/gr/grdatfiles.h>
#include <melee/gr/granime.h>
#include <melee/gr/grbattle.h>
#include <melee/gr/grlast.h>
#include <melee/gr/grizumi.h>
#include <melee/gr/groldpupupu.h>
#include <melee/gr/types.h>
#include <melee/sc/types.h>
#include <melee/mp/mplib.h>
#include <melee/mp/mpcoll.h>
#include <melee/pl/player.h>
#include <melee/cm/camera.h>
#include <melee/ft/ftdevice.h>
#include <melee/ft/ftcoll.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/lobj.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/controller.h>
#include <sysdolphin/baselib/particle.h>
#include <sysdolphin/baselib/tobj.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <emscripten.h>
_Static_assert(sizeof(UnkStageDat)==48&&sizeof(struct UnkStageDat_x8_t)==52,"Stage map ABI");
_Static_assert(sizeof(GroundParam)==220&&sizeof(StageParam)==100,"Stage parameter ABI");
extern int portSceneInitialize(void);
extern void portRuntimeSetSceneDestructors(GObjFunc);
extern LightList** portStageSelectLights(UnkArchiveStruct*,LightList**);
extern void portStageCreateGlobalLights(void);
extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
extern void portRenderContextEnter(void),portRenderContextLeave(void);
extern void portSetGXObserver(int (*)(HSD_GObj*,int));
extern void portCameraDrawPasses(HSD_GObj*);
extern void efLib_render_callback(HSD_GObj*,int);
EM_JS(void,portDispatchObject,(unsigned owner,unsigned pass,unsigned link,unsigned classifier,unsigned particles),{
    if(typeof Module.onNativeObject!=='function')throw Error('Native object receiver is absent');
    Module.onNativeObject(owner,pass,link,classifier,particles);
});
static int dispatch_object(HSD_GObj* object,int pass)
{
    if(object->obj_kind==HSD_GObj_LightKind){
        portRenderContextEnter();object->render_cb(object,pass);portRenderContextLeave();
    }else portDispatchObject((unsigned)object,pass,object->gx_link,object->classifier,object->render_cb==efLib_render_callback);
    return 1;
}
static HSD_GObj* owners[10];
static unsigned model_count;
static StKind stage_kind;
static StageData* stage_callbacks;
static HSD_GObj* render_lights;
static int installed;
static int collision_installed;
static int callbacks_initialized;
extern void portStageSelectResident(StKind);
void portStageDrawPasses(void)
{
    if(!callbacks_initialized||!render_lights)abort();
    HSD_GObj* old=HSD_GObj_804D7818;HSD_GObj_804D7818=Camera_80030A50();
    portSetGXObserver(dispatch_object);portCameraDrawPasses(HSD_GObj_804D7818);portSetGXObserver(NULL);
    HSD_GObj_804D7818=old;
}
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
void portStageMapInstallKind(HSD_Archive* archive,UnkStageDat* data,GroundParam* param,unsigned kind)
{
    switch(kind){
    case St_Kind_Izumi:model_count=5;stage_callbacks=&grIz_StageData;break;
    case St_Kind_Battle:model_count=7;stage_callbacks=&grNBa_StageData;break;
    case St_Kind_Last:model_count=10;stage_callbacks=&grNLa_StageData;break;
    case St_Kind_OldPupupu:model_count=8;stage_callbacks=&grOp_StageData;break;
    default:abort();
    }
    stage_kind=kind;
    if(installed||!archive||!data||!param||data->unkC!=model_count||portSceneInitialize()<0)abort();
    portRuntimeSetSceneDestructors(destroy_lights);
    Ground_801BFFB0();
    UnkArchiveStruct* entry=grDatFiles_GetArchive();entry->unk0=archive;entry->unk4=data;entry->unk8=0;
    stage_info.grkind=stage_callbacks->grkind;stage_info.param=param;installed=1;
}
/* Original archive-location and Ground bank-install steps, before callbacks
 * can spawn generators. The resident archive remains pinned for this scene. */
unsigned portStageParticlesInstall(int* commands,int* textures)
{
    if(!installed||callbacks_initialized||stage_info.map_ptcl||!commands||!textures||
       ((u16*)commands)[0]!=0x42||((u16*)commands)[1]!=30||commands[1]!=30000||
       commands[2]<=0||commands[2]>4096||textures[0]<=0||textures[0]>256)abort();
    stage_info.map_ptcl=commands;stage_info.map_texg=textures;
    psInitDataBankLocate((HSD_Archive*)commands,(HSD_Archive*)textures,NULL);
    psInitDataBankLoad(30,commands,textures,NULL,NULL);
    if(psCmdListArray[30]!=30000+commands[2]||!psTexGroupArray[30]||!ptclref_804D0E5C[30])abort();
    return commands[2];
}
void portStageMapInstall(HSD_Archive* archive,UnkStageDat* data,GroundParam* param)
{portStageMapInstallKind(archive,data,param,St_Kind_Battle);}
HSD_GObj* portStageMapCreate(unsigned index)
{
    if(!installed||callbacks_initialized||index>=model_count||owners[index])abort();
    owners[index]=Ground_GetStageGObj(index);
    if(!owners[index])abort();
    if(collision_installed)Ground_InitMapColl(owners[index]->hsd_obj,index);
    grAnime_801C8138(owners[index],index,0);
    return owners[index];
}
void portStageCallbacksInitialize(void* parameters)
{
    if(!installed||!collision_installed||callbacks_initialized||!parameters)abort();
    for(unsigned i=0;i<model_count;i++)if(owners[i])abort();
    portStageSelectResident(stage_kind);
    stage_info.yakumono_param=parameters;
    stage_info.on_touch_line=stage_callbacks->on_touch_line;
    stage_info.on_check_shadow_render=stage_callbacks->on_check_shadow_render;
    stage_callbacks->on_init();
    for(unsigned i=0;i<model_count;i++)owners[i]=Ground_GetMapGObj(i);
    if(!owners[0]||!owners[1]||!owners[3])abort();
    if(stage_kind==St_Kind_Battle&&!owners[6])abort();
    if((stage_kind==St_Kind_Last||stage_kind==St_Kind_Izumi)&&!owners[2])abort();
    if(stage_kind==St_Kind_Izumi&&!owners[4])abort();
    if(stage_kind==St_Kind_OldPupupu&&(!owners[4]||!owners[5]||!owners[6]||!owners[7]||!Ground_GetMapGObj(8)))abort();
    if(stage_kind==St_Kind_Izumi)stage_callbacks->on_load();
    callbacks_initialized=1;
}
void portBattlefieldCallbacksInitialize(void* parameters){portStageCallbacksInitialize(parameters);}
unsigned portStageObject(unsigned index)
{
    if(!callbacks_initialized||index>=model_count)abort();
    return (unsigned)Ground_GetMapGObj(index);
}
unsigned portBattlefieldObject(unsigned index){return portStageObject(index);}
/* Map lookup stores only the most recently spawned object for each group.
 * Enumerate original owners so simultaneous Dream Land background spawns all
 * retain their own model/callbacks. The ninth owner is an empty spawn timer. */
static void check_empty_stage_joint(HSD_JObj* joint)
{
    for(;joint;joint=joint->next){if(joint->u.dobj)abort();check_empty_stage_joint(joint->child);}
}
unsigned portStageObjects(unsigned* output,unsigned capacity)
{
    if(!callbacks_initialized||!output)abort();unsigned count=0;
    for(HSD_GObj* object=HSD_GObjPLinkHead[5];object;object=object->next){
        if(object->classifier!=HSD_GOBJ_CLASS_STAGE||!object->render_cb)continue;
        Ground* ground=object->user_data;if(!ground||count>=capacity)abort();
        /* GrKind may be unsigned in Clang; the retail custom-owner sentinel is -1. */
        int map_id=(s32)ground->map_id;unsigned id=map_id;
        if(map_id<0){
            if(stage_kind!=St_Kind_Izumi||map_id!=-1||object->render_cb!=grIzumi_801CCB90)abort();
            HSD_Joint* descriptor=HSD_ArchiveGetPublicAddress(grDatFiles_GetArchive()->unk0,"GrdIzumiStar_TopN_joint");
            HSD_JObj* root=object->hsd_obj;
            if(!descriptor||!root||!root->child||root->child->id!=(unsigned)descriptor)abort();
            id=model_count;
        }else if(id>=model_count){if(stage_kind!=St_Kind_OldPupupu||id!=8)abort();check_empty_stage_joint(object->hsd_obj);}
        output[count*2]=(unsigned)object;output[count*2+1]=id;count++;
    }
    return count;
}

/* Optional cosmetic-only profile. Original owners and particle/platform
 * processes remain scheduled. No camera or gameplay transform is changed. */
void portFountainReflectionOff(void)
{
    typedef struct { Mtx matrix; HSD_ImageDesc* image; } Reflection;
    _Static_assert(sizeof(Reflection)==52,"Fountain reflection ABI");
    if(stage_kind!=St_Kind_Izumi||!callbacks_initialized)abort();
    Ground* ground=Ground_GetMapGObj(3)->user_data;
    if(!ground||!ground->u.izumi.xC8)abort();
    Reflection* reflection=ground->u.izumi.xC8->user_data;
    if(!reflection||!reflection->image||!reflection->image->image_ptr||
       reflection->image->width!=80||reflection->image->height!=60||reflection->image->format!=GX_TF_RGB565)abort();
    /* Constant black sampling with q=1. This is a texture matrix only; using
     * an uninitialized reflection matrix would create undefined coordinates. */
    memset(reflection->matrix,0,sizeof(reflection->matrix));reflection->matrix[2][3]=1;
    memset(reflection->image->image_ptr,0,GXGetTexBufferSize(80,60,GX_TF_RGB565,0,0));
}

/* Observe the two distinct original platform owners and their registered
 * collision transforms. This does not step, freeze or reposition a platform. */
double portFountainPlatformRead(unsigned field,unsigned index)
{
    if(stage_kind!=St_Kind_Izumi||!callbacks_initialized||index>=2)abort();
    Ground* selected=NULL;unsigned count=0;
    for(HSD_GObj* object=HSD_GObjPLinkHead[5];object;object=object->next){
        if(object->classifier!=HSD_GOBJ_CLASS_STAGE||!object->render_cb)continue;
        Ground* ground=object->user_data;if(!ground||ground->map_id!=4)continue;
        if(ground->u.izumi3.xC8<0||ground->u.izumi3.xC8>=2)abort();count++;
        if(ground->u.izumi3.xC8==index){if(selected)abort();selected=ground;}
    }
    if(count!=2||!selected)abort();
    CollJoint* joint=&mpGetGroundCollJoint()[index];
    if(joint->x20!=selected->u.izumi3.xCC||!joint->inner||joint->inner->vtx_count<2)abort();
    if(field==0)return selected->u.izumi3.xD0;
    if(field==1)return selected->u.izumi3.xC4;
    if(field==2)return joint->x20->translate.y;
    if(field==3){
        double maximum=0;MtxPtr matrix=joint->x20->mtx;
        for(int i=0;i<joint->inner->vtx_count;i++){
            CollVtx* vertex=&mpGetGroundCollVtx()[joint->inner->vtx_start+i];
            double x=(double)vertex->x0*matrix[0][0]+(double)vertex->x4*matrix[0][1]+matrix[0][3];
            double y=(double)vertex->x0*matrix[1][0]+(double)vertex->x4*matrix[1][1]+matrix[1][3];
            if(!isfinite(x)||!isfinite(y)||!isfinite(vertex->pos.x)||!isfinite(vertex->pos.y))abort();
            maximum=fmax(maximum,fmax(fabs(vertex->pos.x-x),fabs(vertex->pos.y-y)));
        }
        return maximum;
    }
    if(field==4)return mpGetGroundCollVtx()[joint->inner->vtx_start].pos.y;
    if(field==5)return selected->u.izumi3.xC6;
    abort();
}

/* Read-only observations of the original wind state and collision query. */
double portDreamlandWindRead(unsigned field,unsigned slot)
{
    if(stage_kind!=St_Kind_OldPupupu||!callbacks_initialized||slot>=2)abort();
    HSD_GObj* object=Ground_GetMapGObj(7);Ground* ground=object->user_data;
    if(ft_804D6578.x0!=1||ft_80459A68[0].ground!=object||ft_80459A68[0].type!=0xA||ft_80459A68[0].active_cb!=fn_802112F4)abort();
    if(field==0)return ground->u.oldpupupu.xDC;
    if(field==1)return ground->u.oldpupupu.xC8;
    if(field==2)return ground->u.oldpupupu.xD0;
    if(field==3){HSD_GObj* fighter=Player_GetEntity(slot);Vec3 wind;if(!fighter)abort();ftColl_GetWindOffsetVec(fighter,&wind);if(wind.y!=0||wind.z!=0||!isfinite(wind.x))abort();return wind.x;}
    if(field==4)return ((float*)stage_info.yakumono_param)[4];
    abort();
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
    if(field==2){if(index>=model_count)abort();HSD_GObj* g=callbacks_initialized?Ground_GetMapGObj(index):owners[index];if(!g)abort();return (uintptr_t)((Ground*)g->user_data)->x18;}
    if(field==3){if(index>=261||!stage_info.x280[index])abort();Vec3 position;Ground_801C2D24(index,&position);return position.x;}
    if(field==4){if(index>=261||!stage_info.x280[index])abort();Vec3 position;Ground_801C2D24(index,&position);return position.y;}
    abort();
}
unsigned portStageMapLights(unsigned index)
{
    UnkArchiveStruct* entry=grDatFiles_GetArchive();
    if(!installed||index>=model_count)abort();LightList** lights=entry->unk4->unk8[index].x18;
    lights=portStageSelectLights(entry,lights);unsigned n=0;while(lights[n]){if(++n>32)abort();}return n;
}
void portStageMapClear(void)
{
    if(!installed||collision_installed)abort();
    if(render_lights){HSD_LObj_803668EC(NULL);HSD_GObjFree(render_lights);render_lights=NULL;}
    for(unsigned i=0;i<model_count;i++)if(owners[i]){Ground* ground=owners[i]->user_data;if(ground->x18)HSD_GObjFree(ground->x18);HSD_GObjFree(owners[i]);owners[i]=NULL;}
    Ground_801BFFB0();stage_info.param=NULL;installed=0;
}
