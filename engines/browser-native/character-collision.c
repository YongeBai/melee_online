/* Original per-fighter field initialization, model/part setup and hurtbox
 * routines in a limited Fighter fixture. The wider target also runs original
 * dynamic-bone construction/simulation. Combat and material drawing remain
 * separate integration steps; no replacement collision algorithm is used here. */
#include <melee/ft/fighter.h>
#include <melee/ft/ftcoll.h>
#include <melee/ft/ft_0C88.h>
#include <melee/ft/ftdata.h>
#include <melee/pl/player.h>
#include <melee/pl/types.h>
#include <melee/gm/gm_1601.h>
#include <melee/gm/gmvs.h>
#include <melee/ft/ftanim.h>
#include <sysdolphin/baselib/id.h>
#include <melee/ft/ftparts.h>
#include <melee/ft/ftmaterial.h>
#include <melee/ft/kinds/ftCommon/types.h>
#include <melee/ft/kinds/ftCommon/ftCo_09F4.h>
#include <melee/lb/lbcollision.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjproc.h>
#include <sysdolphin/baselib/gobjuserdata.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <sysdolphin/baselib/pobj.h>
#include <sysdolphin/baselib/objalloc.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>

_Static_assert(sizeof(ftHurtboxInit)==40,"Hurtbox descriptor ABI");
unsigned portPackedFlagBits(unsigned value)
{
    UnkFlagStruct flags;flags.byte=value;
    return (flags.b0<<7)|(flags.b1<<6)|(flags.b2<<5)|(flags.b3<<4)|
           (flags.b4<<3)|(flags.b5<<2)|(flags.b6<<1)|flags.b7;
}
/* Diagnostic normal-body preparation from ftDrawCommon_800805C8. This runs
 * original visibility selection, but does not replace the full draw callback,
 * special forms, refraction, materials, accessories or GPU submission. */
