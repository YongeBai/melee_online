/* Record the original HSD texture/texgen setup without a GX command FIFO.
 * Stack GX object handles are scoped to one material capture. No function here
 * is a permissive graphics stub: unsupported/out-of-scope calls abort. */
#include <dolphin/gx.h>
#include <string.h>
#include <stdint.h>

void portRequireMaterialCapture(int condition);
#define require(c) portRequireMaterialCapture(c)
typedef union {u32 u[24];f32 f[24];} Texture;
typedef union {u32 u[16];f32 f[16];} Matrix;
typedef struct {
    u32 texture_mask,texgen_mask,matrix_mask,texgens;
    Texture textures[8];
    u32 generators[8][6];
    Matrix matrices[30];
} TextureState;
_Static_assert(sizeof(TextureState)==2896,"Texture capture ABI");
static TextureState state;
static struct {GXTexObj* handle;Texture value;} pending[16];
static unsigned pending_count;
static struct {GXTlutObj* handle;u32 ptr,format,count;} palette;
static struct {u32 ptr,format,count;} palettes[20];
static u32 palette_mask;

void portTextureCaptureReset(void)
{
    require(1);memset(&state,0,sizeof(state));memset(pending,0,sizeof(pending));
    memset(&palette,0,sizeof(palette));memset(palettes,0,sizeof(palettes));pending_count=0;palette_mask=0;
}
const TextureState* portMaterialTextureState(void){return &state;}
static Texture* object(GXTexObj* handle,int create)
{
    require(handle!=NULL);
    for(unsigned i=0;i<pending_count;i++)if(pending[i].handle==handle)return &pending[i].value;
    require(create&&pending_count<16);pending[pending_count].handle=handle;return &pending[pending_count++].value;
}
void GXInitTexObj(GXTexObj* obj,void* data,u16 width,u16 height,GXTexFmt format,GXTexWrapMode s,GXTexWrapMode t,u8 mip)
{
    require(data&&width&&height&&width<=1024&&height<=1024&&s<=GX_MIRROR&&t<=GX_MIRROR&&mip<=1);
    Texture* v=object(obj,1);memset(v,0,sizeof(*v));
    v->u[0]=(u32)(uintptr_t)data;v->u[1]=width;v->u[2]=height;v->u[3]=format;v->u[4]=s;v->u[5]=t;v->u[6]=mip;v->u[7]=UINT32_MAX;
    /* HSD always follows initialization with explicit GXInitTexObjLOD. */
    v->u[23]=0;
}
void GXInitTexObjCI(GXTexObj* obj,void* data,u16 width,u16 height,GXTexFmt format,GXTexWrapMode s,GXTexWrapMode t,u8 mip,u32 tlut)
{
    GXInitTexObj(obj,data,width,height,format,s,t,mip);require(tlut<20);object(obj,0)->u[7]=tlut;
}
void GXInitTexObjLOD(GXTexObj* obj,GXTexFilter min,GXTexFilter mag,f32 low,f32 high,f32 bias,GXBool clamp,GXBool edge,GXAnisotropy aniso)
{
    Texture* v=object(obj,0);require(min<=GX_LIN_MIP_LIN&&mag<=GX_LINEAR&&clamp<=1&&edge<=1&&aniso<=GX_ANISO_4);
    v->u[8]=min;v->u[9]=mag;v->u[10]=clamp;v->u[11]=edge;v->u[12]=aniso;
    v->f[16]=low;v->f[17]=high;v->f[18]=bias;v->u[23]=1;
}
void GXInitTlutObj(GXTlutObj* obj,void* data,GXTlutFmt format,u16 count)
{
    require(obj&&data&&count&&count<=16384&&format<=GX_TL_RGB5A3);
    palette.handle=obj;palette.ptr=(u32)(uintptr_t)data;palette.format=format;palette.count=count;
}
void GXLoadTlut(GXTlutObj* obj,u32 name)
{
    require(obj&&obj==palette.handle&&name<20);palettes[name].ptr=palette.ptr;palettes[name].format=palette.format;palettes[name].count=palette.count;palette_mask|=1u<<name;
}
void GXLoadTexObj(GXTexObj* obj,GXTexMapID id)
{
    require(id<8);Texture* v=object(obj,0);require(v->u[23]);state.textures[id]=*v;state.texture_mask|=1u<<id;
    if(v->u[7]!=UINT32_MAX){unsigned p=v->u[7];require(p<20&&(palette_mask&(1u<<p)));state.textures[id].u[13]=palettes[p].ptr;state.textures[id].u[14]=palettes[p].format;state.textures[id].u[15]=palettes[p].count;}
}
void GXSetNumTexGens(u8 count){require(count<=8);state.texgens=count;}
void GXSetTexCoordGen2(GXTexCoordID id,GXTexGenType type,GXTexGenSrc src,u32 matrix,GXBool normalize,u32 post)
{
    require(id<8&&normalize<=1);u32* g=state.generators[id];g[0]=type;g[1]=src;g[2]=matrix;g[3]=normalize;g[4]=post;state.texgen_mask|=1u<<id;
}
void GXLoadTexMtxImm(f32 mtx[][4],u32 id,GXTexMtxType type)
{
    unsigned index;
    if(id>=GX_TEXMTX0&&id<=GX_TEXMTX9&&(id-GX_TEXMTX0)%3==0)index=(id-GX_TEXMTX0)/3;
    else {require(id>=GX_PTTEXMTX0&&id<=GX_PTTEXMTX19&&(id-GX_PTTEXMTX0)%3==0);index=10+(id-GX_PTTEXMTX0)/3;}
    require(mtx&&(type==GX_MTX2x4||type==GX_MTX3x4));Matrix* m=&state.matrices[index];memset(m,0,sizeof(*m));m->u[0]=id;m->u[1]=type;
    memcpy(&m->f[4],mtx,(type==GX_MTX2x4?8:12)*sizeof(f32));state.matrix_mask|=1u<<index;
}

/* SDK queries over a live host texture handle retain the same scope checks. */
u16 GXGetTexObjWidth(const GXTexObj* obj){return object((GXTexObj*)obj,0)->u[1];}
u16 GXGetTexObjHeight(const GXTexObj* obj){return object((GXTexObj*)obj,0)->u[2];}
GXTexFmt GXGetTexObjFmt(const GXTexObj* obj){return object((GXTexObj*)obj,0)->u[3];}
