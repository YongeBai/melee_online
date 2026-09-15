/* Limited native pose integration for standard fighter joint trees. This does
 * not replace HSD_JObj classes, constraints, physics or fighter initialization.
 * Unsupported joint modes and animation channels fail explicitly.
 */
#include <sysdolphin/baselib/jobj.h>
#include <sysdolphin/baselib/aobj.h>
#include <sysdolphin/baselib/fobj.h>
#include <sysdolphin/baselib/mtx.h>
#include <math.h>
#include <stdlib.h>

typedef struct PoseNode {
    HSD_JObj joint;
    HSD_AObj animation;
    Vec3 accumulated_scale;
    unsigned source_flags;
    int parent;
    float initial[9];
} PoseNode;
typedef struct Pose { unsigned count;PoseNode nodes[]; } Pose;

Pose* portPoseCreate(unsigned count)
{
    if(!count||count>4096)return NULL;
    Pose* pose=calloc(1,sizeof(Pose)+sizeof(PoseNode)*count);
    if(pose)pose->count=count;
    return pose;
}
int portPoseNode(Pose* pose,unsigned index,int parent,unsigned flags,float* srt)
{
    if(!pose||index>=pose->count||parent< -1||parent>=(int)index)return -1;
    if(flags&(JOBJ_INSTANCE|JOBJ_SPLINE|JOBJ_USE_QUATERNION|JOBJ_EFFECTOR|
              JOBJ_USER_DEF_MTX|JOBJ_MTX_INDEP_PARENT|JOBJ_MTX_INDEP_SRT))return -2;
    PoseNode* node=&pose->nodes[index];
    node->source_flags=flags;node->parent=parent;
    for(int i=0;i<9;i++) {if(!isfinite(srt[i]))return -3;node->initial[i]=srt[i];}
    node->joint.parent=parent<0?NULL:&pose->nodes[parent].joint;
    node->joint.rotate=(Quaternion){srt[0],srt[1],srt[2],0};
    node->joint.scale=(Vec3){srt[3],srt[4],srt[5]};
    node->joint.translate=(Vec3){srt[6],srt[7],srt[8]};
    node->joint.flags=flags;
    return 0;
}
int portPoseTrack(Pose* pose,unsigned index,HSD_FObj* track,unsigned classical,
                  unsigned flags,float end)
{
    if(!pose||index>=pose->count||!track)return -1;
    if(track->obj_type<1||track->obj_type>12||track->obj_type==4)return -2;
    PoseNode* node=&pose->nodes[index];
    HSD_FObj** tail=&node->animation.fobj;
    while(*tail)tail=&(*tail)->next;
    *tail=track;
    node->animation.flags=flags;node->animation.end_frame=end;
    node->animation.framerate=1;node->joint.aobj=&node->animation;
    if(classical)node->source_flags|=JOBJ_CLASSICAL_SCALE;
    else node->source_flags&=~JOBJ_CLASSICAL_SCALE;
    return 0;
}
void portPoseRewind(Pose* pose)
{
    for(unsigned i=0;i<pose->count;i++) {
        PoseNode* node=&pose->nodes[i];float* s=node->initial;
        node->joint.rotate=(Quaternion){s[0],s[1],s[2],0};
        node->joint.scale=(Vec3){s[3],s[4],s[5]};
        node->joint.translate=(Vec3){s[6],s[7],s[8]};
        node->joint.flags=node->source_flags;
        HSD_AObjReqAnim(&node->animation,0);
    }
}
typedef struct UpdateContext {Pose* pose;unsigned index;} UpdateContext;
static void update(void* object,int type,HSD_ObjData* value)
{
    UpdateContext* context=object;Pose* pose=context->pose;
    HSD_JObj* joint=&pose->nodes[context->index].joint;
    float v=value->fv;
    if(type>=8&&type<=10&&fabsf(v)<1e-3f)v=1e-3f;
    switch(type) {
    case 1:joint->rotate.x=v;break;case 2:joint->rotate.y=v;break;case 3:joint->rotate.z=v;break;
    case 5:joint->translate.x=v;break;case 6:joint->translate.y=v;break;case 7:joint->translate.z=v;break;
    case 8:joint->scale.x=v;break;case 9:joint->scale.y=v;break;case 10:joint->scale.z=v;break;
    case 11:case 12:
        for(unsigned i=context->index;i<pose->count;i++) {
            int ancestor=i;
            while(ancestor>(int)context->index)ancestor=pose->nodes[ancestor].parent;
            if(i!=context->index&&(type==11||ancestor!=(int)context->index))continue;
            if(v>0.5f)pose->nodes[i].joint.flags&=~JOBJ_HIDDEN;
            else pose->nodes[i].joint.flags|=JOBJ_HIDDEN;
        }
        break;
    default:abort();
    }
}
void portPoseStep(Pose* pose,float* matrices)
{
    for(unsigned i=0;i<pose->count;i++) {
        UpdateContext context={pose,i};
        HSD_AObjInterpretAnim(&pose->nodes[i].animation,&context,update);
    }
    for(unsigned i=0;i<pose->count;i++) {
        PoseNode* node=&pose->nodes[i];HSD_JObj* j=&node->joint;
        Vec3* parent=j->parent?j->parent->scl:NULL;
        if(j->flags&JOBJ_CLASSICAL_SCALE) {
            if(parent){node->accumulated_scale=*parent;j->scl=&node->accumulated_scale;}
            else j->scl=NULL;
        } else {
            node->accumulated_scale=(Vec3){j->scale.x*(parent?parent->x:1),
                j->scale.y*(parent?parent->y:1),j->scale.z*(parent?parent->z:1)};
            j->scl=&node->accumulated_scale;
        }
        HSD_MtxSRT(j->mtx,&j->scale,(Vec3*)&j->rotate,&j->translate,parent);
        if(j->parent)PSMTXConcat(j->parent->mtx,j->mtx,j->mtx);
        for(int r=0;r<3;r++)for(int c=0;c<4;c++)matrices[i*12+r*4+c]=j->mtx[r][c];
    }
}
void portPoseDestroy(Pose* pose)
{
    if(!pose)return;
    for(unsigned i=0;i<pose->count;i++)HSD_FObjRemoveAll(pose->nodes[i].animation.fobj);
    free(pose);
}