int portFighterPreviewPrepare(HSD_GObj* object)
{
    if(!object||!object->user_data)abort();
    Fighter* fp=object->user_data;
    if(!fp->x21FC_flag.b7||fp->invisible||fp->x221E_b5)return 0;
    if(fp->is_metal||fp->x2226_b5||fp->x2227_b3)abort();
    ftParts_800750C8(fp,1,0);ftParts_800750C8(fp,4,0);
    ftParts_800750C8(fp,2,0);ftParts_800750C8(fp,0,1);
    /* Normal camera branch of ftDrawCommon_80080E18/800805C8. Constructors
     * do not initialize every render-pass bit; skipping this can select the
     * depth-only silhouette pass while drawing the normal body. */
    fp->x2223_b3=false;fp->x2223_b2=false;
    fp->x2227_b7=true;fp->x2228_b0=false;
    extern void portRenderContextEnter(void),portRenderContextLeave(void);
    portRenderContextEnter();
    HSD_GObj* lights=HSD_GObjPLinkHead[3];
    while(lights&&lights->classifier!=12)lights=lights->next;
    if(!lights||!lights->hsd_obj||!lights->render_cb)abort();
    lights->render_cb(lights,0);ftCo_8009F5AC(fp);
    portRenderContextLeave();
    return 1;
}
void portFighterPreviewFinish(HSD_GObj* object)
{
    if(!object||!object->user_data)abort();
    extern void portRenderContextEnter(void),portRenderContextLeave(void);
    portRenderContextEnter();ftCo_8009F7F8(object->user_data);portRenderContextLeave();
}
_Static_assert(sizeof(ftData_x38)==20,"Dynamics collider descriptor ABI");
_Static_assert(offsetof(Fighter,x1670)==0x1670,"Dynamics collider array offset");
_Static_assert(offsetof(Fighter,x1828)==0x1828,"Dynamics collider array extent");
_Static_assert(sizeof(((Fighter*)0)->x1670)/sizeof(Fighter_x1670_t)==11,"Dynamics collider capacity");
typedef struct { ftData_x30 hurt; int count; ftData_x38* dynamics; } CollisionData;
typedef struct { Fighter fighter; ftData data; ftDynamics dynamics; void (*release_dynamics)(Fighter*); void (*release_motions)(Fighter*); unsigned part_channels,part_variants[5],part_count; } CollisionFixture;
static CollisionFixture* context(HSD_GObj* object){if(!object||!object->user_data)abort();return object->user_data;}
extern int portSceneInitialize(void);
extern int portFighterStartupComplete(void);
extern HSD_JObjInfo ftJObj;
extern HSD_JObjInfo ftIntpJObj;
extern HSD_PObjInfo ftPObj;
static void initialize_part_pools(void)
{
    /* These pool declarations match Fighter_800679B0. The full startup path
     * must take over this one-time initialization when stage lighting is ready. */
    static int initialized;if(initialized||portFighterStartupComplete())return;
    HSD_ObjAllocInit(&fighter_parts_alloc_data,MAX_FT_PARTS*sizeof(FighterBone),4);
    HSD_ObjAllocInit(&fighter_dobj_list_alloc_data,124*sizeof(HSD_DObj*),4);
    HSD_ObjAllocInit(&fighter_x2040_alloc_data,32*sizeof(HSD_DObj*),4);
    initialized=1;
}
static void release_fixture(void* data)
{
    CollisionFixture* c=data;
    if(c->release_dynamics)c->release_dynamics(&c->fighter);
    if(c->fighter.x8AC_animSkeleton)HSD_JObjRemoveAll(c->fighter.x8AC_animSkeleton);
    if(c->release_motions)c->release_motions(&c->fighter);
    if(c->fighter.parts)HSD_ObjFree(&fighter_parts_alloc_data,c->fighter.parts);
    if(c->fighter.dobj_list.data)HSD_ObjFree(&fighter_dobj_list_alloc_data,c->fighter.dobj_list.data);
    if(c->fighter.x203C.data)HSD_ObjFree(&fighter_x2040_alloc_data,c->fighter.x203C.data);
    free(c);
}
unsigned portFighterModelLive(void)
{
    return fighter_parts_alloc_data.used+fighter_dobj_list_alloc_data.used+fighter_x2040_alloc_data.used+
        HSD_CLASS_INFO(&ftJObj)->head.nb_exist+HSD_CLASS_INFO(&ftIntpJObj)->head.nb_exist+HSD_CLASS_INFO(&ftPObj)->head.nb_exist+HSD_CLASS_INFO(&ftMObj)->head.nb_exist;
}
typedef struct {ftCo_DatAttrs* attributes;itPickup* pickup;Vec2* offset;Fighter_WaitAnimData* motions;u8 (*mapping)[2];} FighterInitBinding;
_Static_assert(sizeof(FighterInitBinding)==20,"Fighter initialization binding");
_Static_assert(offsetof(Fighter,x670_timer_lstick_tilt_x)==0x670&&offsetof(Fighter,x68B)==0x68B,"Input timer byte range");
static HSD_GObj* create_model_owner(unsigned kind)
{
    if(kind>=27||!CostumeListsForeachCharacter[kind].costume_list[0].joint||portSceneInitialize()<0)return NULL;
    CollisionFixture* c=calloc(1,sizeof(*c));if(!c)return NULL;
    HSD_GObj* object=GObj_Create(HSD_GOBJ_CLASS_FIGHTER,8,0);if(!object){free(c);return NULL;}
    c->fighter.gobj=object;c->fighter.kind=kind;c->fighter.ft_data=&c->data;
    c->fighter.x34_scale.x=c->fighter.x34_scale.y=c->fighter.x34_scale.z=1.0f;
    GObj_InitUserData(object,4,release_fixture,c);return object;
}
static void attach_model(HSD_GObj* object)
{
    Fighter_UnkUpdateCostumeJoint_800686E4(object);
    initialize_part_pools();ftParts_80074E58(&context(object)->fighter);
}
HSD_GObj* portFighterModelCreate(unsigned kind)
{
    HSD_GObj* object=create_model_owner(kind);if(object)attach_model(object);return object;
}
HSD_GObj* portFighterInitModelCreate(unsigned kind,unsigned slot,FighterInitBinding* data,unsigned sub,int tag)
{
    if(!portFighterStartupComplete()||slot>=6||!data||!data->attributes||!data->pickup||!data->offset||!data->motions||!data->mapping)return NULL;
    HSD_GObj* object=create_model_owner(kind);if(!object)return NULL;CollisionFixture* c=context(object);
    c->data.x0=data->attributes;c->data.x40=data->pickup;c->data.x50=data->offset;c->data.xC=data->motions;c->data.x10=data->mapping;
    struct plAllocInfo info={0};info.internal_id=kind;info.slot=slot;info.x5=tag;info.b0=sub!=0;
    // Seed input history to prove the original initializer resets it.
    memset(&c->fighter.input,0xA5,sizeof(c->fighter.input));
    ftData* previous=gFtDataList[kind];gFtDataList[kind]=&c->data;
    Fighter_UnkInitLoad_80068914(object,&info);gFtDataList[kind]=previous;
    attach_model(object);return object;
}
void portMatchPlayerInitialize(void) { Player_InitAllPlayers(); }
// Probe default rules only; this does not initialize the VS match lifecycle.
float portProbeRulesInitialize(void) { gm_SetupRulesDefaults(gm_GetStartMeleeRules());return gm_8016B248(); }
// The original player owner calls the complete Fighter_Create and registers its
// result. Scheduled gameplay looks up this registration, not just the GObj.
int portFighterCharacterKind(unsigned kind)
{
    if(kind>=27)return -1;
    for(int character=CKind_Captain;character<=CKind_Ganon;character++)if(Player_800325C8(character,0)==kind)return character;
    return -1;
}
HSD_GObj* portFighterConstruct(unsigned kind,unsigned slot)
{
    if(!portFighterStartupComplete()||kind>=27||slot>=6)return NULL;
    if(Player_GetEntity(slot))return NULL;
    int character=portFighterCharacterKind(kind);
    if(character<0)return NULL;
    Player_SetPlayerCharacter(slot,character);
    Player_SetSlottype(slot,Gm_PKind_Human);
    Player_SetStocks(slot,4);
    Player_SetHandicap(slot,9);
    Player_80031AD0(slot);
    return Player_GetEntity(slot);
}
double portFighterConstructRead(HSD_GObj* object,unsigned field)
{
    if(!object||object->classifier!=HSD_GOBJ_CLASS_FIGHTER||!object->user_data)abort();
    Fighter* fp=object->user_data;
    switch(field){
    case 0:return fp->motion_id;case 1:return fp->anim_id;
    case 2:return fp->cur_anim_frame;case 3:return fp->ground_or_air;
    case 4:return fp->cur_pos.x;case 5:return fp->cur_pos.y;case 6:return fp->cur_pos.z;
    case 7:return (uintptr_t)fp->x890_cameraBox;case 8:return (uintptr_t)fp->ft_data;
    case 9:{unsigned n=0;for(HSD_GObjProc* p=object->proc;p;p=p->child){if(p->gobj!=object||!p->on_invoke||++n>15)abort();}return n;}
    case 10:return fp->gobj==object&&fp->parts!=NULL&&fp->dat_attrs!=NULL&&fp->dat_attrs_backup!=NULL;
    case 11:return fp->kind;case 12:return fp->player_id;
    case 13:return fp->dmg.x1830_percent;case 14:return fp->dmg.x195c_hitlag_frames;
    case 15:return fp->dmg.x18A4_knockbackMagnitude;case 16:return fp->facing_dir;
    case 17:return fp->shield_health;case 18:return Player_GetStocks(fp->player_id);
    case 19:return (uintptr_t)fp->x20A4.shadow;
    default:abort();
    }
}
void portFighterPlayerConfigure(unsigned slot,unsigned controller,unsigned costume,unsigned team,unsigned player,float scale,unsigned flags)
{
    if(slot>=6||controller>4||costume>255||team>3||player>5||scale<=0)abort();
    Player_SetControllerIndex(slot,controller);Player_SetCostumeId(slot,costume);Player_SetTeam(slot,team);Player_SetPlayerId(slot,player);Player_SetModelScale(slot,scale);
    Player_SetFlagsBit5(slot,flags&1);Player_SetFlagsBit6(slot,(flags>>1)&1);Player_SetFlagsBit7(slot,(flags>>2)&1);
    Player_SetMoreFlagsBit1(slot,(flags>>3)&1);Player_SetMoreFlagsBit2(slot,(flags>>4)&1);Player_SetMoreFlagsBit6(slot,(flags>>5)&1);Player_SetFlagsAEBit0(slot,(flags>>6)&1);
}
extern MotionState* ftData_CharacterStateTables[Ft_Kind_Max];
double portFighterInitRead(HSD_GObj* object,unsigned field,unsigned index)
{
    Fighter* fp=&context(object)->fighter;
    switch(field) {
    case 0:return fp->kind;case 1:return fp->player_id;case 2:return fp->x61A_controller_index;
    case 3:return fp->x618_player_id;case 4:return fp->x619_costume_id;case 5:return fp->team;case 6:return fp->is_sub_fighter;case 7:return fp->x61C;case 8:return fp->x34_scale.x;
    case 9:return fp->x18;case 10:return fp->x1C_actionStateList==ftData_MotionStateList;case 11:return fp->x20_actionStateList==ftData_CharacterStateTables[fp->kind];
    case 12:return (uintptr_t)fp->x24;case 13:return (uintptr_t)fp->x28;case 14:return fp->gobj==object;
    case 15:return fp->is_always_metal|(fp->x2226_b3<<1)|(fp->x2226_b6<<2)|(fp->x2225_b5<<3)|(fp->x2225_b7<<4)|(fp->x2228_b3<<5)|(fp->x2229_b1<<6);
    case 16:if(index>=4)abort();return ((u8*)&fp->x610_color_rgba[0])[index];
    case 20:return (uintptr_t)&fp->co_attrs;case 21:return (uintptr_t)&fp->x294_itPickup;case 22:return (uintptr_t)&fp->x2C4;
    case 23:return sizeof(ftCo_DatAttrs);
    case 24:
        if(index<6)return index%2?fp->input.lstick[index/2].y:fp->input.lstick[index/2].x;
        if(index<12){index-=6;return index%2?fp->input.cstick[index/2].y:fp->input.cstick[index/2].x;}
        if(index<15)return fp->input.triggers[index-12];if(index<18)return fp->input.held_buttons[index-15];
        if(index==18)return fp->input.pressed_buttons;if(index==19)return fp->input.released_buttons;abort();
    case 25:if(index>=28)abort();return ((u8*)fp)[0x670+index];
    case 26:return fp->x21FC_flag.byte;case 27:return fp->smash_attrs.x2135;
    default:abort();
    }
}
int portCollisionAttach(HSD_GObj* object,CollisionData* data,unsigned count,HSD_JObj** parts,unsigned kind)
{
    if(kind>=27||!object||!object->user_data||!data||count>140||data->hurt.count<0||data->hurt.count>15||data->count<0||data->count>11)return -1;
    CollisionFixture* c=context(object);if(c->fighter.kind!=kind||c->data.x30)return -2;
    for(int i=0;i<data->hurt.count;i++)if(data->hurt.inits[i].bone_idx>=count||!parts[data->hurt.inits[i].bone_idx])return -3;
    for(int i=0;i<data->count;i++)if(data->dynamics[i].x0>=count||!parts[data->dynamics[i].x0])return -4;
    c->data.x30=&data->hurt;c->data.x2C=&c->dynamics;c->dynamics.x4=data->count;c->dynamics.x8=data->dynamics;
    ftParts_SetupParts(object);
    for(unsigned i=0;i<count;i++)if(c->fighter.parts[i].joint!=parts[i])return -5;
    ftColl_8007B320(object);return 0;
}
unsigned portCollisionPartRead(HSD_GObj* object,unsigned part,unsigned field)
{
    Fighter* fp=&context(object)->fighter;if(part>=140)abort();
    switch(field) {
    case 0:return (uintptr_t)fp->parts[part].joint;
    case 1:return fp->parts[part].xC;
    case 2:return fp->parts[part].xD;
    case 3:return fp->parts[part].flags_b1;
    case 4:return fp->dobj_list.count;
    case 5:{unsigned count=0;for(unsigned i=0;i<fp->dobj_list.count;i++)if(fp->dobj_list.data[i]->mobj&&HSD_MOBJ_METHOD(fp->dobj_list.data[i]->mobj)==&ftMObj)count++;return count;}
    case 6:{FighterBone* b=&fp->parts[part];return b->flags_b7|(b->flags2_b0<<1)|(b->flags2_b1<<2)|(b->flags2_b2<<3)|(b->flags2_b3<<4)|(b->flags2_b4<<5);}
    case 7:return fp->parts[part].flags2_b6;
    case 11:if(!fp->parts[part].joint)abort();return fp->parts[part].joint->id;
    case 10:return fp->parts[part].flags_b3|(fp->parts[part].flags_b4<<1);
    case 8:return HSD_JOBJ_METHOD((HSD_JObj*)object->hsd_obj)==&ftJObj;
    case 9:{unsigned count=0;for(unsigned i=0;i<fp->dobj_list.count;i++)for(HSD_PObj* p=fp->dobj_list.data[i]->pobj;p;p=p->next)if(HSD_POBJ_METHOD(p)==&ftPObj)count++;return count;}
    default:abort();
    }
}
void portCollisionReset(HSD_GObj* object){context(object);ftColl_8007B4E0(object);}
void portCollisionWorld(HSD_GObj* object)
{
    Fighter* fp=&context(object)->fighter;
    for(unsigned i=0;i<fp->hurt_capsules_len;i++)lbColl_800083C4(&fp->hurt_capsules[i].capsule);
}
double portCollisionRead(HSD_GObj* object,unsigned index,unsigned field)
{
    Fighter* fp=&context(object)->fighter;
    if(field==0)return fp->hurt_capsules_len;if(field==1)return fp->x166C;
    if(field>=30) {
        if(index>=fp->x166C)abort();Fighter_x1670_t* c=&fp->x1670[index];
        switch(field){case 30:return c->x24;case 31:return (uintptr_t)c->jobj;case 32:return c->v1.x;case 33:return c->v1.y;case 34:return c->v1.z;case 35:return c->v2;default:abort();}
    }
    if(index>=fp->hurt_capsules_len)abort();FighterHurtCapsule* h=&fp->hurt_capsules[index];HurtCapsule* c=&h->capsule;
    switch(field) {
    case 2:return c->bone_idx;case 3:return h->height;case 4:return h->is_grabbable;
    case 5:return c->a_offset.x;case 6:return c->a_offset.y;case 7:return c->a_offset.z;
    case 8:return c->b_offset.x;case 9:return c->b_offset.y;case 10:return c->b_offset.z;
    case 11:return c->scale;case 12:return (uintptr_t)c->bone;case 13:return c->state;case 14:return c->skip_update_pos;
    case 15:return c->a_pos.x;case 16:return c->a_pos.y;case 17:return c->a_pos.z;
    case 18:return c->b_pos.x;case 19:return c->b_pos.y;case 20:return c->b_pos.z;
    default:abort();
    }
}

