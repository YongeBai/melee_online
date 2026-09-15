/* Native browser ownership for the original HSD heap and object scheduler. */
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjproc.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <sysdolphin/baselib/initialize.h>
#include <sysdolphin/baselib/memory.h>
#include <sysdolphin/baselib/objalloc.h>
#include <dolphin/os/OSAlloc.h>
#include <stdlib.h>
#include <string.h>

static void* arena;
static unsigned frames;
static u64 paused_links;
static unsigned trace[256];
static unsigned trace_count;
static HSD_GObj* objects[8];

static void unsupported_destructor(HSD_Obj* object)
{
    (void)object;
    /* Until the real renderer owns these classes, using one is a hard error. */
    abort();
}
static GObjFunc destructors[4] = {
    unsupported_destructor, unsupported_destructor,
    unsupported_destructor, unsupported_destructor
};

static void* zero_array(unsigned count, unsigned size)
{
    void* p = HSD_MemAlloc(count * size);
    memset(p, 0, count * size);
    return p;
}

int portRuntimeInit(void)
{
    void* start;
    int heap;
    if (arena) return 0;
    arena = aligned_alloc(32, 32 * 1024 * 1024);
    if (!arena) return -1;
    start = OSInitAlloc(arena, (char*)arena + 32 * 1024 * 1024, 1);
    heap = OSCreateHeap(start, (char*)arena + 32 * 1024 * 1024);
    if (heap < 0) abort();
    OSSetCurrentHeap(heap);
    HSD_SetHeap(heap);
    HSD_ObjSetHeap(32 * 1024 * 1024, NULL);
    /* Same list dimensions as HSD_GObjInit. Graphics class destructors are
     * registered separately to avoid pulling GX hardware into simulation. */
    /* gmscene.c raises the library default to priority 0x18 for Melee. */
    HSD_GObjLibInitData = (HSD_GObjLibInitDataType){63, 63, 24, NULL, &paused_links};
    HSD_GObjPLinkHead = zero_array(64, sizeof(HSD_GObj*));
    plinklow_gobjs = zero_array(64, sizeof(HSD_GObj*));
    HSD_GObjGXLinkHead = zero_array(65, sizeof(HSD_GObj*));
    HSD_GObj_804D7820 = zero_array(65, sizeof(HSD_GObj*));
    HSD_GObj_GObjProcHead = zero_array(25, sizeof(HSD_GObjProc*));
    HSD_GObj_ProcList = zero_array(25 * 64, sizeof(HSD_GObjProc*));
    HSD_ObjAllocInit(&gobj_alloc_data, sizeof(HSD_GObj), 4);
    HSD_ObjAllocInit(&gobjproc_alloc_data, sizeof(HSD_GObjProc), 4);
    HSD_GObj_804D7810 = destructors;
    HSD_GObj_CameraKind = 0;
    HSD_GObj_LightKind = 1;
    HSD_GObj_JObjKind = 2;
    HSD_GObj_FogKind = 3;
    HSD_GObj_804D783C = 0;
    HSD_GObj_CurrentInvokedProcGObj = NULL;
    HSD_GObj_CurrentInvokedProc = NULL;
    HSD_GObj_DelayedProcInfo.flags = 0;
    HSD_GObj_804D7818 = NULL;
    HSD_GObj_804D7814 = NULL;
    return 1;
}

unsigned portRuntimeStep(void)
{
    if (!arena) abort();
    HSD_GObj_RunProcs();
    return ++frames;
}

static void record(HSD_GObj* object)
{
    if (trace_count >= 256) abort();
    trace[trace_count++] = object->classifier;
}
static void record_and_remove(HSD_GObj* object)
{
    record(object);
    objects[object->classifier - 1] = NULL;
    HSD_GObjFree(object);
}
int portRuntimeProbeCreate(unsigned id, unsigned link, unsigned priority, unsigned proc_priority, unsigned remove)
{
    if (!arena || id < 1 || id > 8 || objects[id-1] || link > 63 || priority > 255 || proc_priority > 24) return -1;
    HSD_GObj* object = GObj_Create(id, link, priority);
    if (!object) return -2;
    objects[id-1] = object;
    if (!HSD_GObj_SetupProc(object, remove ? record_and_remove : record, proc_priority)) abort();
    return 0;
}
void portRuntimeProbePause(unsigned link, unsigned paused)
{
    if (link > 63) abort();
    if (paused) paused_links |= (u64)1 << link;
    else paused_links &= ~((u64)1 << link);
}
int portRuntimeProbeRead(unsigned index)
{
    return index < trace_count ? (int)trace[index] : -1;
}
unsigned portRuntimeProbeReset(void)
{
    unsigned count = trace_count;
    trace_count = 0;
    return count;
}
void portRuntimeProbeClear(void)
{
    unsigned i;
    for (i = 0; i < 8; ++i) if (objects[i]) {
        HSD_GObjFree(objects[i]);
        objects[i] = NULL;
    }
    paused_links = 0;
    trace_count = 0;
}
int portRuntimeHeapFree(void) { return OSCheckHeap(HSD_GetHeap()); }
int portRuntimeObjectsUsed(void) { return gobj_alloc_data.used; }
int portRuntimeProcsUsed(void) { return gobjproc_alloc_data.used; }
