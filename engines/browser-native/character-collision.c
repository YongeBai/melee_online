/* Original part/material class setup and hurtbox routines in a limited Fighter
 * fixture. Combat, material drawing and dynamic-bone simulation are separate
 * integration steps; no replacement collision algorithm is used here. */
#include <melee/ft/fighter.h>
#include <melee/ft/ftcoll.h>
#include <melee/ft/ftparts.h>
#include <melee/ft/ftmaterial.h>
#include <melee/ft/kinds/ftCommon/types.h>
#include <melee/lb/lbcollision.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjuserdata.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>

_Static_assert(sizeof(ftHurtboxInit)==40,"Hurtbox descriptor ABI");
_Static_assert(sizeof(ftData_x38)==20,"Dynamics collider descriptor ABI");
_Static_assert(offsetof(Fighter,x1670)==0x1670,"Dynamics collider array offset");
_Static_assert(offsetof(Fighter,x1828)==0x1828,"Dynamics collider array extent");
_Static_assert(sizeof(((Fighter*)0)->x1670)/sizeof(Fighter_x1670_t)==11,"Dynamics collider capacity");
typedef struct { ftData_x30 hurt; int count; ftData_x38* dynamics; } CollisionData;
typedef struct { Fighter fighter; ftData data; ftDynamics dynamics; FighterBone parts[140]; HSD_DObj* displays[124]; } CollisionFixture;
static CollisionFixture* context(HSD_GObj* object){if(!object||!object->user_data)abort();return object->user_data;}
int portCollisionAttach(HSD_GObj* object,CollisionData* data,unsigned count,HSD_JObj** parts,unsigned kind)
{
    if(kind>=27||!object||object->user_data||!data||count>140||data->hurt.count<0||data->hurt.count>15||data->count<0||data->count>11)return -1;
    CollisionFixture* c=calloc(1,sizeof(*c));if(!c)return -2;
    c->fighter.gobj=object;c->fighter.kind=kind;c->fighter.ft_data=&c->data;c->fighter.parts=c->parts;c->fighter.dobj_list.data=c->displays;
    c->data.x30=&data->hurt;c->data.x2C=&c->dynamics;c->dynamics.x4=data->count;c->dynamics.x8=data->dynamics;
    for(int i=0;i<data->hurt.count;i++)if(data->hurt.inits[i].bone_idx>=count||!parts[data->hurt.inits[i].bone_idx]){free(c);return -3;}
    for(int i=0;i<data->count;i++)if(data->dynamics[i].x0>=count||!parts[data->dynamics[i].x0]){free(c);return -4;}
    GObj_InitUserData(object,4,free,c);ftParts_SetupParts(object);
    for(unsigned i=0;i<count;i++)if(c->parts[i].joint!=parts[i])return -5;
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
