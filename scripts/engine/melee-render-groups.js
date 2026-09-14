// Diagnostic-only GX-link filter for GALE01 1.02. The camera, game-object
// processes, collision, animation and input all continue to run. Only the
// selected render-object lists are skipped by HSD_GObj_80390ED0.
export const RENDER_LINK_HOOK=0x80390f28;
export const RENDER_LINK_CAVE=0x80002e00;
export const RENDER_LINK_MASK=0x80002efc;
export const RENDER_LINK_GROUPS={
  stage:(1<<3)>>>0,
  fighters:(1<<5)>>>0,
  effects:((1<<7)|(1<<8))>>>0,
  hud:(1<<11)>>>0,
  shadows:(1<<4)>>>0,
  environment:((1<<0)|(1<<10))>>>0,
};
const ORIGINAL=0x806dc184; // lwz r3,HSD_GObjGXLinkHead@sda21(r13)
const branch=(from,to)=>(0x48000000|((to-from)&0x03fffffc))>>>0;
const HOOK_BRANCH=branch(RENDER_LINK_HOOK,RENDER_LINK_CAVE);
const CAVE_WORDS=[
  0x57ecf0be, // srwi r12,r31,2: byte offset -> GX-link number
  0x3c008000, // lis r0,0x8000
  0x80002efc, // lwz r0,RENDER_LINK_MASK(r0)
  0x7c006430, // srw r0,r0,r12
  0x70000001, // andi. r0,r0,1
  0x41820008, // beq render
  branch(RENDER_LINK_CAVE+0x18,0x80390f6c), // skip this GX link
  ORIGINAL,
  branch(RENDER_LINK_CAVE+0x20,0x80390f2c), // resume original loop
];
export const RENDER_LINK_CODE_BYTES=CAVE_WORDS.length*4;

const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
export function inspectRenderLinks(read32,read8){
  const heads=read32(0x804d7824),max=read8(0x804ce381);
  if(!valid(heads,(max+2)*4)||max>63)throw Error('Invalid GX-link table');
  const links=[];
  for(let link=0;link<=max+1;link++){
    const objects=[],seen=new Set();let g=read32(heads+link*4);
    while(g){
      if(!valid(g,0x38)||seen.has(g)||seen.size>=512)throw Error('Invalid GX-link object chain');
      seen.add(g);if(read8(g+3)!==link)throw Error('GX-link identity mismatch');
      const userData=read32(g+0x2c),ground=valid(userData,0x20)&&read32(userData+4)===g;
      objects.push({gobj:g,classifier:read8(g),pLink:read8(g+2),renderPriority:read8(g+5),
        objectKind:read8(g+6),callback:read32(g+0x1c),hsdObject:read32(g+0x28),userData,
        ...(ground?{groundMapId:read32(userData+0x14),groundCategory:read8(userData+0x11)>>>5}: {})});
      g=read32(g+0x10);
    }
    if(objects.length)links.push({link,objects});
  }
  return{heads,max,links};
}

export function planRenderLinkDiagnostic(read32,read8,enabled,group='stage'){
  if(typeof enabled!=='boolean')throw Error('Render-link mode must be boolean');
  if(!Object.hasOwn(RENDER_LINK_GROUPS,group))throw Error('Unknown render-link group');
  const hook=read32(RENDER_LINK_HOOK),mask=read32(RENDER_LINK_MASK);
  const cave=CAVE_WORDS.map((_,i)=>read32(RENDER_LINK_CAVE+i*4));
  const inactive=hook===ORIGINAL&&mask===0&&cave.every(word=>word===0);
  const active=hook===HOOK_BRANCH&&mask===RENDER_LINK_GROUPS[group]&&cave.every((word,i)=>word===CAVE_WORDS[i]);
  if(!inactive&&!active)throw Error('Unexpected render-link diagnostic hook '+JSON.stringify({hook:hook.toString(16),mask:mask.toString(16),cave:cave.map(x=>x.toString(16))}));
  const inventory=inspectRenderLinks(read32,read8);
  const selected=inventory.links.filter(({link})=>RENDER_LINK_GROUPS[group]&(1<<link));
  if(!selected.length)throw Error('Selected render-link group has no live objects');
  const codeWrites=[];
  if(!enabled&&inactive){
    CAVE_WORDS.forEach((word,i)=>codeWrites.push([RENDER_LINK_CAVE+i*4,word]));
    codeWrites.push([RENDER_LINK_MASK,RENDER_LINK_GROUPS[group]],[RENDER_LINK_HOOK,HOOK_BRANCH]);
  }else if(enabled&&active){
    codeWrites.push([RENDER_LINK_HOOK,ORIGINAL],[RENDER_LINK_MASK,0]);
    CAVE_WORDS.forEach((_,i)=>codeWrites.push([RENDER_LINK_CAVE+i*4,0]));
  }
  return{diagnosticOnly:true,passed:false,enabled,group,mask:RENDER_LINK_GROUPS[group],selected,inventory,codeWrites,
    limits:'Selected GX-link draw callbacks are skipped. Output is incomplete and cannot pass gameplay image acceptance.'};
}
