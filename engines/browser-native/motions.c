/* Integration fixture for the original animation loader. This does not create
 * a playable Fighter: only the fields read by ftData_80085xxx are populated.
 * Keep this boundary explicit until full Fighter_Create has been integrated. */
#include <melee/ft/ftdata.h>
#include <melee/ft/fighter.h>
#include <melee/pl/player.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/gobjuserdata.h>
#include <sysdolphin/baselib/objalloc.h>
#include <stdlib.h>
#include <string.h>

_Static_assert(sizeof(Fighter_WaitAnimData)==24,"Motion table ABI");
extern int portRuntimeInit(void);
extern void portFileRelease(const char*);
extern char* ftData_803C23E4[];
struct PortMotions { Fighter fighter; ftData data; HSD_GObj* object; };
static struct PortMotions* contexts[27];
static int pool_ready;
static struct PortMotions* context(unsigned kind)
{
    if(kind>=27||!contexts[kind])abort();return contexts[kind];
}
static void destroy_motion_data(void* data)
{
    struct PortMotions* c=data;unsigned kind=c->fighter.kind;
    HSD_ObjFree(&fighter_x59C_alloc_data,c->fighter.x59C);
    HSD_ObjFree(&fighter_x59C_alloc_data,c->fighter.x5A0);
    for(unsigned i=0;i<c->fighter.x58C;i++)c->fighter.x24[i].x14=0;
    gFtDataList[kind]=NULL;ftData_Table_Unk0[kind].data=NULL;
    portFileRelease(ftData_803C23E4[kind]);contexts[kind]=NULL;free(c);
}
int portMotionCreate(unsigned kind,Fighter_WaitAnimData* table,unsigned count)
{
    if(kind>=27||contexts[kind]||!table||count!=ftData_Table_Unk0[kind].count)return -1;
    if(kind==Ft_Kind_Nana&&!contexts[Ft_Kind_Popo])return -2;
    if(portRuntimeInit()<0)return -3;
    if(!pool_ready){HSD_ObjAllocInit(&fighter_x59C_alloc_data,0x8000,0x20);pool_ready=1;}
    struct PortMotions* c=calloc(1,sizeof(*c));if(!c)return -4;
    c->fighter.kind=kind;c->fighter.player_id=0;c->fighter.x24=table;
    c->data.xC=table;c->fighter.ft_data=&c->data;
    c->object=GObj_Create(4,8,0);if(!c->object)abort();
    GObj_InitUserData(c->object,4,destroy_motion_data,&c->fighter);
    gFtDataList[kind]=&c->data;contexts[kind]=c;
    Player_SetSlottype(0,Gm_PKind_Human);
    if(kind==Ft_Kind_Popo||kind==Ft_Kind_Nana) {
        unsigned sub=kind==Ft_Kind_Nana;StaticPlayer* p=Player_GetPtrForSlot(0);
        p->transformed[sub]=sub;p->player_entity[sub]=c->object;
    }
    ftData_80085B10(&c->fighter);return 0;
}
void portMotionDestroy(unsigned kind)
{
    struct PortMotions* c=context(kind);
    if(kind==Ft_Kind_Popo&&contexts[Ft_Kind_Nana])abort();
    if(kind==Ft_Kind_Popo||kind==Ft_Kind_Nana)Player_GetPtrForSlot(0)->player_entity[kind==Ft_Kind_Nana]=NULL;
    HSD_GObjFree(c->object);
}
FigaTree* portMotionLoad(unsigned kind,unsigned index,unsigned secondary)
{
    Fighter* fp=&context(kind)->fighter;if(index>=fp->x58C)abort();
    if(secondary)return ftData_80085E50(fp,index);
    ftData_80085CD8(fp,fp,index);return fp->x590;
}
uintptr_t portMotionEntry(unsigned kind,unsigned index,unsigned field)
{
    Fighter* fp=&context(kind)->fighter;if(index>=fp->x58C)abort();
    struct ftData_80085FD4_ret* row=ftData_80085FD4(fp,index);
    switch(field) {
    case 0:return (uintptr_t)row;case 1:return (uintptr_t)row->x0;
    case 2:return row->x8;case 3:return (uintptr_t)row->xC;
    case 4:return row->x10_b0;case 5:return row->x10_b1;case 6:return row->x14;
    default:abort();
    }
}
unsigned portMotionLive(void)
{
    unsigned n=0;for(unsigned i=0;i<27;i++)n+=contexts[i]!=NULL;return n;
}
unsigned portMotionBuffers(void){return fighter_x59C_alloc_data.used;}
