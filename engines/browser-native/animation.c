#include <sysdolphin/baselib/fobj.h>
#include <sysdolphin/baselib/aobj.h>
#include <stdlib.h>

static int initialized;
void portAnimationInit(void)
{
    if (!initialized) { HSD_FObjInitAllocData(); initialized=1; }
}
typedef struct TrackOutput { float value; unsigned updates; } TrackOutput;
static void output_value(void* object, int type, HSD_ObjData* value)
{
    TrackOutput* out=object;
    (void)type;
    out->value=value->fv;
    ++out->updates;
}
HSD_FObj* portAnimationCreate(unsigned char* data, unsigned length,
    int start, unsigned type, unsigned frac_value, unsigned frac_slope)
{
    HSD_FObjDesc desc = {0};
    portAnimationInit();
    desc.length=length;desc.startframe=start;desc.type=type;
    desc.frac_value=frac_value;desc.frac_slope=frac_slope;desc.ad=data;
    return HSD_FObjLoadDesc(&desc);
}
void portAnimationRun(HSD_FObj* track, unsigned frames, float* output)
{
    if (frames>100001)abort();
    TrackOutput state={0};
    HSD_FObjReqAnimAll(track,0);
    for(unsigned i=0;i<frames;i++) {
        state.updates=0;
        HSD_FObjInterpretAnim(track,&state,output_value,i==0?0:1);
        output[i*2]=state.value;
        output[i*2+1]=state.updates;
    }
}
void portAnimationDestroy(HSD_FObj* track) { HSD_FObjRemoveAll(track); }

void portAnimationTimeline(HSD_FObj* track, float end, unsigned loop,
                           unsigned frames, float* output)
{
    if(frames>100001 || end<0)abort();
    HSD_AObj animation={0};
    TrackOutput state={0};
    animation.fobj=track;
    animation.framerate=1;
    animation.end_frame=end;
    animation.flags=loop?AOBJ_LOOP:0;
    HSD_AObjReqAnim(&animation,0);
    for(unsigned i=0;i<frames;i++) {
        state.updates=0;
        HSD_AObjInterpretAnim(&animation,&state,output_value);
        output[i*4]=state.value;
        output[i*4+1]=state.updates;
        output[i*4+2]=animation.curr_frame;
        output[i*4+3]=(animation.flags&AOBJ_NO_ANIM)?1:0;
    }
}
