/* Actual HSD object/class loading and lifetime, separate from the GPU diagnostic
 * pose owner. The scene bring-up build deliberately aborts at every unresolved
 * GX entry point; this is not a rendering-capable or playable target yet.
 */
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/dobj.h>
#include <sysdolphin/baselib/mobj.h>
#include <sysdolphin/baselib/id.h>
#include <sysdolphin/baselib/robj.h>
#include <sysdolphin/baselib/mtx.h>
#include <sysdolphin/baselib/list.h>
#include <sysdolphin/baselib/aobj.h>
#include <sysdolphin/baselib/fobj.h>
#include <sysdolphin/baselib/shadow.h>
#include <melee/lb/lbanim.h>
#include <melee/ft/forward.h>
#include <sysdolphin/baselib/gobjproc.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjobject.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <stdlib.h>
#include <string.h>

_Static_assert(sizeof(HSD_Joint)==64,"Joint descriptor ABI");
_Static_assert(sizeof(HSD_DObjDesc)==16,"Display descriptor ABI");
_Static_assert(sizeof(HSD_PObjDesc)==24,"Polygon descriptor ABI");
_Static_assert(sizeof(HSD_VtxDescList)==24,"Vertex descriptor ABI");
_Static_assert(sizeof(HSD_MObjDesc)==24,"Material object descriptor ABI");
_Static_assert(sizeof(HSD_TObjDesc)==92,"Texture descriptor ABI");
_Static_assert(sizeof(HSD_TObjTevDesc)==32,"Texture TEV descriptor ABI");
_Static_assert(sizeof(HSD_EnvelopeDesc)==8,"Envelope descriptor ABI");
_Static_assert(sizeof(FigaTree)==20,"FigaTree ABI");
_Static_assert(sizeof(FigaTrack)==12,"FigaTrack ABI");
_Static_assert(sizeof(HSD_AnimJoint)==20,"Animation joint descriptor ABI");
_Static_assert(sizeof(HSD_AObjDesc)==16,"Animation object descriptor ABI");
_Static_assert(sizeof(HSD_FObjDesc)==20,"Function object descriptor ABI");
static int initialized;
extern int portRuntimeInit(void);
extern void portAnimationInit(void);
extern void portRuntimeSetJointDestructor(GObjFunc);
static void destroy_joint_object(HSD_Obj* object)
{
    HSD_JObjRemoveAll((HSD_JObj*)object);
}
int portSceneInitialize(void)
{
    if(!initialized) {
        if(portRuntimeInit()<0)return -1;
        HSD_ListInitAllocData();HSD_IDInitAllocData();HSD_IDSetup();
        HSD_VecInitAllocData();HSD_MtxInitAllocData();HSD_RObjInitAllocData();
        HSD_AObjInitAllocData();HSD_ShadowInitAllocData();portAnimationInit();
        portRuntimeSetJointDestructor(destroy_joint_object);
        initialized=1;
    }
    return 0;
}
HSD_JObj* portSceneLoad(HSD_Joint* descriptor)
{
    if(portSceneInitialize()<0)return NULL;
    return HSD_JObjLoadJoint(descriptor);
}
void portSceneDestroy(HSD_JObj* root) { HSD_JObjRemoveAll(root); }
int portSceneAnimation(unsigned count,HSD_JObj** nodes,FigaTree* tree)
{
    FigaTrack* track=tree->tracks;
    for(unsigned i=0;i<count;i++) {
        int tracks=tree->nodes[i];if(tracks<0)return -1;
        lbAnim_8001E6D8(nodes[i],tree,track,tracks);track+=tracks;
    }
    return tree->nodes[count]==-1?0:-2;
}
void portSceneRequest(HSD_JObj* root) { HSD_JObjReqAnimAll(root,0); }
void portSceneAnimate(HSD_JObj* root) { HSD_JObjAnimAll(root); }
unsigned portSceneCollect(HSD_JObj* root,HSD_JObj** nodes,unsigned capacity)
{
    unsigned count=0;
    for(HSD_JObj* j=root;j;j=j->next) {
        if(count>=capacity)abort();nodes[count++]=j;
        if(j->child&&!(j->flags&JOBJ_INSTANCE))count+=portSceneCollect(j->child,nodes+count,capacity-count);
    }
    return count;
}
void portSceneMatrices(unsigned count,HSD_JObj** nodes,float* output)
{
    for(unsigned i=0;i<count;i++) {
        HSD_JObjSetupMatrix(nodes[i]);memcpy(output+i*12,nodes[i]->mtx,48);
    }
}
void portSceneFlags(unsigned count,HSD_JObj** nodes,unsigned* output)
{
    for(unsigned i=0;i<count;i++)output[i]=nodes[i]->flags;
}
void portSceneMeshVisibility(unsigned count,HSD_JObj** nodes,const u16* indices,unsigned* output)
{
    for(unsigned i=0;i<count;i++) {
        HSD_JObj* joint=nodes[indices[i*2]];
        if(!joint||!union_type_dobj(joint))abort();
        HSD_DObj* object=joint->u.dobj;
        for(unsigned j=0;j<indices[i*2+1];j++){if(!object)abort();object=object->next;}
        if(!object)abort();output[i]=!(object->flags&DOBJ_HIDDEN);
    }
}
// Weighted values are compared with the independently decoded source archive.
// Runtime joint identities verify HSD envelope resolution, not just object counts.
double portSceneMetric(unsigned count,HSD_JObj** nodes,unsigned metric)
{
    double value=0;
    for(unsigned i=0;i<count;i++) {
        HSD_JObj* j=nodes[i];
        if(metric==0)value+=j->rotate.x+2.0*j->rotate.y+3.0*j->rotate.z+
            4.0*j->scale.x+5.0*j->scale.y+6.0*j->scale.z+
            7.0*j->translate.x+8.0*j->translate.y+9.0*j->translate.z;
        if(metric==1&&j->envelopemtx)for(int r=0;r<3;r++)for(int c=0;c<4;c++)value+=(r*4+c+1.0)*j->envelopemtx[r][c];
        if(metric==2&&HSD_IDGetDataFromTable(NULL,j->id,NULL)!=j)abort();
        for(HSD_DObj* d=union_type_dobj(j)?j->u.dobj:NULL;d;d=d->next) {
            if(metric==3)value++;
            if(metric==4)value+=d->mobj->mat->alpha+2.0*d->mobj->mat->shininess;
            for(HSD_TObj* t=d->mobj->tobj;t;t=t->next)if(metric==5)value+=t->imagedesc->width+2.0*t->imagedesc->height+3.0*t->imagedesc->format;
            for(HSD_PObj* p=d->pobj;p;p=p->next) {
                if(metric==6)value++;
                if(pobj_type(p)==POBJ_ENVELOPE)for(HSD_SList* l=p->u.envelope_list;l;l=l->next)
                    for(HSD_Envelope* e=l->data;e;e=e->next) {
                        if(metric==7) {
                            /* Descriptor IDs are reused when two fighters share
                             * a costume. Runtime envelopes must reference this
                             * instance, not the loader's most recent ID entry. */
                            unsigned found=0;for(unsigned k=0;k<count;k++)if(nodes[k]==e->jobj){found=1;break;}
                            if(!found)abort();value+=e->weight;
                        }
                    }
            }
        }
    }
    return value;
}
unsigned portSceneLiveJoints(void) { return HSD_CLASS_INFO(&hsdJObj)->head.nb_exist; }
unsigned portSceneLiveMetric(unsigned field)
{
    switch(field){case 0:return HSD_CLASS_INFO(&hsdJObj)->head.nb_exist;case 1:return HSD_CLASS_INFO(&hsdDObj)->head.nb_exist;
    case 2:return HSD_CLASS_INFO(&hsdPObj)->head.nb_exist;case 3:return HSD_CLASS_INFO(&hsdMObj)->head.nb_exist;case 4:return HSD_CLASS_INFO(&hsdTObj)->head.nb_exist;
    case 5:return HSD_AObjGetAllocData()->used;case 6:return HSD_IDGetAllocData()->used;case 7:return HSD_VecGetAllocData()->used;
    case 8:return HSD_MtxGetAllocData()->used;case 9:return HSD_FObjGetAllocData()->used;default:abort();}
}
unsigned portSceneLiveObjects(void)
{
    return HSD_CLASS_INFO(&hsdJObj)->head.nb_exist+HSD_CLASS_INFO(&hsdDObj)->head.nb_exist+
        HSD_CLASS_INFO(&hsdPObj)->head.nb_exist+HSD_CLASS_INFO(&hsdMObj)->head.nb_exist+
        HSD_CLASS_INFO(&hsdTObj)->head.nb_exist+HSD_AObjGetAllocData()->used+
        HSD_IDGetAllocData()->used+HSD_VecGetAllocData()->used+HSD_MtxGetAllocData()->used;
}

