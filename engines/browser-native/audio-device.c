/* Deterministic GameCube audio device boundary for the original sound code.
 *
 * lbAudioAx, AXDriver (the sound-effect command interpreter) and the HSD
 * synthesizer run unchanged. This file supplies what they drive: DSP voices
 * (AX), audio RAM transfers and the disc reads for audio files. Voices advance
 * in fixed 5 ms audio frames stepped from every simulation frame (3,3,4 per
 * three frames = 200 Hz), so voice lifetimes, stealing and "is playing"
 * answers are pure functions of WASM memory and survive rollback snapshots.
 * Voice parameter changes are reported to the browser mixer, which decodes the
 * original DSP-ADPCM samples. The mixer never feeds anything back into C.
 */
#include <dolphin/ax.h>
#include <dolphin/axfx.h>
#include <dolphin/ai.h>
#include <dolphin/ar.h>
#include <dolphin/dvd.h>
#include <dolphin/os.h>
#include <sysdolphin/baselib/forward.h>
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

#define VOICES 64
#define AUDIO_FILES 64
#define OUTPUT_SAMPLES_PER_FRAME 160 /* 5 ms at the 32 kHz DSP rate */

static AXVPB voices[VOICES];
static void (*frame_callback)(void);
static u32 aram_top, start_serial, audio_phase, serials[VOICES];
static int enabled;
struct AudioFile { char path[32]; const u8* bytes; u32 size, total; };
static struct AudioFile audio_files[AUDIO_FILES];
static u32 audio_file_count;
/* Transfer completions, delivered in request order after the request returns. */
struct Completion { HSD_DevComCallback cb; int request; void* args; uintptr_t dest; };
static struct Completion completions[32];
static u32 completion_head, completion_count;
/* Development builds (MELEE_DEBUG_SYNTH=1) link a synthesizer table validator. */
extern int portSynthValidate(int where) __attribute__((weak));
static void validate(int where){if(portSynthValidate&&!portSynthValidate(where))abort();}
static int deliver_completion(void)
{
    if (!completion_count) return 0;
    struct Completion c = completions[completion_head];
    completion_head = (completion_head + 1) % 32; completion_count--;
    validate(10);
    c.cb(c.request, (int) (intptr_t) c.args, (void*) c.dest, false);
    validate(11);
    return 1;
}

EM_JS(void, audio_voice_event, (int kind, int index, u32 serial, const void* pb), {
    if(typeof Module['onNativeSfx']==='function')Module['onNativeSfx']({kind,index,serial,pb});
});
EM_JS(void, audio_aram_event, (int file, u32 src, u32 dest, u32 size), {
    if(typeof Module['onNativeSfx']==='function')Module['onNativeSfx']({kind:5,file,src,dest,size});
});
/* Voice events: 1 start, 2 parameter update, 3 stop, 4 reached end. */
static void report(AXVPB* v, int kind) { audio_voice_event(kind, v->index, serials[v->index], &v->pb); }
static void changed(AXVPB* v) { if (v->pb.state == 1) report(v, 2); }

/* JS installs the byte-order-converted header region of each audio file (and
 * all of smash2.sem). Sample data never enters WASM memory. */
int portAudioFileInstall(const char* path, const u8* bytes, u32 size, u32 total)
{
    if (audio_file_count >= AUDIO_FILES || strlen(path) >= 32 || size > total) return -1;
    for (u32 i = 0; i < audio_file_count; i++) if (!strcmp(audio_files[i].path, path)) return -1;
    struct AudioFile* f = &audio_files[audio_file_count];
    strcpy(f->path, path); f->bytes = bytes; f->size = size; f->total = total;
    return (int) audio_file_count++;
}

