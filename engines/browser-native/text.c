/* Original SIS lifecycle exposed to the menu host. Text ownership and rendering
 * remain HSD GObjs; callers render these in the native GX link order. */
#include <sysdolphin/baselib/sislib.h>
#include <sysdolphin/baselib/gobj.h>
#include <sysdolphin/baselib/gobjplink.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
static int active,context;
void portTextInitialize(void)
{
    if(active)abort();HSD_GObj* camera=NULL;
    for(HSD_GObj* g=HSD_GObjPLinkHead[3];g;g=g->next)if(g->obj_kind==HSD_GObj_CameraKind){if(camera)abort();camera=g;}
    if(!camera)abort();
    HSD_SisLib_803A6048(0x10000);
    HSD_SisLib_803A62A0(0,"SdSlChr.usd","SIS_SelCharData");
    context=HSD_SisLib_803A611C(0,camera,7,8,0x80,1,0x80,0);active=1;
}
HSD_Text* portTextCreate(unsigned index,float x,float y,float z,float scale,float width)
{
    if(!active||index<2||index>=87||!isfinite(x)||!isfinite(y)||!isfinite(z)||!isfinite(scale)||!isfinite(width)||scale<=0||width<=0)abort();
    HSD_Text* t=HSD_SisLib_803A5ACC(0,context,x,y,z,width,480);
    if(!t)abort();t->font_size.x=t->font_size.y=scale;
    HSD_SisLib_803A6368(t,index);return t;
}
HSD_Text* portTextCreateString(const char* string,float x,float y,float z,float scale)
{
    if(!active||!string||!isfinite(x)||!isfinite(y)||!isfinite(z)||!isfinite(scale)||scale<=0)abort();
    /* The original formatting/encoding scratch buffers are 128 bytes. Limit
     * this host helper to short supported ASCII (at most 121 encoded bytes,
     * including the worst alternating spacing commands and terminator). Native
     * menu callers keep their original strings and code paths. */
    size_t length=strnlen(string,25);if(length>24)abort();
    for(size_t i=0;i<length;i++){unsigned char c=string[i];if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||strchr(" \"',-.:",c)))abort();}
    HSD_Text* t=HSD_SisLib_803A6754(0,context);if(!t)abort();
    t->pos_x=x;t->pos_y=y;t->pos_z=z;t->font_size.x=t->font_size.y=scale;
    HSD_SisLib_803A6B98(t,0,0,"%s",string);return t;
}
void portTextDestroy(HSD_Text* t){if(!active||!t)abort();HSD_SisLib_803A5CC4(t);}
void portTextFinish(void){if(!active)abort();HSD_SisLib_803A5FBC();active=0;}
unsigned portTextOwner(HSD_Text* t){if(!active||!t||!t->entity)abort();return (unsigned)t->entity;}
void portTextMeasure(HSD_Text* t,const unsigned char* stream,float* out)
{
    if(!active||!t||!stream||!out)abort();HSD_SisLib_803A8134((void*)stream,t,out,out+1);
}
unsigned portTextStream(HSD_Text* t){if(!active||!t)abort();return (unsigned)t->sis_buffer;}
/* Conformance hook uses the real style-stack push/pop, including return PCs. */
unsigned portTextStyleStackProbe(HSD_Text* t,unsigned pc,float* out)
{
    if(!active||!t||!out)abort();
    t->x78.x=-2.5f;t->x78.y=1.25f;HSD_SisLib_803A7684(t,NULL,1);
    t->x80.x=.5f;t->x80.y=1.5f;HSD_SisLib_803A7684(t,NULL,3);
    HSD_SisLib_803A7684(t,(void*)pc,5);unsigned result=HSD_SisLib_803A7F0C(t,5);
    t->x80.x=t->x80.y=3;HSD_SisLib_803A7F0C(t,3);
    t->x78.x=t->x78.y=4;HSD_SisLib_803A7F0C(t,1);
    out[0]=t->x78.x;out[1]=t->x78.y;out[2]=t->x80.x;out[3]=t->x80.y;
    return result;
}
