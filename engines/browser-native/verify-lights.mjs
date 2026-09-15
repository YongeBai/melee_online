export function verifyLights(module) {
  const light=module._malloc(64),color=module._malloc(4);let cases=0;
  function check(offset,expected,tolerance=0) {
    for(let i=0;i<expected.length;i++) {
      const actual=module.HEAPF32[(light+offset)/4+i],value=Math.fround(expected[i]);
      if(!Number.isFinite(actual)||Math.abs(actual-value)>tolerance*(1+Math.abs(value)))throw Error('Original SDK light-object value mismatch');
    }
    cases++;
  }
  try {
    module.HEAPU8.fill(0xa5,light,light+64);
    module._GXInitLightPos(light,1.25,-2.5,3.75);check(40,[1.25,-2.5,3.75]);
    module._GXInitLightDir(light,0.25,0.5,-0.75);check(52,[-0.25,-0.5,0.75]);
    for(const channels of [[0x12,0x34,0x56,0x78],[0xfe,0xdc,0xba,0x98]]) {
      module._portLightColor(light,...channels);module._GXGetLightColor(light,color);
      const packed=channels.reduce((v,c)=>v*256+c,0);
      if(new DataView(module.HEAPU8.buffer).getUint32(light+12,true)!==packed||
        module.HEAPU8.subarray(color,color+4).some((v,i)=>v!==channels[i]))throw Error('Native light color packing mismatch');cases++;
    }
    for(const [mode,expected] of [[0,[1,0,0]],[1,[1,0.1,0]],[2,[1,0.05,0.005]],[3,[1,0,0.01]],[99,[1,0,0]]]) {
      module._GXInitLightDistAttn(light,10,0.5,mode);check(28,expected);
    }
    for(const [distance,brightness] of [[-1,0.5],[10,0],[10,1]]) {
      module._GXInitLightDistAttn(light,distance,brightness,1);check(28,[1,0,0]);
    }
    const coefficients=[[1,0,0],[-500,1000,0],[-1,2,0],[0,-1,2],[-3,8,-4],[-8,24,-16],[-1,8,-8]];
    for(let mode=0;mode<coefficients.length;mode++){module._GXInitLightSpot(light,60,mode);check(16,coefficients[mode],0.00001);}
    for(const cutoff of [-1,0,91]){module._GXInitLightSpot(light,cutoff,2);check(16,[1,0,0]);}
    if(module.HEAPU8.subarray(light,light+12).some(v=>v!==0xa5))throw Error('SDK light operation changed reserved words');
    return {passed:true,cases,originalSdk:true,limitation:'CPU light-object construction only; no lighting submission or rendered lighting parity'};
  } finally {module._free(light);module._free(color);}
}
