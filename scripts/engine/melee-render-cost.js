// Diagnostic only: bypass scene-object draw dispatch inside the original
// camera passes. Native camera setup and frame/VI loop remain in place.
// Blank/incomplete output is expected; never use this as a playable setting.
export const RENDER_DISPATCH=0x80390ed0;
export const RENDER_COST_SCOPES={
  scene:{address:RENDER_DISPATCH,bytes:0xf0,hash:0xde45893f},
  mesh:{address:0x8036e8ac,bytes:0x144,hash:0x05e03a65},
  matrixsetup:{address:0x8036e83c,bytes:0x70,hash:0x43015a0b},
  rigidmatrix:{address:0x8036e12c,bytes:0x13c,hash:0x69370dda},
  sharedmatrix:{address:0x8036e268,bytes:0x25c,hash:0x658e92a4},
  envelope:{address:0x8036e4c4,bytes:0x378,hash:0x44f045ae},
  drawable:{address:0x8035e388,bytes:0xb8,hash:0x68cc1f2f},
  texture:{address:0x80360950,bytes:0x2e8,hash:0xe1eb5d2e},
  tev:{address:0x80385448,bytes:0x6c,hash:0xf543a920},
};
export function planRenderCostDiagnostic(read32,enabled,scope='scene'){
  if(typeof enabled!=='boolean')throw Error('Render-cost mode must be boolean');
  if(!Object.hasOwn(RENDER_COST_SCOPES,scope))throw Error('Unknown render diagnostic scope');
  const {address,bytes,hash:expectedHash}=RENDER_COST_SCOPES[scope];
  const original=0x7c0802a6,ret=0x4e800020,current=read32(address);
  if(![original,ret].includes(current))throw Error('Unexpected render-dispatch hook');
  let hash=2166136261;
  for(let i=0;i<bytes;i+=4)hash=Math.imul(hash^(i===0?original:read32(address+i)),16777619)>>>0;
  if(hash!==expectedHash)throw Error('Render diagnostic requires original USA 1.02 dispatch');
  const target=enabled?original:ret;
  return{diagnosticOnly:true,passed:false,enabled,scope,writes:current===target?[]:[[address,target]],
    limits:'Blank/incomplete rendering. Scene bypass removes object draw callbacks; drawable removes material setup and meshes; mesh removes skinning and primitive submission; matrixsetup bypasses polygon matrix selection; rigidmatrix/sharedmatrix/envelope bypass their respective GX matrix loads; texture removes texture resource/matrix/object setup and loading; tev removes compiled material combiner setup and constant updates. Each includes downstream graphics work. Not a gameplay optimization or GPU-only timing.'};
}