/* ---- DSP voices ---- */
void AXInit(void)
{
    memset(voices, 0, sizeof(voices));
    for (int i = 0; i < VOICES; i++) voices[i].index = i;
}
void AXRegisterCallback(void (*callback)()) { frame_callback = (void (*)(void)) callback; }
AXVPB* AXAcquireVoice(u32 priority, void (*callback)(void*), u32 userContext)
{
    validate(30);
    AXVPB* chosen = NULL;
    for (int i = 0; i < VOICES && !chosen; i++) if (voices[i].priority == 0) chosen = &voices[i];
    if (!chosen) {
        /* Drop the lowest-priority voice below the request, like the DSP driver. */
        for (int i = 0; i < VOICES; i++)
            if ((u32) voices[i].priority < priority && (!chosen || voices[i].priority < chosen->priority)) chosen = &voices[i];
        if (!chosen) return NULL;
        if (chosen->pb.state == 1) report(chosen, 3);
        void (*dropped)(void*) = chosen->callback;
        chosen->pb.state = 0; chosen->priority = 0; chosen->callback = NULL;
        if (dropped) dropped(chosen);
    }
    u32 index = chosen->index;
    memset(&chosen->pb, 0, sizeof(chosen->pb));
    chosen->index = index; chosen->priority = priority; chosen->callback = callback; chosen->userContext = userContext;
    return chosen;
}
void AXFreeVoice(AXVPB* p)
{
    if (p->pb.state == 1) report(p, 3);
    p->pb.state = 0; p->priority = 0; p->callback = NULL;
}
void AXSetVoicePriority(AXVPB* p, u32 priority) { p->priority = priority; }
void AXSetVoiceState(AXVPB* p, u16 state)
{
    if (p->pb.state == state) return;
    p->pb.state = state;
    if (state == 1) { serials[p->index] = ++start_serial; report(p, 1); }
    else report(p, 3);
}
void AXSetVoiceVe(AXVPB* p, AXPBVE* ve) { p->pb.ve = *ve; changed(p); }
void AXSetVoiceMix(AXVPB* p, AXPBMIX* mix) { p->pb.mix = *mix; changed(p); }
void AXSetVoiceSrc(AXVPB* p, AXPBSRC* src) { p->pb.src = *src; changed(p); }
void AXSetVoiceSrcRatio(AXVPB* p, float ratio)
{
    *(u32*) &p->pb.src.ratioHi = (u32) (65536.0f * ratio); changed(p);
}
/* Addresses are 32-bit DSP nibble addresses stored as one native word over
 * each Hi/Lo pair, matching the synthesizer's own u32 arithmetic on them. */
#define ADDR(field) (*(u32*) &p->pb.addr.field##Hi)
void AXSetVoiceAddr(AXVPB* p, AXPBADDR* addr) { p->pb.addr = *addr; changed(p); }
void AXSetVoiceLoopAddr(AXVPB* p, u32 addr) { ADDR(loopAddress) = addr; changed(p); }
void AXSetVoiceEndAddr(AXVPB* p, u32 addr) { ADDR(endAddress) = addr; changed(p); }
void AXSetVoiceCurrentAddr(AXVPB* p, u32 addr) { ADDR(currentAddress) = addr; changed(p); }
void AXSetVoiceAdpcm(AXVPB* p, AXPBADPCM* adpcm) { p->pb.adpcm = *adpcm; }
void AXSetVoiceAdpcmLoop(AXVPB* p, AXPBADPCMLOOP* loop) { p->pb.adpcmLoop = *loop; }
void AXSetVoiceVeDelta(AXVPB* p, s16 delta) { p->pb.ve.currentDelta = delta; }
void AXSetVoiceLoop(AXVPB* p, u16 loop) { p->pb.addr.loopFlag = loop; changed(p); }
void AXSetVoiceItdOn(AXVPB* p) { p->pb.itd.flag = 1; }
void AXSetVoiceItdTarget(AXVPB* p, u16 lShift, u16 rShift) { p->pb.itd.targetShiftL = lShift; p->pb.itd.targetShiftR = rShift; }
void AXRegisterAuxACallback(void (*callback)(void*, void*), void* context) {}
void AXRegisterAuxBCallback(void (*callback)(void*, void*), void* context) {}
/* Reverb/delay/chorus sends are not rendered by the browser mixer. */
void AXFXSetHooks(void* (*alloc_hook)(unsigned long), void (*free_hook)(void*)) {}
int AXFXReverbStdInit(struct AXFX_REVERBSTD* rev) { return 1; }
int AXFXReverbStdShutdown(struct AXFX_REVERBSTD* rev) { return 1; }
int AXFXReverbHiInit(struct AXFX_REVERBHI* rev) { return 1; }
int AXFXReverbHiShutdown(struct AXFX_REVERBHI* rev) { return 1; }
int AXFXDelayInit(struct AXFX_DELAY* delay) { return 1; }
int AXFXDelayShutdown(struct AXFX_DELAY* delay) { return 1; }
int AXFXChorusInit(struct AXFX_CHORUS* chorus) { return 1; }
int AXFXChorusShutdown(struct AXFX_CHORUS* chorus) { return 1; }
void AXFXReverbStdCallback(struct AXFX_BUFFERUPDATE* b, struct AXFX_REVERBSTD* r) {}
void AXFXReverbHiCallback(struct AXFX_BUFFERUPDATE* b, struct AXFX_REVERBHI* r) {}
void AXFXDelayCallback(struct AXFX_BUFFERUPDATE* b, struct AXFX_DELAY* d) {}
void AXFXChorusCallback(struct AXFX_BUFFERUPDATE* b, struct AXFX_CHORUS* c) {}