int portCollisionAuxiliary(HSD_GObj* object,HSD_Joint* descriptor)
{
    CollisionFixture* c=context(object);if(!descriptor||c->fighter.x203C.data)return -1;
    c->data.x5C=descriptor;ftCo_800C884C(object);
    /* These aliases exist only while the auxiliary envelopes resolve. The
     * primary joints own different IDs; retaining these temporary aliases
     * would leave pointers to freed fighter joints in the global table. */
    HSD_Joint* joint=descriptor;int depth=0;
    while(joint){HSD_IDRemoveByIDFromTable(NULL,(u32)joint);ftAnim_GetNextJointInTree(&joint,&depth);}
    return c->fighter.x203C.count;
}
unsigned portCollisionAuxiliaryRead(HSD_GObj* object,unsigned index,unsigned field)
{
    Fighter* fp=&context(object)->fighter;if(index>=fp->x203C.count)abort();
    HSD_DObj* d=fp->x203C.data[index];
    switch(field){case 0:return (uintptr_t)d;case 1:return d->flags;case 2:return d->mobj&&HSD_MOBJ_METHOD(d->mobj)==&ftMObj;default:abort();}
}

unsigned portCostumeCount(unsigned kind)
{
    if(kind>=27)abort();return CostumeListsForeachCharacter[kind].numCostumes;
}
int portVisibilityAttach(HSD_GObj* object,struct ftData_x8* data,unsigned costume)
{
    Fighter* fp=&context(object)->fighter;
    if(!fp->x203C.data||!data||costume>=portCostumeCount(fp->kind))return -1;
    fp->ft_data->x8=data;fp->x619_costume_id=costume;ftParts_800749CC(object);return fp->x5AC.model_num;
}
void portVisibilitySelect(HSD_GObj* object,unsigned group,int value)
{
    Fighter* fp=&context(object)->fighter;if(group>=fp->x5AC.model_num||value < -1||value>127)abort();
    ftParts_80074A4C(object,group,value);ftParts_80074A8C(object);
}
void portVisibilityApply(HSD_GObj* object,unsigned channel,unsigned operation)
{
    Fighter* fp=&context(object)->fighter;if(channel>=5)abort();
    DObjList* list=channel==2?&fp->x203C:&fp->dobj_list;
    switch(operation){case 0:ftParts_80074D7C(&fp->x5AC,channel,list);break;
    case 1:ftParts_80074B6C(fp,&fp->x5AC,channel,list);break;
    case 2:ftParts_80074CA0(&fp->x5AC,channel,list);break;default:abort();}
}
unsigned portVisibilityRead(HSD_GObj* object,unsigned auxiliary,unsigned index)
{
    Fighter* fp=&context(object)->fighter;DObjList* list=auxiliary?&fp->x203C:&fp->dobj_list;
    if(index>=list->count)abort();return list->data[index]->flags;
}

