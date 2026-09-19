/* Configured bring-up of the original GmRst panel scene. */
#include <melee/sc/types.h>
#include <melee/cm/forward.h>
#include <melee/cm/camera.h>
#include <melee/ft/forward.h>
#include <melee/ft/ftdemo.h>
#include <melee/ft/types.h>
#include <melee/gm/gmresultplayer.h>
#include <melee/gm/gmresultplayer.static.h>
#include <melee/lb/lb_00B0.h>
#include <melee/lb/lbarchive.h>
#include <melee/lb/lbspdisplay.h>
#include <melee/mn/mnmain.h>
#include <melee/pl/player.h>
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
#include <sysdolphin/baselib/memory.h>
#include <sysdolphin/baselib/sislib.h>
#include <sysdolphin/baselib/tobj.h>
#include <stdlib.h>
#include <string.h>

static HSD_Archive* archive;
static SceneDesc *panel_scene,*film_scene;
static HSD_GObj *panel,*camera,*lights;
static HSD_JObj* player_nodes[4][15];
static unsigned player_active[4];
static HSD_JObj* winner_node;
static unsigned winner_character_frame;
static HSD_Text* result_text[4][2];
static unsigned result_text_active;
static HSD_GObj* result_fighters[2];
static HSD_GObj* result_capture_cameras[2];
static HSD_GObj* result_live_cameras[2];
static void destroy_lights(HSD_Obj* object){HSD_LObjRemoveAll((HSD_LObj*)object);}
extern int portSceneInitialize(void);
extern void portRuntimeSetSceneDestructors(GObjFunc);
extern unsigned portRuntimeStep(void);
extern HSD_Archive* portFileArchivePair(const char*,const char*,const char*,void**);
extern void portFileArchiveClose(HSD_Archive*);
extern void portRenderContextBegin(HSD_CObj*,HSD_LObj*);
extern void portRenderContextEnter(void),portRenderContextLeave(void);
extern void portSetGXObserver(int (*)(HSD_GObj*,int));
extern float gm_80168B34(CharacterKind,int,int);
extern Fighter_GObj* fn_8017A67C(CharacterKind,int,int);
extern HSD_GObj* fn_8017A318(s32);
extern void fn_80179F84(HSD_JObj*);
extern void fn_8017A9B4(int);

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

static void add_number(HSD_Text* text,float y,int value,GXColor color)
{
    int line=HSD_SisLib_803A6B98(text,0.0F,y,"%d",value>999?999:value);
    HSD_SisLib_803A7548(text,line,0.11F,0.08F);HSD_SisLib_803A74F0(text,line,&color);
}

static void add_empty(HSD_Text* text,float y,GXColor color)
{
    int line=HSD_SisLib_803A6B98(text,0.0F,y,"-");
    HSD_SisLib_803A7548(text,line,0.11F,0.08F);HSD_SisLib_803A74F0(text,line,&color);
}

/* Recreate the stock-result landing rows from gmresult.c without depending on
 * the product MatchEnd singleton. All arguments are already-derived match
 * counters; raw packed score sentinels never cross this isolated boundary. */
