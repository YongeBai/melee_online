/* Capture original HSD material state at its GX boundary. The scoped native
 * draw backend below submits original callback-selected polygons to WebGL.
 * Unsupported console drawing paths still fail explicitly. */
#include <dolphin/gx.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <sysdolphin/baselib/tev.h>
#include <sysdolphin/baselib/tobj.h>
#include <sysdolphin/baselib/state.h>
#include <sysdolphin/baselib/pobj.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/cobj.h>
#include <sysdolphin/baselib/lobj.h>
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
int portMaterialCaptureActive(void){return capturing;}
static void require(int condition){if(!capturing||!condition){fprintf(stderr,"Invalid native TEV capture\n");abort();}}
void portRequireMaterialCapture(int condition){require(condition);}
void portTextureCaptureReset(void);
void portPixelCaptureReset(void);
void portModelCaptureReset(void);
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

static const PortTevState* capture(HSD_JObj* joint,unsigned index,int polygon,Mtx view,HSD_GObj* owner)
{
    if(capturing||!joint||!union_type_dobj(joint))abort();
    HSD_DObj* display=joint->u.dobj;
    while(index--){if(!display)abort();display=display->next;}
    if(!display||!display->mobj)abort();
    HSD_MObj* material=display->mobj;
    if(HSD_MOBJ_METHOD(material)->setup!=hsdMObj.setup&&(!owner||!owner->user_data)){
        fprintf(stderr,"Custom native material requires its render owner\n");abort();
    }
    HSD_GObj* previous_owner=HSD_GObj_804D7814;HSD_GObj_804D7814=owner;
    HSD_JObj* previous_joint=HSD_JObjGetCurrent();HSD_JObjRef(previous_joint);HSD_JObjSetCurrent(joint);
    memset(&state,0,sizeof(state));capturing=1;
    portTextureCaptureReset();
    portPixelCaptureReset();
    portModelCaptureReset();
    Mtx model_view;MtxPtr active_view=view;
    if(!active_view&&HSD_CObjGetCurrent())active_view=HSD_CObjGetViewingMtxPtrDirect(HSD_CObjGetCurrent());
    if(active_view){
        HSD_JObjSetupMatrix(joint);PSMTXConcat(active_view,joint->mtx,model_view);
        if((joint->flags&JOBJ_SPECULAR)&&!(material->rendermode&RENDER_SHADOW))HSD_LObjSetupSpecularInit(model_view);
    }
    /* Force a complete snapshot rather than relying on previous draw caches. */
    HSD_StateInvalidate(HSD_STATE_COLOR_CHANNEL|HSD_STATE_RENDER_MODE|HSD_STATE_TEV_REGISTER);
    HSD_MObjSetCurrent(material);
    HSD_MOBJ_METHOD(material)->setup(material,material->rendermode);
    if(polygon>=0) {
        HSD_PObj* p=display->pobj;while(polygon--){if(!p)abort();p=p->next;}if(!p||!view)abort();
        HSD_PObjClearMtxMark(NULL,0);
        HSD_POBJ_METHOD(p)->setup_mtx(p,view,model_view,material->rendermode);
        HSD_PObjClearMtxMark(NULL,0);
    }
    HSD_MOBJ_METHOD(material)->unset(material,material->rendermode);
    HSD_MObjSetCurrent(NULL);
    HSD_JObjSetCurrent(previous_joint);HSD_JObjUnref(previous_joint);HSD_GObj_804D7814=previous_owner;
    capturing=0;return &state;
}
const PortTevState* portMaterialTev(HSD_JObj* joint,unsigned index,HSD_GObj* owner){return capture(joint,index,-1,NULL,owner);}
const PortTevState* portMaterialDrawState(HSD_JObj* joint,unsigned index,unsigned polygon,Mtx view,HSD_GObj* owner)
{if(polygon>4096)abort();return capture(joint,index,(int)polygon,view,owner);}

/* Original traversal/callback integration. Only the material/primitive backend
 * methods are scoped to host submission; joint selection, display passes,
 * billboards, fighter flags and owner callbacks remain original C. */
#include <emscripten.h>
static int drawing;
static unsigned immediate_kind;
unsigned portImmediateKind(void){return immediate_kind;}
/* Geometry is decoded into explicit WebGL VAOs; the host binds a complete VAO
 * for every polygon. Clearing GX's FIFO descriptor cannot leave stale host
 * attributes. Scoped particle callbacks use the immediate descriptor instead. */
