/* Scoped GX boundary for the original offscreen camera and HSD light setup.
 * Light registers persist between materials, just as they do on GX. */
#include <dolphin/gx.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/lobj.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
extern int portMaterialCaptureActive(void);
extern bool portCObjSetCurrentOffscreen(HSD_CObj*);
typedef struct {u32 color[4];float a[3],k[3],position[3],direction[3];} PortLight;
typedef struct {u32 mask,loads,projection_type,camera_mask;float viewport[6];u32 scissor[4];Mtx44 projection;PortLight light[8];} PortRenderContext;
_Static_assert(sizeof(PortRenderContext)==632,"Render context ABI");
static PortRenderContext state;
static int setting_context;
void portRenderContextEnter(void){if(setting_context||portMaterialCaptureActive())abort();setting_context=1;}
void portRenderContextLeave(void){if(!setting_context||portMaterialCaptureActive())abort();setting_context=0;}
static void require(int value){if(!value||(!setting_context&&!portMaterialCaptureActive()))abort();}
const PortRenderContext* portRenderContextState(void){return &state;}
static u32 fog_registers[5];
const u32* portFogState(void){return fog_registers;}
void portFogRegister(u32 value)
{unsigned id=value>>24;if(id<0xEE||id>0xF2)abort();fog_registers[id-0xEE]=value&0xFFFFFF;}
extern void portSdkSetFog(GXFogType,f32,f32,f32,f32,GXColor);
/* Preserve original SDK coefficient quantization. Other equations/range
 * adjustment remain explicit failures until their shader paths are verified. */
void GXSetFog(GXFogType type,f32 start,f32 end,f32 near,f32 far,GXColor color)
{if((type!=GX_FOG_NONE&&type!=GX_FOG_LIN)||!isfinite(start)||!isfinite(end)||!isfinite(near)||!isfinite(far)||far<near||near<0)abort();portSdkSetFog(type,start,end,near,far,color);}
void GXSetFogRangeAdj(GXBool enable,u16 center,GXFogAdjTable* table)
{if(enable)abort();}
void GXSetViewport(f32 x,f32 y,f32 width,f32 height,f32 near,f32 far)
{require(setting_context&&isfinite(x)&&isfinite(y)&&width>0&&height>0&&near>=0&&far<=1);float v[6]={x,y,width,height,near,far};memcpy(state.viewport,v,sizeof(v));state.camera_mask|=1;}
void GXSetScissor(u32 x,u32 y,u32 width,u32 height)
{require(setting_context&&width&&height);u32 s[4]={x,y,width,height};memcpy(state.scissor,s,sizeof(s));state.camera_mask|=2;}
void GXSetProjection(f32 matrix[4][4],GXProjectionType type)
{require(setting_context&&matrix&&(type==GX_PERSPECTIVE||type==GX_ORTHOGRAPHIC));memcpy(state.projection,matrix,sizeof(Mtx44));state.projection_type=type;state.camera_mask|=4;}
void GXLoadLightObjImm(GXLightObj* object,GXLightID id)
{
    require(object&&id&&id<=128&&!(id&(id-1)));unsigned slot=0;while((1u<<slot)!=(u32)id)slot++;
    PortLight* light=&state.light[slot];GXColor color;GXGetLightColor(object,&color);
    light->color[0]=color.r;light->color[1]=color.g;light->color[2]=color.b;light->color[3]=color.a;
    GXGetLightAttnA(object,&light->a[0],&light->a[1],&light->a[2]);
    GXGetLightAttnK(object,&light->k[0],&light->k[1],&light->k[2]);
    GXGetLightPos(object,&light->position[0],&light->position[1],&light->position[2]);
    /* SDK GXGetLightDir negates the stored GX direction. Preserve the actual
     * hardware register values, which the shader consumes directly. */
    GXGetLightDir(object,&light->direction[0],&light->direction[1],&light->direction[2]);
    for(unsigned i=0;i<3;i++)light->direction[i]=-light->direction[i];
    state.mask|=id;state.loads++;
}
void portRenderContextBegin(HSD_CObj* camera,HSD_LObj* lights)
{
    if(setting_context||portMaterialCaptureActive()||!camera||!lights)abort();
    memset(&state,0,sizeof(state));memset(fog_registers,0,sizeof(fog_registers));setting_context=1;
    if(!portCObjSetCurrentOffscreen(camera))abort();
    HSD_LObj_803668EC(lights);HSD_LObjSetupInit(camera);
    if(state.camera_mask!=7)abort();setting_context=0;
}

void GXGetProjectionv(f32* p)
{require(p&&state.camera_mask==7);p[0]=state.projection_type;unsigned column=state.projection_type==GX_PERSPECTIVE?2:3;p[1]=state.projection[0][0];p[2]=state.projection[0][column];p[3]=state.projection[1][1];p[4]=state.projection[1][column];p[5]=state.projection[2][2];p[6]=state.projection[2][3];}
