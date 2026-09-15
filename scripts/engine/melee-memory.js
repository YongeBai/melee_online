import {planRenderCostDiagnostic,RENDER_COST_SCOPES} from './melee-render-cost.js';
import {inspectRenderLinks,planRenderLinkDiagnostic,RENDER_LINK_CAVE,RENDER_LINK_CODE_BYTES,RENDER_LINK_HOOK} from './melee-render-groups.js';
import {planAuxReverb} from './melee-reverb.js';
import {planYoshiBackgroundAnimation,inspectYoshiGameplay} from './melee-yoshi-animation.js';
import {inspectStageAnimation} from './melee-stage-animation.js';
import {planStadiumScreen,inspectStadiumPlatforms} from './melee-stadium-screen.js';
import {planStadiumTransformations,STADIUM_TRANSFORMATION_CONTROLLER} from './melee-stadium-freeze.js';
import {planFrozenStadiumDecoration} from './melee-stadium-decoration.js';
import {planStaticBackgroundAnimation} from './melee-static-background.js';
import {planFountainParticles,inspectParticleBanks,PARTICLE_DRAW_CAVE,PARTICLE_DRAW_HOOK} from './melee-fountain-particles.js';
import {planShadowDiagnostic,SHADOW_DIAGNOSTIC_PROC} from './melee-shadow-diagnostic.js';
import {planFountainAnimation,FOUNTAIN_ANIMATION_CAVE,FOUNTAIN_ANIMATION_BYTES} from './melee-fountain-animation.js';
import {planFighterModelDetail} from './melee-model-detail.js';
import {planFountainScenery,inspectFountainGeometry,inspectYoshiGeometry,inspectTournamentStageGeometry,planFinalDestinationBottomVisual,inspectYoshiStaticDrawObjectBytes,planYoshiOffscreenDecor,planYoshiStableDrawCostDiagnostic,planYoshiMinimalStage,planFountainGeometryView,planFountainDecorations} from './melee-scenery.js';
const fountainGeometryBaseline=new WeakMap();
import {planFountainReflection} from './melee-reflection.js';
import { planStageBackground } from './melee-background.js';
import { installTapJumpHooks, TAP_JUMP_FLAG } from "./melee-tap-jump.js";
import { applyCssLayout } from "./melee-css-layout.js";
import { applyCssForeground } from "./melee-foreground.js";
// GALE01 revision 1.02. MEM1 is located by matching original executable bytes.
const signature = [
  124, 8, 2, 166, 60, 96, 128, 76, 144, 1, 0, 4, 148, 33, 255, 40, 219, 225, 0, 208, 219, 193, 0,
  200, 219, 161, 0, 192, 190, 225, 0, 156,
];
let mem1;
export function inspectMelee(module) {
  const heap = module.HEAPU8;
  if (mem1 === undefined) {
    outer: for (let p = 0; p < heap.length - signature.length; p += 4) {
      if (heap[p] !== signature[0] || heap[p + 1] !== signature[1]) continue;
      for (let i = 2; i < signature.length; i++) if (heap[p + i] !== signature[i]) continue outer;
      const base = p - 0x37750c;
      if (base < 0 || base + 0x1800000 > heap.length) continue;
      if (String.fromCharCode(...heap.subarray(base, base + 6)) !== "GALE01") continue;
      mem1 = base;
      break;
    }
  }
  if (mem1 === undefined) throw new Error("Melee MEM1 signature not found");
  const read = (address, length) =>
    Array.from(heap.subarray(mem1 + address - 0x80000000, mem1 + address - 0x80000000 + length));
  const view = new DataView(heap.buffer);
  const u32 = (a) => view.getUint32(mem1 + a - 0x80000000);
  const ptr = u32(0x804d6720);
  const major = read(0x80479d30, 1)[0];
  const minor = read(0x80479d33, 1)[0];
  const sceneKind = ptr >= 0x80000000 && ptr < 0x81800000 ? read(ptr, 1)[0] : -1;
  const valid = (p) => p >= 0x80003100 && p < 0x81800000;
  const fighters = [];
  const cursor = major === 2 && minor === 0 && sceneKind === 8 ? u32(0x804a0bc0) : 0;
  const cssCursor =
    valid(cursor) && cursor + 0x14 <= 0x81800000
      ? {
          x: view.getFloat32(mem1 + cursor + 0xc - 0x80000000),
          y: view.getFloat32(mem1 + cursor + 0x10 - 0x80000000),
        }
      : undefined;
  const cssCursors = [0, 1].map((port) => {
    const c = major === 2 && minor === 0 && sceneKind === 8 ? u32(0x804a0bc0 + port * 4) : 0;
    return valid(c) && c + 0x14 <= 0x81800000
      ? {
          x: view.getFloat32(mem1 + c + 12 - 0x80000000),
          y: view.getFloat32(mem1 + c + 16 - 0x80000000),
        }
      : undefined;
  });
  let match, camera;
  if (major === 2 && minor === 2 && sceneKind === 2) {
    // Original USA 1.02 game_camera (cm/types.h). Read-only diagnostics:
    // distinguish native camera movement from renderer/projection faults.
    const cam = 0x80452c68;
    const float = (a) => view.getFloat32(mem1 + a - 0x80000000);
    const vec = (a) => [float(a), float(a + 4), float(a + 8)];
    camera = {
      mode: u32(cam + 4),
      interest: vec(cam + 0x14),
      targetInterest: vec(cam + 0x20),
      position: vec(cam + 0x2c),
      targetPosition: vec(cam + 0x38),
      fov: float(cam + 0x44),
      pitchOffset: float(cam + 0x2c8),
      yawOffset: float(cam + 0x2cc),
    };
    const rules = 0x8046b6a0 + 0x24c8;
    match = {
      pauser: view.getInt8(mem1 + 0x46b6a1),
      elapsed: u32(0x8046b6a0 + 0x24),
      timeRemaining: u32(0x8046b6a0 + 0x28),
      stage: view.getUint16(mem1 + rules + 14 - 0x80000000),
      timeLimit: u32(rules + 16),
      items: view.getInt8(mem1 + rules + 11 - 0x80000000),
      teams: read(rules + 8, 1)[0],
      cpuLevel: read(0x80480530 + 0x60 + 0x24 + 15, 1)[0],
    };
    for (let i = 0; i < 2; i++) {
      const slot = 0x80453080 + i * 0xe90,
        index = read(slot + 0xc, 1)[0];
      const gobj = index < 2 ? u32(slot + 0xb0 + index * 4) : 0;
      const fp = valid(gobj) ? u32(gobj + 0x2c) : 0;
      if (valid(fp))
        fighters.push({
          port: i,
          playerId: read(fp + 0xc, 1)[0],
          controllerIndex: read(slot + 0x46, 1)[0],
          character: u32(slot + 4),
          slotType: u32(slot + 8),
          stocks: read(slot + 0x8e, 1)[0],
          damage: view.getFloat32(mem1 + fp + 0x1830 - 0x80000000),
          action: u32(fp + 0x10),
          x: view.getFloat32(mem1 + fp + 0xb0 - 0x80000000),
          y: view.getFloat32(mem1 + fp + 0xb4 - 0x80000000),
          air: u32(fp + 0xe0),
        });
    }
  }
  return {
    mem1,
    major,
    minor,
    mainPointer: u32(0x804d3ee0).toString(16),
    sceneKind,
    cssCursor,
    cssCursors,
    cssReady: major === 2 && minor === 0 && sceneKind === 8 && valid(u32(0x804d6cc0)),
    cssPlayerKinds: major === 2 && minor === 0 ? [0, 1].map((i) => read(0x80480820 + i * 0x24 + 1, 1)[0]) : undefined,
    cssCharacters:
      major === 2 && minor === 0
        ? [0, 1].map((i) => read(0x804807b0 + 16 + 0x60 + i * 0x24, 1)[0])
        : undefined,
    // SDK default-thread saved FPSCR, useful for replay desync diagnosis.
    osContextFpscr: u32(0x804a855c).toString(16),
    sceneFrame: u32(0x80479d58),
    renderFrame: u32(0x80479d5c),
    tapJump: read(TAP_JUMP_FLAG, 1)[0] === 0,
    tapJumpByPort: [0, 1].map((port) => read(TAP_JUMP_FLAG + port, 1)[0] === 0),
    tapJumpHooks: [
      0x800cae88, 0x800cb818, 0x800cafb0, 0x800d7420, 0x800caf04, 0x800cb060, 0x800cb988,
    ].map((a) => u32(a).toString(16)),
    fighters,
    match,
    camera,
    master: read(0x804c1fac, 68),
    copy: read(0x804c20bc, 68),
    game: read(0x804c21cc, 68),
    scene: read(0x80479d58, 64),
    scenePointer: read(0x804d6720, 4),
  };
}

