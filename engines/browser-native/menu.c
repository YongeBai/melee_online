/* Original stage-select lifecycle. The browser owns nonblocking scheduling;
 * original menu callbacks own animation, cursor hit tests and selection. */
#include <melee/mn/mnstagesel.h>
#include <melee/mn/types.h>
#include <melee/gm/gm_unsplit.h>
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
static int initialized;
static HSD_GObj* cursor;
static HSD_GObj *camera,*lights,*fog;
static void destroy_lights(HSD_Obj* obj){HSD_LObjRemoveAll((HSD_LObj*)obj);}
unsigned portStageMenuInitialize(unsigned controller)
{
    if(initialized||controller>=4||portSceneInitialize()<0)abort();
    portRuntimeSetSceneDestructors(destroy_lights);
    portInitializeVsRouting();portSceneExitStatus(1);lbLang_SetSavedLanguage(1);gm_8016468C();
    memset(&selection,0,sizeof(selection));selection.unk_stage=controller+1;
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
    return selection.start_game?selection.vs.start.rules.stkind:0;
}
double portShapeBlend(HSD_PObj* polygon,unsigned index)
{
    if(!polygon||pobj_type(polygon)!=POBJ_SHAPEANIM)abort();
    HSD_ShapeSet* s=polygon->u.shape_set;
    if(s->flags&SHAPESET_ADDITIVE){if(index>=s->nb_shape)abort();return s->blend.bp[index];}
    if(index)abort();return s->blend.bl;
}
