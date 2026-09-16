/* Original item model/material/bone/hurtbox setup and isolated article probes.
 * These limited owners are not Item_8026862C and are never installed in the
 * gameplay article table. */
#include <melee/it/item.h>
#include <melee/it/itcoll.h>
#include <melee/it/itmaterial.h>
#include <melee/it/itanimlist.h>
#include <melee/it/itCharItems.h>
#include <melee/it/it_3F14.h>
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
_Static_assert(sizeof(Article)==24&&sizeof(ItemStateDesc)==16,"Article descriptor ABI");
_Static_assert(sizeof(FoxLaserAttr)==40&&sizeof(FoxBlasterAttr)==40,"Blaster/laser attribute ABI");
_Static_assert(sizeof(ItemCommonData)==0x160&&offsetof(ItemCommonData,x48_byte)==0x48&&offsetof(ItemCommonData,x148)==0x148,"Common item ABI");
_Static_assert(sizeof(it_804D6D40_t)==28,"Common item parameters ABI");
/* A fresh-module initialization probe, not a full item-system installation.
 * No article registry is fabricated and spawning remains outside this API. */
unsigned* portItemCommonProbe(ItemCommonData* common)
{
    static unsigned result[30];static int initialized;
    if(!common||initialized||it_804D6D28)abort();initialized=1;
    it_804D6D28=common;Item_80266FCC();it_804D6D28=NULL;
    unsigned* limits=(unsigned*)&Item_804A0C64;
    for(unsigned i=0;i<26;i++)result[i]=limits[i];
    result[26]=Item_804A0CCC.count;result[27]=Item_804A0E24.x;
    result[28]=Item_804A0E24.y;result[29]=Item_804A0E24.z;
    return result;
}
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
/* Isolated script verification on a real model owner. This is not a spawned
 * gameplay item: no fighter ownership, movement or collision scheduler is
 * installed. The normal-size, unstaled damage multipliers are explicit. */
HSD_GObj* portArticleProbeCreate(Article* article)
{
    if(!article||!article->x4_specialAttributes||!article->xC_itemStates)return NULL;
    ItemModelBinding binding={article->x0_common_attr,article->x10_modelDesc,article->x8_hurtbones};
    HSD_GObj* object=portItemModelCreate(&binding);if(!object)return NULL;
    ItemModelOwner* owner=context(object);owner->article=*article;
    owner->item.xC3C=owner->item.xC40=1.0f;owner->item.x5D0_animFrameSpeed=1.0f;
    return object;
}
void portArticleProbeStart(HSD_GObj* object,unsigned state,unsigned count)
{
    if(!count||count>9||state>=count)abort();Item* item=&context(object)->item;
    Item_80268E40(item,&item->xC4_article_data->xC_itemStates->x0_itemStateDesc[state]);
}
void portArticleProbeStep(HSD_GObj* object,float frame)
{
    context(object)->item.x5CC_currentAnimFrame=frame;it_802799E4(object);
}
double portArticleProbeRead(HSD_GObj* object,unsigned field,unsigned index)
{
    Item* item=&context(object)->item;if(index>=4)abort();HitCapsule* hit=&item->x5D4_hitboxes[index].hit;
    switch(field){case 0:return (uintptr_t)item->x524_cmd.u;case 1:return item->x524_cmd.timer;
    case 2:return hit->state;case 3:return hit->damage;case 4:return hit->scale;
    case 5:case 6:case 7:return ((float*)&hit->b_offset)[field-5];
    case 8:return hit->kb_angle;case 9:return hit->x24;case 10:return hit->x28;case 11:return hit->x2C;
    case 12:return hit->element;default:abort();}
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
