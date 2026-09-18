/* Isolated bring-up of the original GmRst panel scene. The product does not
 * switch to this renderer until its pixels and lifecycle are validated. */
#include <melee/sc/types.h>
#include <melee/cm/forward.h>
#include <melee/lb/lb_00B0.h>
#include <melee/lb/lbarchive.h>
#include <melee/lb/lbspdisplay.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/fog.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjgxlink.h>
#include <sysdolphin/baselib/gobjobject.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/lobj.h>
#include <stdlib.h>

static HSD_Archive* archive;
static SceneDesc *panel_scene,*film_scene;
static HSD_GObj *panel,*camera,*lights;
static void destroy_lights(HSD_Obj* object){HSD_LObjRemoveAll((HSD_LObj*)object);}
extern int portSceneInitialize(void);
extern void portRuntimeSetSceneDestructors(GObjFunc);
extern unsigned portRuntimeStep(void);
extern HSD_Archive* portFileArchivePair(const char*,const char*,const char*,void**);
extern void portFileArchiveClose(HSD_Archive*);
extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);

unsigned portResultSceneInitialize(void)
{
    if(archive||portSceneInitialize()<0)abort();portRuntimeSetSceneDestructors(destroy_lights);
    void* scenes[2]={0};archive=portFileArchivePair("GmRst.usd","pnlsce","flmsce",scenes);
    panel_scene=scenes[0];film_scene=scenes[1];if(!archive||!panel_scene||!film_scene)abort();
    camera=GObj_Create(HSD_GOBJ_CLASS_CAMERA,20,0);HSD_CObj* c=HSD_CObjLoadDesc(panel_scene->cameras->desc);
    if(!camera||!c)abort();HSD_GObjObject_80390A70(camera,HSD_GObj_CameraKind,c);
    lights=GObj_Create(11,3,0);HSD_LObj* l=lb_80011AC4(panel_scene->lights);
    if(!lights||!l)abort();HSD_GObjObject_80390A70(lights,HSD_GObj_LightKind,l);
    DynamicModelDesc* model=panel_scene->models[0];panel=GObj_Create(14,15,0);HSD_JObj* root=HSD_JObjLoadJoint(model->joint);
    if(!panel||!root)abort();HSD_GObjObject_80390A70(panel,HSD_GObj_JObjKind,root);GObj_SetupGXLink(panel,HSD_GObj_JObjCallback,11,0);
    lb_8000C07C(root,0,model->anims,model->matanims,model->shapeanims);HSD_JObjReqAnimAll(root,0);HSD_JObjAnimAll(root);return (unsigned)root;
}
unsigned portResultSceneObjects(unsigned* out,unsigned capacity)
{
    if(!archive||!out||capacity<1)abort();HSD_JObj* root=panel->hsd_obj;
    out[0]=(unsigned)panel;out[1]=(unsigned)root;out[2]=root->id;return 1;
}
unsigned portResultSceneStep(void){if(!archive)abort();HSD_JObjAnimAll(panel->hsd_obj);return portRuntimeStep();}
void portResultSceneRenderBegin(void){if(!archive)abort();portRenderContextBegin(camera->hsd_obj,lights->hsd_obj);}
void portResultSceneCameraSnapshot(float* out)
{
    if(!archive||!out)abort();HSD_CObj* c=camera->hsd_obj;if(HSD_CObjGetProjectionType(c)!=PROJ_PERSPECTIVE)abort();
    HSD_CObjGetViewingMtx(c,(float(*)[4])out);MTXPerspective((float(*)[4])(out+12),HSD_CObjGetFov(c),HSD_CObjGetAspect(c),HSD_CObjGetNear(c),HSD_CObjGetFar(c));
    HSD_CObjGetEyePosition(c,(Vec3*)(out+28));HSD_CObjGetInterest(c,(Vec3*)(out+31));out[34]=HSD_CObjGetFov(c);out[35]=HSD_CObjGetAspect(c);out[36]=HSD_CObjGetNear(c);out[37]=HSD_CObjGetFar(c);
}
void portResultSceneFinish(void)
{
    if(!archive)abort();for(unsigned link=0;link<64;link++)while(HSD_GObjPLinkHead[link])HSD_GObjFree(HSD_GObjPLinkHead[link]);
    portFileArchiveClose(archive);archive=NULL;panel_scene=film_scene=NULL;panel=camera=lights=NULL;
}
