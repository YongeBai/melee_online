/* Native replacements for selected SDK paired-single routines. Preserve the
 * upstream assembly's operation order and explicit fused multiply-add steps.
 * This is not a generic matrix library: algebraically equivalent regrouping
 * can change fighter bones and collision results through float rounding.
 */
#include <dolphin/mtx.h>
#include <math.h>
#include <string.h>

_Static_assert(sizeof(Vec)==12,"Vector layout");
_Static_assert(sizeof(Mtx)==48,"Matrix layout");

/* MSL's math_1.c also defines a big-endian frexp. Link only this portable
 * wrapper instead of overriding libc with that unrelated implementation. */
float fabsf__Ff(float value) { return fabsf(value); }

void PSMTXIdentity(Mtx m)
{
    memset(m,0,sizeof(Mtx));m[0][0]=m[1][1]=m[2][2]=1;
}
void PSMTXCopy(Mtx src,Mtx dst) { memmove(dst,src,sizeof(Mtx)); }
void PSMTXScale(Mtx m,float x,float y,float z)
{
    memset(m,0,sizeof(Mtx));m[0][0]=x;m[1][1]=y;m[2][2]=z;
}
void PSMTXTranspose(Mtx src,Mtx dst)
{
    Mtx result;
    for(int r=0;r<3;r++) {for(int c=0;c<3;c++)result[r][c]=src[c][r];result[r][3]=0;}
    memcpy(dst,result,sizeof(result));
}
void PSMTXConcat(Mtx a,Mtx b,Mtx out)
{
    Mtx result;
    for(int r=0;r<3;r++)for(int c=0;c<4;c++) {
        float value=b[0][c]*a[r][0];
        value=fmaf(b[1][c],a[r][1],value);
        value=fmaf(b[2][c],a[r][2],value);
        if(c>=2)value=fmaf(c==3?1.0f:0.0f,a[r][3],value);
        result[r][c]=value;
    }
    memcpy(out,result,sizeof(result));
}
void PSMTXMultVec(Mtx44 m,Vec* src,Vec* dst)
{
    float values[3];
    for(int r=0;r<3;r++) {
        float x=m[r][0]*src->x,y=m[r][1]*src->y;
        x=fmaf(m[r][2],src->z,x);
        y=fmaf(m[r][3],1.0f,y);
        values[r]=x+y;
    }
    *dst=(Vec){values[0],values[1],values[2]};
}
void PSMTXMultVecSR(Mtx44 m,Vec* src,Vec* dst)
{
    float values[3];
    for(int r=0;r<3;r++) {
        float x=m[r][0]*src->x,y=m[r][1]*src->y;
        values[r]=fmaf(m[r][2],src->z,x+y);
    }
    *dst=(Vec){values[0],values[1],values[2]};
}
void PSVECAdd(Vec* a,Vec* b,Vec* out)
{
    const Vec result={a->x+b->x,a->y+b->y,a->z+b->z};*out=result;
}
void PSVECSubtract(Vec* a,Vec* b,Vec* out)
{
    const Vec result={a->x-b->x,a->y-b->y,a->z-b->z};*out=result;
}
void PSVECScale(Vec* a,Vec* out,float scale)
{
    const Vec result={a->x*scale,a->y*scale,a->z*scale};*out=result;
}
float PSVECDotProduct(Vec* a,Vec* b)
{
    float y=a->y*b->y,z=a->z*b->z;
    return fmaf(a->x,b->x,y)+z;
}
float PSVECSquareMag(Vec* a)
{
    float x=a->x*a->x,y=a->y*a->y;
    return fmaf(a->z,a->z,x)+y;
}
void PSVECCrossProduct(Vec* a,Vec* b,Vec* out)
{
    const Vec result={fmaf(a->y,b->z,-(b->y*a->z)),
      -fmaf(a->x,b->z,-(b->x*a->z)), -fmaf(a->y,b->x,-(b->y*a->x))};
    *out=result;
}
