/* Typed shared-data integration. Full Fighter_LoadCommonData still requires
 * accessory scenes and joint animation; do not call it on this image. */
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
