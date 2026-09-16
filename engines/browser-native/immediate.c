/* GX immediate vertices emitted by original particle drawing. Serialize writes
 * in console byte order, validate the active descriptor, then submit a complete
 * primitive. Console FIFO commands outside a scoped draw are unsupported. */
#include <dolphin/gx.h>
#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
extern void portRequireMaterialCapture(int);
extern const void* portImmediateTevState(void);
#define require(x) do{if(!(x)){fprintf(stderr,"Invalid immediate draw at %d\n",__LINE__);abort();}portRequireMaterialCapture(1);}while(0)
static unsigned active,types[26],formats[8][26][3],cursor,expected,count,primitive,stride,format,cull;
static const unsigned char* arrays[26];
static unsigned array_stride[26],array_size[26];
static unsigned char fifo[4096*24];
static float vertices[4096*9];
int portImmediateActive(void){return active;}
void portImmediateBegin(void){require(!active);active=1;cursor=expected=0;memset(types,0,sizeof(types));memset(formats,0,sizeof(formats));memset(arrays,0,sizeof(arrays));}
void portImmediateEnd(void){require(active&&!expected);active=0;}
void portImmediateClear(void){require(active&&!expected);memset(types,0,sizeof(types));}
void GXSetVtxDesc(GXAttr attr,GXAttrType type){require(active&&!expected&&(unsigned)attr<26&&(unsigned)type<=GX_INDEX16);types[attr]=type;}
void GXSetVtxAttrFmt(GXVtxFmt fmt,GXAttr attr,GXCompCnt cnt,GXCompType type,u8 frac)
{require(active&&!expected&&(unsigned)fmt<8&&(unsigned)attr<26);formats[fmt][attr][0]=cnt;formats[fmt][attr][1]=type;formats[fmt][attr][2]=frac;}
void GXSetArray(GXAttr attr,const void* ptr,u8 size){require(active&&!expected&&(unsigned)attr<26&&ptr&&size);arrays[attr]=ptr;array_stride[attr]=size;array_size[attr]=UINT32_MAX;}
void portGXSetArraySized(GXAttr attr,const void* ptr,unsigned bytes,u8 size){GXSetArray(attr,ptr,size);array_size[attr]=bytes;}
void GXSetCullMode(GXCullMode mode){require(active&&!expected&&(unsigned)mode<=GX_CULL_ALL);cull=mode;}
void GXEnableTexOffsets(GXTexCoordID coord,u8 line,u8 point){require(active&&coord==GX_TEXCOORD0&&line<=1&&point<=1);}
/* Point/line expansion needs screen-size and texture-offset semantics. Keep
 * these explicit failures until that separate primitive path is integrated. */