#include <sysdolphin/baselib/tobj.h>
#include <sysdolphin/baselib/aobj.h>
_Static_assert(sizeof(HSD_MatAnimJoint)==12,"Material animation joint ABI");
_Static_assert(sizeof(HSD_MatAnim)==16,"Material animation ABI");
_Static_assert(sizeof(HSD_TexAnim)==24,"Texture animation ABI");
unsigned portMaterialAttach(HSD_GObj* object,struct ftData_x8* data)
{
    Fighter* fp=&context(object)->fighter;fp->ft_data->x8=data;fp->x619_costume_id=0;
    ftAnim_80070308(object);
    return fp->tobj_list.n_costume_tobjs;
}
void portMaterialSelect(HSD_GObj* object,unsigned index,float frame)
{
    Fighter* fp=&context(object)->fighter;ftAnim_80070458(fp,&fp->tobj_list,index,frame);
}
void portMaterialReset(HSD_GObj* object){ftAnim_800705E0(&context(object)->fighter.tobj_list);}
double portMaterialRead(HSD_GObj* object,unsigned index,unsigned field)
{
    Fighter* fp=&context(object)->fighter;if(index>=fp->tobj_list.n_costume_tobjs)abort();
    HSD_TObj* t=fp->tobj_list.costume_tobjs[index];
    switch(field){case 0:return (uintptr_t)t;case 1:return (uintptr_t)t->imagedesc;
    case 2:return t->tlut_no;case 3:return t->aobj->framerate;
    case 4:return (uintptr_t)t->imagetbl;case 5:return (uintptr_t)t->tluttbl;default:abort();}
}

