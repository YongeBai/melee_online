/* Browser port bootstrap: real decompiled subsystems, no emulated CPU.
 * Unsupported platform functions are intentionally unresolved at link time.
 */
#include <melee/lb/types.h>
#include <melee/mp/mpcoll.h>
#include <melee/mp/mplib.h>
#include <melee/gr/stage.h>
#include <melee/gr/ground.h>
#include <melee/gr/types.h>
#include <sysdolphin/baselib/archive.h>
#include <sysdolphin/baselib/random.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

_Static_assert(sizeof(void*) == 4, "WASM32 required");
_Static_assert(sizeof(MapCollData) == 0x30, "Map collision layout");
_Static_assert(sizeof(MapLine) == 0x10, "Map line layout");
_Static_assert(sizeof(MapJoint) == 0x28, "Map joint layout");
_Static_assert(offsetof(MapCollData, joints) == 0x24, "Map joints pointer");
_Static_assert(offsetof(CollData, x130_flags) == 0x130, "ECB layout");
_Static_assert(sizeof(HSD_Archive) == 0x44, "Archive layout");

/* Eight floats in native top/bottom/left/right order, including both axes.
 * The optional override exercises Melee's x34_flags.b6 branch via C, avoiding
 * assumptions about the host compiler's bitfield allocation order.
 */
void portInterpolate(const float* current, const float* desired, const float* override,
                     float time, float* result)
{
    CollData coll = {0};
    memcpy(&coll.ecb, current, 8 * sizeof(float));
    memcpy(&coll.desired_ecb, desired, 8 * sizeof(float));
    if (override) {
        memcpy(&coll.x64_ecb, override, 8 * sizeof(float));
        coll.x34_flags.b6 = 1;
    }
    mpCollInterpolateECB(&coll, time);
    memcpy(result, &coll.ecb, 8 * sizeof(float));
    memcpy(result + 8, &coll.prev_ecb, 8 * sizeof(float));
    result[16] = coll.x34_flags.b6;
}

void portSeed(unsigned seed) { *HSD_RandSeedPtr = seed; }
int portRandom(void) { return HSD_Rand(); }
void portStagePrune(MapCollData* coll, int kind)
{
    stage_info.grkind = kind;
    mpPruneEmptyLines(coll);
}
/* Read every converted field through the upstream C types for ABI validation.
 * Counts alone would miss little-endian float/short and pointer mistakes.
 */
double portStageMetric(const MapCollData* c, int kind)
{
    double sum = 0;
    int i;
    if (kind == 0) return c->vert_count;
    if (kind == 1) return c->line_count;
    if (kind == 2) return c->joint_count;
    if (kind == 3) {
        for (i = 0; i < c->vert_count; ++i) {
            sum += c->verts[i].x * (double)(i * 2 + 1);
            sum += c->verts[i].y * (double)(i * 2 + 2);
        }
    } else if (kind == 4) {
        for (i = 0; i < c->line_count; ++i) {
            const MapLine* l = &c->lines[i];
            sum += l->v0_idx + 2.0*l->v1_idx + 3.0*l->prev_id0 + 4.0*l->next_id0 +
                   5.0*l->prev_id1 + 6.0*l->next_id1 + 7.0*l->hi_flags + 8.0*l->lo_flags;
        }
    } else if (kind == 5) {
        for (i = 0; i < c->joint_count; ++i) {
            const MapJoint* q = &c->joints[i];
            sum += (double)q->floor_start + q->floor_count + q->ceiling_start + q->ceiling_count +
                   q->right_wall_start + q->right_wall_count + q->left_wall_start + q->left_wall_count +
                   q->dynamic_start + q->dynamic_count + q->left_bound + q->bottom_bound +
                   q->right_bound + q->top_bound + q->vtx_start + q->vtx_count;
        }
    } else {
        return -1;
    }
    return sum;
}

HSD_Archive* portArchiveOpen(unsigned char* image, unsigned size)
{
    HSD_Archive* archive = malloc(sizeof(*archive));
    if (archive && HSD_ArchiveParse(archive, image, size) != 0) {
        free(archive);
        return NULL;
    }
    return archive;
}
void* portArchiveSymbol(HSD_Archive* archive, const char* name)
{
    return HSD_ArchiveGetPublicAddress(archive, name);
}
void portArchiveClose(HSD_Archive* archive) { free(archive); }