void GXSetPointSize(u8 size,GXTexOffset offset){fprintf(stderr,"Native particle point expansion pending\n");abort();}
void GXSetLineWidth(u8 size,GXTexOffset offset){fprintf(stderr,"Native particle line expansion pending\n");abort();}
EM_JS(void,emit_immediate,(unsigned primitive,unsigned count,const float* vertices,unsigned cull,unsigned textured,const void* tev),{
    if(typeof Module.onNativeImmediate!=='function')throw Error('Immediate draw receiver absent');
    Module.onNativeImmediate(primitive,count,vertices,cull,textured,tev);
});
static unsigned word(const unsigned char* p){return (unsigned)p[0]<<24|(unsigned)p[1]<<16|(unsigned)p[2]<<8|p[3];}
static float real(const unsigned char* p){union{unsigned u;float f;}v={.u=word(p)};require(isfinite(v.f));return v.f;}
static void emit(void)
{
    const unsigned char* p=fifo;
    for(unsigned i=0;i<count;i++){
        float* v=vertices+i*9;for(unsigned j=0;j<3;j++,p+=4)v[j]=real(p);
        for(unsigned j=0;j<4;j++)v[3+j]=types[GX_VA_CLR0]?*p++/255.0f:1;
        v[7]=v[8]=0;
        if(types[GX_VA_TEX0]){
            const unsigned char* uv=p;
            if(types[GX_VA_TEX0]>=GX_INDEX8){unsigned index=*p++;if(types[GX_VA_TEX0]==GX_INDEX16)index=index*256+*p++;require(arrays[GX_VA_TEX0]&&index*array_stride[GX_VA_TEX0]+2<=array_size[GX_VA_TEX0]);uv=arrays[GX_VA_TEX0]+index*array_stride[GX_VA_TEX0];}
            else p+=formats[format][GX_VA_TEX0][1]==GX_F32?8:2;
            for(unsigned j=0;j<2;j++)v[7+j]=formats[format][GX_VA_TEX0][1]==GX_F32?real(uv+j*4):uv[j];
        }
    }
    require(p==fifo+expected);expected=cursor=0;
    emit_immediate(primitive,count,vertices,cull,types[GX_VA_TEX0]!=0,portImmediateTevState());
}
void GXBegin(GXPrimitive type,GXVtxFmt fmt,u16 n)
{
    require(active&&!expected&&(unsigned)fmt<8&&n&&n<=4096);
    require(type==GX_QUADS||type==GX_TRIANGLES||type==GX_TRIANGLESTRIP||type==GX_TRIANGLEFAN);
    require(types[GX_VA_POS]==GX_DIRECT&&formats[fmt][GX_VA_POS][0]==GX_POS_XYZ&&formats[fmt][GX_VA_POS][1]==GX_F32&&!formats[fmt][GX_VA_POS][2]);
    for(unsigned i=0;i<26;i++)require(!types[i]||i==GX_VA_POS||i==GX_VA_CLR0||i==GX_VA_TEX0);
    require(!types[GX_VA_CLR0]||(types[GX_VA_CLR0]==GX_DIRECT&&formats[fmt][GX_VA_CLR0][0]==GX_CLR_RGBA&&formats[fmt][GX_VA_CLR0][1]==GX_RGBA8));
    require(!types[GX_VA_TEX0]||(formats[fmt][GX_VA_TEX0][0]==GX_TEX_ST&&(formats[fmt][GX_VA_TEX0][1]==GX_U8||formats[fmt][GX_VA_TEX0][1]==GX_F32)&&!formats[fmt][GX_VA_TEX0][2]));
    require(types[GX_VA_TEX0]<GX_INDEX8||formats[fmt][GX_VA_TEX0][1]==GX_U8);
    stride=12+(types[GX_VA_CLR0]?4:0)+(types[GX_VA_TEX0]==GX_INDEX8?1:types[GX_VA_TEX0]==GX_INDEX16?2:types[GX_VA_TEX0]==GX_DIRECT?(formats[fmt][GX_VA_TEX0][1]==GX_F32?8:2):0);
    count=n;primitive=type;format=fmt;expected=count*stride;cursor=0;require(expected<=sizeof(fifo));
}
static void write_word(uint64_t v,unsigned bytes){require(active&&expected&&cursor+bytes<=expected);for(unsigned i=bytes;i;i--)fifo[cursor++]=v>>((i-1)*8);if(cursor==expected)emit();}
void portGXWrite_u8(u8 v){write_word(v,1);}void portGXWrite_s8(s8 v){write_word((u8)v,1);}
void portGXWrite_u16(u16 v){write_word(v,2);}void portGXWrite_s16(s16 v){write_word((u16)v,2);}
void portGXWrite_u32(u32 v){write_word(v,4);}void portGXWrite_s32(s32 v){write_word((u32)v,4);}
void portGXWrite_u64(u64 v){write_word(v,8);}void portGXWrite_s64(s64 v){write_word((u64)v,8);}
void portGXWrite_f32(f32 v){union{float f;u32 u;}x={.f=v};write_word(x.u,4);}
void portGXWrite_f64(f64 v){union{double f;u64 u;}x={.f=v};write_word(x.u,8);}