void portMaterialColorSelect(HSD_GObj* object,unsigned index,float frame)
{
    Fighter* fp=&context(object)->fighter;if(index>=fp->dobj_list.count)abort();
    HSD_MObj* m=fp->dobj_list.data[index]->mobj;if(!m||!m->aobj)abort();
    HSD_MObjReqAnim(m,frame);HSD_MObjAnim(m);
}
unsigned portMaterialColorRead(HSD_GObj* object,unsigned index,unsigned channel)
{
    Fighter* fp=&context(object)->fighter;if(index>=fp->dobj_list.count||channel<1||channel>6)abort();
    HSD_Material* m=fp->dobj_list.data[index]->mobj->mat;
    switch(channel){case 1:return m->ambient.r;case 2:return m->ambient.g;case 3:return m->ambient.b;
    case 4:return m->diffuse.r;case 5:return m->diffuse.g;case 6:return m->diffuse.b;default:abort();}
}

#include <melee/lb/lbarchive.h>
HSD_Joint* portCostumeLoad(unsigned kind,unsigned costume)
{
    if(kind>=27||costume>=portCostumeCount(kind))abort();
    ftData_80085820(kind,costume);return CostumeListsForeachCharacter[kind].costume_list[costume].joint;
}
HSD_MatAnimJoint* portCostumeAnimation(unsigned kind,unsigned costume)
{
    if(kind>=27||costume>=portCostumeCount(kind))abort();
    return CostumeListsForeachCharacter[kind].costume_list[costume].x4;
}
void portCostumeRelease(unsigned kind,unsigned costume)
{
    if(kind>=27||costume>=portCostumeCount(kind))abort();
    UnkCostumeStruct* c=&CostumeListsForeachCharacter[kind].costume_list[costume];
    if(!c->x14_archive)abort();lbArchive_80016EFC(c->x14_archive);
    c->joint=NULL;c->x4=NULL;c->x14_archive=NULL;
}

#include <melee/ft/ftdynamics.h>
#include <melee/lb/lb_00F9.h>
#include <melee/lb/types.h>
_Static_assert(sizeof(ftDynamics)==20&&sizeof(BoneDynamicsDesc)==24,"Dynamics descriptor ABI");
_Static_assert(sizeof(struct DynamicsData)==152&&sizeof(struct lb_00F9_UnkDesc1Inner)==60,"Dynamics runtime/source ABI");
extern unsigned portDynamicsPoolFree(void);
unsigned portDynamicsInitialize(void)
{
    static int initialized;if(!initialized){lb_8000FCDC();initialized=1;}return portDynamicsPoolFree();
}
int portDynamicsAttach(HSD_GObj* object,ftDynamics* data,unsigned part_count)
{
    CollisionFixture* c=context(object);Fighter* fp=&c->fighter;
    if(!data||data->dynamicsNum<0||data->dynamicsNum>=Ft_Dynamics_NumMax||!c->data.x30||c->release_dynamics||part_count>140)return -1;
    if(data->x4!=c->dynamics.x4)return -2;
    unsigned total=0;
    for(int i=0;i<data->dynamicsNum;i++) {
        BoneDynamicsDesc* b=&data->ftDynamicBones->array[i];unsigned count=b->dyn_desc.count;
        if(!count||b->bone_id<0||(unsigned)b->bone_id+count>part_count||!b->dyn_desc.data)return -3;
        HSD_JObj* joint=fp->parts[b->bone_id].joint;
        for(unsigned j=0;j<count;j++){if(!joint||joint!=fp->parts[b->bone_id+j].joint)return -4;joint=joint->child;}
        total+=count;
    }
    if(total>portDynamicsInitialize())return -5;
    c->data.x2C=data;ftCo_8009CF84(fp);c->release_dynamics=ftCo_UnloadDynamicBones;return fp->dynamics_num;
}
unsigned portDynamicsRead(HSD_GObj* object,unsigned set,unsigned field)
{
    Fighter* fp=&context(object)->fighter;
    if(field==0)return fp->dynamics_num;
    if(field==4){if(set>=140)abort();return fp->parts[set].flags_b0;}
    if(set>=(unsigned)fp->dynamics_num)abort();BoneDynamicsDesc* b=&fp->dynamic_bone_sets[set];
    switch(field){case 1:return (uintptr_t)b->dyn_desc.data;case 2:return b->dyn_desc.count;case 3:return b->bone_id;case 5:return (uintptr_t)&b->dyn_desc.pos;default:abort();}
}
void portDynamicsStep(HSD_GObj* object){if(!context(object)->release_dynamics)abort();ftCo_8009E0A8(object);}
void portDynamicsSelect(HSD_GObj* object,unsigned selector,unsigned mode)
{
    Fighter* fp=&context(object)->fighter;if(!context(object)->release_dynamics||selector>255||mode>2)abort();
    u8 mapping[1][2]={{0,selector}};s32 previous=fp->anim_id;unsigned b4=fp->x594_b4,b3=fp->x594_b3;
    fp->anim_id=0;fp->x594_b4=mode==1;fp->x594_b3=mode==2;
    ftCo_8009E7B4(fp,mapping);fp->anim_id=previous;fp->x594_b4=b4;fp->x594_b3=b3;
}

