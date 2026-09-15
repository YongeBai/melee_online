/* Native palette preparation follows HSD SetupEnvelopeModelMtx. Camera/view
 * multiplication is left to the GPU boundary; output is in model world space.
 */
#include <sysdolphin/baselib/mtx.h>
#include <dolphin/mtx.h>
#include <float.h>
#include <string.h>
typedef struct SkinGroup {unsigned kind,owner,first,count;} SkinGroup;
typedef struct SkinInfluence {unsigned joint;float weight;} SkinInfluence;
_Static_assert(sizeof(SkinGroup)==16,"Skin group ABI");
_Static_assert(sizeof(SkinInfluence)==8,"Skin influence ABI");
int portSkinMatrices(unsigned node_count,Mtx* world,Mtx* inverse,unsigned* has_inverse,
    unsigned* flags,int* parents,unsigned group_count,SkinGroup* groups,SkinInfluence* influences,Mtx* output)
{
    if(!node_count||node_count>4096)return -10;
    for(unsigned i=0;i<node_count;i++)if(parents[i]<-1||parents[i]>=(int)i)return -11;
    for(unsigned i=0;i<group_count;i++) {
        SkinGroup* group=&groups[i];SkinInfluence* entries=influences+group->first;
        if(group->owner>=node_count||!group->count)return -1;
        if(group->kind==0) {
            if(entries->joint>=node_count)return -2;
            PSMTXCopy(world[entries->joint],output[i]);continue;
        }
        if(group->kind!=1)return -3;
        Mtx right,tmp,blended;int has_right=!(flags[group->owner]&2);
        if(has_right) {
            int ancestor=group->owner;
            while(ancestor>=0&&!(flags[ancestor]&3))ancestor=parents[ancestor];
            if(ancestor<0||ancestor>=(int)node_count)return -4;
            if(ancestor==(int)group->owner) {
                if(!has_inverse[ancestor]||!PSMTXInverse(inverse[ancestor],right))return -5;
            } else if(flags[ancestor]&2) {
                HSD_MtxInverseConcat(world[ancestor],world[group->owner],right);
            } else {
                if(!has_inverse[ancestor])return -6;
                PSMTXConcat(world[ancestor],inverse[ancestor],tmp);
                HSD_MtxInverseConcat(tmp,world[group->owner],right);
            }
        }
        if(entries->weight>=1.0f-FLT_EPSILON) {
            if(entries->joint>=node_count)return -7;
            if(has_right) {
                if(!has_inverse[entries->joint])return -8;
                PSMTXConcat(world[entries->joint],inverse[entries->joint],blended);
            } else PSMTXCopy(world[entries->joint],blended);
        } else {
            memset(blended,0,sizeof(blended));
            for(unsigned j=0;j<group->count;j++) {
                unsigned index=entries[j].joint;
                if(index>=node_count||!has_inverse[index])return -9;
                PSMTXConcat(world[index],inverse[index],tmp);
                HSD_MtxScaledAdd(tmp,blended,blended,entries[j].weight);
            }
        }
        if(has_right)PSMTXConcat(blended,right,blended);
        PSMTXCopy(blended,output[i]);
    }
    return 0;
}
void portSkinVertices(unsigned count,Vec* positions,unsigned* indices,Mtx* matrices,Vec* output)
{
    for(unsigned i=0;i<count;i++)PSMTXMultVec(matrices[indices[i]],&positions[i],&output[i]);
}
