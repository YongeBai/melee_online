// Generated from our snapshot-page-kernel.wat by scripts/native-port/build-page-kernel.mjs.
// No game code/data. Compares/copies one exact 64 KiB page between two memories.
export const pageKernelSourceSha256='639758333fab6fcdcebf4401be5c0eef5e09ac0896ddab849fc5d61688262190';
const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,1,22,4,96,2,127,127,0,96,2,127,127,1,127,96,1,127,0,96,3,127,127,127,0,2,32,2,3,101,110,118,4,108,105,118,101,2,1,0,128,128,2,3,101,110,118,5,112,97,103,101,115,2,1,0,128,128,2,3,7,6,1,0,0,2,3,0,7,61,6,5,101,113,117,97,108,0,0,7,99,111,112,121,79,117,116,0,1,6,99,111,112,121,73,110,0,2,5,99,108,101,97,114,0,3,9,99,111,112,121,82,97,110,103,101,0,4,10,99,108,101,97,114,82,97,110,103,101,0,5,10,133,1,6,62,1,1,127,32,0,65,128,128,4,106,33,2,3,64,32,0,253,0,4,0,32,1,253,0,68,1,0,253,81,253,83,4,64,65,0,15,11,32,0,65,16,106,33,0,32,1,65,16,106,33,1,32,0,32,2,73,13,0,11,65,1,11,14,0,32,0,32,1,65,128,128,4,252,10,1,0,11,14,0,32,0,32,1,65,128,128,4,252,10,0,1,11,13,0,32,0,65,0,65,128,128,4,252,11,0,11,12,0,32,0,32,1,32,2,252,10,0,1,11,11,0,32,0,65,0,32,1,252,11,0,11]);
let compiled;
export function createSnapshotPageKernel(live){
 if(!WebAssembly.validate(bytes))return null;
 compiled??=new WebAssembly.Module(bytes);
 const memory=new WebAssembly.Memory({initial:1,maximum:32768});
 const {exports}=new WebAssembly.Instance(compiled,{env:{live,pages:memory}});
 return {memory,...exports};
}