_Static_assert(offsetof(Fighter,x594_s32)==0x594&&offsetof(Fighter,x598)==0x598,"Numeric animation flag ABI");
int portFighterAnimationInitialize(HSD_GObj* object,struct ftData_x8* parts)
{
    CollisionFixture* c=context(object);Fighter* fp=&c->fighter;
    if(!c->release_dynamics||!parts||fp->x8AC_animSkeleton)return -1;
    c->data.x8=parts;ftAnim_8007077C(object);ftAnim_8006FE48(object);
    Fighter_UnkUpdateVecFromBones_8006876C(fp);return fp->x8AC_animSkeleton!=NULL;
}
int portFighterAnimationStart(HSD_GObj* object,unsigned index,float speed,float blend)
{
    Fighter* fp=&context(object)->fighter;
    if(!fp->x8AC_animSkeleton||!context(object)->release_motions||index>=(unsigned)ftData_Table_Unk0[fp->kind].count||speed<=0||blend<0)return -1;
    // Use the original loader and this fighter's owned buffers.
    // Motion-state changes, scripts and physics remain the full constructor's
    // integration work; this fixture does not replace Fighter_ChangeMotionState.
    fp->anim_id=index;fp->frame_speed_mul=speed;fp->cur_anim_frame=-speed;fp->x898_unk=0;
    fp->x594_s32=fp->x24[index].x10_animCurrFlags;
    ftData_80085CD8(fp,fp,index);
    if(!fp->x590)return -2;
    ftCo_8009E7B4(fp,&fp->x28[index]);ftAnim_8006EBE8(object,0,speed,blend);
    ftAnim_8006E9B4(object);return 0;
}
void portFighterAnimationStep(HSD_GObj* object)
{
    if(!context(object)->fighter.x8AC_animSkeleton)abort();ftAnim_8006E9B4(object);ftCo_8009E0A8(object);
}
double portFighterAnimationRead(HSD_GObj* object,unsigned field,unsigned index)
{
    Fighter* fp=&context(object)->fighter;
    switch(field){
    case 0:return (u32)fp->x594_s32;case 1:return fp->cur_anim_frame;case 2:return fp->x8A4_animBlendFrames;case 3:return fp->x8A8_anim_frame;
    case 4:return (uintptr_t)fp->x8AC_animSkeleton;
    case 5:if(index>=140)abort();return (uintptr_t)fp->parts[index].x4_jobj2;
    case 6:if(index>=3)abort();return ((float*)&fp->x68C_transNPos)[index];
    case 7:if(index>=3)abort();return ((float*)&fp->x6A4_transNOffset)[index];
    case 8:return fp->x1A6C;case 9:if(index>=3)abort();return ((float*)&fp->x1A70)[index];
    default:abort();}
}

#include <melee/ft/ft_07C1.h>
#include <melee/ft/ft_07C6.h>
#include <melee/ft/ft_081B.h>
#include <melee/ft/ftcamera.h>
#include <melee/ft/ftwaitanim.h>
#include <melee/mp/mpcoll.h>
typedef struct {
    WaitStruct* idle;WaitStruct* crouch;ftData_x34* thrown;ftData_x38* contacts;
    UnkFloat6_Camera* camera;ftData_x44_t* ecb;FtSFX* sounds;int* effect_bones;ftData_x58_t* ik;
} GameplayBinding;
_Static_assert(sizeof(GameplayBinding)==36&&sizeof(ftData_x44_t)==28&&sizeof(ftData_x58_t)==28,"Gameplay data ABI");
int portGameplayAttach(HSD_GObj* object,GameplayBinding* binding,unsigned parts)
{
    CollisionFixture* c=context(object);Fighter* fp=&c->fighter;
    if(!binding||!fp->parts||parts>140||!binding->thrown||!binding->contacts||!binding->camera||!binding->ecb||!binding->sounds||!binding->effect_bones||!binding->ik)return -1;
    const s16 indices[]={binding->ecb->unk0,binding->ecb->unk2,binding->ecb->unk4,binding->ecb->unk6,binding->ecb->unk8,binding->ecb->unkA};
    for(unsigned i=0;i<6;i++)if(indices[i]<0||(unsigned)indices[i]>=parts||!fp->parts[indices[i]].joint)return -2;
    if(binding->thrown->x0<0||(unsigned)binding->thrown->x0>=parts||!fp->parts[binding->thrown->x0].joint)return -3;
    for(unsigned i=0;i<2;i++)if(binding->contacts[i].x0<0||(unsigned)binding->contacts[i].x0>=parts||!fp->parts[binding->contacts[i].x0].joint)return -4;
    c->data.x24=binding->idle;c->data.x28=binding->crouch;c->data.x34=binding->thrown;c->data.x38=binding->contacts;
    c->data.x3C=binding->camera;c->data.x44=binding->ecb;c->data.x4C_sfx=binding->sounds;c->data.x54=binding->effect_bones;c->data.x58=binding->ik;
    ft_80081B38(object);ft_8007C17C(object);ft_8007C630(object);return 0;
}
void portGameplayRescale(HSD_GObj* object,float scale)
{
    if(!context(object)->data.x44||scale<=0)abort();ft_80081C88(object,scale);
}
void portGameplayUpdate(HSD_GObj* object,float alpha)
{
    Fighter* fp=&context(object)->fighter;if(!fp->ft_data->x44)abort();
    if(!(alpha>=0&&alpha<=1))abort();
    mpColl_LoadECB(&fp->coll_data);mpCollInterpolateECB(&fp->coll_data,alpha);ft_8007C224(object);ft_8007C630(object);
}
double portGameplayRead(HSD_GObj* object,unsigned field,unsigned index)
{
    Fighter* fp=&context(object)->fighter;CollData* c=&fp->coll_data;
    switch(field) {
    case 0:return c->ecb_source.kind;case 1:return c->x0_gobj==object;case 2:return (uintptr_t)c->ecb_source.x108_joint;
    case 3:if(index>=6)abort();return (uintptr_t)c->ecb_source.x10C_joint[index];
    case 4:return c->ecb_source.x124;case 5:return c->ecb_source.x128;case 6:return c->ecb_source.x12C;
    case 7:return c->ledge_snap_x;case 8:return c->ledge_snap_y;case 9:return c->ledge_snap_height;case 10:return c->x50;
    case 11:return c->floor_skip;case 12:return c->joint_id_skip;case 13:return c->joint_id_only;
    case 14:return c->x34_flags.b1234;case 15:return c->facing_dir;case 16:return fp->ecb_lock;
    case 17:return (uintptr_t)&c->desired_ecb;case 18:return (uintptr_t)&c->ecb;
    case 20:return (uintptr_t)fp->x1064_thrownHitbox.jobj;case 21:return fp->x1064_thrownHitbox.scale;case 22:return fp->x1064_thrownHitbox.state;
    case 23:if(index>=3)abort();return ((float*)&fp->x1064_thrownHitbox.x4C)[index];
    case 24:if(index>=3)abort();return ((float*)&fp->x1064_thrownHitbox.x58)[index];
    case 25:if(index>=2)abort();return (uintptr_t)fp->x1614[index].x4;
    case 26:if(index>=2)abort();return fp->x1614[index].x0;
    case 27:if(index>=6)abort();return ((float*)&fp->x1614[index/3].x8)[index%3];
    default:abort();
    }
}

