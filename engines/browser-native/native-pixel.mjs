// Full original HSD material setup, recorded independently of the TEV buffer.
export function readNativePixel(module) {
  const p=module._portMaterialPixelState();
  if(!p||p%4||p+320>module.HEAPU8.length)throw Error('Native pixel snapshot bounds');
  const w=Uint32Array.from(new Uint32Array(module.HEAPU8.buffer,p,80));
  if(w[0]!==511||w[1]>2||w[20]>15||w[21]>15||w[22]>15)throw Error('Incomplete native pixel state');
  for(const i of [6,8,9,10,11,12,14])if(w[i]>1)throw Error('Native pixel boolean');
  if(w[2]>3||w[3]>7||w[4]>7||w[5]>15||w[7]>7||w[13]>255||w[15]>7||w[16]>255||w[17]>3||w[18]>7||w[19]>255)throw Error('Native pixel configuration');
  const channels=Array.from({length:4},(_,i)=>{
    if(!(w[20]&(1<<i)))return null;const s=w.slice(32+i*8,38+i*8);
    if(s[0]>1||s[1]>1||s[2]>1||s[3]>255||s[4]>2||s[5]>2)throw Error('Native light channel configuration');
    return {enabled:s[0],ambientSource:s[1],materialSource:s[2],lights:s[3],diffuse:s[4],attenuation:s[5]};
  });
  const colors=Array.from({length:2},(_,i)=>({ambient:Array.from(w.slice(64+i*8,68+i*8)),material:Array.from(w.slice(68+i*8,72+i*8))}));
  if(colors.some(c=>[...c.ambient,...c.material].some(x=>x>255)))throw Error('Native light channel color');
  channels.forEach((c,i)=>{if(!c)return;
    if((!c.materialSource&&!(w[22]&(1<<i)))||(c.enabled&&!c.ambientSource&&!(w[21]&(1<<i))))throw Error('Native light channel missing color');
  });
  return {channelCount:w[1],channels,colors,ambientMask:w[21],materialMask:w[22],blend:{type:w[2],source:w[3],destination:w[4],logic:w[5]},
    depth:{enabled:w[6],compare:w[7],update:w[8],beforeTexture:w[9]},colorUpdate:w[10],alphaUpdate:w[11],destinationAlpha:{enabled:w[12],alpha:w[13]},
    dither:w[14],alphaTest:{compare0:w[15],reference0:w[16],operation:w[17],compare1:w[18],reference1:w[19]}};
}

// GX alpha comparisons operate on the final 8-bit combiner alpha, before blend.
export function gxAlphaTest(alpha,{compare0,reference0,operation,compare1,reference1}) {
  if(!Number.isInteger(alpha)||alpha<0||alpha>255)throw Error('GX alpha test input');
  const compare=(op,ref)=>{
    if(!Number.isInteger(ref)||ref<0||ref>255)throw Error('GX alpha reference');
    switch(op){case 0:return false;case 1:return alpha<ref;case 2:return alpha===ref;case 3:return alpha<=ref;
      case 4:return alpha>ref;case 5:return alpha!==ref;case 6:return alpha>=ref;case 7:return true;default:throw Error('GX alpha comparison');}
  };
  const a=compare(compare0,reference0),b=compare(compare1,reference1);
  switch(operation){case 0:return a&&b;case 1:return a||b;case 2:return a!==b;case 3:return a===b;default:throw Error('GX alpha operation');}
}
