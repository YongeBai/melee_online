/* Original item model/material/bone/hurtbox setup. This is an explicit limited
 * owner, not Item_8026862C: item states, special attributes and scripts are not
 * bound here and this owner is never installed in the gameplay article table. */
#include <melee/it/item.h>
#include <melee/it/itcoll.h>
#include <melee/it/itmaterial.h>
#include <melee/it/types.h>
#include <melee/lb/lbcollision.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/gobjuserdata.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <stddef.h>
#include <stdlib.h>

typedef struct { ItemAttr* attributes;ItemModelDesc* model;ItHurtBoneList* hurt; } ItemModelBinding;
typedef struct { Item item;Article article; } ItemModelOwner;
_Static_assert(sizeof(ItemAttr)==0x84&&offsetof(ItemAttr,x4_throw_speed_mul)==4,"Item attribute ABI");
_Static_assert(sizeof(ItemModelDesc)==16&&sizeof(ItHurtBoneDesc)==32&&sizeof(ItemModelBinding)==12,"Item model descriptor ABI");
extern int portSceneInitialize(void);
extern int portOriginalItemModelSetup(HSD_GObj*);
extern void portOriginalItemModelRelease(Item*);
extern unsigned portSceneCollect(HSD_JObj*,HSD_JObj**,unsigned);
static ItemModelOwner* context(HSD_GObj* object){if(!object||!object->user_data)abort();return object->user_data;}
static void release_owner(void* data){ItemModelOwner* owner=data;portOriginalItemModelRelease(&owner->item);free(owner);}
HSD_GObj* portItemModelCreate(ItemModelBinding* binding)
{
    if(!binding||!binding->attributes||!binding->model||binding->model->x4_bone_count>100||portSceneInitialize()<0)return NULL;
    ItemModelOwner* owner=calloc(1,sizeof(*owner));if(!owner)return NULL;
    HSD_GObj* object=GObj_Create(HSD_GOBJ_CLASS_ITEM,9,0);if(!object){free(owner);return NULL;}
    owner->article.x0_common_attr=binding->attributes;owner->article.x10_modelDesc=binding->model;owner->article.x8_hurtbones=binding->hurt;
    owner->item.entity=object;owner->item.xC4_article_data=&owner->article;owner->item.xC8_joint=binding->model->x0_joint;
    owner->item.xCC_item_attr=binding->attributes;owner->item.scl=binding->attributes->x60_scale;
    GObj_InitUserData(object,6,release_owner,owner);
    if(!portOriginalItemModelSetup(object)){HSD_GObjFree(object);return NULL;}return object;
}
unsigned portItemAttrFlags(const ItemAttr* a)
{
    return (a->x0_is_heavy<<15)|(a->x0_78<<11)|(a->x0_hold_kind<<8)|(a->x1_1<<6)|(a->x1_3<<5)|(a->x1_4<<4)|(a->x1_5<<3)|(a->x1_67_cam_kind<<1)|a->x1_8;
}
void portItemModelTransform(HSD_GObj* object,float scale,float x,float y,float z)
{
    Item* item=&context(object)->item;Vec3 pos={x,y,z};item->scl=scale;Item_8026849C(object);HSD_JObjSetTranslate(object->hsd_obj,&pos);
    for(unsigned i=0;i<item->xAC8_hurtboxNum;i++){item->xACC_itemHurtbox[i].skip_update_pos=0;lbColl_800083C4(&item->xACC_itemHurtbox[i]);}
}
double portItemModelRead(HSD_GObj* object,unsigned field,unsigned index)
{
    Item* item=&context(object)->item;
    if(field>=20){if(index>=item->xAC8_hurtboxNum)abort();HurtCapsule* h=&item->xACC_itemHurtbox[index];switch(field){
      case 20:return h->state;case 21:return (uintptr_t)h->bone;case 22:return h->scale;
      case 23:case 24:case 25:return ((float*)&h->a_pos)[field-23];case 26:case 27:case 28:return ((float*)&h->b_pos)[field-26];default:abort();}}
    switch(field){case 0:return item->xAC8_hurtboxNum;case 1:return (uintptr_t)item->xBBC_dynamicBoneTable;
    case 2:if(!item->xBBC_dynamicBoneTable||index>=item->xC4_article_data->x10_modelDesc->x4_bone_count)abort();return (uintptr_t)item->xBBC_dynamicBoneTable->bones[index];
    case 3:return item->scl;
    case 4:{HSD_JObj* nodes[100];unsigned count=portSceneCollect(object->hsd_obj,nodes,100),materials=0;if(count>100)abort();for(unsigned i=0;i<count;i++)for(HSD_DObj* d=nodes[i]->u.dobj;d;d=d->next){if(d->mobj){if((void*)HSD_MOBJ_METHOD(d->mobj)!=(void*)&it_mobj)abort();materials++;}}return materials;}
    default:abort();}
}
