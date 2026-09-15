/* Original CPU data consumers, without substituting a CPU decision loop. */
#include <melee/ft/fighter.h>
#include <melee/ft/ftcmdscript.h>
#include <melee/ft/ftcpuattack.h>
#include <sysdolphin/baselib/random.h>
#include <stdlib.h>
#include <string.h>
unsigned portCpuScript(struct Fighter_804D64FC_t* tables,unsigned index,u8* output)
{
    if(index>=62||!tables->cmdscripts[index]||!output)abort();
    struct Fighter_804D64FC_t* previous=Fighter_804D64FC;Fighter_804D64FC=tables;
    Fighter fp;memset(&fp,0,sizeof(fp));ftCo_800B462C(&fp);ftCo_800B4880(&fp,index);
    size_t size=fp.cpu.write_pos-fp.cpu.buffer;
    if(size>256)abort();memcpy(output,fp.cpu.buffer,size);Fighter_804D64FC=previous;return size;
}
int portCpuChoose(struct ftCo_AttackEntry* list,unsigned seed,float* random)
{
    unsigned previous=*HSD_RandSeedPtr;*HSD_RandSeedPtr=seed;*random=HSD_Randf();*HSD_RandSeedPtr=seed;
    int result=ftCo_800B6208(list);*HSD_RandSeedPtr=previous;return result;
}