_Static_assert(sizeof(ftData_x1C)==12&&sizeof(ftData_x20)==8&&offsetof(HSD_Joint,child)==8,"Secondary animation ABI");
int portSecondaryAttach(HSD_GObj* object,ftData_x1C** channels,ftData_x20* shield,unsigned count,unsigned* variants,unsigned parts)
{
    CollisionFixture* c=context(object);Fighter* fp=&c->fighter;
    if(!fp->x8AC_animSkeleton||!channels||!shield||!count||count>5||!variants||parts>140)return -1;
    for(unsigned i=0;i<count;i++) {
        ftData_x1C* row=channels[i];if(!row||row->x0>=parts||!row->x2||!row->x4||!row->x8||!variants[i]||variants[i]>6)return -2;
        for(unsigned j=0;j<row->x2;j++)if(row->x4[j]>=parts||!fp->parts[row->x4[j]].joint)return -3;
        c->part_variants[i]=variants[i];
    }
    c->part_channels=count;c->part_count=parts;c->data.x1C=channels;c->data.x20=shield;return 0;
}
int portPartAnimationApply(HSD_GObj* object,unsigned channel,unsigned variant,float duration)
{
    CollisionFixture* c=context(object);if(channel>=c->part_channels||variant>=c->part_variants[channel]||duration<0)return -1;
    ftAnim_ApplyPartAnim(object,channel,variant,duration);return 0;
}
void portPartAnimationStep(HSD_GObj* object){context(object);ftAnim_800707B0(object);}
void portPartAnimationClear(HSD_GObj* object,unsigned channel)
{
    if(channel>=context(object)->part_channels)abort();ftAnim_80070CC4(object,channel);
}
double portPartAnimationRead(HSD_GObj* object,unsigned channel,unsigned field)
{
    CollisionFixture* c=context(object);if(channel>=c->part_channels)abort();struct Fighter_x8B0_t* state=&c->fighter.x8B0[channel];
    switch(field){case 0:return state->x11;case 1:return state->x10;case 2:return state->x4;case 3:return state->x8;case 4:return state->xC;default:abort();}
}
int portShieldPoseApply(HSD_GObj* object,unsigned mode,float weight)
{
    Fighter* fp=&context(object)->fighter;if(!fp->ft_data->x20||weight<0||weight>1||mode>2)return -1;
    HSD_Joint* root=fp->ft_data->x20->x0;if(!root)return 0;
    if(mode==0)ftAnim_8006FA58(fp,FtPart_TransN,root->child);
    if(mode==1)ftAnim_80070010(fp,FtPart_TransN,weight,1-weight,root->child);
    if(mode==2)ftAnim_80070108(fp,FtPart_TransN,weight,1-weight,root->child);
    return 1;
}
double portSecondaryJointRead(HSD_GObj* object,unsigned part,unsigned blend,unsigned field)
{
    CollisionFixture* c=context(object);if(part>=c->part_count||blend>1)abort();FighterBone* bone=&c->fighter.parts[part];
    HSD_JObj* joint=blend?bone->x4_jobj2:bone->joint;if(!joint)abort();
    if(field<4)return ((float*)&joint->rotate)[field];if(field<7)return ((float*)&joint->scale)[field-4];if(field<10)return ((float*)&joint->translate)[field-7];
    switch(field){case 10:return joint->flags;case 11:return bone->flags_b0;case 12:return bone->flags_b4;case 13:return bone->flags_b5;default:abort();}
}

/* The shared archive belongs to the kind; the two load buffers belong to each
 * initialized Fighter. This fixture binding will be replaced by full ftData
 * loading at Fighter_Create integration, not by a new motion loader. */
