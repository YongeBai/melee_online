/* Original HSD material pixel/channel settings, captured at the GX API. */
#include <dolphin/gx.h>
#include <string.h>
void portRequireMaterialCapture(int condition);
#define require(c) portRequireMaterialCapture(c)
typedef struct {u32 pe[32];u32 channels[4][8];u32 colors[2][8];} PixelState;
_Static_assert(sizeof(PixelState)==320,"Pixel capture ABI");
static PixelState state;
void portPixelCaptureReset(void){require(1);memset(&state,0,sizeof(state));}
const PixelState* portMaterialPixelState(void){return &state;}
void GXSetBlendMode(GXBlendMode type,GXBlendFactor src,GXBlendFactor dst,GXLogicOp logic)
{require(type<=3&&src<=7&&dst<=7&&logic<=15);state.pe[0]|=1;state.pe[2]=type;state.pe[3]=src;state.pe[4]=dst;state.pe[5]=logic;}
void GXSetZMode(GXBool enable,GXCompare compare,GXBool update)
{require(enable<=1&&compare<=7&&update<=1);state.pe[0]|=2;state.pe[6]=enable;state.pe[7]=compare;state.pe[8]=update;}
void GXSetZCompLoc(GXBool before){require(before<=1);state.pe[0]|=4;state.pe[9]=before;}
void GXSetColorUpdate(GXBool enable){require(enable<=1);state.pe[0]|=8;state.pe[10]=enable;}
void GXSetAlphaUpdate(GXBool enable){require(enable<=1);state.pe[0]|=16;state.pe[11]=enable;}
void GXSetDstAlpha(GXBool enable,u8 alpha){require(enable<=1);state.pe[0]|=32;state.pe[12]=enable;state.pe[13]=alpha;}
void GXSetDither(GXBool enable){require(enable<=1);state.pe[0]|=64;state.pe[14]=enable;}
void GXSetAlphaCompare(GXCompare a,u8 refa,GXAlphaOp op,GXCompare b,u8 refb)
{require(a<=7&&b<=7&&op<=3);state.pe[0]|=128;state.pe[15]=a;state.pe[16]=refa;state.pe[17]=op;state.pe[18]=b;state.pe[19]=refb;}
void GXSetNumChans(u8 count){require(count<=2);state.pe[0]|=256;state.pe[1]=count;}
void GXSetChanCtrl(GXChannelID id,GXBool enable,GXColorSrc ambient,GXColorSrc material,u32 lights,GXDiffuseFn diffuse,GXAttnFn attenuation)
{
    require(id<6&&enable<=1&&ambient<=1&&material<=1&&lights<=255&&diffuse<=2&&attenuation<=2);
    unsigned first=id<4?id:id-4,last=id<4?id:id-2;
    for(unsigned i=first;i<=last;i+=2){u32* c=state.channels[i];c[0]=enable;c[1]=ambient;c[2]=material;c[3]=lights;c[4]=diffuse;c[5]=attenuation;state.pe[20]|=1u<<i;}
}
static void color(GXChannelID id,GXColor value,int material)
{
    require(id<6);unsigned channel=id&1;u32* c=state.colors[channel]+(material?4:0);
    if(id<2||id>=4){c[0]=value.r;c[1]=value.g;c[2]=value.b;state.pe[material?22:21]|=1u<<channel;}
    if(id>=2){c[3]=value.a;state.pe[material?22:21]|=1u<<(channel+2);}
}
void GXSetChanAmbColor(GXChannelID id,GXColor value){color(id,value,0);}
void GXSetChanMatColor(GXChannelID id,GXColor value){color(id,value,1);}
