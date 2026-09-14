// USA 1.02 experiment. Ground loads stage particles into bank 30; Fountain's
// main object spawns its ambient generators there. Skip only their draw body.
// Particle generation, updates, sorting, RNG and all other banks stay native.
export const PARTICLE_DRAW_HOOK=0x803a02c4;
export const PARTICLE_DRAW_ORIGINAL=0x800107a0;
export const PARTICLE_DRAW_CAVE=0x80002d00;
const branch=(from,to)=>(0x48000000|((to-from)&0x03fffffc))>>>0;
export function fountainParticleDrawCode(){
 const code=[],normalBranches=[];
 const emit=word=>code.push(word>>>0);
 const normal=()=>{normalBranches.push(code.length);emit(0);};
 // Preserve r12, the stack pointer and the entire CR. r0 is overwritten by the
 // displaced instruction on the native path. No floating-point instruction,
 // LR, CTR or XER change is introduced. The original size compare still runs.
 [0x9421fff0,0x91810008,0x7d800026,0x9181000c,
  0x881e0008,0x2c00001e].forEach(emit);normal();
 [0x3d808048,0x880c9d30,0x2c000002].forEach(emit);normal();
 [0x880c9d33,0x2c000002].forEach(emit);normal();
 [0x3d808047,0xa00cdb76,0x2c000002].forEach(emit);normal();
 const restore=()=>[0x8181000c,0x7d8ff120,0x81810008,0x38210010].forEach(emit);
 restore();
 // Advance directly to the next particle. Keep prev_kind describing the last
 // rendered particle, so the next fighter effect gets the correct GX state.
 emit(branch(PARTICLE_DRAW_CAVE+code.length*4,0x803a388c));
 const normalIndex=code.length;restore();emit(PARTICLE_DRAW_ORIGINAL);
 emit(branch(PARTICLE_DRAW_CAVE+code.length*4,PARTICLE_DRAW_HOOK+4));
 for(const index of normalBranches)code[index]=(0x40820000|((normalIndex-index)*4))>>>0;
 return code;
}
export function planFountainParticles(read32,enabled){
 if(typeof enabled!=='boolean')throw Error('Particle visibility must be boolean');
 const hooked=branch(PARTICLE_DRAW_HOOK,PARTICLE_DRAW_CAVE),current=read32(PARTICLE_DRAW_HOOK);
 if(![PARTICLE_DRAW_ORIGINAL,hooked].includes(current))throw Error('Unexpected particle draw hook');
 for(const[address,word]of [[0x803a02b4,0xc03e004c],[0x803a02bc,0xfc010040],[0x803a02c0,0x418035c8],[0x803a02c8,0x2c000000],[0x803a3888,0x827e0004],[0x803a388c,0x83de0000],[0x803a3890,0x281e0000]])
  if(read32(address)!==word)throw Error('Unexpected USA 1.02 particle draw procedure');
 const code=fountainParticleDrawCode(),codeWrites=[];
 for(const[index,word]of code.entries()){
  const address=PARTICLE_DRAW_CAVE+index*4,value=read32(address);
  if(value!==0&&value!==word)throw Error('Particle code-handler area already occupied');
  if(current===hooked&&value!==word)throw Error('Incomplete installed particle hook');
  if(!enabled&&value!==word)codeWrites.push([address,word]);
 }
 const target=enabled?PARTICLE_DRAW_ORIGINAL:hooked;
 return {objects:[{bank:30,scope:'Fountain match only',enabled}],enabled,
  codeWrites,writes:current===target?[]:[[PARTICLE_DRAW_HOOK,target]],codeBytes:code.length*4};
}
export function inspectParticleBanks(read32,read8,readFloat){
 const seen=new Set(),banks=new Map();
 for(let link=0;link<16;link++){
  let particle=read32(0x804d0908+link*4);
  while(particle){
   if((particle&3)||particle<0x80003100||particle+0x98>0x81800000||seen.has(particle)||seen.size>=10000)throw Error('Invalid particle list');
   seen.add(particle);const bank=read8(particle+8),size=readFloat(particle+0x4c);
   const row=banks.get(bank)||{bank,particles:0,aboveDrawThreshold:0,links:[]};
   row.particles++;if(!(size<1.19209290e-7))row.aboveDrawThreshold++;if(!row.links.includes(link))row.links.push(link);
   banks.set(bank,row);particle=read32(particle);
  }
 }
 return {total:seen.size,banks:[...banks.values()].sort((a,b)=>a.bank-b.bank),limits:'Live particle count, not CPU time or executed draw count.'};
}
