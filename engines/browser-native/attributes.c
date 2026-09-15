/* Call the original per-character parameter loader with its real Fighter/GObj
 * fields. This is an initialization boundary, not a replacement OnLoad callback
 * or a complete Fighter_Create. */
#include <melee/ft/types.h>
#include <sysdolphin/baselib/gobj.h>
#include <stdlib.h>
#include <string.h>
extern HSD_GObjEvent ftKindCalcIndiviParamTable[Ft_Kind_Max];
extern unsigned portAttributeSize(unsigned kind);
int portAttributesLoad(unsigned kind,const void* source,void* destination,unsigned size,float scale)
{
    if(kind>=27||size!=portAttributeSize(kind)||!source||!destination||source==destination)return -1;
    Fighter fp;ftData data;HSD_GObj object;
    memset(&fp,0,sizeof(fp));memset(&data,0,sizeof(data));memset(&object,0,sizeof(object));
    fp.kind=kind;fp.ft_data=&data;fp.dat_attrs=destination;fp.dat_attrs_backup=destination;
    fp.x34_scale.x=fp.x34_scale.z=1;fp.x34_scale.y=scale;data.ext_attr=(void*)source;
    object.user_data=&fp;fp.gobj=&object;ftKindCalcIndiviParamTable[kind](&object);return 0;
}
