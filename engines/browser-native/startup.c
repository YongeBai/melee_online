/* Startup integration diagnostics. The original FirstInitialize entry point
 * runs in shared.c; these readers do not replace any startup/game logic. */
#include <melee/ft/fighter.h>
#include <melee/ft/ftdata.h>
#include <melee/ft/ftparts.h>
#include <melee/ft/ftCo_800C7CA0.h>
#include <melee/ft/ft_0C8C.h>
#include <melee/ft/kinds/ftKirby/ftkirby.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/lobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <stdlib.h>
#include <string.h>
extern int portFighterStartupComplete(void);
extern int ft_8045996C[Ft_Kind_Max];
extern u32 Fighter_804D64F8;
/* Same original private type; only diagnostics access it across units. */
typedef struct ft_8045993C_t { u32 pad_x0; u8 pad_x4[2]; u16 x6_b0:1; u16 x6_b1_b2:2; } ft_8045993C_t;
extern ft_8045993C_t ft_8045993C[6];
_Static_assert(sizeof(ft_8045993C_t)==8,"Startup state layout");

unsigned portStartupResetCheck(void)
{
    if(portFighterStartupComplete())abort();
    unsigned checks=0;int counts[Ft_Kind_Max][2];
    for(int i=0;i<Ft_Kind_Max;i++) {
        if(gFtDataList[i]||ftData_Table_Unk0[i].data||ftData_UnkIntPairs[i].data)abort();
        counts[i][0]=ftData_Table_Unk0[i].count;counts[i][1]=ftData_UnkIntPairs[i].count;
        gFtDataList[i]=(ftData*)(uintptr_t)0x100;
        ftData_Table_Unk0[i].data=ftData_UnkIntPairs[i].data=(void*)(uintptr_t)0x200;
        ft_8045996C[i]=i+1;
        for(int j=0;j<CostumeListsForeachCharacter[i].numCostumes;j++) {
            UnkCostumeStruct* c=&CostumeListsForeachCharacter[i].costume_list[j];
            if(c->joint||c->x4||c->pad_x8||c->pad_xC||c->pad_x10||c->x14_archive)abort();
            c->joint=(HSD_Joint*)(uintptr_t)0x300;c->pad_x8=123;
            c->x4=(HSD_MatAnimJoint*)(uintptr_t)0x400;c->pad_xC=456;c->pad_x10=789;
            c->x14_archive=(HSD_Archive*)(uintptr_t)0x500;
        }
    }
    for(int i=0;i<6;i++){ft_8045993C[i].pad_x0=123;ft_8045993C[i].pad_x4[0]=17;ft_8045993C[i].pad_x4[1]=91;ft_8045993C[i].x6_b0=1;ft_8045993C[i].x6_b1_b2=3;}
    ft_800852B0();ft_8008549C();
    for(int i=0;i<Ft_Kind_Max;i++) {
        if(gFtDataList[i]||ftData_Table_Unk0[i].data||ftData_UnkIntPairs[i].data||ft_8045996C[i]||
           ftData_Table_Unk0[i].count!=counts[i][0]||ftData_UnkIntPairs[i].count!=counts[i][1])abort();checks+=6;
        for(int j=0;j<CostumeListsForeachCharacter[i].numCostumes;j++) {
            UnkCostumeStruct* c=&CostumeListsForeachCharacter[i].costume_list[j];
            if(c->joint||c->pad_x8||c->x4!=(HSD_MatAnimJoint*)(uintptr_t)0x400||c->pad_xC!=456||c->pad_x10!=789||c->x14_archive!=(HSD_Archive*)(uintptr_t)0x500)abort();
            checks+=6;memset(c,0,sizeof(*c));
        }
    }
    for(int i=0;i<6;i++){if(ft_8045993C[i].pad_x0||ft_8045993C[i].x6_b0||ft_8045993C[i].x6_b1_b2||ft_8045993C[i].pad_x4[0]!=17||ft_8045993C[i].pad_x4[1]!=91)abort();checks+=5;}
    memset(ft_8045993C,0,sizeof(ft_8045993C));
    memset(&ft_80459B88,0xA5,sizeof(ft_80459B88));ftKb_Init_800EE528();
    const unsigned char* p=(const unsigned char*)&ft_80459B88;
    for(unsigned i=0;i<sizeof(ft_80459B88);i++){if(p[i]!=(i<Ft_Kind_Max*4?0:0xA5))abort();checks++;}
    memset(&ft_80459B88,0,sizeof(ft_80459B88));return checks;
}
double portStartupMetric(unsigned metric,unsigned index)
{
    HSD_ObjAllocData* pools[]={&fighter_alloc_data,&fighter_dat_attrs_alloc_data,&fighter_parts_alloc_data,&fighter_dobj_list_alloc_data,&fighter_x2040_alloc_data,&fighter_x59C_alloc_data};
    if(metric<=2){if(index>=6)abort();return metric==0?pools[index]->size:metric==1?pools[index]->align:pools[index]->used;}
    if(metric==3)return Fighter_804D64F8;
    if(metric==4)return (uintptr_t)ft_804D6580;
    if(metric==5)return (uintptr_t)ft_804D6588;
    if(metric==6){if(index>=4||!ft_804D6588||!ft_804D6588->mat)abort();return ((u8*)&ft_804D6588->mat->diffuse)[index];}
    if(metric==7)return sizeof(Fighter);
    if(metric==8)return MAX_FT_PARTS*sizeof(FighterBone);
    HSD_GObj* object=HSD_GObjPLinkHead[3];if(!object||object->next)abort();
    if(metric==9)return object->classifier;
    HSD_LObj* light=object->hsd_obj;
    if(metric==10){unsigned count=0;for(;light;light=light->next)count++;return count;}
    for(unsigned i=0;i<index;i++){if(!light)abort();light=light->next;}if(!light)abort();
    if(metric==11)return light->flags;
    if(metric==12)return light->shininess;
    if(metric==13)return (uintptr_t)light;
    if(metric==14||metric==15||metric==16){Vec3 position;if(!HSD_LObjGetPosition(light,&position))return 0;return metric==14?position.x:metric==15?position.y:position.z;}
    abort();
}
