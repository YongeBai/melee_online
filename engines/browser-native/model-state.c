/* Original HSD PObj matrix loads, independent of the optimized skin palette. */
#include <dolphin/gx.h>
#include <dolphin/mtx.h>
#include <string.h>
void portRequireMaterialCapture(int condition);
#define require(c) portRequireMaterialCapture(c)
typedef struct {u32 position_mask,normal_mask,current,current_set;Mtx position[10];Mtx normal[10];} ModelState;
_Static_assert(sizeof(ModelState)==976,"Model matrix capture ABI");
static ModelState state;
void portModelCaptureReset(void){require(1);memset(&state,0,sizeof(state));}
const ModelState* portMaterialModelState(void){return &state;}
static unsigned slot(u32 id){require(id<=GX_PNMTX9&&id%3==0);return id/3;}
void GXSetCurrentMtx(u32 id){state.current=slot(id);state.current_set=1;}
void GXLoadPosMtxImm(f32 mtx[3][4],u32 id){unsigned i=slot(id);require(mtx!=NULL);memcpy(state.position[i],mtx,sizeof(Mtx));state.position_mask|=1u<<i;}
void GXLoadNrmMtxImm(f32 mtx[3][4],u32 id){unsigned i=slot(id);require(mtx!=NULL);for(unsigned r=0;r<3;r++)for(unsigned c=0;c<3;c++)state.normal[i][r][c]=mtx[r][c];state.normal_mask|=1u<<i;}