/* Real GObj ownership used by fighters. User data and fighter callbacks are
 * attached by Fighter_Create later; this verifies the graphics-object lifetime. */
HSD_GObj* portSceneObjectCreate(HSD_Joint* descriptor)
{
    HSD_JObj* root=portSceneLoad(descriptor);if(!root)return NULL;
    HSD_GObj* object=GObj_Create(HSD_GOBJ_CLASS_FIGHTER,8,0);
    if(!object){HSD_JObjRemoveAll(root);return NULL;}
    HSD_GObjObject_80390A70(object,HSD_GObj_JObjKind,root);
    return object;
}
HSD_JObj* portSceneObjectRoot(HSD_GObj* object)
{
    if(!object||object->obj_kind!=HSD_GObj_JObjKind)abort();
    return object->hsd_obj;
}
void portSceneObjectFree(HSD_GObj* object)
{
    if(!object||object->obj_kind!=HSD_GObj_JObjKind)abort();
    HSD_GObjFree(object);
}

void portSceneObjectDeleteNextStep(HSD_GObj* object)
{
    if(!object||object->obj_kind!=HSD_GObj_JObjKind)abort();
    if(!HSD_GObj_SetupProc(object,portSceneObjectFree,0))abort();
}

/* Shared accessory animation uses native HSD descriptors, not FigaTree. */
void portSceneJointAnimation(HSD_JObj* root,HSD_AnimJoint* animation)
{
    HSD_JObjAddAnimAll(root,animation,NULL,NULL);
}

/* Keep the C aggregate argument inside C at the JS/WASM boundary. */
void portLightColor(GXLightObj* light,unsigned r,unsigned g,unsigned b,unsigned a)
{
    GXColor color={(u8)r,(u8)g,(u8)b,(u8)a};GXInitLightColor(light,color);
}

/* WASM linear memory is coherent: rewritten GX command bytes are read from
 * the same buffer by the browser renderer. There is no GameCube data cache to
 * flush, and this is not a GPU upload or synchronization operation. */
void DCFlushRange(void* address,u32 length)
{
    if(length&&!address)abort();
    __asm__ __volatile__("" ::: "memory");
}
