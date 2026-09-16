/* Browser asset residency boundary. Load only converted Articles and reject
 * unsupported kinds before the original constructor reads any descriptor.
 * Original registration, construction, scheduling and gameplay remain intact. */
#include <melee/it/item.h>
#include <melee/it/it_3F14.h>
#include <melee/it/it_26B1.h>
#include <melee/it/types.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/jobj.h>
#include <stdio.h>
#include <stdlib.h>
static Article* character_articles[118];
static Article* common_articles[It_Kind_Kuriboh];
_Static_assert(It_PKind_Start-It_Kind_Kuriboh==118,"Character article table ABI");
static int initialized;
extern void port_unlinked_Item_80267978(HSD_GObj*);
extern void port_unlinked_it_8026B3F8(Article*,s32);
void portItemsInitialize(ItemCommonData* common,it_804D6D40_t* parameters,Fighter_804D653C_t* colors)
{
    if(initialized||!common||!parameters||!colors||it_804D6D28)abort();
    initialized=1;it_804D6D28=common;it_804D6D40=parameters;it_804D6D04=colors;
    it_804D6D24=common_articles;it_804D6D38=character_articles;Item_80266FCC();
}
void it_8026B3F8(Article* article,s32 kind)
{
    if(!initialized||!article||kind<It_Kind_Kuriboh||kind>=It_PKind_Start)abort();
    port_unlinked_it_8026B3F8(article,kind);
}
void portCommonItemInstall(Article* article,int kind)
{
    if(!initialized||!article||(kind!=It_Kind_BombHei&&kind!=It_Kind_Dosei&&kind!=It_Kind_Sword)||common_articles[kind])abort();
    common_articles[kind]=article;
}
void portStoryItemInstall(Article* article)
{
    if(!initialized||!article||it_804A0F60[It_Kind_Heiho-It_Kind_Old_Kuri])abort();
    it_8026B40C(article,It_Kind_Heiho);
}
void Item_80267978(HSD_GObj* object)
{
    Item* item=object->user_data;int kind=item->kind;
    int resident=kind>=It_Kind_Kuriboh&&kind<It_PKind_Start&&character_articles[kind-It_Kind_Kuriboh];
    if(kind>=0&&kind<It_Kind_Kuriboh)resident=common_articles[kind]!=NULL;
    if(kind==It_Kind_Heiho)resident=it_804A0F60[It_Kind_Heiho-It_Kind_Old_Kuri]!=NULL;
    if(!initialized||!resident) {
        fprintf(stderr,"Native item asset not resident: kind %d\n",kind);abort();
    }
    port_unlinked_Item_80267978(object);
}
unsigned portItemsList(unsigned* result,unsigned capacity)
{
    unsigned n=0;for(HSD_GObj* object=HSD_GObjPLinkHead[HSD_GOBJ_PLINK_ITEM];object;object=object->next){if(n<capacity)result[n]=(unsigned)object;n++;}return n;
}
/* Original tethers use separately scheduled ItemLink objects, not
 * Items. Enumerate them without changing their lifetime, collision or poses. */
unsigned portItemLinksList(unsigned* result,unsigned capacity)
{
    unsigned n=0;
    for(HSD_GObj* object=HSD_GObjPLinkHead[HSD_GOBJ_PLINK_ITEM];object;object=object->next){
        Item* item=object->user_data;ItemLink* first=NULL;
        if(item->kind==It_Kind_Samus_GBeam)first=item->xDD4_itemVar.samusgrapple.x0;
        else if(item->kind==It_Kind_Link_HShot||item->kind==It_Kind_CLink_HShot)first=item->xDD4_itemVar.linkhookshot.x0;
        else if(item->kind==It_Kind_Seak_Chain)first=item->xDD4_itemVar.seakchain.x0;
        else if(item->kind==It_Kind_Ness_Yoyo)first=item->xDD4_itemVar.nessyoyo.x8;
        else continue;
        unsigned links=0;
        for(ItemLink* link=first;link;link=link->next){
            if(++links>256||!link->gobj||!link->gobj->hsd_obj)abort();
            HSD_JObj* joint=link->gobj->hsd_obj;
            if(n<capacity){result[n*2]=(unsigned)link->gobj;result[n*2+1]=joint->id;}n++;
        }
    }
    return n;
}
/* These joints are drawn by the item's original callback but are not children
 * of its primary model. Keep their native owner and lifetime. */
unsigned portItemAttachmentsList(unsigned* result,unsigned capacity)
{
    unsigned n=0;
    for(HSD_GObj* object=HSD_GObjPLinkHead[HSD_GOBJ_PLINK_ITEM];object;object=object->next){
        Item* item=object->user_data;HSD_JObj** roots=NULL;
        if(item->kind==It_Kind_Link_Boomerang||item->kind==It_Kind_CLink_Boomerang)roots=item->xDD4_itemVar.linkboomerang.xF90;
        else if(item->kind==It_Kind_Link_Arrow||item->kind==It_Kind_CLink_Arrow)roots=item->xDD4_itemVar.linkarrow.xB4;
        if(!roots)continue;
        for(unsigned i=0;i<2;i++)if(roots[i]){
            if(n<capacity){result[n*3]=(unsigned)object;result[n*3+1]=(unsigned)roots[i];result[n*3+2]=roots[i]->id;}n++;
        }
    }
    return n;
}
double portItemRead(HSD_GObj* object,unsigned field)
{
    if(!object||object->classifier!=HSD_GOBJ_CLASS_ITEM)abort();Item* item=object->user_data;
    switch(field){case 0:return item->kind;case 1:return item->msid;case 2:return item->pos.x;case 3:return item->pos.y;
    case 4:return item->pos.z;case 5:return (unsigned)item->owner;case 6:return item->x5D4_hitboxes[0].hit.state;
    case 7:return item->x5D4_hitboxes[0].hit.damage;case 8:return (unsigned)item->xC8_joint;default:abort();}
}
