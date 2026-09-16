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
static void require(int value){if(!value||(!setting_context&&!portMaterialCaptureActive()))abort();}
const PortRenderContext* portRenderContextState(void){return &state;}
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
    memset(&state,0,sizeof(state));setting_context=1;
    if(!portCObjSetCurrentOffscreen(camera))abort();
    HSD_LObj_803668EC(lights);HSD_LObjSetupInit(camera);
    if(state.camera_mask!=7)abort();setting_context=0;
}