static struct { ftData data; unsigned owners; } fighter_motion_bindings[27];
extern char* ftData_803C23E4[];
extern void portFileRelease(const char*);
int portFighterMotionRegister(unsigned kind,Fighter_WaitAnimData* table,unsigned count)
{
    if(kind>=27||!portFighterStartupComplete()||!table||count!=ftData_Table_Unk0[kind].count||gFtDataList[kind]||ftData_Table_Unk0[kind].data)return -1;
    fighter_motion_bindings[kind].data.xC=table;gFtDataList[kind]=&fighter_motion_bindings[kind].data;
    ftData_80085A14(kind);return 0;
}
int portFighterMotionUnregister(unsigned kind)
{
    if(kind>=27||gFtDataList[kind]!=&fighter_motion_bindings[kind].data||fighter_motion_bindings[kind].owners)return -1;
    if(kind==Ft_Kind_Popo&&fighter_motion_bindings[Ft_Kind_Nana].owners)return -1;
    for(unsigned i=0;i<ftData_Table_Unk0[kind].count;i++)fighter_motion_bindings[kind].data.xC[i].x14=0;
    gFtDataList[kind]=NULL;ftData_Table_Unk0[kind].data=NULL;memset(&fighter_motion_bindings[kind],0,sizeof(fighter_motion_bindings[kind]));
    portFileRelease(ftData_803C23E4[kind]);return 0;
}
static void release_fighter_motions(Fighter* fp)
{
    if(!fighter_motion_bindings[fp->kind].owners)abort();
    HSD_ObjFree(&fighter_x59C_alloc_data,fp->x59C);HSD_ObjFree(&fighter_x59C_alloc_data,fp->x5A0);
    fp->x59C=fp->x5A0=NULL;fp->x590=fp->x598=NULL;fighter_motion_bindings[fp->kind].owners--;
}
int portFighterMotionAttach(HSD_GObj* object)
{
    CollisionFixture* c=context(object);Fighter* fp=&c->fighter;
    if(c->release_motions||gFtDataList[fp->kind]!=&fighter_motion_bindings[fp->kind].data||fp->x24!=gFtDataList[fp->kind]->xC)return -1;
    if(fp->kind==Ft_Kind_Nana&&gFtDataList[Ft_Kind_Popo]!=&fighter_motion_bindings[Ft_Kind_Popo].data)return -2;
    ftData_80085B10(fp);fighter_motion_bindings[fp->kind].owners++;c->release_motions=release_fighter_motions;return 0;
}
FigaTree* portFighterMotionLoad(HSD_GObj* object,unsigned index,unsigned secondary)
{
    CollisionFixture* c=context(object);Fighter* fp=&c->fighter;
    if(!c->release_motions||index>=fp->x58C||secondary>1)abort();
    if(secondary)return ftData_80085E50(fp,index);ftData_80085CD8(fp,fp,index);return fp->x590;
}
uintptr_t portFighterMotionRead(HSD_GObj* object,unsigned field)
{
    CollisionFixture* c=context(object);Fighter* fp=&c->fighter;if(!c->release_motions)abort();
    switch(field){case 0:return (uintptr_t)fp->x59C;case 1:return (uintptr_t)fp->x5A0;case 2:return (uintptr_t)fp->x590;case 3:return (uintptr_t)fp->x598;case 4:return fp->x58C;case 5:return (uintptr_t)fp->x5A4;case 6:return (uintptr_t)fp->x5A8;default:abort();}
}

/* Activate the original fighter-owned lights before invoking the complete
 * original fighter render callback. Body selection/cleanup happens there. */
unsigned portFighterNativeDraw(HSD_GObj* object,unsigned pass)
{
    if(!object||object->classifier!=HSD_GOBJ_CLASS_FIGHTER||!object->user_data||pass>2)abort();
    extern void portRenderContextEnter(void),portRenderContextLeave(void);
    extern unsigned portNativeDrawObjectExtra(HSD_GObj*,unsigned,unsigned,HSD_JObj*);
    portRenderContextEnter();
    HSD_GObj* lights=HSD_GObjPLinkHead[3];while(lights&&lights->classifier!=12)lights=lights->next;
    if(!lights||!lights->render_cb)abort();lights->render_cb(lights,pass);
    portRenderContextLeave();return portNativeDrawObjectExtra(object,pass,1,((Fighter*)object->user_data)->x20A0_accessory);
}
unsigned portFighterRespawnPlatform(HSD_GObj* object)
{
    if(!object||object->classifier!=HSD_GOBJ_CLASS_FIGHTER||!object->user_data)abort();
    HSD_JObj* joint=((Fighter*)object->user_data)->x20A0_accessory;
    /* HSD records the source descriptor in id. Unknown accessories must be
     * imported explicitly, never interpreted as respawn-platform geometry. */
    if(joint&&(!Fighter_804D6534||joint->id!=(unsigned)((HSD_Joint**)Fighter_804D6534)[0]))abort();
    return (unsigned)joint;
}
unsigned portFighterAccessory(HSD_GObj* object,unsigned field)
{
    if(!object||object->classifier!=HSD_GOBJ_CLASS_FIGHTER||!object->user_data||field>1)abort();
    HSD_JObj* joint=((Fighter*)object->user_data)->x20A0_accessory;
    if(!joint)return 0;
    unsigned kind=0;
    if(Fighter_804D6534&&joint->id==(unsigned)((HSD_Joint**)Fighter_804D6534)[0])kind=1;
    else if(Fighter_804D6514&&joint->id==(unsigned)Fighter_804D6514)kind=2;
    else {
        Fighter* fp=object->user_data;
        if(fp->kind==Ft_Kind_Samus&&fp->ft_data->x48_items&&fp->ft_data->x48_items[4]&&joint->id==(unsigned)*(HSD_Joint**)fp->ft_data->x48_items[4])kind=3;
        else abort();
    }
    return field?kind:(unsigned)joint;
}
