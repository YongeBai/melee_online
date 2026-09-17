/* Stream device boundary. Original menu/game code still chooses the track,
 * gain and pause state. A host must explicitly accept playback; diagnostics
 * may decline it and report missing audio without pretending it played. */
#include <sysdolphin/baselib/axdriver.h>
#include <emscripten.h>
static bool active;
EM_JS(int, music_request, (int action,const char* path,int volume,int track), {
    if(typeof Module['onNativeMusic']!=='function')throw Error('Native music receiver is absent');
    return Module['onNativeMusic']({action,path:path?UTF8ToString(path):null,volume,track})===true?1:0;
});
bool AXDriver_8038E8EC(const char* path,u8 volume,int track)
{
    if(active)AXDriverStop();
    active=music_request(0,path,volume,track)!=0;return active;
}
bool AXDriverStop(void)
{
    if(!active)return false;
    if(!music_request(1,0,0,0))return false;
    active=false;return true;
}
bool AXDriverPause(void){return active&&music_request(2,0,0,0);}
bool AXDriverResume(void){return active&&music_request(3,0,0,0);}
bool AXDriver_8038EA18(void)
{
    if(active&&!music_request(4,0,0,0))active=false;
    return active;
}
