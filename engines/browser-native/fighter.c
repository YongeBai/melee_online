/* First fighter-data boundary. These are subsystem entry points, not a
 * replacement for Fighter_Create or its animation/collision callbacks. */
#include <melee/ft/types.h>
#include <melee/ft/ftcommon.h>
#include <stdlib.h>
#include <string.h>

_Static_assert(sizeof(ftCo_DatAttrs) == 0x184, "Fighter attribute layout");
_Static_assert(offsetof(ftCo_DatAttrs, gravity) == 0x5c, "Gravity layout");
_Static_assert(offsetof(ftCo_DatAttrs, camera_zoom_target_bone) == 0x16c, "Camera bone layout");
_Static_assert(offsetof(ftCo_DatAttrs, weight_independent_throws_mask) == 0x180, "Packed throw flags layout");

double portFighterAttribute(const ftCo_DatAttrs* a, unsigned which)
{
    switch (which) {
    case 0: return a->walk_accel_mul;
    case 1: return a->ground_friction;
    case 2: return a->dash_initial_velocity;
    case 3: return a->dash_max_velocity;
    case 4: return a->jump_startup_time;
    case 5: return a->jump_v_initial_velocity;
    case 6: return a->hop_v_initial_velocity;
    case 7: return a->max_jumps;
    case 8: return a->gravity;
    case 9: return a->terminal_velocity;
    case 10: return a->air_drift_stick_mul;
    case 11: return a->aerial_drift_base;
    case 12: return a->air_drift_max;
    case 13: return a->aerial_friction;
    case 14: return a->fast_fall_velocity;
    case 15: return a->weight;
    case 16: return a->model_scaling;
    case 17: return a->normal_landing_lag;
    case 18: return a->camera_zoom_target_bone;
    case 19: return a->weight_independent_throws_mask;
    default: abort();
    }
}

void portFighterPhysicsProbe(const ftCo_DatAttrs* attrs, float velocity,
                            unsigned frames, float* result)
{
    Fighter* fp = calloc(1, sizeof(Fighter));
    if (!fp || frames > 3600) abort();
    memcpy(&fp->co_attrs, attrs, sizeof(*attrs));
    fp->self_vel.y = velocity;
    fp->gr_vel = velocity;
    for (unsigned i = 0; i < frames; ++i) {
        ftCommon_FallBasic(fp);
        result[i] = fp->self_vel.y;
    }
    ftCommon_CalcGroundAccel_Deaccel(fp, attrs->ground_friction);
    result[frames] = fp->xE4_ground_accel_1;
    free(fp);
}
