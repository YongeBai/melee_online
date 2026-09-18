import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

// Compile the actual enumeration boundary against small native object fixtures.
// Browser probes separately exercise original constructors, poses and GPU plans.
const compiler=process.env.CC||'cc';
test('native attachment enumeration bounds writes and follows Illusion/Phantasm joint lifetime and owner reuse',{skip:spawnSync(compiler,['--version']).status!==0},()=>{
 const source=fs.readFileSync(new URL('../../engines/browser-native/item-runtime.c',import.meta.url),'utf8');
 const begin=source.indexOf('unsigned portItemAttachmentsList('),end=source.indexOf('\ndouble portItemRead(',begin);
 assert(begin>=0&&end>begin);
 const fixture=`
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
typedef struct HSD_JObj { unsigned id; } HSD_JObj;
typedef struct HSD_GObj { void* user_data; struct HSD_GObj* next; } HSD_GObj;
enum { HSD_GOBJ_PLINK_ITEM, It_Kind_Link_Boomerang, It_Kind_CLink_Boomerang,
 It_Kind_Link_Arrow, It_Kind_CLink_Arrow, It_Kind_Kirby_LinkArrow,
 It_Kind_Kirby_CLinkArrow, It_Kind_Fox_Illusion, It_Kind_Falco_Phantasm };
typedef struct Item { unsigned kind; union {
 struct { HSD_JObj* xF90[2]; } linkboomerang;
 struct { HSD_JObj* xB4[2]; } linkarrow;
 struct { HSD_JObj* xDDC; HSD_JObj* unrelated; } foxillusion;
} xDD4_itemVar; } Item;
HSD_GObj* HSD_GObjPLinkHead[1];
${source.slice(begin,end)}
#define ADDRESS(p) ((unsigned)(uintptr_t)(p))
int main(void) {
 HSD_JObj fox={101},falco={102},arrow={103},second={104},replacement={101},poison={999};
 Item items[5]={0}; HSD_GObj objects[5]={0};
 items[0].kind=It_Kind_Fox_Illusion;items[0].xDD4_itemVar.foxillusion.xDDC=&fox;
 items[0].xDD4_itemVar.foxillusion.unrelated=&poison;
 items[1].kind=It_Kind_Falco_Phantasm;items[1].xDD4_itemVar.foxillusion.xDDC=&falco;
 items[1].xDD4_itemVar.foxillusion.unrelated=&poison;
 items[2].kind=It_Kind_Link_Arrow;items[2].xDD4_itemVar.linkarrow.xB4[0]=&arrow;items[2].xDD4_itemVar.linkarrow.xB4[1]=&second;
 items[3].kind=It_Kind_CLink_Boomerang;items[3].xDD4_itemVar.linkboomerang.xF90[1]=&second;
 items[4].kind=100;items[4].xDD4_itemVar.foxillusion.xDDC=&poison;
 for(unsigned i=0;i<5;i++){objects[i].user_data=&items[i];objects[i].next=i<4?&objects[i+1]:0;}HSD_GObjPLinkHead[0]=objects;
 unsigned out[18];for(unsigned i=0;i<18;i++)out[i]=0xfeedface;
 assert(portItemAttachmentsList(out,0)==5);for(unsigned i=0;i<18;i++)assert(out[i]==0xfeedface);
 assert(portItemAttachmentsList(out,1)==5);assert(out[0]==ADDRESS(objects)&&out[1]==ADDRESS(&fox)&&out[2]==101);for(unsigned i=3;i<18;i++)assert(out[i]==0xfeedface);
 assert(portItemAttachmentsList(out,5)==5);assert(out[3]==ADDRESS(objects+1)&&out[4]==ADDRESS(&falco)&&out[5]==102);assert(out[15]==0xfeedface);
 items[0].xDD4_itemVar.foxillusion.xDDC=0;assert(portItemAttachmentsList(out,5)==4);assert(out[0]==ADDRESS(objects+1));
 items[0].kind=It_Kind_Falco_Phantasm;items[0].xDD4_itemVar.foxillusion.xDDC=&replacement;
 assert(portItemAttachmentsList(out,5)==5);assert(out[0]==ADDRESS(objects)&&out[1]==ADDRESS(&replacement)&&out[2]==101);
 replacement.id=107;assert(portItemAttachmentsList(out,5)==5);assert(out[2]==107);
 HSD_GObjPLinkHead[0]=0;assert(portItemAttachmentsList(out,5)==0);return 0;
}`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-attachments-'));
 try{fs.writeFileSync(dir+'/probe.c',fixture);execFileSync(compiler,['-std=c11','-Wno-pointer-to-int-cast',dir+'/probe.c','-o',dir+'/probe']);execFileSync(dir+'/probe');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