void portResultSceneConfigureStats(unsigned kos0,unsigned falls0,unsigned self0,
                                   unsigned kos1,unsigned falls1,unsigned self1)
{
    if(!archive||result_text_active||kos0>999||falls0>999||self0>999||kos1>999||falls1>999||self1>999)abort();
    HSD_JObj* root=panel->hsd_obj;Vec3 base,anchors[6];lb_8000B1CC(find_node(root,0x68),NULL,&base);
    for(unsigned i=0;i<6;i++)lb_8000B1CC(find_node(root,0x62+i),NULL,&anchors[i]);
    const float first=1.14F*(anchors[4].y-anchors[0].y),second=1.12F*(anchors[5].y-anchors[4].y);
    const unsigned values[2][3]={{kos0,falls0,self0},{kos1,falls1,self1}};GXColor white={255,255,255,255},empty={160,160,160,255};
    for(unsigned slot=0;slot<4;slot++){
        HSD_Text* score=result_text[slot][0]=HSD_SisLib_803A6754(0,0);HSD_Text* stats=result_text[slot][1]=HSD_SisLib_803A6754(0,0);
        if(!score||!stats)abort();score->pos_x=anchors[slot].x;score->pos_y=-base.y;score->pos_z=base.z;score->default_alignment=score->default_kerning=1;
        stats->pos_x=anchors[slot].x;stats->pos_y=-anchors[slot].y-30.0F;stats->pos_z=anchors[slot].z;stats->default_alignment=stats->default_kerning=1;
        if(slot<2){int derived=(int)values[slot][0]-(int)values[slot][1]-(int)values[slot][2];add_number(score,-30.0F,derived,white);add_number(stats,0.0F,(int)values[slot][0],white);add_number(stats,-first,(int)values[slot][1],white);add_number(stats,-first-second,(int)values[slot][2],white);}
        else{add_empty(score,-30.0F,empty);add_empty(stats,0.0F,empty);add_empty(stats,-first,empty);add_empty(stats,-first-second,empty);}
    }
    result_text_active=1;
}

