/* Original color interpreter integration. External GFX/SFX/rumble events use
 * Melee's own skip handlers in this verification fixture, not fake gameplay
 * implementations. Event counts and complete parameter words remain observable. */
#include <melee/lb/lb_013B.h>
#include <melee/lb/types.h>
#include <melee/ft/ftaction.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/gobjuserdata.h>
#include <stdlib.h>

struct PortColor { ColorOverlay color; HSD_GObj* object; unsigned events[3],hash; };
extern int portRuntimeInit(void);
static void release_color(void* data){free(data);}
static void skip_effect(Fighter_GObj* object,CommandInfo* command,int opcode)
{
    struct PortColor* p=object->user_data;
    unsigned count=opcode==21?5:opcode==22?3:opcode==23?1:0;if(!count)abort();
    p->events[opcode-21]++;
    const u32* words=(const u32*)command->u;
    for(unsigned i=0;i<count;i++)p->hash=(p->hash^words[i])*16777619U;
    if(opcode==21)ftAction_800711DC(object,command);
    else if(opcode==22)ftAction_80071CA4(object,command);
    else ftAction_80073108(object,command);
}
struct PortColor* portColorCreate(Fighter_804D653C_t* table,unsigned count,unsigned index)
{
    if(!table||index>=count||portRuntimeInit()<0)return NULL;
    struct PortColor* p=calloc(1,sizeof(*p));if(!p)return NULL;
    p->object=GObj_Create(4,8,0);if(!p->object)abort();
    GObj_InitUserData(p->object,4,release_color,p);p->hash=2166136261U;
    lb_80014498(&p->color);
    if(!lb_800144C8(&p->color,table,index,0))abort();return p;
}
int portColorSelect(struct PortColor* p,Fighter_804D653C_t* table,unsigned count,unsigned index,int lifetime)
{
    if(index>=count||p->color.x28_colanim.i>=count)abort();
    return lb_800144C8(&p->color,table,index,lifetime);
}
int portColorStep(struct PortColor* p){return lb_80014258(p->object,&p->color,skip_effect);}
void portColorDestroy(struct PortColor* p){HSD_GObjFree(p->object);}
double portColorRead(struct PortColor* p,unsigned index)
{
    ColorOverlay* c=&p->color;
    switch(index) {
    case 0:return c->x0_timer;case 1:return c->x4_pri;case 2:return (uintptr_t)c->x8_ptr1;
    case 3:return c->xC_loop;case 4:return c->x28_colanim.i;
    case 5:return c->x2C_hex.r;case 6:return c->x2C_hex.g;case 7:return c->x2C_hex.b;case 8:return c->x2C_hex.a;
    case 9:return c->x50_light_color.r;case 10:return c->x50_light_color.g;case 11:return c->x50_light_color.b;case 12:return c->x50_light_color.a;
    case 13:return c->x30_color_red;case 14:return c->x34_color_green;case 15:return c->x38_color_blue;case 16:return c->x3C_color_alpha;
    case 17:return c->x40_colorblend_red;case 18:return c->x44_colorblend_green;case 19:return c->x48_colorblend_blue;case 20:return c->x4C_colorblend_alpha;
    case 21:return c->x54_light_red;case 22:return c->x58_light_green;case 23:return c->x5C_light_blue;case 24:return c->x60_light_alpha;
    case 25:return c->x64_lightblend_red;case 26:return c->x68_lightblend_green;case 27:return c->x6C_lightblend_blue;case 28:return c->x70_lightblend_alpha;
    case 29:return c->x74_light_rot_x;case 30:return c->x78_light_rot_yz;
    case 31:return c->x7C_color_enable;case 32:return c->x7C_flag2;case 33:return c->x7C_light_enable;
    case 34:return p->events[0];case 35:return p->events[1];case 36:return p->events[2];case 37:return p->hash;
    default:abort();
    }
}
