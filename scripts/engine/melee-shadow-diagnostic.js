// Private diagnostic only. Removing dynamic shadows changes competitive visual
// cues, so its timings must never count as a playable 720p60 acceptance result.
export const SHADOW_DIAGNOSTIC_PROC=0x8000f38c;
export function planShadowDiagnostic(read32,enabled){
 if(typeof enabled!=='boolean')throw Error('Shadow diagnostic mode must be boolean');
 const first=read32(SHADOW_DIAGNOSTIC_PROC);
 if(![0x7c0802a6,0x4e800020].includes(first))throw Error('Unrecognized shadow entry');
 let hash=2166136261;for(let i=4;i<0x66c;i+=4)hash=Math.imul(hash^read32(SHADOW_DIAGNOSTIC_PROC+i),16777619)>>>0;
 if(hash!==0x202007de)throw Error('Shadow diagnostic requires the original USA 1.02 routine');
 const target=enabled?0x7c0802a6:0x4e800020;
 return {objects:[{procedure:SHADOW_DIAGNOSTIC_PROC,enabled}],writes:first===target?[]:[[SHADOW_DIAGNOSTIC_PROC,target]],diagnosticOnly:true};
}
