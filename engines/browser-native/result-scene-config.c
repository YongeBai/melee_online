/* Isolated configured bring-up of the original GmRst panel scene. The product does not
 * switch to this renderer until its pixels and lifecycle are validated. */
#include <melee/sc/types.h>
#include <melee/cm/forward.h>
#include <melee/ft/forward.h>
#include <melee/lb/lb_00B0.h>
#include <melee/lb/lbarchive.h>
#include <melee/lb/lbspdisplay.h>
#include <melee/mn/mnmain.h>
#include <sysdolphin/baselib/aobj.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/fog.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjgxlink.h>
#include <sysdolphin/baselib/gobjobject.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/lobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <sysdolphin/baselib/tobj.h>
#include <stdlib.h>

static HSD_Archive* archive;
static SceneDesc *panel_scene,*film_scene;
static HSD_GObj *panel,*camera,*lights;
static HSD_JObj* player_nodes[4][15];
static unsigned player_active[4];
static HSD_JObj* winner_node;
static unsigned winner_character_frame;
static void destroy_lights(HSD_Obj* object){HSD_LObjRemoveAll((HSD_LObj*)object);}
extern int portSceneInitialize(void);
extern void portRuntimeSetSceneDestructors(GObjFunc);
extern unsigned portRuntimeStep(void);
extern HSD_Archive* portFileArchivePair(const char*,const char*,const char*,void**);
extern void portFileArchiveClose(HSD_Archive*);
extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
extern float gm_80168B34(CharacterKind,int,int);

static HSD_JObj* find_node(HSD_JObj* root,unsigned id)
{
    HSD_JObj* node=root;lb_80011E24(root,&node,id,-1);if(!node)abort();return node;
}

static void freeze_joint(HSD_JObj* node,float frame)
{
    HSD_ForeachAnim(node,JOBJ_TYPE,ALL_TYPE_MASK,HSD_AObjSetRate,AOBJ_ARG_AF,0.0);
    HSD_ForeachAnim(node,JOBJ_TYPE,ALL_TYPE_MASK,HSD_AObjSetCurrentFrame,AOBJ_ARG_AF,frame);
    HSD_JObjAnimAll(node);
}

static HSD_TObj* node_texture(HSD_JObj* node)
{
    HSD_DObj* dobj=node?node->u.dobj:NULL;HSD_MObj* mobj=dobj?dobj->mobj:NULL;
    HSD_TObj* tobj=mobj?mobj->tobj:NULL;if(!tobj||!tobj->aobj)abort();return tobj;
}

static void freeze_texture(HSD_JObj* node,float frame)
{
    HSD_TObj* tobj=node_texture(node);HSD_AObjSetCurrentFrame(tobj->aobj,frame);
    HSD_AObjSetRate(tobj->aobj,0.0F);HSD_TObjAnim(tobj);
}

static void configure_winner(HSD_JObj* root,unsigned character)
{
    winner_node=find_node(root,0xA);HSD_DObj* dobj=winner_node->u.dobj;
    HSD_TObj* tobj=dobj&&dobj->next&&dobj->next->mobj?dobj->next->mobj->tobj:NULL;if(!tobj||!tobj->aobj)abort();
    winner_character_frame=(unsigned)gm_80168B34((CharacterKind)character,0,0);HSD_TObjReqAnim(tobj,(float)winner_character_frame);HSD_TObjAnim(tobj);
    if(winner_character_frame<0x19){HSD_AObjSetCurrentFrame(tobj->aobj,0.0F);HSD_AObjSetEndFrame(tobj->aobj,29.0F);}
    else{float start=30.0F*(float)(winner_character_frame-0xB4);HSD_AObjSetCurrentFrame(tobj->aobj,start);HSD_AObjSetEndFrame(tobj->aobj,start+29.0F);}
    mn_8022F3D8(winner_node,1,TOBJ_MASK);
}

