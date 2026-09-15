// Opt-in preview configuration. Promotion requires documented real-browser tests.
export const browserDefaults = {
  engine:'wasm',video:'ogl',oglproxy:'worker',renderheight:'720',oglsab:'0',oglsync:'1',
  blit:'bitmap',pace:'raf',queueclock:'raf',
  wasmjit:'2',forcejit:'1',jitwarmup:'900',shortprefix:'1',smearcompile:'0',
  determinism:'1',icache:'0',dcbfast:'1',dcbbatch:'1',inlinedispatch:'1',
};
