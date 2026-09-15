/* Direct arithmetic translation of the pinned SDK's PSMTXQuat/PSMTXInverse
 * assembly (libs/dolphin/src/dolphin/mtx/mtx.c). The small pair helpers inline;
 * they do not interpret instructions or carry emulated processor state.
 */
#include <dolphin/mtx.h>
#include <math.h>
#include <string.h>
extern double portFres(double);
typedef struct Pair {float x,y;} Pair;
static Pair splat(float x){return (Pair){x,x};}
static Pair load(const float* p){return (Pair){p[0],p[1]};}
static Pair load1(const float* p){return (Pair){p[0],1};}
static Pair add(Pair a,Pair b){return (Pair){a.x+b.x,a.y+b.y};}
static Pair sub(Pair a,Pair b){return (Pair){a.x-b.x,a.y-b.y};}
static Pair mul(Pair a,Pair b){return (Pair){a.x*b.x,a.y*b.y};}
static Pair madd(Pair a,Pair c,Pair b){return (Pair){fmaf(a.x,c.x,b.x),fmaf(a.y,c.y,b.y)};}
static Pair msub(Pair a,Pair c,Pair b){return (Pair){fmaf(a.x,c.x,-b.x),fmaf(a.y,c.y,-b.y)};}
static Pair nmadd(Pair a,Pair c,Pair b){Pair p=madd(a,c,b);return (Pair){-p.x,-p.y};}
static Pair nmsub(Pair a,Pair c,Pair b){Pair p=msub(a,c,b);return (Pair){-p.x,-p.y};}
static Pair merge00(Pair a,Pair b){return (Pair){a.x,b.x};}
static Pair merge01(Pair a,Pair b){return (Pair){a.x,b.y};}
static Pair merge10(Pair a,Pair b){return (Pair){a.y,b.x};}
static Pair merge11(Pair a,Pair b){return (Pair){a.y,b.y};}
/* SDK assembly orders operands as destination,A,C,B. */
static Pair sum0(Pair a,Pair c,Pair b){return (Pair){a.x+b.y,c.y};}
static Pair sum1(Pair a,Pair c,Pair b){return (Pair){c.x,a.x+b.y};}
static void store(float* p,Pair value){p[0]=value.x;p[1]=value.y;}

void PSMTXRotAxisRad(Mtx m,Vec* axis,float angle)
{
    Vec normalized;float out[12];
    float sine=sinf(angle),cosine=cosf(angle),remaining=1-cosine;
    PSVECNormalize(axis,&normalized);
    Pair rad={normalized.x,normalized.y},t1=splat(normalized.z),t0=splat(cosine),zero=splat(0);
    Pair t4=mul(rad,splat(remaining)),t5=mul(t1,splat(remaining));
    Pair t3=mul(t4,splat(rad.y)),t2=mul(t4,splat(rad.x));
    rad=mul(rad,splat(sine));t4=mul(t4,t1);
    Pair t6=splat(-fmaf(t1.x,sine,-t3.x)),t7=splat(fmaf(t1.x,sine,t3.x));
    Pair t9={-rad.x,-rad.y},t8=sum0(t4,zero,rad);
    t2=sum0(t2,t6,t0);t3=sum1(t0,t7,t3);t6=sum0(t9,zero,t4);t9=sum0(t4,t4,t9);
    store(out+2,t8);t5=mul(t5,t1);store(out,t2);t4=sum1(rad,t9,t4);
    store(out+4,t3);t5=sum0(t5,zero,t0);store(out+6,t6);store(out+8,t4);store(out+10,t5);
    memcpy(m,out,sizeof(out));
}

void PSMTXQuat(Mtx m,Quaternion* q)
{
    float input[4],out[12];memcpy(input,q,sizeof(input));
    Pair one=splat(1),zero=splat(0),two=splat(2),scale;
    Pair t0=load(input),t1=load(input+2),t2,t3,t4,t5,t6,t7,t8,t9;
    t2=mul(t0,t0);t5=merge10(t0,t0);
    t4=madd(t1,t1,t2);t3=mul(t1,t1);
    scale=sum0(t4,t4,t4);t7=mul(t5,splat(t1.y));
    t9=splat((float)portFres(scale.x));t4=sum1(t3,t4,t2);
    scale=nmsub(scale,t9,two);t6=mul(t1,splat(t1.y));
    scale=mul(t9,scale);t2=sum0(t2,t2,t2);
    scale=splat(scale.x*2);t8=madd(t0,t5,t6);t6=msub(t0,t5,t6);
    out[3]=0;t2=nmsub(t2,scale,one);t4=nmsub(t4,scale,one);out[11]=0;
    t8=mul(t8,scale);t6=mul(t6,scale);out[10]=t2.x;
    t5=madd(t0,splat(t1.x),t7);t1=merge00(t8,t4);
    t7=nmsub(t7,two,t5);t0=merge10(t4,t6);
    store(out+4,t1);t5=mul(t5,scale);t7=mul(t7,scale);
    store(out,t0);out[2]=t5.x;t3=merge10(t7,zero);t9=merge01(t7,t5);
    store(out+6,t3);store(out+8,t9);memcpy(m,out,sizeof(out));
}
u32 PSMTXInverse(Mtx src,Mtx inv)
{
    float in[12],out[12];memcpy(in,src,sizeof(in));
    Pair f0=load1(in),f1=load(in+1),f2=load1(in+4),f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13;
    f6=merge10(f1,f0);f3=load(in+5);f4=load1(in+8);
    f7=merge10(f3,f2);f5=load(in+9);f11=mul(f3,f6);f13=mul(f5,f7);
    f8=merge10(f5,f4);f11=msub(f1,f7,f11);f12=mul(f1,f8);
    f13=msub(f3,f8,f13);f10=mul(f3,f4);f12=msub(f5,f6,f12);
    f9=mul(f0,f5);f8=mul(f1,f2);f6=sub(f6,f6);f10=msub(f2,f5,f10);
    f7=mul(f0,f13);f9=msub(f1,f4,f9);f7=madd(f2,f12,f7);
    f8=msub(f0,f3,f8);f7=madd(f4,f11,f7);
    if(f7.x==f6.x)return 0;
    f0=splat((float)portFres(f7.x));f6=add(f0,f0);f5=mul(f0,f0);
    f0=nmsub(f7,f5,f6);f1=splat(in[3]);f13=mul(f13,splat(f0.x));
    f2=splat(in[7]);f12=mul(f12,splat(f0.x));f3=splat(in[11]);
    f11=mul(f11,splat(f0.x));f5=merge00(f13,f12);f10=mul(f10,splat(f0.x));
    f4=merge11(f13,f12);f9=mul(f9,splat(f0.x));store(out,f5);
    f6=mul(f13,f1);store(out+4,f4);f8=mul(f8,splat(f0.x));
    f6=madd(f12,f2,f6);out[8]=f10.x;f6=nmadd(f11,f3,f6);out[9]=f9.x;
    f7=mul(f10,f1);f5=merge00(f11,f6);out[10]=f8.x;f4=merge11(f11,f6);
    store(out+2,f5);f7=madd(f9,f2,f7);store(out+6,f4);f7=nmadd(f8,f3,f7);
    out[11]=f7.x;memcpy(inv,out,sizeof(out));return 1;
}