/* Advance one DSP-ADPCM voice by one 5 ms frame. Frames are 8 bytes: one
 * header byte (2 nibbles) then 14 sample nibbles. */
static void advance(AXVPB* p)
{
    u32 ratio = *(u32*) &p->pb.src.ratioHi;
    u32 fixed = OUTPUT_SAMPLES_PER_FRAME * ratio + p->pb.src.currentAddressFrac;
    u32 steps = fixed >> 16;
    p->pb.src.currentAddressFrac = (u16) fixed;
    u32 current = ADDR(currentAddress), end = ADDR(endAddress), loop = ADDR(loopAddress);
    while (steps--) {
        if (current == end) {
            if (p->pb.addr.loopFlag) { current = loop; continue; }
            ADDR(currentAddress) = current; p->pb.state = 0; report(p, 4); return;
        }
        current++;
        if ((current & 15) < 2) current = (current & ~15u) + 2;
    }
    ADDR(currentAddress) = current;
}
/* Replaces the synthesizer wait: deliver pending transfers, otherwise idle. */
extern int HSD_SynthSFXGetPendingLoadCount(void);
void HSD_SynthSFXWaitForLoadCompletion(void (*callback)(void))
{
    while (HSD_SynthSFXGetPendingLoadCount() != 0) if (!deliver_completion()) callback();
}
void portAudioFrame(void)
{
    if (!enabled) return;
    validate(1);
    while (deliver_completion()) {}
    u32 ticks = audio_phase++ % 3 == 2 ? 4 : 3;
    while (ticks--) {
        for (int i = 0; i < VOICES; i++) if (voices[i].pb.state == 1) advance(&voices[i]);
        validate(2);
        if (frame_callback) frame_callback();
        validate(3);
    }
}

/* ---- Audio RAM and interface ---- */
u32 ARInit(u32* stack_index_addr, u32 num_entries) { aram_top = 0x4000; return aram_top; }
u32 ARGetBaseAddress(void) { return 0x4000; }
u32 ARAlloc(u32 length) { u32 at = aram_top; aram_top += (length + 31) & ~31u; return at; }
void ARQInit(void) {}
void AIInit(u8* stack) {}
void AISetDSPSampleRate(u32 rate) {}
void AISetStreamVolLeft(u8 vol) {}
void AISetStreamVolRight(u8 vol) {}
static u32 sound_mode = 1;
u32 OSGetSoundMode(void) { return sound_mode; }
void OSSetSoundMode(u32 mode) { sound_mode = mode; }

