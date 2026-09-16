/* Typed shared-data integration. The complete PlCo image is retained by the
 * original Fighter_LoadCommonData for the lifetime of the runtime. */
#include <melee/ft/fighter.h>
#include <melee/ft/ftparts.h>
#include <melee/ft/ftcommon.h>
#include <stdlib.h>
#include <string.h>

/* The original functions read globals. Scope the fixture binding to one call so
 * a data verification cannot leave dangling globals after its archive is freed. */
u32 portSharedPart(FighterPartsTable** parts,Fighter_804D6540_t** groups,
                   unsigned operation,unsigned to,unsigned from,unsigned value)
{
    if(to>=34||from>=34)abort();
    FighterPartsTable** old_parts=ftPartsTable;Fighter_804D6540_t** old_groups=Fighter_804D6540;
    ftPartsTable=parts;Fighter_804D6540=groups;u32 result;
    if(operation==0) {
        if(value>=56)abort();Fighter fp;memset(&fp,0,sizeof(fp));fp.kind=to;
        result=ftParts_GetBoneIndex(&fp,value);
    } else if(operation==1)result=ftPartsRemap(to,from,value);
    else if(operation==2)result=ftParts_8007506C(to,value);
    else abort();
    ftPartsTable=old_parts;Fighter_804D6540=old_groups;return result;
}
void portSharedLanding(ftCommonData* common,float velocity,float normal_x,float normal_y,float* output)
{
    ftCommonData* previous=p_ftCommonData;p_ftCommonData=common;
    Fighter fp;memset(&fp,0,sizeof(fp));fp.ground_or_air=GA_Ground;fp.x8c_kb_vel.x=velocity;
    fp.coll_data.floor.normal.x=normal_x;fp.coll_data.floor.normal.y=normal_y;
    ftCommon_SetGroundedKnockbackIfLanded(&fp);
    output[0]=fp.xF0_ground_kb_vel;output[1]=fp.x8c_kb_vel.x;output[2]=fp.x8c_kb_vel.y;
    p_ftCommonData=previous;
}

#include <melee/sfx/crowdsfx.h>
/* Like the game, common data live for the lifetime of this native runtime. */
static int common_initialized;
int portSharedInitialize(void)
{
    if(common_initialized)return 1;
    Fighter_LoadCommonData();common_initialized=1;return 0;
}
extern int portSceneInitialize(void);
int portFighterStartupComplete(void){return common_initialized==2;}
int portFighterInitialize(void)
{
    if(common_initialized==2)return 1;
    /* Resetting the original tables after partial loading would discard live
     * ownership. Full startup must be the first common-data initialization. */
    if(common_initialized||portSceneInitialize()<0)return -1;
    Fighter_FirstInitialize_80067A84();common_initialized=2;return 0;
}
uintptr_t portSharedGlobal(unsigned index)
{
    switch(index) {
    case 0:return (uintptr_t)p_ftCommonData;
    case 1:return (uintptr_t)Fighter_804D6550;
    case 2:return (uintptr_t)Fighter_804D654C;
    case 3:return (uintptr_t)Fighter_804D6548;
    case 4:return (uintptr_t)ftPartsTable;
    case 5:return (uintptr_t)Fighter_804D6540;
    case 6:return (uintptr_t)Fighter_804D653C;
    case 7:return (uintptr_t)Fighter_804D6538;
    case 8:return (uintptr_t)Fighter_804D6534;
    case 9:return (uintptr_t)Fighter_804D6530;
    case 10:return (uintptr_t)Fighter_GrabMashShake;
    case 11:return (uintptr_t)Fighter_SmashChargeShakeTable;
    case 12:return (uintptr_t)Fighter_804D6524;
    case 13:return (uintptr_t)Fighter_804D6520;
    case 14:return (uintptr_t)Fighter_804D651C;
    case 15:return (uintptr_t)Fighter_804D6518;
    case 16:return (uintptr_t)Fighter_804D6514;
    case 17:return (uintptr_t)Fighter_804D6510;
    case 18:return (uintptr_t)Fighter_804D650C;
    case 19:return (uintptr_t)Fighter_804D6508;
    case 20:return (uintptr_t)Fighter_804D6504;
    case 21:return (uintptr_t)gCrowdConfig;
    case 22:return (uintptr_t)Fighter_804D64FC;
    default:abort();
    }
}