unsigned portResultSceneInitialize(unsigned character0,unsigned character1,unsigned winner)
{
    if(archive||portSceneInitialize()<0)abort();
    /* Scene transitions retain resident archives but not live HSD objects. The
     * browser has already copied MatchEnd before entering here. */
    for(unsigned link=0;link<64;link++)while(HSD_GObjPLinkHead[link])HSD_GObjFree(HSD_GObjPLinkHead[link]);
    portRuntimeSetSceneDestructors(destroy_lights);
    void* scenes[2]={0};archive=portFileArchivePair("GmRst.usd","pnlsce","flmsce",scenes);
    panel_scene=scenes[0];film_scene=scenes[1];if(!archive||!panel_scene||!film_scene)abort();
    camera=GObj_Create(HSD_GOBJ_CLASS_CAMERA,20,0);HSD_CObj* c=HSD_CObjLoadDesc(panel_scene->cameras->desc);
    if(!camera||!c)abort();HSD_GObjObject_80390A70(camera,HSD_GObj_CameraKind,c);
    HSD_SisLib_803A6048(0x10000);HSD_SisLib_803A611C(0,camera,9,0xD,0,0xE,0,0x13);HSD_SisLib_803A62A0(0,"SdRst.usd","SIS_ResultData");
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
/* Bring up the original result demo-fighter constructor after the host has
 * installed common data, fighter packages, PdPm and GmRstM archives. Keep this
 * in the isolated result module: these original pools/statics are one-shot. */
void portResultFightersInitialize(unsigned character0,unsigned character1,unsigned winner,unsigned costume0,unsigned costume1)
{
    if(!archive||result_fighters[0]||result_fighters[1]||character0>=26||character1>=26||winner>1||costume0>5||costume1>5)abort();
    Player_80036DD8();ftDemo_ObjAllocInit();Player_InitAllPlayers();
    ResultsDisplayLayout* layout=(ResultsDisplayLayout*)&lbl_8046E1B0;memset(&layout->state,0,sizeof(layout->state));
    const u16 dim_w1[4]={80,80,70,52},dim_h1[4]={110,114,100,74},dim_w2[4]={52,52,52,52},dim_h2[4]={74,74,74,74},scissor_x[4]={14,14,6,0},scissor_y[4]={12,8,6,0};
    memcpy(layout->state.dim_w1,dim_w1,sizeof(dim_w1));memcpy(layout->state.dim_h1,dim_h1,sizeof(dim_h1));memcpy(layout->state.dim_w2,dim_w2,sizeof(dim_w2));memcpy(layout->state.dim_h2,dim_h2,sizeof(dim_h2));memcpy(layout->state.scissor_x,scissor_x,sizeof(scissor_x));memcpy(layout->state.scissor_y,scissor_y,sizeof(scissor_y));
    fn_80179F84(find_node(panel->hsd_obj,0x41));
    const CharacterKind characters[2]={(CharacterKind)character0,(CharacterKind)character1};const unsigned costumes[2]={costume0,costume1};
    layout->state.match_end.is_teams=0;layout->state.match_end.n_winners=1;layout->state.match_end.winners[0]=winner;
    for(unsigned slot=0;slot<2;slot++){
        MatchPlayerData* standing=&layout->state.match_end.player_standings[slot];standing->pkind=Gm_PKind_Human;standing->ckind=characters[slot];standing->ftkind=Player_800325C8(characters[slot],0);standing->is_big_loser=slot==winner?0:1;standing->x3_b0=costumes[slot];
        fn_8017A9B4(slot);
        HSD_PadCopyStatus[slot].button=slot==winner?0x200:0;result_fighters[slot]=(HSD_GObj*)fn_8017A67C(characters[slot],costumes[slot],slot);if(!result_fighters[slot])abort();
    }
    for(unsigned slot=0;slot<2;slot++){
        HSD_GObj* main=fn_8017A318(slot);if(!main||main->obj_kind!=HSD_GObj_CameraKind||!main->hsd_obj||!main->render_cb)abort();
        result_capture_cameras[slot]=main;
        if(slot==winner){HSD_GObj* live=main->next;if(!live||live->obj_kind!=HSD_GObj_CameraKind||!live->hsd_obj||!live->render_cb)abort();result_live_cameras[slot]=live;}
    }
}
unsigned portResultFighter(unsigned slot){if(slot>=2||!result_fighters[slot])abort();return (unsigned)result_fighters[slot];}
unsigned portResultFighterCamera(unsigned slot,unsigned live)
{
    if(slot>=2||live>1)abort();HSD_GObj* camera=live?result_live_cameras[slot]:result_capture_cameras[slot];return (unsigned)camera;
}
static void snapshot_camera(HSD_CObj* c,float* out)
{
    if(!c||!out||HSD_CObjGetProjectionType(c)!=PROJ_PERSPECTIVE)abort();HSD_CObjGetViewingMtx(c,(float(*)[4])out);MTXPerspective((float(*)[4])(out+12),HSD_CObjGetFov(c),HSD_CObjGetAspect(c),HSD_CObjGetNear(c),HSD_CObjGetFar(c));
    HSD_CObjGetEyePosition(c,(Vec3*)(out+28));HSD_CObjGetInterest(c,(Vec3*)(out+31));out[34]=HSD_CObjGetFov(c);out[35]=HSD_CObjGetAspect(c);out[36]=HSD_CObjGetNear(c);out[37]=HSD_CObjGetFar(c);
}
void portResultFighterCameraProjectionSnapshot(unsigned slot,unsigned live,float* out)
{
    HSD_GObj* owner=(HSD_GObj*)portResultFighterCamera(slot,live);if(!owner)abort();snapshot_camera(owner->hsd_obj,out);
}
void portResultFighterRenderBegin(unsigned slot,unsigned live)
{
    HSD_GObj* owner=(HSD_GObj*)portResultFighterCamera(slot,live);if(!owner||!lights||!lights->hsd_obj)abort();portRenderContextBegin(owner->hsd_obj,lights->hsd_obj);
}
unsigned portResultFighterNativeDraw(unsigned slot,unsigned pass)
{
    extern unsigned portFighterNativeDraw(HSD_GObj*,unsigned);if(slot>=2||!result_fighters[slot]||pass>2)abort();Fighter* fp=result_fighters[slot]->user_data;if(!fp)abort();
    if(fp->kind==Ft_Kind_GameWatch){u8 old=Camera_80031060();Camera_80031074(1);unsigned drawn=portFighterNativeDraw(result_fighters[slot],pass);Camera_80031074(old);return drawn;}
    return portFighterNativeDraw(result_fighters[slot],pass);
}
unsigned portResultPortraitDescriptor(unsigned slot,unsigned* out)
{
    if(slot>=2||!out)abort();ResultsDisplayLayout* layout=(ResultsDisplayLayout*)&lbl_8046E1B0;HSD_ImageDesc* image=&layout->player_img2[slot];
    if(!image->image_ptr||!image->width||!image->height||image->format!=GX_TF_RGB5A3)abort();out[0]=(unsigned)image;out[1]=(unsigned)image->image_ptr;out[2]=image->width;out[3]=image->height;out[4]=image->format;out[5]=GXGetTexBufferSize(image->width,image->height,image->format,0,0);return 6;
}
void portResultPortraitCopy(unsigned slot)
{
    if(slot>=2)abort();ResultsDisplayLayout* layout=(ResultsDisplayLayout*)&lbl_8046E1B0;unsigned lookup=layout->state.match_end.player_standings[slot].is_big_loser;
    if(lookup>3)abort();u16 x=layout->state.scissor_x[lookup]+(320-(layout->state.dim_w1[lookup]/4)*2),y=layout->state.scissor_y[lookup]+(244-(layout->state.dim_h1[lookup]/2)*2);
    HSD_ImageDescCopyFromEFB(&layout->player_img2[slot],x,y,0,0);
}
void portResultPortraitAttach(unsigned slot)
{
    if(slot>=2)abort();ResultsDisplayLayout* layout=(ResultsDisplayLayout*)&lbl_8046E1B0;HSD_JObj* node=layout->jobjs[slot];HSD_TObj* texture=node&&node->u.dobj&&node->u.dobj->next&&node->u.dobj->next->mobj?node->u.dobj->next->mobj->tobj:NULL;
    if(!texture)abort();texture->imagedesc=&layout->player_img2[slot];HSD_JObjClearFlagsAll(node,JOBJ_HIDDEN);
}
unsigned portResultPortraitAttachment(unsigned slot,unsigned* out)
{
    if(slot>=2||!out)abort();ResultsDisplayLayout* layout=(ResultsDisplayLayout*)&lbl_8046E1B0;HSD_JObj* node=layout->jobjs[slot];HSD_DObj* dobj=node?node->u.dobj:NULL;HSD_TObj* texture=dobj&&dobj->next&&dobj->next->mobj?dobj->next->mobj->tobj:NULL;
    if(!node||!dobj||!texture)abort();out[0]=(unsigned)node;out[1]=(unsigned)dobj;out[2]=(unsigned)dobj->next;out[3]=(unsigned)texture;out[4]=(unsigned)texture->imagedesc;out[5]=(unsigned)&layout->player_img2[slot];out[6]=(unsigned)player_nodes[slot][0];out[7]=player_nodes[slot][0]->flags;return 8;
}
static HSD_GObj* submission_target;
static unsigned submission_count,submission_passes;
static int observe_submission(HSD_GObj* object,int pass)
{
    if(object==submission_target){submission_count++;if(pass<32)submission_passes|=1U<<pass;}return 1;
}
unsigned portResultWinnerCameraSubmission(unsigned slot,unsigned* passes)
{
    if(slot>=2||!passes||!result_live_cameras[slot]||submission_target)abort();submission_target=result_fighters[slot];submission_count=submission_passes=0;
    HSD_GObj* old=HSD_GObj_804D7818;HSD_GObj_804D7818=result_live_cameras[slot];portRenderContextEnter();portSetGXObserver(observe_submission);
    result_live_cameras[slot]->render_cb(result_live_cameras[slot],0);
    portSetGXObserver(NULL);portRenderContextLeave();HSD_GObj_804D7818=old;submission_target=NULL;*passes=submission_passes;return submission_count;
}
void portResultFighterCameraSnapshot(unsigned slot,unsigned live,float* out)
{
    if(!out)abort();HSD_GObj* owner=(HSD_GObj*)portResultFighterCamera(slot,live);if(!owner)abort();HSD_CObj* c=owner->hsd_obj;
    snapshot_camera(c,out);
    Scissor scissor;HSD_CObjGetScissor(c,&scissor);out[38]=scissor.left;out[39]=scissor.right;out[40]=scissor.top;out[41]=scissor.bottom;
}
void portResultFighterSnapshot(unsigned slot,float* out)
{
    if(slot>=2||!result_fighters[slot]||!out)abort();Fighter* fp=result_fighters[slot]->user_data;if(!fp)abort();
    out[0]=fp->kind;out[1]=fp->motion_id;out[2]=fp->anim_id;out[3]=fp->cur_anim_frame;out[4]=fp->cur_pos.x;out[5]=fp->cur_pos.y;out[6]=fp->cur_pos.z;out[7]=fp->facing_dir;out[8]=fp->x34_scale.y;out[9]=(unsigned)fp->x5A4;out[10]=(unsigned)fp->x5A8;out[11]=(unsigned)fp->x8AC_animSkeleton;out[12]=fp->invisible;out[13]=fp->x221E_b5;out[14]=(unsigned)fp->x5AC.xC[4];
}
unsigned portResultSceneTextOwners(unsigned* out,unsigned capacity)
{
    if(!archive||!result_text_active||!out||capacity<8)abort();unsigned count=0;
    for(unsigned slot=0;slot<4;slot++)for(unsigned row=0;row<2;row++){HSD_Text* text=result_text[slot][row];if(!text||!text->entity)abort();out[count++]=(unsigned)text->entity;}
    return count;
}
void portResultSceneRenderBegin(void){if(!archive)abort();portRenderContextBegin(camera->hsd_obj,lights->hsd_obj);}
void portResultSceneCameraSnapshot(float* out)
{
    if(!archive||!out)abort();HSD_CObj* c=camera->hsd_obj;if(HSD_CObjGetProjectionType(c)!=PROJ_PERSPECTIVE)abort();
    HSD_CObjGetViewingMtx(c,(float(*)[4])out);MTXPerspective((float(*)[4])(out+12),HSD_CObjGetFov(c),HSD_CObjGetAspect(c),HSD_CObjGetNear(c),HSD_CObjGetFar(c));
    HSD_CObjGetEyePosition(c,(Vec3*)(out+28));HSD_CObjGetInterest(c,(Vec3*)(out+31));out[34]=HSD_CObjGetFov(c);out[35]=HSD_CObjGetAspect(c);out[36]=HSD_CObjGetNear(c);out[37]=HSD_CObjGetFar(c);
}
void portResultSceneFinish(void)
{
    if(!archive)abort();if(result_text_active){for(unsigned slot=0;slot<4;slot++)for(unsigned row=0;row<2;row++){HSD_SisLib_803A5CC4(result_text[slot][row]);result_text[slot][row]=NULL;}result_text_active=0;}HSD_SisLib_803A5FBC();
    ResultsDisplayLayout* layout=(ResultsDisplayLayout*)&lbl_8046E1B0;for(unsigned slot=0;slot<4;slot++){if(layout->player_img1[slot].image_ptr){HSD_Free(layout->player_img1[slot].image_ptr);layout->player_img1[slot].image_ptr=NULL;}if(layout->player_img2[slot].image_ptr){HSD_Free(layout->player_img2[slot].image_ptr);layout->player_img2[slot].image_ptr=NULL;}}
    for(unsigned link=0;link<64;link++)while(HSD_GObjPLinkHead[link])HSD_GObjFree(HSD_GObjPLinkHead[link]);
    portFileArchiveClose(archive);archive=NULL;panel_scene=film_scene=NULL;panel=camera=lights=NULL;
    winner_node=NULL;winner_character_frame=0;
    for(unsigned slot=0;slot<2;slot++){result_fighters[slot]=NULL;result_capture_cameras[slot]=NULL;result_live_cameras[slot]=NULL;}
    for(unsigned slot=0;slot<4;slot++){player_active[slot]=0;for(unsigned part=0;part<15;part++)player_nodes[slot][part]=NULL;}
}
