/* Capture the original HSD material combiner setup at its GX boundary.
 * These functions are valid only inside an explicit capture. They neither
 * suppress draws nor pretend that the remaining GX renderer is implemented. */
#include <dolphin/gx.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <sysdolphin/baselib/tev.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

typedef struct {
    u32 stages,registers,constants,syncs;
    s32 reg[4][4];
    u32 konst[4][4];
    s32 stage[16][32];
} PortTevState;
_Static_assert(sizeof(PortTevState)==2192,"Native TEV snapshot ABI");
static PortTevState state;
static int capturing;
static void require(int condition){if(!capturing||!condition){fprintf(stderr,"Invalid native TEV capture\n");abort();}}
static s32* stage(unsigned id){require(id<16);return state.stage[id];}
void GXPixModeSync(void){require(1);state.syncs++;}
void GXSetTevColor(GXTevRegID id,GXColor c){require(id<4);state.registers|=1u<<id;state.reg[id][0]=c.r;state.reg[id][1]=c.g;state.reg[id][2]=c.b;state.reg[id][3]=c.a;}
void GXSetTevColorS10(GXTevRegID id,GXColorS10 c){require(id<4);state.registers|=1u<<id;state.reg[id][0]=c.r;state.reg[id][1]=c.g;state.reg[id][2]=c.b;state.reg[id][3]=c.a;}
void GXSetTevKColor(GXTevKColorID id,GXColor c){require(id<4);state.constants|=1u<<id;state.konst[id][0]=c.r;state.konst[id][1]=c.g;state.konst[id][2]=c.b;state.konst[id][3]=c.a;}
void GXSetNumTevStages(u8 n){require(n>0&&n<=16);state.stages=n;}
void GXSetTevOrder(GXTevStageID id,GXTexCoordID coord,GXTexMapID map,GXChannelID color){s32* s=stage(id);s[0]=coord;s[1]=map;s[2]=color;}
void GXSetTevOp(GXTevStageID id,GXTevMode mode){stage(id)[3]=mode;}
void GXSetTevColorOp(GXTevStageID id,GXTevOp op,GXTevBias bias,GXTevScale scale,GXBool clamp,GXTevRegID out){s32* s=stage(id);s[3]=-1;s[4]=op;s[5]=bias;s[6]=scale;s[7]=clamp;s[8]=out;}
void GXSetTevColorIn(GXTevStageID id,GXTevColorArg a,GXTevColorArg b,GXTevColorArg c,GXTevColorArg d){s32* s=stage(id);s[9]=a;s[10]=b;s[11]=c;s[12]=d;}
void GXSetTevAlphaOp(GXTevStageID id,GXTevOp op,GXTevBias bias,GXTevScale scale,GXBool clamp,GXTevRegID out){s32* s=stage(id);s[13]=op;s[14]=bias;s[15]=scale;s[16]=clamp;s[17]=out;}
void GXSetTevAlphaIn(GXTevStageID id,GXTevAlphaArg a,GXTevAlphaArg b,GXTevAlphaArg c,GXTevAlphaArg d){s32* s=stage(id);s[18]=a;s[19]=b;s[20]=c;s[21]=d;}
void GXSetTevSwapMode(GXTevStageID id,GXTevSwapSel ras,GXTevSwapSel tex){s32* s=stage(id);s[22]=ras;s[23]=tex;}
void GXSetTevKColorSel(GXTevStageID id,GXTevKColorSel sel){stage(id)[24]=sel;}
void GXSetTevKAlphaSel(GXTevStageID id,GXTevKAlphaSel sel){stage(id)[25]=sel;}

const PortTevState* portMaterialTev(HSD_JObj* joint,unsigned index)
{
    if(capturing||!joint||!union_type_dobj(joint))abort();
    HSD_DObj* display=joint->u.dobj;
    while(index--){if(!display)abort();display=display->next;}
    if(!display||!display->mobj)abort();
    HSD_MObj* material=display->mobj;
    memset(&state,0,sizeof(state));capturing=1;
    HSD_StateInitTev();
    HSD_MOBJ_METHOD(material)->setup_tev(material,material->tobj,material->rendermode);
    HSD_StateSetNumTevStages();
    capturing=0;return &state;
}
