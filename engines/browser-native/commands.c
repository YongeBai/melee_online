/* Tests call these original control-flow functions directly. Fighter dispatch
 * and action handlers remain in the game and are not replaced by this probe. */
#include <melee/lb/types.h>
#include <melee/ft/types.h>
#include <port-command-word.h>
#include <melee/lb/lbcommand.h>
#include <stdlib.h>
struct PortCommandState { CommandInfo info; CmdUnion* base; };
void* portCommandControlCreate(CmdUnion* program)
{
    struct PortCommandState* state=calloc(1,sizeof(*state));if(!state)abort();
    state->info.u=state->base=program;return state;
}
void portCommandControlDestroy(void* state){free(state);}
void portCommandControlFrame(struct PortCommandState* state,float frame){state->info.frame_count=frame;}
void portCommandControlStep(struct PortCommandState* state,unsigned opcode)
{
    if(!state->info.u||((gmScriptEventDefault*)state->info.u)->opcode!=opcode)abort();
    switch(opcode) {
    case 0: Command_00(&state->info);break;
    case 1: Command_01(&state->info);break;
    case 2: Command_02(&state->info);break;
    case 3: Command_03(&state->info);break;
    case 4: Command_04(&state->info);break;
    case 5: Command_05(&state->info);break;
    case 6: Command_06(&state->info);break;
    case 7: Command_07(&state->info);break;
    case 8: Command_08(&state->info);break;
    default: abort();
    }
}
double portCommandControlRead(struct PortCommandState* state,unsigned field)
{
    switch(field) {
    case 0: return state->info.timer;
    case 1: return state->info.frame_count;
    case 2: return state->info.u?((intptr_t)state->info.u-(intptr_t)state->base)/4:-1;
    case 3: return state->info.loop_count;
    default: abort();
    }
}

int portCommandReadUnit(const void* words,unsigned type,unsigned index)
{
    switch(type) {
    case 8:return portCommandU8(words,index);
    case 16:return portCommandU16(words,index);
    case 17:return portCommandS16(words,index);
    case 18:return portCommandItemSoundOpcode(words);
    case 12:return portCommandSigned12(words);
    default:abort();
    }
}