// Addresses use GALE01 symbols, verified against the supplied DOL. In particular
// GetSaveData returns main+0x1868, despite the current decomp header's 0x1898
// comment. Rules/scene changes only affect data; tap jump uses checked PPC hooks.
export function controlMelee(module, api, action, options = {}) {
  const state = inspectMelee(module);
  const heap = module.HEAPU8,
    v = new DataView(heap.buffer);
  const at = (a) => {
    if (a < 0x80000000 || a >= 0x81800000)
      throw new Error("Invalid Melee address " + a.toString(16));
    return mem1 + a - 0x80000000;
  };
  const u32 = (a) => v.getUint32(at(a));
  const b = (a, n) => v.setUint8(at(a), n);
  const h = (a, n) => v.setUint16(at(a), n);
  const w = (a, n) => v.setUint32(at(a), n);
  const f = (a, n) => v.setFloat32(at(a), n);
  const main = u32(0x804d3ee0);
  const rules = main + 0x1850,
    vs = main + 0x590;
  if(action==='renderCostDiagnostic'){
    if(!api.browserInvalidateGuestCode)throw Error('Render diagnostic requires code invalidation');
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause render diagnostic');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2||![2,3,8,28,31,32].includes(current.match?.stage))throw Error('Render-cost fixture requires a live legal tournament stage match');
      const scope=options.scope||'scene';
      if(options.enabled===false){
        for(const other of Object.keys(RENDER_COST_SCOPES))if(other!==scope&&planRenderCostDiagnostic(u32,true,other).writes.length)throw Error('Another render diagnostic hook is active');
      }
      const plan=planRenderCostDiagnostic(u32,options.enabled,scope);
      for(const[address,value]of plan.writes)w(address,value);
      for(const[address]of plan.writes)if(!api.browserInvalidateGuestCode(address,4))throw Error('Render diagnostic invalidation failed');
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='renderLinkDiagnostic'){
    if(!api.browserInvalidateGuestCode)throw Error('Render-link diagnostic requires code invalidation');
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause render-link diagnostic');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2)throw Error('Render-link diagnostic requires a live match');
      const plan=planRenderLinkDiagnostic(u32,a=>v.getUint8(at(a)),options.enabled,options.group);
      for(const[address,value]of plan.codeWrites)w(address,value);
      if(plan.codeWrites.length){
        if(!api.browserInvalidateGuestCode(RENDER_LINK_HOOK,4))throw Error('Render-link hook invalidation failed');
        if(!api.browserInvalidateGuestCode(RENDER_LINK_CAVE,RENDER_LINK_CODE_BYTES))throw Error('Render-link cave invalidation failed');
      }
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='renderLinkInventory'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for render-link inventory');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2)throw Error('Render-link inventory requires a live match');
      return {...inspectRenderLinks(u32,a=>v.getUint8(at(a))),stage:current.match.stage,sceneFrame:current.sceneFrame};
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if (action === "inspect") return state;
  if(action==='auxReverb'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for reverb change');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2)return {objects:[],writes:[],enabled:options.enabled};
      const plan=planAuxReverb(u32,options.enabled);
      for(const[address,value]of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='stageAnimationInventory'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for animation inventory');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2)throw Error('Animation inventory requires a live match');
      return {...inspectStageAnimation(u32,a=>v.getUint8(at(a))),stage:current.match.stage,sceneFrame:current.sceneFrame};
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if (action === "fountainReflectionState" || action === "stadiumGameplayState" || action === "yoshiGameplayState" || action === 'tournamentGameplayState') {
    const tournament=action==='tournamentGameplayState',stadium=action==='stadiumGameplayState',yoshi=action==='yoshiGameplayState';
    if(tournament?!Number.isInteger(state.match?.stage):state.match?.stage!==(yoshi?8:stadium?3:2))throw Error('Cosmetic state inspection requires a live native stage');
    const valid=(p,bytes)=>Number.isInteger(p)&&!(p&3)&&p>=0x80003100&&p+bytes<=0x81800000;
    const lists=u32(0x804d782c),seed=u32(0x804d5f94);if(!valid(lists,0x24)||!valid(seed,4))throw Error('Invalid stage/RNG pointers');
    const platforms=[],seen=new Set();let g=u32(lists+20);
    while(g){
      if(!valid(g,0x38)||seen.has(g)||seen.size>=128)throw Error('Invalid stage-object list');seen.add(g);
      const ground=u32(g+0x2c),jobj=u32(g+0x28);
      if(v.getUint16(at(g))===3&&valid(ground,0xe0)&&u32(ground+4)===g&&u32(ground+0x14)===4){
        if(!valid(jobj,0x44))throw Error('Invalid platform root');
        platforms.push({positionBits:[0x38,0x3c,0x40].map(o=>u32(jobj+o)),modeTimers:[0xc4,0xc8].map(o=>u32(ground+o)),heightState:[0xd0,0xd4,0xd8,0xdc].map(o=>u32(ground+o))});
      }
      g=u32(g+8);
    }
    const allActors=[];seen.clear();g=u32(lists+0x20);
    while(g){
      if(!valid(g,0x38)||seen.has(g)||seen.size>=16)throw Error('Invalid fighter-object chain');seen.add(g);
      const fp=u32(g+0x2c);
      if(v.getUint16(at(g))!==4||!valid(fp,0x1834)||u32(fp)!==g)throw Error('Invalid fighter object');
      allActors.push({playerId:v.getUint8(at(fp+0xc)),kind:u32(fp+4),action:u32(fp+0x10),facingBits:u32(fp+0x2c),damageBits:u32(fp+0x1830),motionWords:Array.from({length:34},(_,i)=>u32(fp+0x80+i*4))});
      g=u32(g+8);
    }
    allActors.sort((a,b)=>a.playerId-b.playerId||a.kind-b.kind);
    return {...state,...(yoshi?inspectYoshiGameplay(u32,a=>v.getUint8(at(a))):{}),...(!yoshi?{platforms:tournament?[]:stadium?inspectStadiumPlatforms(u32,a=>v.getUint8(at(a))):platforms}:{}),allActors,randomSeed:u32(seed)};
  }
  if(action==='stadiumScreen'){
    if(!api.browserInvalidateGuestCode)throw Error('Stadium screen experiment requires guest code invalidation');
    const eligible=s=>s.major===2&&s.minor===2&&s.sceneKind===2&&s.match?.stage===3;
    if(!eligible(state))return {objects:[],writes:[],codeWrites:[]};
    let plan=planStadiumScreen(u32,a=>v.getUint8(at(a)),options.enabled);
    if(!plan.codeWrites.length&&!plan.writes.length)return plan;
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for Stadium screen change');
    try{
      if(!eligible(inspectMelee(module)))return {objects:[],writes:[],codeWrites:[]};
      plan=planStadiumScreen(u32,a=>v.getUint8(at(a)),options.enabled);
      for(const[address,value]of plan.codeWrites){w(address,value);if(!api.browserInvalidateGuestCode(address,4))throw Error('Stadium copy-site invalidation failed');}
      for(const[address,value]of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='stadiumTransformations'){
    if(!api.browserInvalidateGuestCode)throw Error('Stadium freeze experiment requires guest code invalidation');
    const eligible=s=>s.major===2&&s.minor===2&&s.sceneKind===2&&s.match?.stage===3;
    if(!eligible(state))return {objects:[],writes:[],codeWrites:[]};
    let plan=planStadiumTransformations(u32,a=>v.getUint8(at(a)),options.enabled);
    if(!plan.codeWrites.length)return plan;
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for Stadium freeze change');
    try{
      if(!eligible(inspectMelee(module)))return {objects:[],writes:[],codeWrites:[]};
      plan=planStadiumTransformations(u32,a=>v.getUint8(at(a)),options.enabled);
      for(const[address,value]of plan.codeWrites)w(address,value);
      if(plan.codeWrites.length&&!api.browserInvalidateGuestCode(STADIUM_TRANSFORMATION_CONTROLLER,4))
        throw Error('Stadium transformation-controller invalidation failed');
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='stadiumDecoration'){
    const eligible=s=>s.major===2&&s.minor===2&&s.sceneKind===2&&s.match?.stage===3;
    if(!eligible(state))return {objects:[],writes:[]};
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for Stadium decoration change');
    try{
      if(!eligible(inspectMelee(module)))return {objects:[],writes:[]};
      const plan=planFrozenStadiumDecoration(u32,a=>v.getUint8(at(a)),options.enabled);
      for(const[address,value]of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='staticBackgroundAnimation'){
    const eligible=s=>s.major===2&&s.minor===2&&s.sceneKind===2&&[31,32].includes(s.match?.stage);
    if(!eligible(state))return {objects:[],writes:[],codeWrites:[]};
    let plan=planStaticBackgroundAnimation(u32,a=>v.getUint8(at(a)),options.enabled,state.match.stage);
    if(!plan.codeWrites.length&&!plan.writes.length)return plan;
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for static background change');
    try{
      const current=inspectMelee(module);if(!eligible(current))return {objects:[],writes:[],codeWrites:[]};
      plan=planStaticBackgroundAnimation(u32,a=>v.getUint8(at(a)),options.enabled,current.match.stage);
      for(const[address,value]of plan.codeWrites)w(address,value);
      if(plan.codeWrites.length&&!api.browserInvalidateGuestCode(FOUNTAIN_ANIMATION_CAVE,FOUNTAIN_ANIMATION_BYTES))
        throw Error('Static animation code invalidation failed');
      for(const[address,value]of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='particleBankInspect'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for particle-bank inventory');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2)
        throw Error('Particle-bank inventory requires a live match');
      return inspectParticleBanks(u32,a=>v.getUint8(at(a)),a=>v.getFloat32(at(a)));
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='fountainParticles'){
    if(!api.browserInvalidateGuestCode)throw Error('Particle experiment requires guest code invalidation');
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for particle visibility');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==2)return {objects:[],writes:[],codeWrites:[]};
      const plan=planFountainParticles(u32,options.enabled);
      const particles=inspectParticleBanks(u32,a=>v.getUint8(at(a)),a=>v.getFloat32(at(a)));
      for(const[address,value]of plan.codeWrites)w(address,value);
      if(plan.codeWrites.length&&!api.browserInvalidateGuestCode(PARTICLE_DRAW_CAVE,plan.codeBytes))throw Error('Particle cave invalidation failed; hook unchanged');
      for(const[address,value]of plan.writes)w(address,value);
      if(plan.writes.length&&!api.browserInvalidateGuestCode(PARTICLE_DRAW_HOOK,4))throw Error('Particle hook invalidation failed');
      return {...plan,particles};
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if (action === "fountainAnimation" || action === 'yoshiBackgroundAnimation') {
    const animationStage=action==='yoshiBackgroundAnimation'?8:2;
    const animationPlan=(read32,read8,enabled)=>animationStage===8?planYoshiBackgroundAnimation(read32,read8,enabled,animationStage):planFountainAnimation(read32,read8,enabled);
    if(state.major!==2||state.minor!==2||state.sceneKind!==2||state.match?.stage!==animationStage)return {objects:[],writes:[],codeWrites:[]};
    let plan=animationPlan(u32,a=>v.getUint8(at(a)),options.enabled);
    if(plan.writes.length||plan.codeWrites.length){
      if(!api.browserInvalidateGuestCode)throw Error('This core cannot safely install guest code');
      const wasPaused=api.getCoreStateName?.()==='Paused';
      if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for scenery animation change');
      try{
        const current=inspectMelee(module);
        if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==animationStage)return {objects:[],writes:[],codeWrites:[]};
        plan=animationPlan(u32,a=>v.getUint8(at(a)),options.enabled);
        for(const[address,value]of plan.codeWrites)w(address,value);
        if(plan.codeWrites.length&&!api.browserInvalidateGuestCode(FOUNTAIN_ANIMATION_CAVE,FOUNTAIN_ANIMATION_BYTES))throw Error('Guest code invalidation failed; process callbacks unchanged');
        for(const[address,value]of plan.writes)w(address,value);
      }finally{if(!wasPaused)api.setCorePaused(0);}
    }
    return plan;
  }
  if (action === "shadowDiagnostic") {
    if(state.major!==2||state.minor!==2||state.sceneKind!==2)return {objects:[],writes:[],diagnosticOnly:true};
    if(!api.browserInvalidateGuestCode)throw Error('Shadow diagnostic requires safe code invalidation');
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause the shadow diagnostic');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2)return {objects:[],writes:[],diagnosticOnly:true};
      const plan=planShadowDiagnostic(u32,options.enabled);
      for(const[address,value]of plan.writes)w(address,value);
      if(plan.writes.length&&!api.browserInvalidateGuestCode(SHADOW_DIAGNOSTIC_PROC,4))throw Error('Shadow code invalidation failed');
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if (action === "modelDetail") {
    if(state.major!==2||state.minor!==2||state.sceneKind!==2)return {objects:[],writes:[],byteWrites:[]};
    let plan=planFighterModelDetail(u32,a=>v.getUint8(at(a)),options.enabled);
    if(plan.writes.length||plan.byteWrites.length){
      const wasPaused=api.getCoreStateName?.()==='Paused';
      if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for model detail change');
      try{
        const current=inspectMelee(module);
        if(current.major!==2||current.minor!==2||current.sceneKind!==2)return {objects:[],writes:[],byteWrites:[]};
        plan=planFighterModelDetail(u32,a=>v.getUint8(at(a)),options.enabled);
        for(const[address,value]of plan.writes)w(address,value);
        for(const[address,value]of plan.byteWrites)b(address,value);
      }finally{if(!wasPaused)api.setCorePaused(0);}
    }
    return plan;
  }
  if(action==='fountainDecorations'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for decoration visibility');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==2)return {objects:[],writes:[]};
      const plan=planFountainDecorations(u32,a=>v.getUint8(at(a)),a=>v.getFloat32(at(a)),options.enabled);
      for(const[address,value]of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='yoshiGeometryInspect'||action==='yoshiDrawDependencyProbe'||action==='yoshiOffscreenDecor'||action==='yoshiStableDrawCostDiagnostic'||action==='yoshiMinimalStage'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for checked Yoshi mesh control');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==8)
        throw Error('Yoshi mesh inventory requires a live Yoshi match');
      const geometry=inspectYoshiGeometry(u32,a=>v.getUint8(at(a)),a=>v.getFloat32(at(a)));
      if(action==='yoshiGeometryInspect')return {...geometry,sceneFrame:current.sceneFrame};
      if(action==='yoshiDrawDependencyProbe')return {...inspectYoshiStaticDrawObjectBytes(geometry,a=>v.getUint8(at(a))),sceneFrame:current.sceneFrame,renderFrame:current.renderFrame};
      const plan=action==='yoshiStableDrawCostDiagnostic'
        ? planYoshiStableDrawCostDiagnostic(geometry,options.enabled)
        : action==='yoshiMinimalStage'?planYoshiMinimalStage(geometry,options.enabled)
        : planYoshiOffscreenDecor(geometry,options.enabled);
      for(const [address,value] of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='tournamentStageGeometryInspect'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for tournament stage geometry inventory');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2||![2,3,8,28,31,32].includes(current.match?.stage))
        throw Error('Tournament geometry inventory requires a live legal-stage match');
      return {...inspectTournamentStageGeometry(u32,a=>v.getUint8(at(a)),a=>v.getFloat32(at(a))),
        stage:current.match.stage,sceneFrame:current.sceneFrame};
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='finalDestinationBottomVisual'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for Final Destination visual control');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==32)
        throw Error('Final Destination visual control requires a live Final Destination match');
      const geometry=inspectTournamentStageGeometry(u32,a=>v.getUint8(at(a)),a=>v.getFloat32(at(a)));
      const plan=planFinalDestinationBottomVisual(u32,geometry,options.enabled,options.selection);
      for(const[address,value]of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if(action==='fountainGeometryInspect'||action==='fountainGeometryView'){
    const wasPaused=api.getCoreStateName?.()==='Paused';
    if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for geometry diagnostic');
    try{
      const current=inspectMelee(module);
      if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==2)throw Error('Geometry diagnostic requires Fountain');
      const geometry=inspectFountainGeometry(u32,a=>v.getUint8(at(a)),a=>v.getFloat32(at(a)));
      if(action==='fountainGeometryInspect'){
        const original=fountainGeometryBaseline.get(module);
        if(!original||original.objects[0].root!==geometry.objects[0].root)fountainGeometryBaseline.set(module,geometry);
        return geometry;
      }
      const original=fountainGeometryBaseline.get(module);if(!original)throw Error('Inspect geometry before changing visibility');
      const plan=planFountainGeometryView(geometry,original,options.selection);
      for(const[address,value]of plan.writes)w(address,value);
      return plan;
    }finally{if(!wasPaused)api.setCorePaused(0);}
  }
  if (action === "fountainScenery") {
    if (state.major !== 2 || state.minor !== 2 || state.sceneKind !== 2 || state.match?.stage !== 2) return {objects:[],writes:[],clear:[]};
    let plan=planFountainScenery(u32,a=>v.getUint8(at(a)),options.enabled);
    if(plan.writes.length){
      const wasPaused=api.getCoreStateName?.()==='Paused';
      if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for scenery change');
      try{
        const current=inspectMelee(module);
        if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==2)return {objects:[],writes:[],clear:[]};
        plan=planFountainScenery(u32,a=>v.getUint8(at(a)),options.enabled);

        for(const [address,value]of plan.writes)w(address,value);
      }finally{if(!wasPaused)api.setCorePaused(0);}
    }
    return plan;
  }
  if (action === "fountainReflection") {
    if (state.major !== 2 || state.minor !== 2 || state.sceneKind !== 2 || state.match?.stage !== 2) return {objects:[],writes:[],clear:[]};
    let plan=planFountainReflection(u32,a=>v.getUint8(at(a)),options.enabled);
    if(plan.writes.length){
      const wasPaused=api.getCoreStateName?.()==='Paused';
      if(!wasPaused&&!api.setCorePaused(1))throw Error('Could not pause for reflection change');
      try{
        const current=inspectMelee(module);
        if(current.major!==2||current.minor!==2||current.sceneKind!==2||current.match?.stage!==2)return {objects:[],writes:[],clear:[]};
        plan=planFountainReflection(u32,a=>v.getUint8(at(a)),options.enabled);
        for(const [address,bytes]of plan.clear)heap.fill(0,at(address),at(address)+bytes);
        for(const [address,value]of plan.writes)w(address,value);
      }finally{if(!wasPaused)api.setCorePaused(0);}
    }
    return plan;
  }
  if (action === "stageBackground") {
    if (state.major !== 2 || state.minor !== 2 || state.sceneKind !== 2) return {objects: [], writes: []};
    // A previously skipped background must animate before becoming visible.
    if(options.enabled && state.match.stage===8){
      const repair=planYoshiBackgroundAnimation(u32,a=>v.getUint8(at(a)),true,8);
      if(repair.writes.length)controlMelee(module,api,'yoshiBackgroundAnimation',{enabled:true});
    }
    let plan = planStageBackground(u32, (a) => v.getUint8(at(a)), options.enabled, state.match.stage);
    if (plan.writes.length) {
      const wasPaused = api.getCoreStateName?.() === 'Paused';
      if (!wasPaused && !api.setCorePaused(1)) throw Error('Could not pause for background change');
      try {
        const paused = inspectMelee(module);
        if (paused.major !== 2 || paused.minor !== 2 || paused.sceneKind !== 2)
          return {objects: [], writes: []};
        // Objects may have been replaced between the first read and the pause.
        plan = planStageBackground(u32, (a) => v.getUint8(at(a)), options.enabled, paused.match.stage);
        for (const [address, value] of plan.writes) w(address, value);
      }
      finally { if (!wasPaused) api.setCorePaused(0); }
    }
    return plan;
  }
  if (action === "roomLayout") {
    if (state.major === 2 && state.minor === 0 && state.sceneKind === 8) {
      applyCssLayout(heap);
      applyCssForeground(heap);
    }
    return state;
  }
  if (action === "tapJump") {
    const port = options.online ? options.port : 0;
    if (![0, 1].includes(port)) throw Error("Invalid controller port");
    b(TAP_JUMP_FLAG + port, options.enabled === false ? 1 : 0);
    return state;
  }
  api.setCorePaused(1);
  try {
    if (action === "prepare" || action === "enterCss") {
      installTapJumpHooks(u32, w, options.online);
      b(TAP_JUMP_FLAG, options.tapJump === false ? 1 : 0);
      h(main + 0x1868, 0x7ff); // all eleven unlockable fighters
      h(main + 0x186a, 0xffff);
      b(rules + 2, 1);
      b(rules + 4, 4);
      b(rules + 5, 0);
      b(rules + 6, 10);
      b(rules + 8, 8);
      b(rules + 9, 0);
      b(rules + 10, 1);
      b(main + 0x1cb0, 255);
      w(main + 0x1cb8, 0);
      w(main + 0x1cbc, 0);
      b(vs + 8 + 8, 0);
      h(vs + 8 + 14, 0x1f);
      for (let i = 0; i < 6; i++) {
        const p = vs + 8 + 0x60 + i * 0x24;
        b(p + 1, i === 0 ? 0 : i === 1 ? (options.online && !options.cpu ? 0 : 1) : 3);
        b(p + 2, 4);
        b(p + 4, 0); // Native automatic player ID uses the fighter slot.
        b(p + 7, i); // Controller/color index: owner P1, guest P2.
        if (i < 2) {
          b(p, i === 0 ? 2 : 20);
          b(p + 3, 0);
          b(p + 8, 9);
          b(p + 14, 4);
          b(p + 15, 9);
        }
        f(p + 0x18, 1);
        f(p + 0x1c, 1);
        f(p + 0x20, 1);
      }
      if (action === "enterCss") {
        if (state.major !== 1) throw new Error("Enter CSS requires the native main menu");
        const info = u32(0x804d6720);
        b(u32(info + 8), 2); // MenuExitData::pending_mode, consumed by onExit
        b(0x80479d31, 2);
        b(0x80479d3c, 1);
        w(0x80479d64, 1);
      }
    } else if (action === "lockCss" || action === "start") {
      if (state.major !== 2 || state.minor !== 0) throw new Error("Not at VS character select");
      // The router stores the next state plus one: 2 enters native stage select.
      b(0x80479d35, 2);
      b(0x804807b0 + 16 + 8, 0);
      b(rules + 2, 1);
      b(rules + 4, 4);
      b(rules + 8, 8);
      b(main + 0x1cb0, 255);
      w(main + 0x1cb8, 0);
      w(main + 0x1cbc, 0);
      for (let i = 0; i < 6; i++) {
        const p = 0x804807b0 + 16 + 0x60 + i * 0x24;
        b(p + 1, i === 0 ? 0 : i === 1 ? (options.online && !options.cpu ? 0 : 1) : 3);
        b(p + 2, 4);
        if (options.online) {
          b(p + 4, 0);
          b(p + 7, i);
        }
        if (i === 1) b(p + 15, 9);
      }
      if (action === "start")
        for (let i = 0; i < 2; i++) {
          const p = 0x804807b0 + 16 + 0x60 + i * 0x24;
          if (heap[at(p)] === 18 && options.startingSheik?.[i]) b(p, 19);
        }
    } else if (action === "selectStage") {
      // QA uses the original SSS force-stage path. Normal play uses WASD / A.
      if (state.major !== 2 || state.minor !== 1 || state.sceneKind !== 9)
        throw new Error("Stage selection requires the native stage select screen");
      if (!Number.isInteger(options.stage) || options.stage < 2 || options.stage > 32)
        throw new Error("Invalid stage");
      const sss = u32(u32(0x804d6720) + 4);
      b(sss + 3, options.stage);
    } else if (action === "quit") {
      if (state.major !== 2 || state.minor !== 2 || state.sceneKind !== 2)
        throw new Error("No active match");
      // Native OUTCOME_NO_CONTEST, consumed by gm_GetMatchOutcome. The game runs
      // its own match-end callbacks, resource cleanup, and scene transition.
      b(0x8046b6a8, 7);
    } else if (action === "returnCss") {
      if (state.major !== 2 || state.minor !== 4) throw new Error("Not at results");
      for (let i = 0; i < 2; i++) {
        const p = vs + 8 + 0x60 + i * 0x24;
        if (heap[at(p)] === 19) b(p, 18);
      }
      b(0x80479d35, 1);
      w(0x80479d64, 1);
    } else if (action === "opponent") {
      if (state.major !== 2 || state.minor !== 0 || state.sceneKind !== 8)
        throw new Error("Change opponent at character select");
      b(0x80480820 + 0x24 + 1, options.cpu ? 1 : 0);
      b(0x80480820 + 0x24 + 15, 9);
      b(0x80479d35, 1);
      w(0x80479d64, 1);
    } else if (action === "select") {
      if (state.major !== 2 || state.minor !== 0 || state.sceneKind !== 8)
        throw new Error("Selection requires character select");
      if (![options.player, options.cpu].every((n) => Number.isInteger(n) && n >= 0 && n < 26))
        throw new Error("Invalid fighter");
      const css = 0x804807b0;
      for (let i = 0; i < 6; i++) {
        const p = css + 16 + 0x60 + i * 0x24;
        b(p + 1, i === 0 ? 0 : i === 1 ? (options.online ? 0 : 1) : 3);
        b(p + 2, 4);
        if (options.online) {
          b(p + 4, 0);
          b(p + 7, i);
        }
        if (i < 2) {
          const char = i === 0 ? options.player : options.cpu;
          b(p, char === 19 ? 18 : char);
          b(p + 15, 9);
          b(p + 3, i === 1 && options.player === options.cpu ? 1 : 0);
        }
      }
      b(css + 3, 0);
      b(0x80479d35, 1);
      w(0x80479d64, 1);
    } else throw new Error("Unknown Melee action");
  } finally {
    api.setCorePaused(0);
  }
  return inspectMelee(module);
}