/* ---- Audio file reads ---- */
s32 DVDConvertPathToEntrynum(const char* path)
{
    for (u32 i = 0; i < audio_file_count; i++) if (!strcmp(audio_files[i].path, path)) return (s32) i;
    return -1;
}
BOOL DVDFastOpen(s32 entrynum, DVDFileInfo* info)
{
    if (entrynum < 0 || (u32) entrynum >= audio_file_count) return false;
    memset(info, 0, sizeof(*info));
    info->startAddr = (u32) entrynum; info->length = audio_files[entrynum].total;
    return true;
}
BOOL DVDClose(DVDFileInfo* info) { return true; }
static const u8* file_bytes(u32 entry, u32 offset, u32 size)
{
    if (entry >= audio_file_count) abort();
    struct AudioFile* f = &audio_files[entry];
    /* Only installed header bytes may be read into main RAM. */
    if (offset > f->size || size > f->size - offset) abort();
    return f->bytes + offset;
}
BOOL DVDReadAsyncPrio(DVDFileInfo* info, void* addr, s32 length, s32 offset, DVDCallback callback, s32 prio)
{
    struct AudioFile* f = &audio_files[info->startAddr];
    u32 n = (u32) length;
    if ((u32) offset + n > f->size) n = f->size - (u32) offset; /* rounded-up read of a whole file */
    memcpy(addr, file_bytes(info->startAddr, (u32) offset, n), n);
    if (callback) callback(n, info);
    return true;
}
/* Device requests used by the synthesizer: 0x21 file -> main RAM, 0x23 file
 * -> audio RAM, 3 main RAM -> audio RAM (buffer clear). Data moves at request
 * time; completion callbacks are delivered later in request order, as on the
 * console. Callers record the returned request before completion arrives. */
int HSD_DevComRequest(int file, uintptr_t src, uintptr_t dest, size_t size, int type, int pri, HSD_DevComCallback cb, void* args)
{
    static int request;
    ++request;
    validate(20 + type);
    if (type == 0x21) memcpy((void*) dest, file_bytes((u32) file, (u32) src, (u32) size), size);
    else if (type == 0x23) {
        if ((u32) file >= audio_file_count || src > audio_files[file].total || size > audio_files[file].total - src) abort();
        audio_aram_event(file, (u32) src, (u32) dest, (u32) size);
    } else if (type != 3) abort();
    validate(100 + type);
    if (cb) {
        if (completion_count == 32) abort();
        completions[(completion_head + completion_count++) % 32] = (struct Completion) {cb, request, args, dest};
    }
    return request;
}

/* Original boot order: audio init, then language/table and resident banks. */
extern int portRuntimeInit(void);
#include <melee/lb/lblanguage.h>
#include <sysdolphin/baselib/synth.h>
extern void lbAudioAx_8002838C(void);
extern void lbAudioAx_80028690(void);
int portAudioEnable(void)
{
    if (enabled) return 1;
    if (DVDConvertPathToEntrynum("/audio/us/smash2.sem") < 0 || portRuntimeInit() < 0) return 0;
    lbLang_SetSavedLanguage(1); /* The product is the USA release; the menus set it too. */
    /* The port runtime has one heap; the original separate audio heap shares it. */
    if (HSD_Synth_804D6018 < 0) HSD_Synth_804D6018 = __OSCurrHeap;
    lbAudioAx_8002838C();
    enabled = 1;
    lbAudioAx_80028690(); /* Boot sound setup: common bank, tables, resident banks. */
    return 1;
}
int portAudioEnabled(void) { return enabled; }
/* Plays one original sound id through lbAudioAx for tests and diagnostics. */
#include <melee/lb/lbaudio_ax.h>
int portAudioPlay(int id, int volume, int pan) { return enabled ? lbAudioAx_800237A8(id, volume, pan) : -1; }
const void* portAudioVoices(void) { return voices; }
