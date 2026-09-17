/* Explicit mute mode for menu bring-up. This does not fabricate loaded banks
 * or played voices. A complete native release still needs a browser SFX backend.
 * Without explicit host acceptance, original loaders retain their platform
 * guards and fail at the unported device boundary. */
#include <emscripten.h>
#include <stdlib.h>
static int diagnostic_mute;
extern void port_unlinked_lbAudioAx_80027168(void);
extern void port_unlinked_lbAudioAx_80027648(void);
EM_JS(int, accept_diagnostic_mute, (), {
    return typeof Module['onNativeAudioMode']==='function'&&Module['onNativeAudioMode']('diagnostic-muted')===true;
});
void portMenuDiagnosticMute(void)
{
    if(diagnostic_mute||!accept_diagnostic_mute())abort();diagnostic_mute=1;
}
void lbAudioAx_80027168(void)
{
    if(!diagnostic_mute)port_unlinked_lbAudioAx_80027168();
}
void lbAudioAx_80027648(void)
{
    if(!diagnostic_mute)port_unlinked_lbAudioAx_80027648();
}
