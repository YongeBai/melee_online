// GX state emitted by the original HSD material compiler/setup, copied before
// the next material reuses the capture buffer. Not an emulated command stream.
export function readNativeTev(module,joint,displayIndex) {
  const p=module._portMaterialTev(joint,displayIndex);
  if(!p||p%4||p+2192>module.HEAPU8.length)throw Error('Native TEV snapshot bounds');
  const words=Int32Array.from(new Int32Array(module.HEAPU8.buffer,p,548)),n=words[0];
  if(n<1||n>16)throw Error('Native TEV stage capacity');
  const rows=(at,count,stride)=>Array.from({length:count},(_,i)=>Array.from(words.slice(at+i*stride,at+(i+1)*stride)));
  const stages=rows(36,n,32);validateTevStages(stages);
  return {stages,registers:rows(4,4,4),konst:rows(20,4,4),registerMask:words[1],constantMask:words[2],syncs:words[3]};
}

export function validateTevStages(stages) {
  if(!Array.isArray(stages)||stages.length<1||stages.length>16)throw Error('Native TEV stage capacity');
  const range=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
  for(const s of stages) {
    if(!Array.isArray(s)||s.length!==32||!s.every(Number.isInteger))throw Error('Native TEV stage layout');
    if(![0,1,2,3,4,5,6,7,255].includes(s[0])||(!range(s[1],7)&&s[1]!==255)||![0,1,2,3,4,5,6,7,255].includes(s[2]))throw Error('Native TEV order');
    for(const i of [22,23])if(!range(s[i],3))throw Error('Native TEV swap');
    if(!range(s[24],31)||!range(s[25],31))throw Error('Native TEV constant selector');
    if(s[3]!==-1){if(!range(s[3],4))throw Error('Native TEV preset mode');continue;}
    for(const i of [4,13])if(![0,1,8,9,10,11,12,13,14,15].includes(s[i]))throw Error('Native TEV operation');
    for(const i of [5,6,8,14,15,17])if(!range(s[i],3))throw Error('Native TEV configuration');
    for(const i of [7,16])if(!range(s[i],1))throw Error('Native TEV clamp');
    if((s[4]<2&&s[5]===3)||(s[13]<2&&s[14]===3))throw Error('Native TEV regular bias');
    if(s.slice(9,13).some(x=>!range(x,15))||s.slice(18,22).some(x=>!range(x,7)))throw Error('Native TEV input');
  }
}

// GXSetTevOp from the pinned SDK: later stages use PREV, stage zero uses RAS.
export function explicitTevStages(stages) {
  validateTevStages(stages);
  return stages.map((input,i)=>{
    const s=input.slice();if(s[3]===-1)return s;
    const color=i?0:10,alpha=i?0:5,mode=s[3];s[3]=-1;
    s.splice(4,5,0,0,0,1,0);s.splice(13,5,0,0,0,1,0);
    s.splice(9,4,...[[15,8,color,15],[color,8,9,15],[color,12,8,15],[15,15,15,8],[15,15,15,color]][mode]);
    s.splice(18,4,...[[7,4,alpha,7],[7,7,7,alpha],[7,4,alpha,7],[7,7,7,4],[7,7,7,alpha]][mode]);
    return s;
  });
}