static void configure_players(HSD_JObj* root,unsigned character0,unsigned character1,unsigned winner)
{
    static const unsigned ids[4][15]={
        {0x42,0x1D,0x1E,0x3D,0x46,0x21,0x52,0x19,0x6C,0x6B,0x23,0x24,0x56,0x5A,0x5E},
        {0x43,0x25,0x26,0x3E,0x49,0x29,0x53,0x1A,0x6E,0x6D,0x2B,0x2C,0x57,0x5B,0x5F},
        {0x44,0x2D,0x2E,0x3F,0x4C,0x31,0x54,0x1B,0x70,0x6F,0x33,0x34,0x58,0x5C,0x60},
        {0x45,0x35,0x36,0x40,0x4F,0x39,0x55,0x1C,0x72,0x71,0x3B,0x3C,0x59,0x5D,0x61},
    };
    const unsigned characters[2]={character0,character1};if(character0>=26||character1>=26||winner>1)abort();
    configure_winner(root,characters[winner]);
    for(unsigned slot=0;slot<4;slot++){
        for(unsigned part=0;part<15;part++)player_nodes[slot][part]=find_node(root,ids[slot][part]);
        static const unsigned initially_hidden[]={0,4,8,9,10,11};
        for(unsigned part=0;part<sizeof(initially_hidden)/sizeof(*initially_hidden);part++)HSD_JObjSetFlagsAll(player_nodes[slot][initially_hidden[part]],JOBJ_HIDDEN);
        player_active[slot]=slot<2;
        if(slot<2){
            float character_frame=gm_80168B34((CharacterKind)characters[slot],0,0);
            freeze_joint(player_nodes[slot][0],character_frame);freeze_texture(player_nodes[slot][5],character_frame);
            freeze_joint(player_nodes[slot][4],slot==winner?5.0F:1.0F);
            HSD_JObjClearFlagsAll(player_nodes[slot][0],JOBJ_HIDDEN);HSD_JObjClearFlagsAll(player_nodes[slot][4],JOBJ_HIDDEN);
            HSD_JObjSetFlagsAll(player_nodes[slot][3],JOBJ_HIDDEN);
        }
        else{HSD_JObjSetFlagsAll(player_nodes[slot][1],JOBJ_HIDDEN);HSD_JObjSetFlagsAll(player_nodes[slot][5],JOBJ_HIDDEN);HSD_JObjSetFlagsAll(player_nodes[slot][7],JOBJ_HIDDEN);}
    }
}

unsigned portResultSceneInitialize(unsigned character0,unsigned character1,unsigned winner)
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
    lb_8000C07C(root,0,model->anims,model->matanims,model->shapeanims);HSD_JObjReqAnimAll(root,0);HSD_JObjAnimAll(root);
    configure_players(root,character0,character1,winner);return (unsigned)root;
}
unsigned portResultSceneObjects(unsigned* out,unsigned capacity)
{
    if(!archive||!out||capacity<1)abort();HSD_JObj* root=panel->hsd_obj;
    out[0]=(unsigned)panel;out[1]=(unsigned)root;out[2]=root->id;return 1;
}
unsigned portResultSceneStep(void){if(!archive)abort();HSD_JObjAnimAll(panel->hsd_obj);return portRuntimeStep();}
unsigned portResultScenePlayerSnapshot(unsigned* out,unsigned capacity)
{
    if(!archive||!out||capacity<24)abort();
    for(unsigned slot=0;slot<4;slot++){
        unsigned* row=out+slot*6;row[0]=player_active[slot];row[1]=(player_nodes[slot][0]->flags&JOBJ_HIDDEN)!=0;
        row[2]=(player_nodes[slot][1]->flags&JOBJ_HIDDEN)!=0;row[3]=(player_nodes[slot][4]->flags&JOBJ_HIDDEN)!=0;
        row[4]=(player_nodes[slot][5]->flags&JOBJ_HIDDEN)!=0;row[5]=(unsigned)HSD_AObjGetCurrFrame(node_texture(player_nodes[slot][5])->aobj);
    }
    return 4;
}
unsigned portResultSceneWinnerSnapshot(void){if(!archive||!winner_node)abort();return winner_character_frame;}
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
    winner_node=NULL;winner_character_frame=0;
    for(unsigned slot=0;slot<4;slot++){player_active[slot]=0;for(unsigned part=0;part<15;part++)player_nodes[slot][part]=NULL;}
}
