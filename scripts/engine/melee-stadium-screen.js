// USA 1.02, Pokémon Stadium only. Keep the video-board state machine, RNG,
// completion flags, stage transformations and gameplay camera. Suppress only
// its three texture-copy call sites and the board's draw call. Keep the
// custom render wrapper's state updates (grStadium_801D1EF8) running.
export const STADIUM_SCREEN_CALLS = [
  [0x801d2f60,0x4be3f369,0x38c00001,0x38600001,0x800122c8],
  [0x801d300c,0x4be3f2bd,0x38c00000,0x881f0018,0x800122c8],
  [0x801d30c0,0x4be3f209,0xa0a3001c,0x881f0018,0x800122c8],
  [0x801d509c,0x4bff0d15,0x389f0000,0x8001001c,0x801c5db0],
];
const DRAW=0x801d5074,NOP=0x60000000;
const valid=(p,n)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+n<=0x81800000;
export function planStadiumScreen(read32,read8,enabled) {
 if(typeof enabled!=='boolean')throw Error('Stadium screen visibility must be boolean');
 if(read32(DRAW)!==0x7c0802a6||read32(0x801d5090)!==0x4bffce69)throw Error('Unexpected Stadium draw procedures');
 const codeWrites=[],writes=[],objects=[];
 for(const[address,original,before,after]of STADIUM_SCREEN_CALLS){
  const current=read32(address);
  if(![original,NOP].includes(current)||read32(address-4)!==before||read32(address+4)!==after)throw Error('Unexpected USA 1.02 Stadium texture-copy site');
  const target=enabled?original:NOP;if(current!==target)codeWrites.push([address,target]);
 }
 const lists=read32(0x804d782c);if(!valid(lists,24))throw Error('Invalid Stadium object lists');
 let g=read32(lists+20);const seen=new Set();
 while(g){
  if(!valid(g,0x38)||seen.has(g)||seen.size>=128)throw Error('Invalid Stadium object chain');seen.add(g);
  const ground=read32(g+0x2c);
  if(read8(g)===0&&read8(g+1)===3&&valid(ground,0xfc)&&read32(ground+4)===g&&read32(ground+0x14)===1){
   const current=read32(g+0x1c),root=read32(g+0x28);
   if(current!==DRAW||!valid(root,0x88))throw Error('Unexpected Stadium video board');
   // These wrappers are created by grStadium_801D2278 and remain active.
   for(const offset of[0xd4,0xd8,0xdc])if(!valid(read32(ground+offset),0x38))throw Error('Stadium video wrappers not ready');
   objects.push({gobj:g,ground,root,mapId:1});
  }
  g=read32(g+8);
 }
 if(objects.length!==1)throw Error('Expected one Stadium video board');
 return {enabled,objects,codeWrites,writes,copySites:STADIUM_SCREEN_CALLS.slice(0,3).map(([address])=>address),drawSite:0x801d509c};
}

// Replay probes for the gameplay stage objects, excluding the video board.
// Keep exact float bits; this is observable-state validation, not whole-machine
// equivalence (the screen textures and graphics command stream intentionally differ).
export function inspectStadiumPlatforms(read32,read8) {
 const lists=read32(0x804d782c);if(!valid(lists,24))throw Error('Invalid Stadium object lists');
 const objects=[],seen=new Set();let g=read32(lists+20);
 while(g){
  if(!valid(g,0x38)||seen.has(g)||seen.size>=128)throw Error('Invalid Stadium object chain');seen.add(g);
  const ground=read32(g+0x2c),mapId=valid(ground,0xf4)?read32(ground+0x14):-1;
  if(read8(g)===0&&read8(g+1)===3&&valid(ground,0xf4)&&read32(ground+4)===g&&mapId>=2&&mapId<=9){
   const joints=[],seenJ=new Set();
   const visit=(j,depth=0)=>{
    if(depth>64)throw Error('Stadium joint depth exceeded');
    while(j){
     if(!valid(j,0x88)||seenJ.has(j)||seenJ.size>=2048)throw Error('Invalid Stadium joint tree');seenJ.add(j);
     joints.push({local:Array.from({length:10},(_,i)=>read32(j+0x1c+i*4)),matrix:Array.from({length:12},(_,i)=>read32(j+0x44+i*4))});
     if(!(read32(j+20)&0x1000))visit(read32(j+16),depth+1);
     j=read32(j+8);
    }
   };
   const root=read32(g+0x28);if(!valid(root,0x88))throw Error('Invalid Stadium gameplay root');
   visit(root);
   objects.push({mapId,modeWords:Array.from({length:13},(_,i)=>read32(ground+0xc4+i*4)),joints});
  }
  g=read32(g+8);
 }
 if(!objects.some(o=>o.mapId===2))throw Error('Stadium transformation controller absent');
 return objects;
}
