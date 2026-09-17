export const nativeKeyboardCodes=new Set(['KeyZ','KeyS','KeyX','KeyV','KeyC','KeyT','ShiftLeft','ShiftRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyI','KeyJ','KeyK','KeyL','AltLeft']);
export const neutralNativeSample=()=>[0,0,0,0,0,0,0];
const keyboardButtons=new Map([['KeyZ',0x100],['KeyS',0x200],['KeyX',0x400],['KeyV',0x800],['KeyC',0x10],['KeyT',8],['ShiftLeft',0x20],['ShiftRight',0x40]]);
export function keyboardNativeSample(keys){
  let buttons=0;for(const [key,bit]of keyboardButtons)if(keys.has(key))buttons|=bit;
  const x=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),y=Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown'));
  const scale=(keys.has('AltLeft') ? .5 : 1)/(x&&y?Math.SQRT2:1);
  return [buttons,x*scale,y*scale,Number(keys.has('KeyL'))-Number(keys.has('KeyJ')),Number(keys.has('KeyI'))-Number(keys.has('KeyK')),Number(keys.has('ShiftRight')),Number(keys.has('ShiftLeft'))];
}
const axis=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
const pressure=value=>Math.max(0,axis(value));
// Retain normalized analog magnitudes. Original fighter code applies its own
// deadzones; rescaling a second deadzone here changes tilt/DI/shield thresholds.
// Mapping follows the existing browser controller layout. Nonstandard adapters
// need an explicit device mapping and must not silently impersonate this one.
export function standardNativeSample(pad){
  if(!pad||pad.connected===false||pad.mapping!=='standard')return neutralNativeSample();
  const mapping=[[0,0x100],[2,0x200],[1,0x400],[3,0x800],[5,0x10],[9,0x1000],[12,8],[13,4],[14,1],[15,2]];
  let buttons=0;for(const [index,bit]of mapping)if(pad.buttons?.[index]?.pressed)buttons|=bit;
  const l=pressure(pad.buttons?.[6]?.value),r=pressure(pad.buttons?.[7]?.value);
  // The browser's pressed flag commonly becomes true halfway through an analog
  // trigger. Only full travel supplies the digital click; soft pressure stays soft.
  if(l>=.99)buttons|=0x40;if(r>=.99)buttons|=0x20;
  return [buttons,axis(pad.axes?.[0]),-axis(pad.axes?.[1]),axis(pad.axes?.[2]),-axis(pad.axes?.[3]),l,r];
}
export function completeNativeSample(sample){
  if(!Array.isArray(sample)||(sample.length!==3&&sample.length!==7))throw Error('Controller sample must contain buttons, sticks and optional shoulders');
  const result=sample.length===3?[...sample,0,0,0,0]:sample;
  if(!Number.isInteger(result[0])||result[0]<0||result[0]>0x1f7f||(result[0]&~0x1f7f)||result.slice(1).some((v,i)=>!Number.isFinite(v)||Math.abs(v)>1||(i>=4&&v<0)))throw Error('Invalid normalized controller sample');
  return result;
}