extern int portImmediateActive(void);
extern void portImmediateClear(void),portImmediateBegin(void),portImmediateEnd(void);
void GXClearVtxDesc(void){if(portImmediateActive()){portImmediateClear();return;}if(!drawing||capturing)abort();}
const void* portImmediateTevState(void){require(portImmediateActive());return &state;}
void portNativeDrawParticles(HSD_GObj* owner,unsigned pass)
{
    extern void efLib_render_callback(HSD_GObj*,int);
    extern void portRenderContextEnter(void),portRenderContextLeave(void);
    if(drawing||capturing||!owner||owner->render_cb!=efLib_render_callback||pass>2)abort();
    portRenderContextEnter();drawing=capturing=1;memset(&state,0,sizeof(state));
    portTextureCaptureReset();portModelCaptureReset();immediate_kind=0;portImmediateBegin();
    HSD_GObj* previous=HSD_GObj_804D7814;HSD_GObj_804D7814=owner;
    owner->render_cb(owner,pass);
    HSD_GObj_804D7814=previous;portImmediateEnd();drawing=capturing=0;portRenderContextLeave();
}
// Sword trails are a separate original immediate draw inside a fighter pass.
// Keep their complete native arithmetic; only scope the GX receiver.
void ftCo_800C2600(HSD_GObj* owner,u32 pass)
{
    extern void port_unlinked_ftCo_800C2600(HSD_GObj*,u32);
    if(!drawing||capturing||!owner||owner!=HSD_GObj_804D7814||pass>2)abort();
    capturing=1;memset(&state,0,sizeof(state));
    portTextureCaptureReset();portModelCaptureReset();immediate_kind=1;portImmediateBegin();
    port_unlinked_ftCo_800C2600(owner,pass);
    portImmediateEnd();capturing=0;
}
static HSD_DObj* drawing_display;
static unsigned emitted;
EM_JS(void,portEmitDraw,(unsigned owner,unsigned joint,unsigned display,unsigned polygon,unsigned tev,unsigned positions,unsigned position_count,unsigned normals,unsigned normal_count),{
    if(typeof Module['onNativeDraw']!=='function')throw Error('Native draw receiver is absent');
    Module['onNativeDraw'](owner,joint,display,polygon,tev,positions,position_count,normals,normal_count);
});
static void native_polygon(HSD_PObj* polygon,Mtx view,Mtx position,u32 mode)
{
    require(drawing&&drawing_display&&polygon&&view&&position);
    if((polygon->flags&(POBJ_CULLFRONT|POBJ_CULLBACK))==(POBJ_CULLFRONT|POBJ_CULLBACK))return;
    portModelCaptureReset();HSD_PObjClearMtxMark(NULL,0);
    HSD_POBJ_METHOD(polygon)->setup_mtx(polygon,view,position,mode);
    float (*vertices)[3]=NULL,(*normals)[3]=NULL;unsigned vn=0,nn=0;
    if(pobj_type(polygon)==POBJ_SHAPEANIM){
        extern void portShapeEvaluate(HSD_PObj*,float(**)[3],float(**)[3]);
        HSD_ShapeSet* s=polygon->u.shape_set;
        if(!s||!s->vertex_desc||(s->normal_desc&&s->normal_desc->attr!=GX_VA_NRM))abort();
        portShapeEvaluate(polygon,&vertices,&normals);vn=s->nb_vertex_index;nn=s->nb_normal_index;
    }
    portEmitDraw((unsigned)HSD_GObj_804D7814,(unsigned)HSD_JObjGetCurrent(),(unsigned)drawing_display,(unsigned)polygon,(unsigned)&state,(unsigned)vertices,vn,(unsigned)normals,nn);
    emitted++;
}
static void native_display(HSD_DObj* display,Mtx view,Mtx position,u32 mode)
{
    if(!drawing||capturing||drawing_display||!display||!display->mobj||(mode&0x04000000))abort();
    capturing=1;drawing_display=display;memset(&state,0,sizeof(state));
    portTextureCaptureReset();portPixelCaptureReset();portModelCaptureReset();
    HSD_StateInvalidate(HSD_STATE_COLOR_CHANNEL|HSD_STATE_RENDER_MODE|HSD_STATE_TEV_REGISTER);
    HSD_DObjDisp(display,view,position,mode);
    drawing_display=NULL;capturing=0;
}
static HSD_DObjInfo* draw_classes[32];static unsigned draw_class_count;
static HSD_PObjInfo* polygon_classes[32];static unsigned polygon_class_count;
static void bind_backend(HSD_JObj* joint)
{
    if(!joint)return;
    if(union_type_dobj(joint))for(HSD_DObj* d=joint->u.dobj;d;d=d->next){
        HSD_DObjInfo* dc=HSD_DOBJ_METHOD(d);
        if(dc->disp!=native_display){if(dc->disp!=HSD_DObjDisp||draw_class_count==32)abort();draw_classes[draw_class_count++]=dc;dc->disp=native_display;}
        for(HSD_PObj* p=d->pobj;p;p=p->next){HSD_PObjInfo* pc=HSD_POBJ_METHOD(p);
            if(pc->disp!=native_polygon){if(pc->disp!=HSD_PObjDisp||polygon_class_count==32)abort();polygon_classes[polygon_class_count++]=pc;pc->disp=native_polygon;}
        }
    }
    if(!(joint->flags&JOBJ_INSTANCE))for(HSD_JObj* child=joint->child;child;child=child->next)bind_backend(child);
    else if(joint->child)bind_backend(joint->child);
}
unsigned portNativeDrawObjectExtra(HSD_GObj* owner,unsigned pass,unsigned callback,HSD_JObj* extra)
{
    if(drawing||capturing||!owner||!owner->hsd_obj||pass>2||callback>1||(callback&&!owner->render_cb))abort();
    extern void portRenderContextEnter(void),portRenderContextLeave(void);
    portRenderContextEnter();drawing=1;emitted=0;draw_class_count=polygon_class_count=0;
    bind_backend(owner->hsd_obj);bind_backend(extra);
    HSD_GObj* previous=HSD_GObj_804D7814;HSD_GObj_804D7814=owner;
    if(callback)owner->render_cb(owner,pass);else HSD_GObj_JObjCallback(owner,pass);
    HSD_GObj_804D7814=previous;
    for(unsigned i=0;i<draw_class_count;i++)draw_classes[i]->disp=HSD_DObjDisp;
    for(unsigned i=0;i<polygon_class_count;i++)polygon_classes[i]->disp=HSD_PObjDisp;
    drawing=0;portRenderContextLeave();return emitted;
}
unsigned portNativeDrawObject(HSD_GObj* owner,unsigned pass,unsigned callback)
{
    return portNativeDrawObjectExtra(owner,pass,callback,NULL);
}

