// GALE01 USA 1.02 audio-only optimization. AUX A is Melee's standard room
// reverb return. A null callback also makes AX stop sending DSP input to that
// buffer; clearing its three rotating buffers removes only the wet return.
// Dry voices, music, gameplay cues and AUX B's delay remain native.
export const AX_AUX_A_CALLBACK=0x804d74f8;
export const AX_AUX_A_CONTEXT=0x804d7500;
export const AX_AUX_A_BUFFER=0x804a8e80;
export const AX_AUX_A_BUFFER_BYTES=0x1680;
export const AX_REVERB_STD_CALLBACK=0x8035ce78;
export const AX_REVERB_STD_WORK=0x804c5e00;
export const AX_DRIVER_STATE=0x804d603c;

export function planAuxReverb(read32,enabled){
  if(typeof enabled!=='boolean')throw Error('Reverb mode must be boolean');
  const expected=[[AX_REVERB_STD_CALLBACK,0x7c0802a6],[AX_REVERB_STD_CALLBACK+0x0c,0x8804013c],
    [AX_REVERB_STD_CALLBACK+0x14,0x4082000c],[AX_REVERB_STD_CALLBACK+0x1c,0x4bfffa7d],
    [AX_REVERB_STD_CALLBACK+0x2c,0x4e800020]];
  for(const[address,word]of expected)if(read32(address)!==word)
    throw Error('Reverb control requires the unmodified USA 1.02 callback');
  const type=read32(AX_DRIVER_STATE)>>>8&15;
  if(type!==2)throw Error('Expected Melee standard reverb on AUX A');
  const callback=read32(AX_AUX_A_CALLBACK),context=read32(AX_AUX_A_CONTEXT);
  if(![0,AX_REVERB_STD_CALLBACK].includes(callback))throw Error('Unexpected AUX A callback');
  if(![0,AX_REVERB_STD_WORK].includes(context))throw Error('Unexpected AUX A context');
  if((callback===0)!==(context===0))throw Error('Inconsistent AUX A callback state');
  const writes=[],targetCallback=enabled?AX_REVERB_STD_CALLBACK:0,targetContext=enabled?AX_REVERB_STD_WORK:0;
  if(callback!==targetCallback)writes.push([AX_AUX_A_CALLBACK,targetCallback]);
  if(context!==targetContext)writes.push([AX_AUX_A_CONTEXT,targetContext]);
  if(!enabled)for(let offset=0;offset<AX_AUX_A_BUFFER_BYTES;offset+=4)
    if(read32(AX_AUX_A_BUFFER+offset)!==0)writes.push([AX_AUX_A_BUFFER+offset,0]);
  return {objects:[{channel:0,type:'standard',enabled}],writes,enabled,
    effect:'wet standard reverb only',dryMixPreserved:true,bufferBytes:AX_AUX_A_BUFFER_BYTES};
}
