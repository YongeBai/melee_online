#include <melee/ef/efasync.h>
#include <melee/ef/efdata.h>
#include <melee/ef/eflib.h>
#include <melee/ef/types.h>
#include <melee/cm/camera.h>
#include <melee/sc/types.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjobject.h>
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/particle.h>
#include <sysdolphin/baselib/psstructs.h>
#include <stddef.h>
#include <stdlib.h>
#include <math.h>
extern EF_DAT_Entry efAsync_DatEntries[51];
extern HSD_PSFormGroup** psFormGroupArray[65];
extern int portSceneInitialize(void);
extern HSD_Particle* hsd_804D0908[16];
_Static_assert(sizeof(EF_EffectDesc)==20&&sizeof(StaticModelDesc)==16,"Effect descriptor ABI");
_Static_assert(offsetof(HSD_PSCmdList,cmdList)==60&&offsetof(HSD_PSTexGroup,texTable)==24,"Particle bank ABI");
void portEffectsInitialize(void) { static int ready;if(!ready){if(portSceneInitialize()<0)abort();efLib_Init();ready=1;} }
/* Enumerate original model-effect owners. Particle managers have no joint and
 * remain a separate rendering boundary; never classify them as model effects. */
unsigned portEffectModels(unsigned* output,unsigned capacity)
{
    unsigned count=0;
    for(unsigned link=11;link<=12;link++)for(HSD_GObj* g=HSD_GObjPLinkHead[link];g;g=g->next){
        if(g->render_cb!=HSD_GObj_JObjCallback)continue;
        if(g->classifier!=HSD_GOBJ_CLASS_EFFECT||g->obj_kind!=HSD_GObj_JObjKind||!g->hsd_obj||count>=capacity)abort();
        HSD_JObj* joint=g->hsd_obj;
        output[count*3]=(unsigned)g;output[count*3+1]=(unsigned)joint;output[count*3+2]=joint->id;count++;
    }
    return count;
}
// Match startup uses 70 original camera subjects. No projection/camera offsets.
void portMatchCameraInitialize(void) { static int ready;if(!ready){Camera_Init(70);Camera_Create();ready=1;} }
void* portEffectsBankData(unsigned bank) { if(bank>=50)abort();return efAsync_DatEntries[bank].data; }
void* portEffectsLoad(void) { efAsync_LoadSync(4);return efAsync_DatEntries[4].data; }
void* portCommonEffectsLoad(void) { efAsync_LoadSync(0);return efAsync_DatEntries[0].data; }
double portEffectsRead(unsigned field,unsigned index) {
    switch(field){
      case 0:return (uintptr_t)efAsync_DatEntries[4].data;
      case 1:return psCmdListArray[4];
      case 2:return ((s32*)psFormGroupArray)[4];
      case 3:if(index>=17||!ptclref_804D0E5C[4])abort();return (uintptr_t)ptclref_804D0E5C[4][4000+index];
      case 4:if(index>=7||!psTexGroupArray[4])abort();return (uintptr_t)psTexGroupArray[4][index];
      case 5:return efLib_AllocData.used;
      case 6:return hsd_804D78E0;
      case 7:return hsd_804D78DE;
      case 8:{unsigned n=0;for(unsigned i=0;i<16;i++)for(HSD_Particle* p=hsd_804D0908[i];p;p=p->next){
          if(++n>65535||!isfinite(p->pos.x)||!isfinite(p->pos.y)||!isfinite(p->pos.z)||
             !isfinite(p->vel.x)||!isfinite(p->vel.y)||!isfinite(p->vel.z)||!isfinite(p->size))abort();
        }return n;}
      case 9:{if(index>=65)abort();unsigned n=0;for(unsigned i=0;i<16;i++)for(HSD_Particle* p=hsd_804D0908[i];p;p=p->next)if(p->bank==index)n++;return n;}
      default:abort();
    }
}
/* Test attachment owner with no archive IDs shared with the spawned models. */
HSD_GObj* portEffectParentCreate(void) {
    HSD_GObj* object=GObj_Create(0,8,0);
    HSD_JObj* joint=HSD_JObjAlloc();
    if(!object||!joint)abort();
    HSD_GObjObject_80390A70(object,HSD_GObj_JObjKind,joint);
    return object;
}
HSD_GObj* portEffectBankCreate(unsigned bank,unsigned index,HSD_GObj* parent) {
    if((bank!=0&&bank!=4)||index>=(bank==0?47:6)||!parent||!efAsync_DatEntries[bank].data||efLib_AnimCount)abort();
    efLib_LoadKind=EF_LOADKIND_SYNC;
    EF_Effect* effect=efLib_Create(bank*1000+index,parent);
    // Finish the same deferred initial animation queue used by efSync_Spawn.
    while(efLib_AnimCount)HSD_JObjAnimAll(((HSD_JObj**)efLib_AnimQueue)[--efLib_AnimCount]);
    return effect?effect->gobj:NULL;
}
HSD_GObj* portEffectCreate(unsigned index,HSD_GObj* parent) { return portEffectBankCreate(4,index,parent); }
void portEffectsDestroyOwner(HSD_GObj* parent) { if(!parent)abort();efLib_DestroyAll(parent); }
unsigned portEffectLife(HSD_GObj* object) { if(!object||!object->user_data)abort();return ((EF_Effect*)object->user_data)->lifetime; }
void portEffectStep(HSD_GObj* object) { efLib_Update(object); }
void portEffectsParticleStep(void) {
    efLib_particles_proc_main(NULL);
    efLib_particles_proc_aux(NULL);
}