/* SIS retains original command interpretation, line layout, kerning and glyph
 * drawing. Only its GX device submission uses the existing immediate backend. */
void portNativeDrawText(HSD_GObj* owner,unsigned pass)
{
    extern void HSD_SisLib_803A84BC(HSD_GObj*,int);
    extern void portRenderContextEnter(void),portRenderContextLeave(void);
    if(drawing||capturing||!owner||owner->render_cb!=HSD_SisLib_803A84BC||pass>2)abort();
    if(pass!=2)return;
    portRenderContextEnter();drawing=capturing=1;memset(&state,0,sizeof(state));
    portTextureCaptureReset();portModelCaptureReset();
    immediate_kind=2;portImmediateBegin();HSD_StateInvalidate(-1);
    HSD_GObj* previous=HSD_GObj_804D7814;HSD_GObj_804D7814=owner;
    owner->render_cb(owner,pass);
    HSD_GObj_804D7814=previous;portImmediateEnd();drawing=capturing=0;portRenderContextLeave();
}
const void* portTextureDefaultState(unsigned width,unsigned height,unsigned format,unsigned mip)
{
    extern const void* portMaterialTextureState(void);
    static unsigned char dummy[32] __attribute__((aligned(32)));
    if(drawing||capturing||width>1024||height>1024||mip>1)abort();
    GXTexObj object;capturing=1;portTextureCaptureReset();
    GXInitTexObj(&object,dummy,width,height,format,GX_CLAMP,GX_CLAMP,mip);
    GXLoadTexObj(&object,GX_TEXMAP0);capturing=0;return portMaterialTextureState();
}
unsigned portMaterialPolygon(HSD_JObj* joint,unsigned display,unsigned polygon)
{
    if(!joint||!union_type_dobj(joint))abort();HSD_DObj* d=joint->u.dobj;
    while(display--&&d)d=d->next;if(!d)abort();HSD_PObj* p=d->pobj;
    while(polygon--&&p)p=p->next;if(!p)abort();return (unsigned)p;
}
unsigned portMaterialPolygonDescriptor(HSD_JObj* joint,HSD_PObjDesc* descriptor)
{
    if(!joint||!descriptor||!union_type_dobj(joint))abort();
    HSD_PObj* found=NULL;unsigned count=0;
    // Copy costumes append DObjs to existing fighter bones. Their display
    // indices depend on the original body, but immutable source geometry
    // pointers survive HSD_PObjLoad. Reject missing or ambiguous bindings.
    for(HSD_DObj* d=joint->u.dobj;d;d=d->next)for(HSD_PObj* p=d->pobj;p;p=p->next){
        if(++count>4096)abort();
        if(p->verts==descriptor->verts&&p->display==descriptor->display&&p->n_display==descriptor->n_display){if(found)abort();found=p;}
    }
    if(!found)abort();return (unsigned)found;
}
