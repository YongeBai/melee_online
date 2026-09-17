#include <melee/ft/types.h>
#include <melee/pl/player.h>
#include <stdlib.h>
static unsigned enabled[2]={1,1};
void portTapJumpSet(unsigned port,unsigned value){if(port>=2||value>1)abort();enabled[port]=value;}
unsigned portTapJumpGet(unsigned port){if(port>=2)abort();return enabled[port];}
int portTapJumpAllowed(Fighter* fp){return fp->player_id>=2||enabled[fp->player_id]||fp->kind==Ft_Kind_Nana||Player_GetPlayerSlotType(fp->player_id)!=Gm_PKind_Human;}
