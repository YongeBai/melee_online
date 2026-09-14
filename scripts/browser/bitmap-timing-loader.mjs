// Fail closed against unexpected generated loaders; opt-in via credit[3].
export function instrumentBitmapTiming(source){
  const replacements=[
    ['Module._detachedOglCredit=new Int32Array(new SharedArrayBuffer(12))','Module._detachedOglCredit=new Int32Array(new SharedArrayBuffer(16))'],
    ['let bitmap;try{bitmap=canvas.transferToImageBitmap();','let bitmap;try{const timing=Atomics.load(credit,3)?{sequence:Atomics.load(credit,1),exportStartAt:performance.timeOrigin+performance.now()}:undefined;bitmap=canvas.transferToImageBitmap();if(timing)timing.exportEndAt=performance.timeOrigin+performance.now();'],
    ['{type:"detachedOglFrame",bitmap,width:bitmap.width,height:bitmap.height,credit}','{type:"detachedOglFrame",bitmap,width:bitmap.width,height:bitmap.height,credit,timing}']
  ];
  for(const [from,to]of replacements){if(source.split(from).length!==2)throw Error('Unexpected bitmap exporter: '+from);source=source.replace(from,to);}
  return source;
}
